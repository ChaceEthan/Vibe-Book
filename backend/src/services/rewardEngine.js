// @ts-nocheck
const mongoose = require("mongoose");

const WalletTransaction = require("../modules/wallet/walletTransactionModel");
const walletService = require("../modules/wallet/walletService");
const { TRANSACTION_SOURCES } = require("../modules/wallet/walletConstants");
const { engagementRewardFor } = require("../utils/pointsCalculator");

const DEFAULT_COOLDOWNS = {
  post_view: 10 * 60 * 1000,
  like: 60 * 60 * 1000,
  comment: 5 * 60 * 1000,
  share: 10 * 60 * 1000,
  profile_visit: 60 * 60 * 1000,
  follow: 24 * 60 * 60 * 1000,
  livestream: 10 * 60 * 1000,
  watch_time: 10 * 60 * 1000,
  referral_signup: 7 * 24 * 60 * 60 * 1000,
};

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";
const isValidId = (value) => mongoose.isValidObjectId(idOf(value));

const sourceFor = (actionType) => {
  const key = String(actionType || "").toLowerCase();
  return {
    post_view: "post_view",
    like: "like_reward",
    comment: "comment_reward",
    share: "share_reward",
    profile_visit: "profile_visit",
    follow: "follow_reward",
    livestream: TRANSACTION_SOURCES.LIVE_STREAM,
    watch_time: "watch_time",
    referral_signup: TRANSACTION_SOURCES.REFERRAL,
  }[key] || TRANSACTION_SOURCES.SYSTEM_BONUS;
};

const recentRewardExists = async ({ userId, actionType, dedupeKey, cooldownMs }) => {
  const since = new Date(Date.now() - cooldownMs);
  return WalletTransaction.exists({
    userId,
    source: sourceFor(actionType),
    $or: [
      { "metadata.dedupeKey": dedupeKey },
      {
        "metadata.actionType": actionType,
        "metadata.dedupeKey": dedupeKey,
        createdAt: { $gte: since },
      },
    ],
  });
};

const rewardEngagement = async ({
  actorId,
  recipientId,
  actionType,
  targetId,
  metrics = {},
  cooldownMs,
  dedupeKey,
}) => {
  const recipient = idOf(recipientId);
  const actor = idOf(actorId);
  const target = idOf(targetId) || String(targetId || "");
  const action = String(actionType || "").trim().toLowerCase();

  if (!recipient || !isValidId(recipient) || (actor && actor === recipient)) {
    return { rewarded: false, reason: "self_or_invalid" };
  }

  const amount = engagementRewardFor(action, metrics);
  if (!amount) {
    return { rewarded: false, reason: "threshold_not_met" };
  }

  const uniqueKey = dedupeKey || `${action}:${recipient}:${actor || "anon"}:${target}`;
  const lockMs = Number(cooldownMs || DEFAULT_COOLDOWNS[action] || 10 * 60 * 1000);
  const duplicate = await recentRewardExists({
    userId: recipient,
    actionType: action,
    dedupeKey: uniqueKey,
    cooldownMs: lockMs,
  });

  if (duplicate) {
    return { rewarded: false, reason: "duplicate_or_cooldown" };
  }

  const result = await walletService.addPoints(recipient, amount, sourceFor(action), {
    actionType: action,
    actorId: actor,
    targetId: target,
    dedupeKey: uniqueKey,
    cooldownMs: lockMs,
    futureTokenReady: true,
  });

  return {
    rewarded: true,
    amount,
    ...result,
  };
};

module.exports = {
  DEFAULT_COOLDOWNS,
  rewardEngagement,
};
