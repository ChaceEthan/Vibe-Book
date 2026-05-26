// @ts-nocheck
/**
 * LiveSession Model
 * Tracks individual viewer sessions in a livestream
 */

const mongoose = require("mongoose");

const liveSessionSchema = new mongoose.Schema(
  {
    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveStream",
      required: true,
      index: true,
    },
    viewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null, // null for anonymous viewers
    },
    viewerName: {
      type: String,
      trim: true,
      default: "Guest",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    leftAt: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    interactions: {
      comments: {
        type: Number,
        default: 0,
        min: 0,
      },
      reactions: {
        type: Number,
        default: 0,
        min: 0,
      },
      giftsReceived: {
        type: Number,
        default: 0,
        min: 0,
      },
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
liveSessionSchema.index({ streamId: 1, viewerId: 1 });
liveSessionSchema.index({ streamId: 1, isActive: 1 });
liveSessionSchema.index({ viewerId: 1, streamId: 1 });

// Calculate duration when session ends
liveSessionSchema.pre("save", function () {
  if (this.leftAt && this.joinedAt) {
    this.duration = Math.floor((this.leftAt - this.joinedAt) / 1000);
    this.isActive = false;
  }
});

module.exports = mongoose.model("LiveSession", liveSessionSchema);
