// @ts-nocheck
/**
 * LiveStream Model
 * Stores active and completed livestreams
 */

const mongoose = require("mongoose");

const liveStreamSchema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    category: {
      type: String,
      enum: ["gaming", "music", "art", "talk", "performance", "education", "lifestyle", "other"],
      default: "other",
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      maxlength: 5,
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "ended", "archived"],
      default: "live",
      index: true,
    },
    privacyLevel: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "public",
    },
    thumbnail: {
      type: String,
      default: null,
    },
    coverImage: {
      type: String,
      default: null,
    },
    streamUrl: {
      type: String,
      trim: true,
      default: null,
    },
    streamKey: {
      type: String,
      trim: true,
      select: false,
      default: null,
    },
    viewerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxViewers: {
      type: Number,
      default: 0,
      min: 0,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    settings: {
      commentsEnabled: {
        type: Boolean,
        default: true,
      },
      giftsEnabled: {
        type: Boolean,
        default: true,
      },
      allowReactions: {
        type: Boolean,
        default: true,
      },
      moderatorIds: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "User",
        default: [],
      },
      qualityOptions: {
        type: [String],
        enum: ["360p", "480p", "720p", "1080p"],
        default: ["720p"],
      },
      selectedQuality: {
        type: String,
        enum: ["360p", "480p", "720p", "1080p"],
        default: "720p",
      },
      followerOnlyChat: {
        type: Boolean,
        default: false,
      },
      moderationEnabled: {
        type: Boolean,
        default: true,
      },
      liveNotifications: {
        type: Boolean,
        default: true,
      },
      beautyFilter: {
        type: String,
        trim: true,
        default: "natural",
        maxlength: 40,
      },
      backgroundTheme: {
        type: String,
        trim: true,
        default: "classic",
        maxlength: 40,
      },
      effectsPreset: {
        type: String,
        trim: true,
        default: "none",
        maxlength: 40,
      },
      pkBattleReady: {
        type: Boolean,
        default: false,
      },
      mutedUsers: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "User",
        default: [],
      },
      blockedUsers: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: "User",
        default: [],
      },
      slowModeEnabled: {
        type: Boolean,
        default: false,
      },
      slowModeSeconds: {
        type: Number,
        default: 10,
        min: 0,
        max: 120,
      },
    },
    panel: {
      limit: {
        type: Number,
        default: 10,
        min: 1,
        max: 10,
      },
      layout: {
        type: String,
        enum: ["solo", "side-by-side", "grid", "extended-grid", "host-focus", "active-speaker"],
        default: "solo",
      },
      locked: {
        type: Boolean,
        default: false,
      },
      activeGuests: {
        type: [
          {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
            username: { type: String, default: "Viewer", maxlength: 80 },
            avatar: { type: String, default: "" },
            micEnabled: { type: Boolean, default: true },
            cameraEnabled: { type: Boolean, default: true },
            muted: { type: Boolean, default: false },
            connectionStatus: { type: String, enum: ["connecting", "connected", "disconnected"], default: "connecting" },
            joinedAt: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
      pendingRequests: {
        type: [
          {
            requestId: { type: String, required: true },
            viewerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
            username: { type: String, default: "Viewer", maxlength: 80 },
            avatar: { type: String, default: "" },
            status: { type: String, enum: ["pending", "approved", "rejected", "cancelled", "expired"], default: "pending" },
            createdAt: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
      pendingInvites: {
        type: [
          {
            inviteId: { type: String, required: true },
            hostUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            viewerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
            username: { type: String, default: "Viewer", maxlength: 80 },
            avatar: { type: String, default: "" },
            status: { type: String, enum: ["pending", "approved", "rejected", "cancelled", "expired"], default: "pending" },
            createdAt: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
    },
    stats: {
      totalViews: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalEngagement: {
        type: Number,
        default: 0,
        min: 0,
      },
      giftsReceived: {
        type: Number,
        default: 0,
        min: 0,
      },
      giftValue: {
        type: Number,
        default: 0,
        min: 0,
      },
      avgViewDuration: {
        type: Number,
        default: 0,
        min: 0,
      },
      topSupporters: {
        type: [
          {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            username: {
              type: String,
              default: "Viewer",
              maxlength: 80,
            },
            avatar: {
              type: String,
              default: "",
            },
            total: {
              type: Number,
              default: 0,
              min: 0,
            },
            count: {
              type: Number,
              default: 0,
              min: 0,
            },
            lastGiftAt: {
              type: Date,
              default: null,
            },
          },
        ],
        default: [],
      },
      giftLog: {
        type: [
          {
            transactionId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "WalletTransaction",
            },
            senderId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            senderName: {
              type: String,
              default: "Viewer",
              maxlength: 80,
            },
            giftId: {
              type: String,
              default: "",
              maxlength: 80,
            },
            giftName: {
              type: String,
              default: "",
              maxlength: 120,
            },
            value: {
              type: Number,
              default: 0,
              min: 0,
            },
            tier: {
              type: String,
              default: "small",
              maxlength: 40,
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
        default: [],
      },
    },
    scheduledStartTime: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    replayUrl: {
      type: String,
      default: null,
    },
    replayExpireAt: {
      type: Date,
      default: null,
    },
    isLive: {
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
    timestamps: true,
  }
);

// Indexes for common queries
liveStreamSchema.index({ creatorId: 1, status: 1 });
liveStreamSchema.index({ isLive: 1, status: 1 });
liveStreamSchema.index({ category: 1, isLive: 1 });
liveStreamSchema.index({ startedAt: -1 });
liveStreamSchema.index({ viewerCount: -1 });

// Calculate duration for ended streams
liveStreamSchema.pre("save", function () {
  if (this.status === "ended" && this.startedAt && this.endedAt) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
});

module.exports = mongoose.model("LiveStream", liveStreamSchema);
