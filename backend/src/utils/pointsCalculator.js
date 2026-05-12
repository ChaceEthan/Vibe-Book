// @ts-nocheck
const DEFAULT_POINTS_PER_COIN = 1000;

const toPositiveNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const pointsPerCoin = () => toPositiveNumber(process.env.NEX_POINTS_PER_COIN, DEFAULT_POINTS_PER_COIN);

const dailyRewardForStreak = (streakCount = 0) => {
  const nextStreak = Math.max(1, Number(streakCount || 0) + 1);

  if (nextStreak % 30 === 0) {
    return { amount: 500, streakDay: 30, nextStreak };
  }

  if (nextStreak % 7 === 0) {
    return { amount: 75, streakDay: 7, nextStreak };
  }

  if (nextStreak % 3 === 0) {
    return { amount: 25, streakDay: 3, nextStreak };
  }

  return { amount: 10, streakDay: 1, nextStreak };
};

const engagementRewardFor = (actionType, metrics = {}) => {
  const type = String(actionType || "").trim().toLowerCase();
  const count = Math.max(1, Number(metrics.count || metrics.views || metrics.likes || 1));
  const watchedSeconds = Math.max(0, Number(metrics.watchedSeconds || metrics.watchTime || 0));

  const rewardMap = {
    post_view: count >= 100 ? 5 : 0,
    like: count >= 10 ? 2 : 0,
    comment: String(metrics.comment || "").trim().length >= 12 ? 3 : 0,
    share: 4,
    profile_visit: 1,
    follow: 5,
    livestream: Math.max(10, Math.floor(watchedSeconds / 300) * 5),
    watch_time: Math.max(0, Math.floor(watchedSeconds / 60)),
    referral_signup: 50,
  };

  return Math.max(0, Math.floor(rewardMap[type] || 0));
};

const nexCoinEstimate = (points = 0) => {
  const rate = pointsPerCoin();
  return {
    points: Math.max(0, Number(points || 0)),
    pointsPerCoin: rate,
    estimatedCoins: Math.max(0, Number(points || 0)) / rate,
    migrationReady: true,
    tokenSymbol: process.env.NEX_COIN_SYMBOL || "NEX",
  };
};

module.exports = {
  DEFAULT_POINTS_PER_COIN,
  dailyRewardForStreak,
  engagementRewardFor,
  nexCoinEstimate,
  pointsPerCoin,
};
