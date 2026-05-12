// @ts-nocheck
const mongoose = require("mongoose");

const creatorBoostSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    itemId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    boostType: {
      type: String,
      enum: ["feed", "explore", "trending", "story", "spotlight"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    multiplier: {
      type: Number,
      default: 1,
      min: 1,
    },
    startsAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    cooldownUntil: {
      type: Date,
      index: true,
    },
    estimatedReach: {
      type: String,
      trim: true,
      default: "",
    },
    analytics: {
      impressionsBefore: { type: Number, default: 0 },
      impressionsCurrent: { type: Number, default: 0 },
      clicksCurrent: { type: Number, default: 0 },
      followersCurrent: { type: Number, default: 0 },
    },
    purchaseTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
    },
  },
  {
    collection: "creatorBoosts",
    timestamps: true,
  }
);

creatorBoostSchema.index({ userId: 1, boostType: 1, status: 1, expiresAt: -1 });

module.exports = mongoose.model("CreatorBoost", creatorBoostSchema);
