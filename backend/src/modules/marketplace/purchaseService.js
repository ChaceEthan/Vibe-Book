// @ts-nocheck
const mongoose = require("mongoose");

const Feed = require("../../models/Feed");
const User = require("../../models/User");
const walletService = require("../wallet/walletService");
const CreatorBoost = require("./creatorBoostModel");
const FeaturedContent = require("./featuredContentModel");
const MarketplaceItem = require("./marketplaceItemModel");
const PremiumReaction = require("./premiumReactionModel");
const ProfileTheme = require("./profileThemeModel");
const UserInventory = require("./userInventoryModel");
const { DEFAULT_MARKETPLACE_ITEMS, MARKETPLACE_CATEGORIES } = require("./marketplaceCatalog");

const purchaseLocks = new Map();
const LOCK_TTL_MS = 20 * 1000;
const CATEGORY_TO_FIELD = {
  [MARKETPLACE_CATEGORIES.FRAMES]: "ownedFrames",
  [MARKETPLACE_CATEGORIES.BADGES]: "ownedBadges",
  [MARKETPLACE_CATEGORIES.REACTIONS]: "ownedReactions",
  [MARKETPLACE_CATEGORIES.THEMES]: "ownedThemes",
  [MARKETPLACE_CATEGORIES.BOOSTS]: "ownedBoosts",
  [MARKETPLACE_CATEGORIES.FEATURED]: "ownedFeatured",
};

const idOf = (value) => value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";
const hoursFromNow = (hours = 0) => new Date(Date.now() + Number(hours || 0) * 60 * 60 * 1000);
const daysFromNow = (days = 0) => new Date(Date.now() + Number(days || 0) * 24 * 60 * 60 * 1000);
const activeDateQuery = { $gt: new Date() };

