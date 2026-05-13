// @ts-nocheck
/**
 * Wallet Controller
 * API endpoint handlers for wallet operations
 */

const walletService = require("./walletService");
const { getIo } = require("../../socket");
const { formatWalletResponse, formatTransactionResponse } = require("./walletUtils");

const statusForWalletError = (error = {}) => {
  if (error.statusCode || error.status) {
    return Number(error.statusCode || error.status);
  }

  if (error.code === "DAILY_REWARD_ALREADY_CLAIMED") return 429;
  if (error.code === "REFERRAL_ALREADY_REWARDED") return 409;
  if (error.code === "INSUFFICIENT_BALANCE") return 402;
  if (error.code === "TRANSFER_COOLDOWN") return 429;
  if (error.code === "RECIPIENT_NOT_FOUND") return 404;
  if (["SELF_REFERRAL", "SELF_TRANSFER", "RECIPIENT_REQUIRED", "RECEIVE_DISABLED", "INVALID_QR_PAYLOAD", "QR_EXPIRED", "SELF_QR_SCAN"].includes(error.code)) return 400;
  if (error.name === "ValidationError" || error.name === "CastError") return 400;

  return 500;
};

const walletErrorPayload = (error = {}) => {
  const message = error.message || "Wallet request failed";
  return {
    success: false,
    message,
    data: null,
    error: message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.nextClaimTime ? { nextClaimTime: error.nextClaimTime } : {}),
    ...(error.cooldownUntil ? { cooldownUntil: error.cooldownUntil } : {}),
  };
};

const walletSuccess = (res, message, payload = {}, status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data: payload,
    ...payload,
  });
};

const walletFailure = (res, status, message, extra = {}) => {
  return res.status(status).json({
    success: false,
    message,
    data: null,
    ...extra,
  });
};

const handleWalletError = (req, res, next, error) => {
  console.error("[wallet]", error);

  if (res.headersSent) {
    return typeof next === "function" ? next(error) : undefined;
  }

  return res.status(statusForWalletError(error)).json(walletErrorPayload(error));
};

const emitToUser = (userId, event, payload = {}) => {
  const io = getIo?.();
  if (io && userId) {
    io.to(userId.toString()).emit(event, payload);
  }
};

const emitDailyRewardEvents = (userId, wallet, payload) => {
  try {
    emitToUser(userId, "wallet:update", wallet);
    emitToUser(userId, "wallet:reward", payload);
    emitToUser(userId, "reward:claimed", payload);
  } catch (error) {
    console.error("[wallet] daily reward emit failed", error);
  }
};

const dailyRewardClaimsInFlight = new Set();

/**
 * GET /api/wallet
 * Get current user's wallet
 */
