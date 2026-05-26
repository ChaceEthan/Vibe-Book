// @ts-nocheck
const DEFAULT_POINTS_PER_COIN = 1000;

const toPositiveNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const pointsPerCoin = () => toPositiveNumber(process.env.NEX_POINTS_PER_COIN, DEFAULT_POINTS_PER_COIN);

const rewardMetaForDay = (day = 1) => {
  const streakDay = Math.max(1, Math.floor(Number(day || 1)));
  const cycleDay = ((streakDay - 1) % 7) + 1;
  const monthDay = ((streakDay - 1) % 30) + 1;
  const weekIndex = Math.ceil(streakDay / 7);
  const monthIndex = Math.ceil(streakDay / 30);
  const isMonthlyBonus = streakDay % 30 === 0;
  const isWeeklyBonus = !isMonthlyBonus && streakDay % 7 === 0;
  const isMomentumBonus = !isMonthlyBonus && !isWeeklyBonus && streakDay % 3 === 0;

  let amount = 10;
  let rewardType = "daily";
  let multiplier = 1;
  let label = "Daily claim";

  if (isMonthlyBonus) {
    amount = 500;
    rewardType = "monthly";
    multiplier = 50;
    label = "Monthly prestige";
  } else if (isWeeklyBonus) {
    amount = 75;
    rewardType = "weekly";
    multiplier = 7.5;
    label = "Weekly boost";
  } else if (isMomentumBonus) {
    amount = 25;
    rewardType = "momentum";
    multiplier = 2.5;
    label = "Momentum boost";
  }

  return {
    amount,
    streakDay,
    cycleDay,
    monthDay,
    weekIndex,
    monthIndex,
    rewardType,
    label,
    multiplier,
    isWeeklyBonus,
    isMonthlyBonus,
    isMomentumBonus,
  };
};

const dailyRewardForStreak = (streakCount = 0) => {
  const nextStreak = Math.max(1, Math.floor(Number(streakCount || 0)) + 1);
  return {
    ...rewardMetaForDay(nextStreak),
    nextStreak,
  };
};

const dailyRewardProgress = (streakCount = 0) => {
  const currentStreak = Math.max(0, Math.floor(Number(streakCount || 0)));
  const nextStreak = currentStreak + 1;
  const monthIndex = Math.max(1, Math.ceil(nextStreak / 30));
  const monthStart = (monthIndex - 1) * 30 + 1;

  return {
    currentStreak,
    nextStreak,
    monthIndex,
    monthStart,
    monthEnd: monthStart + 29,
    monthDay: ((nextStreak - 1) % 30) + 1,
    days: Array.from({ length: 30 }, (_, index) => {
      const streakDay = monthStart + index;
      return {
        ...rewardMetaForDay(streakDay),
        completed: streakDay <= currentStreak,
        next: streakDay === nextStreak,
      };
    }),
  };
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
  dailyRewardProgress,
  dailyRewardForStreak,
  engagementRewardFor,
  nexCoinEstimate,
  pointsPerCoin,
  rewardMetaForDay,
};