const publicItem = (item = {}) => ({
  _id: item._id,
  itemId: item.itemId,
  name: item.name,
  description: item.description,
  category: item.category,
  rarity: item.rarity,
  price: Number(item.price || 0),
  currency: item.currency || "NEX_POINTS",
  status: item.status || "active",
  levelRequired: Number(item.levelRequired || 1),
  durationHours: Number(item.durationHours || 0),
  durationDays: Number(item.durationDays || 0),
  cooldownHours: Number(item.cooldownHours || 0),
  preview: item.preview || {},
  metadata: item.metadata || {},
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const ensureCatalog = async () => {
  const count = await MarketplaceItem.estimatedDocumentCount();

  if (count === 0) {
    await MarketplaceItem.insertMany(DEFAULT_MARKETPLACE_ITEMS, { ordered: false }).catch(() => null);
  }

  await Promise.all(
    DEFAULT_MARKETPLACE_ITEMS.map((item) =>
      MarketplaceItem.updateOne(
        { itemId: item.itemId },
        { $setOnInsert: item },
        { upsert: true, runValidators: true }
      ).catch(() => null)
    )
  );

  const reactionItems = DEFAULT_MARKETPLACE_ITEMS.filter((item) => item.category === MARKETPLACE_CATEGORIES.REACTIONS);
  await Promise.all(
    reactionItems.map((item) =>
      PremiumReaction.findOneAndUpdate(
        { itemId: item.itemId },
        {
          $setOnInsert: {
            itemId: item.itemId,
            name: item.name,
            emoji: item.metadata?.emoji || item.preview?.emoji || "",
            animation: item.metadata?.animation || item.preview?.animation || "",
            metadata: item.metadata || {},
          },
        },
        { upsert: true, returnDocument: "after" }
      ).catch(() => null)
    )
  );

  const themeItems = DEFAULT_MARKETPLACE_ITEMS.filter((item) => item.category === MARKETPLACE_CATEGORIES.THEMES);
  await Promise.all(
    themeItems.map((item) =>
      ProfileTheme.findOneAndUpdate(
        { itemId: item.itemId },
        {
          $setOnInsert: {
            itemId: item.itemId,
            themeKey: item.metadata?.themeKey || item.itemId.replace(/^theme_/, ""),
            name: item.name,
            tokens: item.metadata || {},
          },
        },
        { upsert: true, returnDocument: "after" }
      ).catch(() => null)
    )
  );
};

const getCatalog = async (filters = {}) => {
  await ensureCatalog();
  const query = {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.includeDisabled ? {} : { status: { $ne: "disabled" } }),
  };
  const items = await MarketplaceItem.find(query).sort({ category: 1, price: 1, rarity: 1 }).lean();
  return items.map(publicItem);
};

const getInventory = async (userId) => {
  let inventory = await UserInventory.findOne({ userId });

  if (!inventory) {
    inventory = await UserInventory.create({ userId });
  }

  return inventory;
};

const serializeInventoryItem = (item = {}) => ({
  _id: item._id,
  itemId: item.itemId,
  category: item.category,
  owned: item.owned !== false,
  equipped: Boolean(item.equipped),
  quantity: Number(item.quantity || 1),
  acquiredAt: item.acquiredAt,
  expiresAt: item.expiresAt,
  metadata: item.metadata || {},
});

const serializeInventory = (inventory = {}) => ({
  ownedFrames: (inventory.ownedFrames || []).map(serializeInventoryItem),
  ownedBadges: (inventory.ownedBadges || []).map(serializeInventoryItem),
  ownedReactions: (inventory.ownedReactions || []).map(serializeInventoryItem),
  ownedThemes: (inventory.ownedThemes || []).map(serializeInventoryItem),
  ownedBoosts: (inventory.ownedBoosts || []).map(serializeInventoryItem),
  ownedFeatured: (inventory.ownedFeatured || []).map(serializeInventoryItem),
  active: {
    frame: inventory.active?.frame || "",
    theme: inventory.active?.theme || "",
    badges: Array.isArray(inventory.active?.badges) ? inventory.active.badges : [],
    reactions: Array.isArray(inventory.active?.reactions) ? inventory.active.reactions : [],
  },
  futureTokenReady: inventory.futureTokenReady !== false,
  updatedAt: inventory.updatedAt,
});

const acquireLock = (userId, itemId) => {
  const key = `${userId}:${itemId}`;
  const existing = purchaseLocks.get(key);

  if (existing && existing > Date.now()) {
    const error = new Error("Purchase already in progress");
    error.code = "PURCHASE_LOCKED";
    throw error;
  }

  purchaseLocks.set(key, Date.now() + LOCK_TTL_MS);
  return () => purchaseLocks.delete(key);
};

const assertCanBuy = async (userId, item, options = {}) => {
  if (!item || item.status !== "active") {
    const error = new Error("This marketplace item is not available");
    error.code = "ITEM_UNAVAILABLE";
    throw error;
  }

  const user = await User.findById(userId).select("creatorLevel creatorBadges profileTheme marketplace isBlocked");
  if (!user || user.isBlocked) {
    const error = new Error("User is not eligible for purchases");
    error.code = "USER_NOT_ELIGIBLE";
    throw error;
  }

  const wallet = await walletService.getWallet(userId);
  if (Number(wallet.level || 1) < Number(item.levelRequired || 1)) {
    const error = new Error(`Creator level ${item.levelRequired} required`);
    error.code = "LEVEL_REQUIRED";
    throw error;
  }

  const inventory = await getInventory(userId);
  const field = CATEGORY_TO_FIELD[item.category];
  const existing = (inventory[field] || []).find((owned) => owned.itemId === item.itemId && (!owned.expiresAt || new Date(owned.expiresAt) > new Date()));

  if (existing && ![MARKETPLACE_CATEGORIES.BOOSTS, MARKETPLACE_CATEGORIES.FEATURED].includes(item.category)) {
    const error = new Error("You already own this item");
    error.code = "ALREADY_OWNED";
    throw error;
  }

  if (item.category === MARKETPLACE_CATEGORIES.BOOSTS) {
    const boostType = item.metadata?.boostType || "feed";
    const activeBoost = await CreatorBoost.findOne({
      userId,
      boostType,
      status: "active",
      expiresAt: activeDateQuery,
    });
    const cooldown = await CreatorBoost.findOne({
      userId,
      boostType,
      cooldownUntil: activeDateQuery,
    }).sort({ cooldownUntil: -1 });

    if (activeBoost || cooldown) {
      const error = new Error("This boost is cooling down");
      error.code = "BOOST_COOLDOWN";
      error.cooldownUntil = activeBoost?.expiresAt || cooldown?.cooldownUntil;
      throw error;
    }
  }

  if (item.category === MARKETPLACE_CATEGORIES.FEATURED) {
    const postId = options.postId;
    if (!mongoose.isValidObjectId(postId)) {
      const error = new Error("Choose a valid video to feature");
      error.code = "POST_REQUIRED";
      throw error;
    }

    const post = await Feed.findOne({ _id: postId, userId, type: "video", visibility: { $ne: "private" } });
    if (!post) {
      const error = new Error("Featured placement requires one of your public videos");
      error.code = "POST_NOT_FOUND";
      throw error;
    }

    const duplicate = await FeaturedContent.findOne({
      userId,
      postId,
      status: { $in: ["pending_moderation", "approved", "active"] },
      expiresAt: activeDateQuery,
    });

    if (duplicate) {
      const error = new Error("This video is already in the featured queue");
      error.code = "FEATURED_DUPLICATE";
      throw error;
    }
  }

  return { wallet, inventory };
};

const inventoryPushFor = (item, transactionId) => {
  const expiresAt = item.durationDays ? daysFromNow(item.durationDays) : null;
  return {
    itemId: item.itemId,
    marketplaceItem: item._id,
    category: item.category,
    owned: true,
    equipped: false,
    quantity: 1,
    acquiredAt: new Date(),
    expiresAt,
    purchaseTransactionId: transactionId,
    metadata: item.metadata || {},
  };
};

const addToInventory = async (userId, item, transactionId) => {
  const inventory = await getInventory(userId);
  const field = CATEGORY_TO_FIELD[item.category];
  const entry = inventoryPushFor(item, transactionId);

  if (!field) {
    return inventory;
  }

  const existing = (inventory[field] || []).find((owned) => owned.itemId === item.itemId);
  if (existing && ![MARKETPLACE_CATEGORIES.BOOSTS, MARKETPLACE_CATEGORIES.FEATURED].includes(item.category)) {
    existing.quantity = Number(existing.quantity || 1);
    existing.owned = true;
    existing.expiresAt = entry.expiresAt || existing.expiresAt;
  } else {
    inventory[field].push(entry);
  }

  await inventory.save();
  return inventory;
};

const updateProfilePrestige = async (userId, inventory) => {
  const activeBadges = (inventory.ownedBadges || [])
    .filter((item) => item.equipped && (!item.expiresAt || new Date(item.expiresAt) > new Date()))
    .map((item) => item.itemId)
    .slice(0, 5);

  await User.findByIdAndUpdate(userId, {
    $set: {
      "marketplace.equippedFrame": inventory.active?.frame || "",
      "marketplace.equippedTheme": inventory.active?.theme || "",
      "marketplace.equippedBadges": activeBadges,
      "marketplace.ownedReactions": inventory.active?.reactions || [],
      creatorBadges: activeBadges,
      profileTheme: inventory.active?.theme || "classic",
      premiumBadge: activeBadges.length > 0,
    },
  });
};

const activateBoost = async (userId, item, transactionId) => {
  const durationHours = Number(item.durationHours || 24);
  const boostType = item.metadata?.boostType || "feed";
  const expiresAt = hoursFromNow(durationHours);
  const cooldownUntil = hoursFromNow(durationHours + Number(item.cooldownHours || 0));

  const boost = await CreatorBoost.create({
    userId,
    itemId: item.itemId,
    boostType,
    status: "active",
    multiplier: Number(item.metadata?.multiplier || 1.25),
    startsAt: new Date(),
    expiresAt,
    cooldownUntil,
    estimatedReach: item.metadata?.estimatedReach || "",
    purchaseTransactionId: transactionId,
  });

  if (["feed", "trending", "spotlight"].includes(boostType)) {
    await Feed.updateMany(
      { userId, visibility: { $ne: "private" } },
      {
        $max: { boostedUntil: expiresAt },
        $inc: { boostScore: Math.round(Number(item.metadata?.multiplier || 1.25) * 20) },
      }
    ).catch(() => null);
  }

  return boost;
};

const createFeaturedPlacement = async (userId, item, transactionId, postId) => {
  const queuePosition = await FeaturedContent.countDocuments({
    status: { $in: ["pending_moderation", "approved", "active"] },
    expiresAt: activeDateQuery,
  });
  const post = await Feed.findById(postId).select("views likes shareCount");
  const featured = await FeaturedContent.create({
    userId,
    postId,
    itemId: item.itemId,
    status: "pending_moderation",
    startsAt: new Date(),
    expiresAt: hoursFromNow(item.durationHours || 24),
    queuePosition: queuePosition + 1,
    analytics: {
      viewsBefore: Number(post?.views || 0),
      viewsCurrent: Number(post?.views || 0),
      likesCurrent: Number(post?.likes || 0),
      sharesCurrent: Number(post?.shareCount || 0),
    },
    purchaseTransactionId: transactionId,
  });

  await Feed.findByIdAndUpdate(postId, {
    $inc: { boostScore: 45 },
    $max: { boostedUntil: featured.expiresAt },
  }).catch(() => null);

  return featured;
};

const purchaseItem = async (userId, itemId, options = {}) => {
  const releaseLock = acquireLock(userId, itemId);
  let spendResult = null;

  try {
    await ensureCatalog();
    const item = await MarketplaceItem.findOne({ itemId: String(itemId || "").trim().toLowerCase() });
    const { wallet } = await assertCanBuy(userId, item, options);

    spendResult = await walletService.spendPoints(userId, item.price, "purchase", {
      itemId: item.itemId,
      category: item.category,
      currency: item.currency || "NEX_POINTS",
      futureTokenReady: true,
    });

    const transactionId = spendResult.transaction?._id;
    const inventory = await addToInventory(userId, item, transactionId);
    let boost = null;
    let featured = null;

    if (item.category === MARKETPLACE_CATEGORIES.BOOSTS) {
      boost = await activateBoost(userId, item, transactionId);
    }

    if (item.category === MARKETPLACE_CATEGORIES.FEATURED) {
      featured = await createFeaturedPlacement(userId, item, transactionId, options.postId);
    }

    return {
      item: publicItem(item),
      wallet: spendResult.wallet || wallet,
      transaction: spendResult.transaction,
      inventory: serializeInventory(inventory),
      boost,
      featured,
    };
  } catch (error) {
    if (spendResult?.transaction && spendResult?.wallet) {
      await walletService.addPoints(userId, Number(spendResult.transaction.amount || 0), "refund", {
        reason: "marketplace_purchase_rollback",
        originalTransactionId: idOf(spendResult.transaction),
        itemId,
      }).catch(() => null);
    }
    throw error;
  } finally {
    releaseLock();
  }
};

const equipItem = async (userId, itemId, action = "equip") => {
  await ensureCatalog();
  const item = await MarketplaceItem.findOne({ itemId: String(itemId || "").trim().toLowerCase() });

  if (!item) {
    const error = new Error("Item not found");
    error.code = "ITEM_NOT_FOUND";
    throw error;
  }

  const inventory = await getInventory(userId);
  const field = CATEGORY_TO_FIELD[item.category];
  const owned = (inventory[field] || []).find((entry) => entry.itemId === item.itemId && (!entry.expiresAt || new Date(entry.expiresAt) > new Date()));

  if (!owned) {
    const error = new Error("You do not own this item");
    error.code = "NOT_OWNED";
    throw error;
  }

  const shouldEquip = action !== "unequip";
  const now = new Date();

  if (item.category === MARKETPLACE_CATEGORIES.FRAMES) {
    inventory.ownedFrames.forEach((entry) => {
      entry.equipped = shouldEquip && entry.itemId === item.itemId;
      if (entry.equipped) entry.lastEquippedAt = now;
    });
    inventory.active.frame = shouldEquip ? item.itemId : "";
  }

  if (item.category === MARKETPLACE_CATEGORIES.THEMES) {
    inventory.ownedThemes.forEach((entry) => {
      entry.equipped = shouldEquip && entry.itemId === item.itemId;
      if (entry.equipped) entry.lastEquippedAt = now;
    });
    inventory.active.theme = shouldEquip ? (item.metadata?.themeKey || item.itemId) : "";
  }

  if (item.category === MARKETPLACE_CATEGORIES.BADGES) {
    const nextBadges = new Set(inventory.active.badges || []);
    if (shouldEquip) nextBadges.add(item.itemId);
    else nextBadges.delete(item.itemId);
    inventory.active.badges = Array.from(nextBadges).slice(0, 5);
    inventory.ownedBadges.forEach((entry) => {
      entry.equipped = inventory.active.badges.includes(entry.itemId);
      if (entry.equipped) entry.lastEquippedAt = now;
    });
  }

  if (item.category === MARKETPLACE_CATEGORIES.REACTIONS) {
    const nextReactions = new Set(inventory.active.reactions || []);
    if (shouldEquip) nextReactions.add(item.itemId);
    else nextReactions.delete(item.itemId);
    inventory.active.reactions = Array.from(nextReactions).slice(0, 12);
    inventory.ownedReactions.forEach((entry) => {
      entry.equipped = inventory.active.reactions.includes(entry.itemId);
      if (entry.equipped) entry.lastEquippedAt = now;
    });
  }

  await inventory.save();
  await updateProfilePrestige(userId, inventory);

  return serializeInventory(inventory);
};

module.exports = {
  ensureCatalog,
  getCatalog,
  getInventory,
  purchaseItem,
  equipItem,
  serializeInventory,
  publicItem,
};
