// @ts-nocheck
const mongoose = require("mongoose");

const Feed = require("../../models/Feed");
const User = require("../../models/User");
const Wallet = require("../wallet/walletModel");
const WalletTransaction = require("../wallet/walletTransactionModel");
const { TRANSACTION_STATUS, TRANSACTION_SOURCES, TRANSACTION_TYPES } = require("../wallet/walletConstants");
const { generateTransactionDescription, sanitizeMetadata, validateAmount, validateUserId } = require("../wallet/walletUtils");
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
    ...(filters.includeDisabled ? {} : { status: "active" }),
  };
  const items = await MarketplaceItem.find(query).sort({ category: 1, price: 1, rarity: 1 }).lean();
  return items.map(publicItem);
};

const withSession = (query, session) => (session ? query.session(session) : query);

const getInventory = async (userId, options = {}) => {
  const session = options.session || null;
  let inventory = await withSession(UserInventory.findOne({ userId }), session);

  if (!inventory) {
    if (session) {
      [inventory] = await UserInventory.create([{ userId }], { session });
    } else {
      inventory = await UserInventory.create({ userId });
    }
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

const getPurchaseWallet = async (userId, session) => {
  let wallet = await withSession(Wallet.findOne({ userId }), session);

  if (!wallet) {
    wallet = new Wallet({
      userId,
      balance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      totalReceived: 0,
      totalSent: 0,
      streakCount: 0,
      level: 1,
      levelName: "Starter",
    });
    await wallet.save({ session });
  }

  return wallet;
};

const assertCanBuy = async (userId, item, options = {}) => {
  const session = options.session || null;

  if (!item) {
    const error = new Error("Marketplace item not found");
    error.code = "ITEM_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  if (item.status !== "active") {
    const error = new Error("This marketplace item is not available");
    error.code = "ITEM_UNAVAILABLE";
    throw error;
  }

  if (String(item.currency || "NEX_POINTS").toUpperCase() !== "NEX_POINTS") {
    const error = new Error("Token purchases are prepared for a future release but are not active yet");
    error.code = "TOKEN_PURCHASES_DISABLED";
    throw error;
  }

  const numericPrice = Number(item.price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    const error = new Error("Invalid item price");
    error.code = "INVALID_ITEM_PRICE";
    throw error;
  }
  const price = validateAmount(numericPrice);

  const user = await withSession(User.findById(userId).select("creatorLevel creatorBadges profileTheme marketplace isBlocked"), session);
  if (!user || user.isBlocked) {
    const error = new Error("User is not eligible for purchases");
    error.code = "USER_NOT_ELIGIBLE";
    throw error;
  }

  const wallet = await getPurchaseWallet(userId, session);
  if (Number(wallet.level || 1) < Number(item.levelRequired || 1)) {
    const error = new Error(`Creator level ${item.levelRequired} required`);
    error.code = "LEVEL_REQUIRED";
    throw error;
  }

  const inventory = await getInventory(userId, { session });
  const field = CATEGORY_TO_FIELD[item.category];
  if (!field) {
    const error = new Error("This marketplace category is not available yet");
    error.code = "ITEM_UNAVAILABLE";
    throw error;
  }
  const existing = (inventory[field] || []).find((owned) => owned.itemId === item.itemId && (!owned.expiresAt || new Date(owned.expiresAt) > new Date()));

  if (existing && ![MARKETPLACE_CATEGORIES.BOOSTS, MARKETPLACE_CATEGORIES.FEATURED].includes(item.category)) {
    const error = new Error("You already own this item");
    error.code = "ALREADY_OWNED";
    throw error;
  }

  if (item.category === MARKETPLACE_CATEGORIES.BOOSTS) {
    const boostType = item.metadata?.boostType || "feed";
    const activeBoost = await withSession(CreatorBoost.findOne({
      userId,
      boostType,
      status: "active",
      expiresAt: activeDateQuery,
    }), session);
    const cooldown = await withSession(CreatorBoost.findOne({
      userId,
      boostType,
      cooldownUntil: activeDateQuery,
    }).sort({ cooldownUntil: -1 }), session);

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

    const post = await withSession(Feed.findOne({ _id: postId, userId, type: "video", visibility: { $ne: "private" } }), session);
    if (!post) {
      const error = new Error("Featured placement requires one of your public videos");
      error.code = "POST_NOT_FOUND";
      throw error;
    }

    const duplicate = await withSession(FeaturedContent.findOne({
      userId,
      postId,
      status: { $in: ["pending_moderation", "approved", "active"] },
      expiresAt: activeDateQuery,
    }), session);

    if (duplicate) {
      const error = new Error("This video is already in the featured queue");
      error.code = "FEATURED_DUPLICATE";
      throw error;
    }
  }

  return { wallet, inventory, price };
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

const autoEquipInventoryItem = (inventory, item) => {
  const now = new Date();

  if (item.category === MARKETPLACE_CATEGORIES.FRAMES) {
    inventory.ownedFrames.forEach((entry) => {
      entry.equipped = entry.itemId === item.itemId;
      if (entry.equipped) entry.lastEquippedAt = now;
    });
    inventory.active.frame = item.itemId;
  }

  if (item.category === MARKETPLACE_CATEGORIES.THEMES) {
    inventory.ownedThemes.forEach((entry) => {
      entry.equipped = entry.itemId === item.itemId;
      if (entry.equipped) entry.lastEquippedAt = now;
    });
    inventory.active.theme = item.metadata?.themeKey || item.itemId;
  }

  if (item.category === MARKETPLACE_CATEGORIES.BADGES) {
    const activeBadges = new Set(inventory.active.badges || []);
    activeBadges.add(item.itemId);
    inventory.active.badges = Array.from(activeBadges).slice(0, 5);
    inventory.ownedBadges.forEach((entry) => {
      entry.equipped = inventory.active.badges.includes(entry.itemId);
      if (entry.equipped) entry.lastEquippedAt = now;
    });
  }

  if (item.category === MARKETPLACE_CATEGORIES.REACTIONS) {
    const activeReactions = new Set(inventory.active.reactions || []);
    activeReactions.add(item.itemId);
    inventory.active.reactions = Array.from(activeReactions).slice(0, 12);
    inventory.ownedReactions.forEach((entry) => {
      entry.equipped = inventory.active.reactions.includes(entry.itemId);
      if (entry.equipped) entry.lastEquippedAt = now;
    });
  }
};

const addToInventory = async (userId, item, transactionId, session = null) => {
  const inventory = await getInventory(userId, { session });
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
    existing.metadata = { ...(existing.metadata || {}), ...(entry.metadata || {}) };
  } else {
    inventory[field].push(entry);
  }

  if ([MARKETPLACE_CATEGORIES.FRAMES, MARKETPLACE_CATEGORIES.THEMES, MARKETPLACE_CATEGORIES.BADGES, MARKETPLACE_CATEGORIES.REACTIONS].includes(item.category)) {
    autoEquipInventoryItem(inventory, item);
  }

  await inventory.save({ ...(session ? { session } : {}) });
  return inventory;
};

const updateProfilePrestige = async (userId, inventory, session = null) => {
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
  }, { ...(session ? { session } : {}) });
};

