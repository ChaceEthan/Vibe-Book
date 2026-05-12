// @ts-nocheck
/**
 * Wallet Controller
 * API endpoint handlers for wallet operations
 */

const walletService = require("./walletService");
const { getIo } = require("../../socket");
const { formatWalletResponse, formatTransactionResponse } = require("./walletUtils");

const emitToUser = (userId, event, payload = {}) => {
  const io = getIo?.();
  if (io && userId) {
    io.to(userId.toString()).emit(event, payload);
  }
};

/**
 * GET /api/wallet
 * Get current user's wallet
 */
const getWallet = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const wallet = await walletService.getWallet(userId);

    return res.json({
      success: true,
      wallet: formatWalletResponse(wallet),
    });
  } catch (error) {
    next(error);
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
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await walletService.getTransactionHistory(userId, Math.min(limit, 100), offset);

    return res.json({
      success: true,
      transactions: result.transactions.map(formatTransactionResponse),
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/wallet/transfer
 * Transfer points to another user
 */
const transferPoints = async (req, res, next) => {
  try {
    const senderId = req.user?._id;
    const { receiverId, amount } = req.body;

    if (!senderId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!receiverId || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: receiverId, amount",
      });
    }

    const result = await walletService.transferPoints(senderId, receiverId, amount);
    const senderWallet = formatWalletResponse(result.sender);
    const receiverWallet = formatWalletResponse(result.receiver);
    const sendTransaction = formatTransactionResponse(result.sendTransaction);
    const receiveTransaction = formatTransactionResponse(result.receiveTransaction);

    emitToUser(senderId, "wallet:update", senderWallet);
    emitToUser(receiverId, "wallet:update", receiverWallet);
    emitToUser(receiverId, "wallet:reward", {
      type: "transfer_received",
      amount: result.receiveTransaction.amount,
      wallet: receiverWallet,
      transaction: receiveTransaction,
      message: "NEX Points received",
    });

    return res.json({
      success: true,
      sender: senderWallet,
      receiver: receiverWallet,
      transaction: sendTransaction,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/wallet/reward/daily
 * Claim daily login reward
 */
const claimDailyReward = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await walletService.rewardDailyLogin(userId);
    const wallet = formatWalletResponse(result.wallet);
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
      streakCount: wallet?.streakCount,
      message: "Daily reward claimed successfully",
    };

    emitToUser(userId, "wallet:update", wallet);
    emitToUser(userId, "wallet:reward", payload);
    emitToUser(userId, "reward:claimed", payload);

    return res.json({
      success: true,
      wallet,
      transaction,
      rewardAmount,
      nextClaimTime,
      streakCount: wallet?.streakCount,
      message: "Daily reward claimed successfully",
    });
  } catch (error) {
    if (error.code === "DAILY_REWARD_ALREADY_CLAIMED") {
      return res.status(429).json({
        success: false,
        message: error.message,
        nextClaimTime: error.nextClaimTime,
      });
    }
    next(error);
  }
};

const redeemReward = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
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

    return res.json({
      success: true,
      wallet,
      transaction,
      message: "Reward redeemed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const referralReward = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { referrerId, referredUserId } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const targetReferrer = referrerId || userId;
    const targetReferred = referredUserId;

    if (!targetReferred) {
      return res.status(400).json({ success: false, message: "referredUserId is required" });
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

    return res.json({
      success: true,
      wallet,
      transaction,
      message: "Referral reward tracked",
    });
  } catch (error) {
    if (error.code === "REFERRAL_ALREADY_REWARDED") {
      return res.status(409).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const spendPoints = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const result = await walletService.spend(userId, req.body || {});
    const wallet = formatWalletResponse(result.wallet);
    const transaction = formatTransactionResponse(result.transaction);

    emitToUser(userId, "wallet:update", wallet);

    return res.json({
      success: true,
      wallet,
      transaction,
      message: "NEX Points spent successfully",
    });
  } catch (error) {
    next(error);
  }
};

const generateQr = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const result = await walletService.generateQr(userId, req.body || {});

    return res.json({
      success: true,
      qrId: result.qrId,
      qrPayload: result.qrPayload,
      qrText: result.qrText,
      expiresAt: result.expiresAt,
      message: "QR payload generated",
    });
  } catch (error) {
    next(error);
  }
};

const scanQr = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const result = await walletService.scanQr(userId, req.body?.payload || req.body?.qrText || req.body || {});

    if (result.sender) {
      emitToUser(userId, "wallet:update", formatWalletResponse(result.sender));
      emitToUser(result.receiver?.userId, "wallet:update", formatWalletResponse(result.receiver));
    }

    return res.json({
      success: true,
      action: result.action,
      sender: result.sender ? formatWalletResponse(result.sender) : undefined,
      receiver: result.receiver ? formatWalletResponse(result.receiver) : undefined,
      transaction: result.sendTransaction ? formatTransactionResponse(result.sendTransaction) : undefined,
      referralCode: result.referralCode,
      message: result.action === "wallet_transfer" ? "QR payment completed" : "Referral QR scanned",
    });
  } catch (error) {
    next(error);
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
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!userId || !amount || !reason) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, amount, reason",
      });
    }

    const result = await walletService.adminAdjustment(userId, amount, reason, adminId);

    return res.json({
      success: true,
      wallet: formatWalletResponse(result.wallet),
      transaction: formatTransactionResponse(result.transaction),
      message: "Wallet adjusted successfully",
    });
  } catch (error) {
    next(error);
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

    return res.json({
      success: true,
      earners,
      period,
    });
  } catch (error) {
    next(error);
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

    return res.json({
      success: true,
      spenders,
      period,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getWallet,
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
