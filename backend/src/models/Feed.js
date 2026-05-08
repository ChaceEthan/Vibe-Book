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
    watchTime: {
      type: Number,
      default: 0,
      min: 0,
    },
    completionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    replays: {
      type: Number,
      default: 0,
      min: 0,
    },
    engagementScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    viralScore: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    trendScore: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    engagementVelocity: {
      type: Number,
      default: 0,
      min: 0,
    },
    shareCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    saves: {
      type: Number,
      default: 0,
      min: 0,
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    skips: {
      type: Number,
      default: 0,
      min: 0,
    },
    reports: {
      type: Number,
      default: 0,
      min: 0,
    },
    notInterestedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    emotion: {
      type: String,
      trim: true,
      default: "neutral",
      index: true,
    },
    distributionStage: {
      type: String,
      enum: ["test", "expansion_1k", "expansion_10k", "viral"],
      default: "test",
      index: true,
    },
    lastEngagementAt: {
      type: Date,
    },
    aiMetadata: {
      topics: {
        type: [String],
        default: [],
      },
      emotion: {
        type: String,
        trim: true,
        default: "neutral",
      },
      language: {
        type: String,
        trim: true,
        default: "unknown",
      },
      hashtags: {
        type: [String],
        default: [],
      },
      category: {
        type: String,
        trim: true,
        default: "",
      },
      moderation: {
        type: String,
        trim: true,
        default: "pending",
      },
      transcript: {
        type: String,
        trim: true,
        default: "",
      },
      subtitleUrl: {
        type: String,
        trim: true,
        default: "",
      },
    },
    boostedUntil: {
      type: Date,
    },
    boostScore: {
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
    savedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    reportedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    notInterestedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    viewedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
        watchedSeconds: {
          type: Number,
          default: 0,
          min: 0,
        },
        completionRate: {
          type: Number,
          default: 0,
          min: 0,
          max: 1,
        },
      },
    ],
    uniqueViewerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastViewedAt: {
      type: Date,
    },
    ownerViewTracked: {
      type: Boolean,
      default: false,
    },
    visibility: {
      type: String,
      enum: ["public", "private", "draft"],
      default: "public",
      index: true,
    },
    commentsEnabled: {
      type: Boolean,
      default: true,
    },
    category: {
      type: String,
      trim: true,
      default: "",
    },
    monetized: {
      type: Boolean,
      default: false,
    },
    adSafe: {
      type: Boolean,
      default: true,
    },
    copyrightSafe: {
      type: Boolean,
      default: true,
    },
    rpm: {
      type: Number,
      default: 0,
      min: 0,
    },
    cpm: {
      type: Number,
      default: 0,
      min: 0,
    },
    revenueGenerated: {
      type: Number,
      default: 0,
      min: 0,
    },
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
feedSchema.index({ type: 1, viralScore: -1, createdAt: -1 });
feedSchema.index({ tags: 1, createdAt: -1 });
feedSchema.index({ visibility: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("Feed", feedSchema);
