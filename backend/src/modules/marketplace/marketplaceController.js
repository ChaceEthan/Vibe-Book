// @ts-nocheck
const { getIo } = require("../../socket");
const { formatWalletResponse, formatTransactionResponse } = require("../wallet/walletUtils");
const marketplaceService = require("./marketplaceService");
const purchaseService = require("./purchaseService");

const emitToUser = (userId, event, payload = {}) => {
  const io = getIo?.();
  if (io && userId) {
    io.to(userId.toString()).emit(event, payload);
  }
};

const listStore = async (req, res, next) => {
  try {
    const items = await marketplaceService.listStore({
      category: req.query.category,
      includeDisabled: req.user?.role === "admin" || req.user?.accountRole === "admin",
    });
    return res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
};

const getInventory = async (req, res, next) => {
  try {
    const economy = await marketplaceService.getCreatorEconomy(req.user._id);
    return res.json({ success: true, ...economy });
  } catch (error) {
    next(error);
  }
};

const purchaseItem = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await purchaseService.purchaseItem(userId, req.params.itemId || req.body.itemId, {
      postId: req.body.postId,
      source: req.body.source,
    });
    const payload = {
      success: true,
      item: result.item,
      wallet: formatWalletResponse(result.wallet),
      transaction: formatTransactionResponse(result.transaction),
      inventory: result.inventory,
      boost: result.boost,
      featured: result.featured,
      message: `${result.item.name} unlocked with NEX Points`,
    };

    emitToUser(userId, "store:purchase", payload);
    emitToUser(userId, "inventory:update", { inventory: result.inventory });
    if (result.boost) emitToUser(userId, "creator:boost", { boost: result.boost });
    if (result.featured) emitToUser(userId, "featured:update", { featured: result.featured });
    if (result.item.category === "themes") emitToUser(userId, "profile:theme", { inventory: result.inventory });

    return res.status(201).json(payload);
  } catch (error) {
    if (error.code === "INSUFFICIENT_BALANCE") {
      return res.status(402).json({ success: false, message: "Not enough NEX Points for this purchase" });
    }

    if (["ALREADY_OWNED", "LEVEL_REQUIRED", "ITEM_UNAVAILABLE", "BOOST_COOLDOWN", "POST_REQUIRED", "POST_NOT_FOUND", "FEATURED_DUPLICATE", "PURCHASE_LOCKED"].includes(error.code)) {
      return res.status(error.code === "BOOST_COOLDOWN" || error.code === "PURCHASE_LOCKED" ? 429 : 400).json({
        success: false,
        message: error.message,
        cooldownUntil: error.cooldownUntil,
      });
    }

    next(error);
  }
};

const equipItem = async (req, res, next) => {
  try {
    const inventory = await purchaseService.equipItem(req.user._id, req.params.itemId || req.body.itemId, req.body.action || "equip");
    emitToUser(req.user._id, "inventory:update", { inventory });
    emitToUser(req.user._id, "profile:theme", { inventory });
    return res.json({ success: true, inventory, message: "Inventory updated" });
  } catch (error) {
    if (["ITEM_NOT_FOUND", "NOT_OWNED"].includes(error.code)) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const adminUpsertItem = async (req, res, next) => {
  try {
    const item = await marketplaceService.adminUpsertItem(req.body, req.user._id);
    return res.status(201).json({ success: true, item, message: "Marketplace item saved" });
  } catch (error) {
    if (error.code === "INVALID_ITEM") {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const adminFeaturedStatus = async (req, res, next) => {
  try {
    const featured = await marketplaceService.adminUpdateFeaturedStatus(req.params.id, req.body.status, req.user._id, req.body.reason);
    emitToUser(featured.userId, "featured:update", { featured });
    return res.json({ success: true, featured, message: "Featured status updated" });
  } catch (error) {
    if (error.code === "FEATURED_NOT_FOUND") {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const adminOverview = async (req, res, next) => {
  try {
    const overview = await marketplaceService.adminEconomyOverview();
    return res.json({ success: true, overview });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  adminFeaturedStatus,
  adminOverview,
  adminUpsertItem,
  equipItem,
  getInventory,
  listStore,
  purchaseItem,
};
