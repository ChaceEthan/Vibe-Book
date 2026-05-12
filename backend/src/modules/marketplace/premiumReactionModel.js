// @ts-nocheck
const mongoose = require("mongoose");

const premiumReactionSchema = new mongoose.Schema(
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
    },
    emoji: {
      type: String,
      trim: true,
      default: "",
    },
    animation: {
      type: String,
      trim: true,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    collection: "premiumReactions",
    timestamps: true,
  }
);

module.exports = mongoose.model("PremiumReaction", premiumReactionSchema);