const activateBoost = async (userId, item, transactionId, session = null) => {
  const durationHours = Number(item.durationHours || 24);
  const boostType = item.metadata?.boostType || "feed";
  const expiresAt = hoursFromNow(durationHours);
  const cooldownUntil = hoursFromNow(durationHours + Number(item.cooldownHours || 0));

  const [boost] = await CreatorBoost.create([{
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
  }], { ...(session ? { session } : {}) });

  if (["feed", "trending", "spotlight"].includes(boostType)) {
    await Feed.updateMany(
      { userId, visibility: { $ne: "private" } },
      {
        $max: { boostedUntil: expiresAt },
        $inc: { boostScore: Math.round(Number(item.metadata?.multiplier || 1.25) * 20) },
      },
      { ...(session ? { session } : {}) }
    ).catch(() => null);
  }

  return boost;
};

const createFeaturedPlacement = async (userId, item, transactionId, postId, session = null) => {
  const queuePosition = await withSession(FeaturedContent.countDocuments({
    status: { $in: ["pending_moderation", "approved", "active"] },
    expiresAt: activeDateQuery,
  }), session);
  const post = await withSession(Feed.findById(postId).select("views likes shareCount"), session);
  const [featured] = await FeaturedContent.create([{
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
  }], { ...(session ? { session } : {}) });

  await Feed.findByIdAndUpdate(postId, {
    $inc: { boostScore: 45 },
    $max: { boostedUntil: featured.expiresAt },
  }, { ...(session ? { session } : {}) }).catch(() => null);

  return featured;
};

