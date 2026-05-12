// @ts-nocheck
const mongoose = require("mongoose");
const { MARKETPLACE_CATEGORIES, RARITIES } = require("./marketplaceCatalog");

const marketplaceItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    category: {
      type: String,
      enum: Object.values(MARKETPLACE_CATEGORIES),
      required: true,
      index: true,
    },
    rarity: {
      type: String,
      enum: Object.values(RARITIES),
      default: RARITIES.COMMON,
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ["NEX_POINTS", "NEX_TOKEN"],
      default: "NEX_POINTS",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "disabled", "coming_soon"],
      default: "active",
      index: true,
    },
    levelRequired: {
      type: Number,
      default: 1,
      min: 1,
    },
    durationHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    durationDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    cooldownHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    preview: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    collection: "marketplaceItems",
    timestamps: true,
  }
);

marketplaceItemSchema.index({ category: 1, status: 1, price: 1 });
marketplaceItemSchema.index({ rarity: 1, createdAt: -1 });

module.exports = mongoose.model("MarketplaceItem", marketplaceItemSchema);
