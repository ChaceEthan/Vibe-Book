const mongoose = require("mongoose");

const feedCommentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    message: {
      type: String,
      trim: true,
      required: true,
      maxlength: 500,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const feedSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    mediaUrl: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => /^https:\/\/res\.cloudinary\.com\//i.test(value || ""),
        message: "Feed media must be a Cloudinary secure URL",
      },
    },
    type: {
      type: String,
      enum: ["image", "video"],
      required: true,
      index: true,
    },
    orientation: {
      type: String,
      enum: ["portrait", "landscape"],
      default: "portrait",
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    shareCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    comments: {
      type: [feedCommentSchema],
      default: [],
    },
  },
  {
    collection: "posts",
    timestamps: true,
  }
);

feedSchema.index({ userId: 1, mediaUrl: 1 }, { unique: true });

module.exports = mongoose.model("Feed", feedSchema);