const getWallet = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return walletFailure(res, 401, "Authentication required");
    }

    const profile = await walletService.getWalletIdentityProfile(userId);

    return walletSuccess(res, "Wallet loaded successfully", {
      wallet: formatWalletResponse(profile.wallet),
      identity: profile.identity,
      settings: profile.settings,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

/**
 * GET /api/wallet/history
 * Get wallet transaction history
 */
const getTransactionHistory = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return walletFailure(res, 401, "Authentication required");
    }

    const result = await walletService.getTransactionHistory(userId, Math.min(limit, 100), offset);

    return walletSuccess(res, "Wallet history loaded successfully", {
      transactions: result.transactions.map(formatTransactionResponse),
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

/**
 * POST /api/wallet/transfer
 * Transfer points to another user
 */
const transferPoints = async (req, res, next) => {
  try {
    const senderId = req.user?._id;
    const { receiverId, recipient, identifier, walletId, nexHandle, username, amount } = req.body || {};

    if (!senderId) {
      return walletFailure(res, 401, "Authentication required");
    }

    if (!(receiverId || recipient || identifier || walletId || nexHandle || username) || !amount) {
      return walletFailure(res, 400, "Missing required fields: recipient and amount");
    }

    const result = await walletService.transferByIdentifier(senderId, req.body || {}, {
      ipHash: req.ip,
      userAgentHash: req.get?.("user-agent") || "",
    });
    const senderWallet = formatWalletResponse(result.sender);
    const receiverWallet = formatWalletResponse(result.receiver);
    const sendTransaction = formatTransactionResponse(result.sendTransaction);
    const receiveTransaction = formatTransactionResponse(result.receiveTransaction);

    emitToUser(senderId, "wallet:update", senderWallet);
    emitToUser(result.receiverUser?._id || result.receiver?.userId, "wallet:update", receiverWallet);
    emitToUser(result.receiverUser?._id || result.receiver?.userId, "wallet:reward", {
      type: "transfer_received",
      amount: result.receiveTransaction.amount,
      wallet: receiverWallet,
      transaction: receiveTransaction,
      message: "NEX Points received",
    });

    return walletSuccess(res, "Transfer completed successfully", {
      sender: senderWallet,
      receiver: receiverWallet,
      recipient: {
        userId: result.receiverUser?._id,
        username: result.receiverUser?.username,
        name: result.receiverUser?.name,
        walletId: result.receiverUser?.walletId,
        nexHandle: result.receiverUser?.nexHandle,
      },
      transaction: sendTransaction,
      transfer: result.transfer,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

/**
 * POST /api/wallet/reward/daily
 * Claim daily login reward
 */
const claimDailyReward = async (req, res) => {
  let claimKey = "";

  try {
    const userId = req.user?._id || req.user?.id;
    claimKey = userId?.toString?.() || "";

    if (!claimKey || !claimKey.match(/^[0-9a-fA-F]{24}$/)) {
      return walletFailure(res, 400, "Invalid wallet user");
    }

    if (dailyRewardClaimsInFlight.has(claimKey)) {
      return walletFailure(res, 409, "Daily reward claim already in progress", {
        code: "DAILY_REWARD_CLAIM_IN_PROGRESS",
      });
    }

    dailyRewardClaimsInFlight.add(claimKey);

    const result = await walletService.rewardDailyLogin(userId);
    if (!result?.wallet) {
      return walletFailure(res, 400, "Invalid wallet state");
    }

    const wallet = {
      balance: 0,
      lifetimeEarned: 0,
      streakCount: 0,
      ...(formatWalletResponse(result.wallet) || {}),
    };
    const transaction = formatTransactionResponse(result.transaction);
    const rewardAmount = Number(result.transaction?.amount || 0);
    const nextClaimTime = result.nextClaimTime ||
      (result.wallet?.lastLoginDate
        ? new Date(new Date(result.wallet.lastLoginDate).getTime() + 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000));

    const payload = {
      type: "daily_login",
      amount: rewardAmount,
      wallet,
      transaction,
      nextClaimTime,
      streakCount: Number(wallet?.streakCount ?? 0),
      message: "Daily reward claimed successfully",
    };

    emitDailyRewardEvents(userId, wallet, payload);

    return walletSuccess(res, "Daily reward claimed successfully", {
      wallet,
      transaction,
      claimed: true,
      reward: rewardAmount,
      rewardAmount,
      balance: Number(wallet?.balance ?? 0),
      nextClaimTime,
      streak: Number(wallet?.streakCount ?? 0),
      streakCount: Number(wallet?.streakCount ?? 0),
    });
  } catch (error) {
    console.error(
      "[DAILY_REWARD_FATAL]",
      error,
      error?.message,
      error?.stack
    );

    if (res.headersSent) {
      return undefined;
    }

    const message = error.message || "Daily reward failed";
    const alreadyClaimed = error.code === "DAILY_REWARD_ALREADY_CLAIMED";
    const invalidWallet = error.message === "Invalid user ID" || error.name === "CastError" || error.name === "ValidationError";
    const walletUpdateFailed = error.code === "WALLET_UPDATE_FAILED";
    const status = alreadyClaimed ? 409 : invalidWallet ? 400 : statusForWalletError(error);
    const responseMessage = alreadyClaimed ? "Already claimed today" : walletUpdateFailed ? "Wallet update failed" : message;

    return res.status(status).json({
      success: false,
      message: responseMessage,
      data: null,
      error: responseMessage,
      ...(error.code ? { code: error.code } : {}),
      ...(error.nextClaimTime ? { nextClaimTime: error.nextClaimTime } : {}),
    });
  } finally {
    if (claimKey) {
      dailyRewardClaimsInFlight.delete(claimKey);
    }
  }
};

const redeemReward = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return walletFailure(res, 401, "Authentication required");
    }

    const result = await walletService.redeemReward(userId, req.body || {});
    const wallet = formatWalletResponse(result.wallet);
    const transaction = formatTransactionResponse(result.transaction);

    emitToUser(userId, "wallet:update", wallet);
    emitToUser(userId, "store:purchase", {
      wallet,
      transaction,
      item: { itemId: req.body?.itemId || req.body?.rewardId, name: req.body?.name || "NEX reward" },
      message: "Reward redeemed",
    });

    return walletSuccess(res, "Reward redeemed successfully", {
      wallet,
      transaction,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

const referralReward = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { referrerId, referredUserId } = req.body || {};

    if (!userId) {
      return walletFailure(res, 401, "Authentication required");
    }

    const targetReferrer = referrerId || userId;
    const targetReferred = referredUserId;

    if (!targetReferred) {
      return walletFailure(res, 400, "referredUserId is required");
    }

    if (targetReferrer.toString() !== userId.toString()) {
      return walletFailure(res, 403, "Referral rewards can only be claimed by the referrer");
    }

    const result = await walletService.rewardReferral(targetReferrer, targetReferred);
    const wallet = formatWalletResponse(result.wallet);
    const transaction = formatTransactionResponse(result.transaction);

    emitToUser(targetReferrer, "wallet:update", wallet);
    emitToUser(targetReferrer, "referral:success", {
      type: "referral",
      amount: transaction.amount,
      wallet,
      transaction,
      message: "Referral signup bonus earned",
    });

    return walletSuccess(res, "Referral reward tracked", {
      wallet,
      transaction,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

const spendPoints = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return walletFailure(res, 401, "Authentication required");
    }

    const result = await walletService.spend(userId, req.body || {});
    const wallet = formatWalletResponse(result.wallet);
    const transaction = formatTransactionResponse(result.transaction);

    emitToUser(userId, "wallet:update", wallet);

    return walletSuccess(res, "NEX Points spent successfully", {
      wallet,
      transaction,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

const generateQr = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return walletFailure(res, 401, "Authentication required");
    }

    const result = await walletService.generateQr(userId, req.body || {});

    return walletSuccess(res, "QR payload generated", {
      qrId: result.qrId,
      qrPayload: result.qrPayload,
      qrText: result.qrText,
      expiresAt: result.expiresAt,
      identity: result.identity,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

const scanQr = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return walletFailure(res, 401, "Authentication required");
    }

    const result = await walletService.scanQr(userId, req.body?.payload || req.body?.qrText || req.body || {});

    if (result.sender) {
      emitToUser(userId, "wallet:update", formatWalletResponse(result.sender));
      emitToUser(result.receiver?.userId, "wallet:update", formatWalletResponse(result.receiver));
    }

    const message = result.action === "wallet_transfer" ? "QR payment completed" : "Referral QR scanned";
    return walletSuccess(res, message, {
      action: result.action,
      sender: result.sender ? formatWalletResponse(result.sender) : undefined,
      receiver: result.receiver ? formatWalletResponse(result.receiver) : undefined,
      transaction: result.sendTransaction ? formatTransactionResponse(result.sendTransaction) : undefined,
      referralCode: result.referralCode,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

const getWalletIdentity = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return walletFailure(res, 401, "Authentication required");

    const profile = await walletService.getWalletIdentityProfile(userId);
    return walletSuccess(res, "Wallet identity loaded successfully", {
      wallet: formatWalletResponse(profile.wallet),
      identity: profile.identity,
      settings: profile.settings,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

const getReceiveProfile = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return walletFailure(res, 401, "Authentication required");

    const profile = await walletService.getWalletIdentityProfile(userId);
    const qrPayload = profile.identity?.qrPayload;
    return walletSuccess(res, "Receive profile loaded successfully", {
      wallet: formatWalletResponse(profile.wallet),
      identity: profile.identity,
      qrPayload,
      qrText: qrPayload ? Buffer.from(JSON.stringify(qrPayload)).toString("base64url") : "",
      settings: profile.settings,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

const getWalletSettings = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return walletFailure(res, 401, "Authentication required");

    const profile = await walletService.getWalletIdentityProfile(userId);
    return walletSuccess(res, "Wallet settings loaded successfully", {
      identity: profile.identity,
      settings: profile.settings,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

const updateWalletSettings = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return walletFailure(res, 401, "Authentication required");

    const profile = await walletService.updateWalletSettings(userId, req.body || {});
    return walletSuccess(res, "Wallet settings updated successfully", {
      wallet: formatWalletResponse(profile.wallet),
      identity: profile.identity,
      settings: profile.settings,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

/**
 * POST /api/wallet/admin/add
 * Admin adjust user wallet
 * Requires admin middleware
 */
const adminAddPoints = async (req, res, next) => {
  try {
    const adminId = req.user?._id;
    const { userId, amount, reason } = req.body;

    if (!adminId) {
      return walletFailure(res, 401, "Authentication required");
    }

    if (!userId || !amount || !reason) {
      return walletFailure(res, 400, "Missing required fields: userId, amount, reason");
    }

    const result = await walletService.adminAdjustment(userId, amount, reason, adminId);

    return walletSuccess(res, "Wallet adjusted successfully", {
      wallet: formatWalletResponse(result.wallet),
      transaction: formatTransactionResponse(result.transaction),
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

/**
 * GET /api/wallet/leaderboard/earners
 * Get top earners
 */
const getTopEarners = async (req, res, next) => {
  try {
    const { limit = 100, period = "all" } = req.query;

    const earners = await walletService.getTopEarners(Math.min(limit, 1000), period);

    return walletSuccess(res, "Top earners loaded successfully", {
      earners,
      period,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

/**
 * GET /api/wallet/leaderboard/spenders
 * Get top spenders
 */
const getTopSpenders = async (req, res, next) => {
  try {
    const { limit = 100, period = "all" } = req.query;

    const spenders = await walletService.getTopSpenders(Math.min(limit, 1000), period);

    return walletSuccess(res, "Top spenders loaded successfully", {
      spenders,
      period,
    });
  } catch (error) {
    return handleWalletError(req, res, next, error);
  }
};

module.exports = {
  getWallet,
  getWalletIdentity,
  getReceiveProfile,
  getWalletSettings,
  updateWalletSettings,
  getTransactionHistory,
  transferPoints,
  claimDailyReward,
  redeemReward,
  referralReward,
  spendPoints,
  generateQr,
  scanQr,
  adminAddPoints,
  getTopEarners,
  getTopSpenders,
};
