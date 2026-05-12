// @ts-nocheck
const mongoose = require("mongoose");
const { MARKETPLACE_CATEGORIES } = require("./marketplaceCatalog");

const inventoryItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    marketplaceItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketplaceItem",
    },
    category: {
      type: String,
      enum: Object.values(MARKETPLACE_CATEGORIES),
      required: true,
    },
    owned: {
      type: Boolean,
      default: true,
    },
    equipped: {
      type: Boolean,
      default: false,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    acquiredAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
    },
    lastEquippedAt: {
      type: Date,
    },
    purchaseTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: true }
);

const userInventorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    ownedFrames: {
      type: [inventoryItemSchema],
      default: [],
    },
    ownedBadges: {
      type: [inventoryItemSchema],
      default: [],
    },
    ownedReactions: {
      type: [inventoryItemSchema],
      default: [],
    },
    ownedThemes: {
      type: [inventoryItemSchema],
      default: [],
    },
    ownedBoosts: {
      type: [inventoryItemSchema],
      default: [],
    },
    ownedFeatured: {
      type: [inventoryItemSchema],
      default: [],
    },
    active: {
      frame: { type: String, trim: true, default: "" },
      theme: { type: String, trim: true, default: "" },
      badges: { type: [String], default: [] },
      reactions: { type: [String], default: [] },
    },
    futureTokenReady: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "userInventory",
    timestamps: true,
  }
);

userInventorySchema.index({ "ownedFrames.itemId": 1 });
userInventorySchema.index({ "ownedBadges.itemId": 1 });
userInventorySchema.index({ "ownedReactions.itemId": 1 });
userInventorySchema.index({ "ownedThemes.itemId": 1 });
userInventorySchema.index({ "ownedBoosts.itemId": 1 });

module.exports = mongoose.model("UserInventory", userInventorySchema);
