// @ts-nocheck
/**
 * Wallet Constants
 * Core constants for the NEX Points economy system
 * Prepared for future migration to NEX COIN token
 */

const WALLET_CONFIG = {
  CURRENCY_NAME: "NEX Points",
  CURRENCY_SYMBOL: "NEX",
  FUTURE_TOKEN_NAME: "NEX COIN",
  FUTURE_TOKEN_SYMBOL: "NEX",
};

const TRANSACTION_TYPES = {
  EARN: "earn",
  SPEND: "spend",
  GIFT: "gift",
  REWARD: "reward",
  BONUS: "bonus",
  REFERRAL: "referral",
  ADMIN_ADJUSTMENT: "admin_adjustment",
  TRANSFER: "transfer",
};

const TRANSACTION_SOURCES = {
  DAILY_LOGIN: "daily_login",
  VIDEO_UPLOAD: "video_upload",
  LIVE_STREAM: "live_stream",
  GIFT_SENT: "gift_sent",
  GIFT_RECEIVED: "gift_received",
  REFERRAL: "referral",
  SYSTEM_BONUS: "system_bonus",
  CREATOR_EARNINGS: "creator_earnings",
  PURCHASE: "purchase",
  ADMIN_MANUAL: "admin_manual",
  REFUND: "refund",
  TRENDING_CONTENT: "trending_content",
  FIRST_TIME_BONUS: "first_time_bonus",
  REDEEM: "redeem",
  QR_TRANSFER: "qr_transfer",
  TRANSFER: "transfer",
  POST_VIEW: "post_view",
  LIKE_REWARD: "like_reward",
  COMMENT_REWARD: "comment_reward",
  SHARE_REWARD: "share_reward",
  PROFILE_VISIT: "profile_visit",
  FOLLOW_REWARD: "follow_reward",
  WATCH_TIME: "watch_time",
};

const TRANSACTION_STATUS = {
  COMPLETED: "completed",
  PENDING: "pending",
  FAILED: "failed",
  REVERSED: "reversed",
};

// Reward amounts for different activities
const REWARD_AMOUNTS = {
  DAILY_LOGIN: 10,
  VIDEO_UPLOAD: 20,
  LIVE_STREAM_START: 50,
  REFERRAL_SIGNUP: 50,
  TRENDING_CONTENT: 200,
  FIRST_TIME_BONUS: 500,
};

// User levels based on lifetime earned
const USER_LEVELS = {
  STARTER: { level: 1, minPoints: 0, name: "Starter" },
  CLIMBER: { level: 2, minPoints: 500, name: "Climber" },
  INFLUENCER: { level: 3, minPoints: 2000, name: "Influencer" },
  SUPERSTAR: { level: 4, minPoints: 5000, name: "Superstar" },
  LEGEND: { level: 5, minPoints: 10000, name: "Legend" },
};

const GIFT_DEFINITIONS = {
  ROSE: {
    id: "rose",
    name: "Rose",
    color: "red",
    pointsCost: 10,
    creatorRewardPercent: 50,
    animation: "rose_float",
  },
  FIRE: {
    id: "fire",
    name: "Fire",
    color: "orange",
    pointsCost: 50,
    creatorRewardPercent: 60,
    animation: "fire_burst",
  },
  CROWN: {
    id: "crown",
    name: "Crown",
    color: "gold",
    pointsCost: 100,
    creatorRewardPercent: 70,
    animation: "crown_shine",
  },
  LION: {
    id: "lion",
    name: "Lion",
    color: "amber",
    pointsCost: 250,
    creatorRewardPercent: 75,
    animation: "lion_roar",
  },
  ROCKET: {
    id: "rocket",
    name: "Rocket",
    color: "blue",
    pointsCost: 750,
    creatorRewardPercent: 80,
    animation: "rocket_launch",
  },
  UNIVERSE: {
    id: "universe",
    name: "Universe",
    color: "violet",
    pointsCost: 1500,
    creatorRewardPercent: 85,
    animation: "universe_burst",
  },
  DIAMOND: {
    id: "diamond",
    name: "Diamond",
    color: "purple",
    pointsCost: 500,
    creatorRewardPercent: 80,
    animation: "diamond_sparkle",
  },
};

const DAILY_LOGIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const VIDEO_UPLOAD_COOLDOWN_MS = 60 * 1000; // 1 minute (prevent spam)
const TRANSFER_COOLDOWN_MS = 60 * 1000; // 1 minute (prevent spam)
const REFERRAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (per referral unique)

module.exports = {
  WALLET_CONFIG,
  TRANSACTION_TYPES,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUS,
  REWARD_AMOUNTS,
  USER_LEVELS,
  GIFT_DEFINITIONS,
  DAILY_LOGIN_COOLDOWN_MS,
  VIDEO_UPLOAD_COOLDOWN_MS,
  TRANSFER_COOLDOWN_MS,
  REFERRAL_COOLDOWN_MS,
};
