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
  HEART: {
    id: "heart",
    name: "Heart",
    color: "rose",
    pointsCost: 1,
    creatorRewardPercent: 50,
    animation: "floating_hearts",
    emoji: "❤️",
    tier: "small",
  },
  ROSE: {
    id: "rose",
    name: "Rose",
    color: "red",
    pointsCost: 5,
    creatorRewardPercent: 50,
    animation: "flying_roses",
    emoji: "🌹",
    tier: "small",
  },
  FLOWER_BOUQUET: {
    id: "flower_bouquet",
    name: "Flower Bouquet",
    color: "pink",
    pointsCost: 15,
    creatorRewardPercent: 55,
    animation: "bouquet_bloom",
    emoji: "💐",
    tier: "small",
  },
  FIRE: {
    id: "fire",
    name: "Fire",
    color: "orange",
    pointsCost: 10,
    creatorRewardPercent: 60,
    animation: "fire_burst",
    emoji: "🔥",
    tier: "small",
  },
  DIAMOND: {
    id: "diamond",
    name: "Diamond",
    color: "cyan",
    pointsCost: 25,
    creatorRewardPercent: 65,
    animation: "diamond_sparkle",
    emoji: "💎",
    tier: "small",
  },
  CROWN: {
    id: "crown",
    name: "Crown",
    color: "gold",
    pointsCost: 50,
    creatorRewardPercent: 70,
    animation: "crown_shine",
    emoji: "👑",
    tier: "medium",
  },
  ROCKET: {
    id: "rocket",
    name: "Rocket",
    color: "blue",
    pointsCost: 100,
    creatorRewardPercent: 75,
    animation: "rocket_launch",
    emoji: "🚀",
    tier: "medium",
  },
  SPORTS_CAR: {
    id: "sports_car",
    name: "Sports Car",
    color: "red",
    pointsCost: 250,
    creatorRewardPercent: 75,
    animation: "car_sweep",
    emoji: "🏎️",
    tier: "medium",
  },
  MAGIC_BOX: {
    id: "magic_box",
    name: "Magic Box",
    color: "violet",
    pointsCost: 500,
    creatorRewardPercent: 78,
    animation: "magic_box",
    emoji: "🎁",
    tier: "medium",
  },
  LION: {
    id: "lion",
    name: "Lion",
    color: "amber",
    pointsCost: 1000,
    creatorRewardPercent: 75,
    animation: "lion_roar",
    emoji: "🦁",
    tier: "premium",
  },
  UNIVERSE: {
    id: "universe",
    name: "Universe",
    color: "violet",
    pointsCost: 5000,
    creatorRewardPercent: 85,
    animation: "universe_burst",
    emoji: "🌌",
    tier: "premium",
  },
  CASTLE: {
    id: "castle",
    name: "Castle",
    color: "indigo",
    pointsCost: 2000,
    creatorRewardPercent: 82,
    animation: "castle_glow",
    emoji: "🏰",
    tier: "premium",
  },
  DRAGON: {
    id: "dragon",
    name: "Dragon",
    color: "emerald",
    pointsCost: 3000,
    creatorRewardPercent: 84,
    animation: "dragon_flight",
    emoji: "🐉",
    tier: "premium",
  },
  GALAXY_STORM: {
    id: "galaxy_storm",
    name: "Galaxy Storm",
    color: "fuchsia",
    pointsCost: 7500,
    creatorRewardPercent: 88,
    animation: "galaxy_storm",
    emoji: "✨",
    tier: "premium",
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
