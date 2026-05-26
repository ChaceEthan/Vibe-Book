// @ts-nocheck
/**
 * Wallet Utilities
 * Helper functions for wallet operations
 */

const { USER_LEVELS } = require("./walletConstants");
const { dailyRewardProgress } = require("../../utils/pointsCalculator");

/**
 * Calculate user level based on lifetime earned points
 */
const calculateLevel = (lifetimeEarned) => {
  const levels = Object.values(USER_LEVELS).sort((a, b) => b.minPoints - a.minPoints);

  for (const level of levels) {
    if (lifetimeEarned >= level.minPoints) {
      return level;
    }
  }

  return USER_LEVELS.STARTER;
};

/**
 * Validate transaction amount
 */
const validateAmount = (amount) => {
  const num = Number(amount);

  if (!Number.isFinite(num)) {
    throw new Error("Invalid amount: must be a number");
  }

  if (num <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  if (num > 1000000) {
    throw new Error("Amount exceeds maximum limit");
  }

  return Math.floor(num); // Ensure integer points
};

/**
 * Validate userId
 */
const validateUserId = (userId) => {
  if (!userId || !userId.toString().match(/^[0-9a-fA-F]{24}$/)) {
    throw new Error("Invalid user ID");
  }
};

/**
 * Sanitize metadata object
 */
const sanitizeMetadata = (metadata) => {
  if (!metadata) {
    return {};
  }

  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  // Allow only safe properties
  const safe = {};
  const allowedKeys = [
    "giftId",
    "referrerId",
    "referredUserId",
    "videoId",
    "streamId",
    "reason",
    "description",
    "contentId",
    "itemId",
    "category",
    "currency",
    "futureTokenReady",
    "date",
    "streakDay",
    "cycleDay",
    "monthDay",
    "weekIndex",
    "monthIndex",
    "nextStreak",
    "multiplier",
    "rewardType",
    "rewardLabel",
    "isWeeklyBonus",
    "isMonthlyBonus",
    "streakReset",
    "mysteryBonus",
    "boostType",
    "postId",
    "originalTransactionId",
    "actionType",
    "actorId",
    "targetId",
    "dedupeKey",
    "cooldownMs",
    "qrId",
    "qrPayload",
    "recipientId",
    "senderId",
    "redemptionId",
    "conversionRate",
    "nexCoinEstimate",
    "walletTransferId",
    "receiverIdentifier",
    "receiverWalletId",
    "senderWalletId",
    "nexHandle",
    "memo",
    "transferMethod",
    "asset",
    "tokenStage",
    "tokenStatus",
    "chain",
  ];

  for (const key of allowedKeys) {
    if (key in metadata) {
      const value = metadata[key];
      // Ensure values are safe strings/numbers
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        safe[key] = value;
      }
    }
  }

  return safe;
};

/**
 * Format wallet response
 */
const formatWalletResponse = (wallet) => {
  if (!wallet) {
    return null;
  }

  return {
    userId: wallet.userId,
    balance: wallet.balance,
    lifetimeEarned: wallet.lifetimeEarned,
    lifetimeSpent: wallet.lifetimeSpent,
    totalReceived: wallet.totalReceived,
    totalSent: wallet.totalSent,
    streakCount: wallet.streakCount,
    lastLoginDate: wallet.lastLoginDate,
    level: wallet.level,
    levelName: wallet.levelName,
    tokenMigration: wallet.tokenMigration || {},
    tokenBalance: wallet.tokenMigration?.estimatedCoins || 0,
    dailyProgress: dailyRewardProgress(wallet.streakCount),
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
  };
};

/**
 * Format transaction response
 */
const formatTransactionResponse = (transaction) => {
  if (!transaction) {
    return null;
  }

  return {
    _id: transaction._id,
    type: transaction.type,
    amount: transaction.amount,
    source: transaction.source,
    description: transaction.description,
    balanceBefore: transaction.balanceBefore,
    balanceAfter: transaction.balanceAfter,
    status: transaction.status,
    metadata: transaction.metadata || {},
    relatedUserId: transaction.relatedUserId,
    createdAt: transaction.createdAt,
  };
};

/**
 * Generate transaction description
 */
const generateTransactionDescription = (type, source, metadata) => {
  const descriptions = {
    daily_login: "Daily login bonus",
    video_upload: "Video upload reward",
    live_stream: "Live stream starter reward",
    gift_received: "Gift received",
    referral: "Referral signup bonus",
    system_bonus: "System bonus",
    creator_earnings: "Creator earnings",
    purchase: "Purchase",
    admin_manual: "Admin adjustment",
    refund: "Refund",
    trending_content: "Trending content reward",
    first_time_bonus: "First time bonus",
    redeem: "Redeemed reward",
    qr_transfer: "QR wallet transfer",
    post_view: "Post view reward",
    like_reward: "Like milestone reward",
    comment_reward: "Meaningful comment reward",
    share_reward: "Share reward",
    profile_visit: "Profile visit reward",
    follow_reward: "Follower reward",
    watch_time: "Video watch-time reward",
  };

  return descriptions[source] || `${type} transaction`;
};

module.exports = {
  calculateLevel,
  validateAmount,
  validateUserId,
  sanitizeMetadata,
  formatWalletResponse,
  formatTransactionResponse,
  generateTransactionDescription,
};