const purchaseItem = async (userId, itemId, options = {}) => {
  validateUserId(userId);
  const safeItemId = String(itemId || "").trim().toLowerCase();

  if (!safeItemId) {
    const error = new Error("Marketplace item is required");
    error.code = "ITEM_REQUIRED";
    throw error;
  }

  const releaseLock = acquireLock(userId, safeItemId);
  let session = null;

  try {
    await ensureCatalog();
    session = await Wallet.startSession();
    session.startTransaction();

    const item = await MarketplaceItem.findOne({ itemId: safeItemId }).session(session);
    const { wallet, price } = await assertCanBuy(userId, item, { ...options, session });

    if (wallet.balance < price) {
      const error = new Error("Insufficient balance");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }

    const updatedWallet = await Wallet.findOneAndUpdate(
      { _id: wallet._id, balance: { $gte: price } },
      {
        $inc: {
          balance: -price,
          lifetimeSpent: price,
        },
      },
      { returnDocument: "after", session }
    );

    if (!updatedWallet) {
      const error = new Error("Insufficient balance");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }

    updatedWallet.updateLevel();
    updatedWallet.updateTokenEstimate();
    await updatedWallet.save({ session });

    const balanceBefore = Number(updatedWallet.balance || 0) + price;
    const balanceAfter = Number(updatedWallet.balance || 0);

    const metadata = sanitizeMetadata({
      itemId: item.itemId,
      category: item.category,
      currency: item.currency || "NEX_POINTS",
      asset: "NEX_POINTS",
      tokenStatus: "points_only",
      futureTokenReady: true,
    });
    const [transaction] = await WalletTransaction.create([{
      userId,
      type: TRANSACTION_TYPES.SPEND,
      amount: price,
      balanceBefore,
      balanceAfter,
      source: TRANSACTION_SOURCES.PURCHASE,
      description: generateTransactionDescription(TRANSACTION_TYPES.SPEND, TRANSACTION_SOURCES.PURCHASE, metadata),
      metadata,
      status: TRANSACTION_STATUS.COMPLETED,
    }], { session });

    const transactionId = transaction?._id;
    const inventory = await addToInventory(userId, item, transactionId, session);
    let boost = null;
    let featured = null;

    if ([MARKETPLACE_CATEGORIES.FRAMES, MARKETPLACE_CATEGORIES.THEMES, MARKETPLACE_CATEGORIES.BADGES, MARKETPLACE_CATEGORIES.REACTIONS].includes(item.category)) {
      await updateProfilePrestige(userId, inventory, session);
    }

    if (item.category === MARKETPLACE_CATEGORIES.BOOSTS) {
      boost = await activateBoost(userId, item, transactionId, session);
    }

    if (item.category === MARKETPLACE_CATEGORIES.FEATURED) {
      featured = await createFeaturedPlacement(userId, item, transactionId, options.postId, session);
    }

    const result = {
      item: publicItem(item),
      wallet: updatedWallet,
      transaction,
      inventory: serializeInventory(inventory),
      boost,
      featured,
    };

    await session.commitTransaction();

    return result;
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
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
