// @ts-nocheck
/**
 * Wallet Model
 * Stores user wallet balance and statistics
 * One wallet per user - auto-created on first access
 */

const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    lifetimeEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    lifetimeSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalReceived: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSent: {
      type: Number,
      default: 0,
      min: 0,
    },
    streakCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastLoginDate: {
      type: Date,
      default: null,
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
    },
    levelName: {
      type: String,
      default: "Starter",
    },
    tokenMigration: {
      pointsPerCoin: {
        type: Number,
        default: () => Number(process.env.NEX_POINTS_PER_COIN || 1000),
      },
      estimatedCoins: {
        type: Number,
        default: 0,
      },
      exportable: {
        type: Boolean,
        default: true,
      },
      stage: {
        type: String,
        enum: ["points", "coin_ready", "migrated"],
        default: "points",
      },
      tokenSymbol: {
        type: String,
        default: () => process.env.NEX_COIN_SYMBOL || "NEX",
      },
      tokenBalance: {
        type: Number,
        default: 0,
        min: 0,
      },
      lockedTokenBalance: {
        type: Number,
        default: 0,
        min: 0,
      },
      migrationEnabled: {
        type: Boolean,
        default: false,
      },
      lastEstimateAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
walletSchema.index({ balance: -1 }); // For leaderboards
walletSchema.index({ lifetimeEarned: -1 }); // For leaderboards
walletSchema.index({ createdAt: -1 });

// Virtual to calculate net balance
walletSchema.virtual("netBalance").get(function () {
  return this.lifetimeEarned - this.lifetimeSpent;
});

// Instance method to update level based on lifetime earned
walletSchema.methods.updateLevel = function () {
  const { USER_LEVELS } = require("./walletConstants");
  const levels = Object.values(USER_LEVELS).sort((a, b) => b.minPoints - a.minPoints);

  for (const level of levels) {
    if (this.lifetimeEarned >= level.minPoints) {
      this.level = level.level;
      this.levelName = level.name;
      break;
    }
  }

  return this;
};

walletSchema.methods.updateTokenEstimate = function () {
  const { nexCoinEstimate } = require("../../utils/pointsCalculator");
  const estimate = nexCoinEstimate(this.balance);

  this.tokenMigration = {
    ...(this.tokenMigration || {}),
    pointsPerCoin: estimate.pointsPerCoin,
    estimatedCoins: estimate.estimatedCoins,
    exportable: true,
    stage: "points",
    tokenSymbol: estimate.tokenSymbol,
    tokenBalance: this.tokenMigration?.tokenBalance || 0,
    lockedTokenBalance: this.tokenMigration?.lockedTokenBalance || 0,
    migrationEnabled: false,
    lastEstimateAt: new Date(),
  };

  return this;
};

module.exports = mongoose.model("Wallet", walletSchema);
