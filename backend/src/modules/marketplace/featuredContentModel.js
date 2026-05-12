// @ts-nocheck
const mongoose = require("mongoose");

const featuredContentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Feed",
      required: true,
      index: true,
    },
    itemId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ["pending_moderation", "approved", "active", "expired", "rejected", "cancelled"],
      default: "pending_moderation",
      index: true,
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
    queuePosition: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    moderation: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: { type: Date },
      reason: { type: String, trim: true, default: "" },
    },
    analytics: {
      viewsBefore: { type: Number, default: 0 },
      viewsCurrent: { type: Number, default: 0 },
      likesCurrent: { type: Number, default: 0 },
      sharesCurrent: { type: Number, default: 0 },
    },
    purchaseTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
    },
  },
  {
    collection: "featuredContent",
    timestamps: true,
  }
);

featuredContentSchema.index({ status: 1, queuePosition: 1, createdAt: 1 });
featuredContentSchema.index({ userId: 1, postId: 1, status: 1 });

module.exports = mongoose.model("FeaturedContent", featuredContentSchema);
