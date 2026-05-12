// @ts-nocheck
const mongoose = require("mongoose");

const profileThemeSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    themeKey: {
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
    tokens: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    collection: "profileThemes",
    timestamps: true,
  }
);

module.exports = mongoose.model("ProfileTheme", profileThemeSchema);
