// @ts-nocheck
const express = require("express");
const rateLimit = require("express-rate-limit");

const adminMiddleware = require("../../middleware/adminMiddleware");
const authMiddleware = require("../../middleware/authMiddleware");
const controller = require("./marketplaceController");

const router = express.Router();

const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many marketplace actions. Please slow down.", data: null },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many marketplace admin actions. Please slow down.", data: null },
});

router.get("/items", authMiddleware, controller.listStore);
router.get("/inventory", authMiddleware, controller.getInventory);
router.post("/purchase/:itemId", authMiddleware, purchaseLimiter, controller.purchaseItem);
router.post("/inventory/:itemId/equip", authMiddleware, purchaseLimiter, controller.equipItem);
router.post("/inventory/:itemId/unequip", authMiddleware, purchaseLimiter, (req, res, next) => {
  req.body.action = "unequip";
  return controller.equipItem(req, res, next);
});

router.get("/admin/overview", authMiddleware, adminMiddleware, adminLimiter, controller.adminOverview);
router.post("/admin/items", authMiddleware, adminMiddleware, adminLimiter, controller.adminUpsertItem);
router.patch("/admin/featured/:id", authMiddleware, adminMiddleware, adminLimiter, controller.adminFeaturedStatus);

module.exports = router;
