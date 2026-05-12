// @ts-nocheck
const CreatorBoost = require("./creatorBoostModel");
const FeaturedContent = require("./featuredContentModel");
const MarketplaceItem = require("./marketplaceItemModel");
const purchaseService = require("./purchaseService");

const listStore = purchaseService.getCatalog;

const getUserInventory = async (userId) => {
  const inventory = await purchaseService.getInventory(userId);
  return purchaseService.serializeInventory(inventory);
};

const getCreatorEconomy = async (userId) => {
  const [inventory, boosts, featured] = await Promise.all([
    getUserInventory(userId),
    CreatorBoost.find({ userId, status: "active", expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1 }).lean(),
    FeaturedContent.find({ userId, status: { $in: ["pending_moderation", "approved", "active"] }, expiresAt: { $gt: new Date() } })
      .sort({ queuePosition: 1, createdAt: 1 })
      .lean(),
  ]);

  return { inventory, boosts, featured };
};

const adminUpsertItem = async (payload = {}, adminId) => {
  const itemId = String(payload.itemId || payload.name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");

  if (!itemId || !payload.name || !payload.category) {
    const error = new Error("itemId, name, and category are required");
    error.code = "INVALID_ITEM";
    throw error;
  }

  const update = {
    itemId,
    name: String(payload.name).trim().slice(0, 80),
    description: String(payload.description || "").trim().slice(0, 500),
    category: payload.category,
    rarity: payload.rarity || "common",
    price: Math.max(0, Number(payload.price || 0)),
    currency: payload.currency || "NEX_POINTS",
    status: payload.status || "active",
    levelRequired: Math.max(1, Number(payload.levelRequired || 1)),
    durationHours: Math.max(0, Number(payload.durationHours || 0)),
    durationDays: Math.max(0, Number(payload.durationDays || 0)),
    cooldownHours: Math.max(0, Number(payload.cooldownHours || 0)),
    preview: payload.preview && typeof payload.preview === "object" ? payload.preview : {},
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    createdBy: adminId,
  };

  const item = await MarketplaceItem.findOneAndUpdate(
    { itemId },
    { $set: update },
    { upsert: true, new: true, runValidators: true }
  );

  return purchaseService.publicItem(item);
};

const adminUpdateFeaturedStatus = async (featuredId, status, adminId, reason = "") => {
  const featured = await FeaturedContent.findByIdAndUpdate(
    featuredId,
    {
      $set: {
        status,
        moderation: {
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reason: String(reason || "").slice(0, 300),
        },
      },
    },
    { new: true, runValidators: true }
  );

  if (!featured) {
    const error = new Error("Featured placement not found");
    error.code = "FEATURED_NOT_FOUND";
    throw error;
  }

  return featured;
};

const adminEconomyOverview = async () => {
  const [items, activeBoosts, featuredQueue] = await Promise.all([
    MarketplaceItem.countDocuments({ status: "active" }),
    CreatorBoost.countDocuments({ status: "active", expiresAt: { $gt: new Date() } }),
    FeaturedContent.find({ status: { $in: ["pending_moderation", "approved", "active"] }, expiresAt: { $gt: new Date() } })
      .sort({ queuePosition: 1, createdAt: 1 })
      .limit(50)
      .populate("userId", "name username profilePicture profileImage")
      .populate("postId", "caption mediaUrl type views likes")
      .lean(),
  ]);

  return { items, activeBoosts, featuredQueue };
};

module.exports = {
  listStore,
  getUserInventory,
  getCreatorEconomy,
  adminUpsertItem,
  adminUpdateFeaturedStatus,
  adminEconomyOverview,
};
