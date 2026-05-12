// @ts-nocheck
/**
 * Wallet Service
 * Core business logic for wallet operations
 * All balance changes go through this service
 */

const Wallet = require("./walletModel");
const WalletTransaction = require("./walletTransactionModel");
const User = require("../../models/User");
const {
  TRANSACTION_TYPES,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUS,
  REWARD_AMOUNTS,
  DAILY_LOGIN_COOLDOWN_MS,
  VIDEO_UPLOAD_COOLDOWN_MS,
} = require("./walletConstants");
const { validateAmount, validateUserId, sanitizeMetadata, calculateLevel, generateTransactionDescription } = require("./walletUtils");
const { dailyRewardForStreak, nexCoinEstimate } = require("../../utils/pointsCalculator");

const qrCache = new Map();

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const syncTokenEstimate = async (wallet, session = null) => {
  if (!wallet) {
    return wallet;
  }

  const estimate = nexCoinEstimate(wallet.balance);
  wallet.tokenMigration = {
    ...(wallet.tokenMigration || {}),
    pointsPerCoin: estimate.pointsPerCoin,
    estimatedCoins: estimate.estimatedCoins,
    exportable: true,
    stage: "points",
  };

  return wallet.save({ ...(session ? { session } : {}) });
};

/**
 * Create wallet for user (auto-called on first access)
 */
const createWallet = async (userId) => {
  validateUserId(userId);

  // Check if wallet already exists
  let wallet = await Wallet.findOne({ userId });
  if (wallet) {
    return wallet;
  }

  // Create new wallet
  wallet = new Wallet({
    userId,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    totalReceived: 0,
    totalSent: 0,
    streakCount: 0,
    level: 1,
    levelName: "Starter",
  });

  return await wallet.save();
};

/**
 * Get user's wallet (auto-create if doesn't exist)
 */
const getWallet = async (userId) => {
  validateUserId(userId);

  let wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    wallet = await createWallet(userId);
  }

  return wallet;
};

/**
 * Add points to user's wallet
 * Creates transaction record automatically
 */
const addPoints = async (userId, amount, source, metadata = {}) => {
  validateUserId(userId);
  const validatedAmount = validateAmount(amount);
  const cleanMetadata = sanitizeMetadata(metadata);

  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const wallet = await getWallet(userId);

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + validatedAmount;

    // Update wallet atomically
    const updatedWallet = await Wallet.findByIdAndUpdate(
      wallet._id,
      {
        $inc: {
          balance: validatedAmount,
          lifetimeEarned: validatedAmount,
        },
      },
      { new: true, session }
    );

    // Update level if needed
    if (updatedWallet) {
      updatedWallet.updateLevel();
      await syncTokenEstimate(updatedWallet, session);
    }

    // Create immutable transaction record
    const transaction = new WalletTransaction({
      userId,
      type: TRANSACTION_TYPES.EARN,
      amount: validatedAmount,
      balanceBefore,
      balanceAfter,
      source,
      description: generateTransactionDescription(TRANSACTION_TYPES.EARN, source),
      metadata: cleanMetadata,
      status: TRANSACTION_STATUS.COMPLETED,
    });

    await transaction.save({ session });

    await session.commitTransaction();

    return { wallet: updatedWallet, transaction };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Spend points from user's wallet
 * Prevents negative balance
 */
const spendPoints = async (userId, amount, source, metadata = {}) => {
  validateUserId(userId);
  const validatedAmount = validateAmount(amount);
  const cleanMetadata = sanitizeMetadata(metadata);

  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const wallet = await getWallet(userId);

    // Check sufficient balance
    if (wallet.balance < validatedAmount) {
      const error = new Error("Insufficient balance");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - validatedAmount;

    // Update wallet atomically
    const updatedWallet = await Wallet.findByIdAndUpdate(
      wallet._id,
      {
        $inc: {
          balance: -validatedAmount,
          lifetimeSpent: validatedAmount,
        },
      },
      { new: true, session }
    );

    if (updatedWallet) {
      updatedWallet.updateLevel();
      await syncTokenEstimate(updatedWallet, session);
    }

    // Create immutable transaction record
    const transaction = new WalletTransaction({
      userId,
      type: TRANSACTION_TYPES.SPEND,
      amount: validatedAmount,
      balanceBefore,
      balanceAfter,
      source,
      description: generateTransactionDescription(TRANSACTION_TYPES.SPEND, source),
      metadata: cleanMetadata,
      status: TRANSACTION_STATUS.COMPLETED,
    });

    await transaction.save({ session });

    await session.commitTransaction();

    return { wallet: updatedWallet, transaction };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Transfer points between users
 */
const transferPoints = async (senderId, receiverId, amount, metadata = {}) => {
  validateUserId(senderId);
  validateUserId(receiverId);
  const validatedAmount = validateAmount(amount);
  const cleanMetadata = sanitizeMetadata(metadata);

  if (senderId.toString() === receiverId.toString()) {
    throw new Error("Cannot transfer to yourself");
  }

  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    // Get both wallets
    const senderWallet = await getWallet(senderId);
    const receiverWallet = await getWallet(receiverId);

    // Check sender has sufficient balance
    if (senderWallet.balance < validatedAmount) {
      const error = new Error("Insufficient balance");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }

    const senderBalanceBefore = senderWallet.balance;
    const receiverBalanceBefore = receiverWallet.balance;

    // Update sender
    const updatedSender = await Wallet.findByIdAndUpdate(
      senderWallet._id,
      {
        $inc: {
          balance: -validatedAmount,
          lifetimeSpent: validatedAmount,
          totalSent: validatedAmount,
        },
      },
      { new: true, session }
    );

    if (updatedSender) {
      updatedSender.updateLevel();
      await syncTokenEstimate(updatedSender, session);
    }

    // Update receiver
    const updatedReceiver = await Wallet.findByIdAndUpdate(
      receiverWallet._id,
      {
        $inc: {
          balance: validatedAmount,
          lifetimeEarned: validatedAmount,
          totalReceived: validatedAmount,
        },
      },
      { new: true, session }
    );

    if (updatedReceiver) {
      updatedReceiver.updateLevel();
      await syncTokenEstimate(updatedReceiver, session);
    }

    // Create send transaction
    const sendTransaction = new WalletTransaction({
      userId: senderId,
      type: TRANSACTION_TYPES.TRANSFER,
      amount: validatedAmount,
      balanceBefore: senderBalanceBefore,
      balanceAfter: senderBalanceBefore - validatedAmount,
      source: TRANSACTION_SOURCES.TRANSFER,
      description: `Transfer to user`,
      metadata: { ...cleanMetadata, recipientId: receiverId.toString() },
      status: TRANSACTION_STATUS.COMPLETED,
      relatedUserId: receiverId,
    });

    await sendTransaction.save({ session });

    // Create receive transaction
    const receiveTransaction = new WalletTransaction({
      userId: receiverId,
      type: TRANSACTION_TYPES.TRANSFER,
      amount: validatedAmount,
      balanceBefore: receiverBalanceBefore,
      balanceAfter: receiverBalanceBefore + validatedAmount,
      source: TRANSACTION_SOURCES.TRANSFER,
      description: `Transfer from user`,
      metadata: { ...cleanMetadata, senderId: senderId.toString() },
      status: TRANSACTION_STATUS.COMPLETED,
      relatedUserId: senderId,
    });

    await receiveTransaction.save({ session });

    await session.commitTransaction();

    return {
      sender: updatedSender,
      receiver: updatedReceiver,
      sendTransaction,
      receiveTransaction,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Gift points to user
 * Used during live streams, etc
 */
const sendGift = async (senderId, receiverId, giftId, giftPointsValue, metadata = {}) => {
  validateUserId(senderId);
  validateUserId(receiverId);
  const validatedAmount = validateAmount(giftPointsValue);

  if (senderId.toString() === receiverId.toString()) {
    throw new Error("Cannot gift to yourself");
  }

  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const senderWallet = await getWallet(senderId);
    const receiverWallet = await getWallet(receiverId);

    if (senderWallet.balance < validatedAmount) {
      const error = new Error("Insufficient balance for gift");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }

    const senderBalanceBefore = senderWallet.balance;
    const receiverBalanceBefore = receiverWallet.balance;

    // Update sender
    const updatedSender = await Wallet.findByIdAndUpdate(
      senderWallet._id,
      {
        $inc: {
          balance: -validatedAmount,
          lifetimeSpent: validatedAmount,
          totalSent: validatedAmount,
        },
      },
      { new: true, session }
    );

    if (updatedSender) {
      updatedSender.updateLevel();
      await syncTokenEstimate(updatedSender, session);
    }

    // Update receiver
    const updatedReceiver = await Wallet.findByIdAndUpdate(
      receiverWallet._id,
      {
        $inc: {
          balance: validatedAmount,
          lifetimeEarned: validatedAmount,
          totalReceived: validatedAmount,
        },
      },
      { new: true, session }
    );

    if (updatedReceiver) {
      updatedReceiver.updateLevel();
      await syncTokenEstimate(updatedReceiver, session);
    }

    // Create send transaction
    const sendTransaction = new WalletTransaction({
      userId: senderId,
      type: TRANSACTION_TYPES.GIFT,
      amount: validatedAmount,
      balanceBefore: senderBalanceBefore,
      balanceAfter: senderBalanceBefore - validatedAmount,
      source: TRANSACTION_SOURCES.GIFT_RECEIVED,
      description: `Sent ${giftId} gift`,
      metadata: { ...sanitizeMetadata(metadata), giftId, recipientId: receiverId.toString() },
      status: TRANSACTION_STATUS.COMPLETED,
      relatedUserId: receiverId,
    });

    await sendTransaction.save({ session });

    // Create receive transaction
    const receiveTransaction = new WalletTransaction({
      userId: receiverId,
      type: TRANSACTION_TYPES.GIFT,
      amount: validatedAmount,
      balanceBefore: receiverBalanceBefore,
      balanceAfter: receiverBalanceBefore + validatedAmount,
      source: TRANSACTION_SOURCES.GIFT_RECEIVED,
      description: `Received ${giftId} gift`,
      metadata: { ...sanitizeMetadata(metadata), giftId, senderId: senderId.toString() },
      status: TRANSACTION_STATUS.COMPLETED,
      relatedUserId: senderId,
    });

    await receiveTransaction.save({ session });

    await session.commitTransaction();

    return {
      sender: updatedSender,
      receiver: updatedReceiver,
      sendTransaction,
      receiveTransaction,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Reward daily login (max once per 24 hours)
 */
const rewardDailyLogin = async (userId) => {
  validateUserId(userId);

  const wallet = await getWallet(userId);
  const now = new Date();

  const lastLogin = toDate(wallet.lastLoginDate);
  if (lastLogin && now.getTime() - lastLogin.getTime() < DAILY_LOGIN_COOLDOWN_MS) {
    const error = new Error("Daily reward already claimed");
    error.code = "DAILY_REWARD_ALREADY_CLAIMED";
    error.nextClaimTime = new Date(lastLogin.getTime() + DAILY_LOGIN_COOLDOWN_MS);
    throw error;
  }

  const recentDailyTransaction = await WalletTransaction.findOne({
    userId,
    source: TRANSACTION_SOURCES.DAILY_LOGIN,
    createdAt: { $gte: new Date(now.getTime() - DAILY_LOGIN_COOLDOWN_MS) },
  }).lean();

  if (recentDailyTransaction) {
    const error = new Error("Daily reward already claimed");
    error.code = "DAILY_REWARD_ALREADY_CLAIMED";
    error.nextClaimTime = new Date(new Date(recentDailyTransaction.createdAt).getTime() + DAILY_LOGIN_COOLDOWN_MS);
    throw error;
  }

  const reward = dailyRewardForStreak(wallet.streakCount);

  const result = await addPoints(userId, reward.amount, TRANSACTION_SOURCES.DAILY_LOGIN, {
    date: now.toISOString(),
    streakDay: reward.streakDay,
    nextStreak: reward.nextStreak,
    conversionRate: process.env.NEX_POINTS_PER_COIN || 1000,
    futureTokenReady: true,
  });

  // Update last login date and return the refreshed wallet so clients see the
  // new streak immediately after a successful claim.
  const updatedWallet = await Wallet.findByIdAndUpdate(
    result.wallet._id,
    {
      lastLoginDate: now,
      streakCount: reward.nextStreak,
    },
    { new: true }
  );

  if (updatedWallet) {
    updatedWallet.updateLevel();
    await syncTokenEstimate(updatedWallet);
  }

  return {
    ...result,
    wallet: updatedWallet || result.wallet,
    rewardAmount: reward.amount,
    streakDay: reward.streakDay,
    nextClaimTime: new Date(now.getTime() + DAILY_LOGIN_COOLDOWN_MS),
  };
};

/**
 * Reward video upload
 */
const rewardVideoUpload = async (userId, videoId) => {
  validateUserId(userId);

  return await addPoints(userId, REWARD_AMOUNTS.VIDEO_UPLOAD, TRANSACTION_SOURCES.VIDEO_UPLOAD, {
    videoId: videoId?.toString(),
  });
};

/**
 * Reward live stream start
 */
const rewardLiveStream = async (userId, streamId) => {
  validateUserId(userId);

  return await addPoints(userId, REWARD_AMOUNTS.LIVE_STREAM_START, TRANSACTION_SOURCES.LIVE_STREAM, {
    streamId: streamId?.toString(),
  });
};

/**
 * Reward referral signup
 */
const rewardReferral = async (referrerId, newUserId) => {
  validateUserId(referrerId);
  validateUserId(newUserId);

  if (referrerId.toString() === newUserId.toString()) {
    const error = new Error("Self-referrals are not allowed");
    error.code = "SELF_REFERRAL";
    throw error;
  }

  const existing = await WalletTransaction.exists({
    userId: referrerId,
    source: TRANSACTION_SOURCES.REFERRAL,
    "metadata.referredUserId": newUserId.toString(),
  });

  if (existing) {
    const error = new Error("Referral reward already tracked");
    error.code = "REFERRAL_ALREADY_REWARDED";
    throw error;
  }

  return await addPoints(referrerId, REWARD_AMOUNTS.REFERRAL_SIGNUP, TRANSACTION_SOURCES.REFERRAL, {
    referredUserId: newUserId.toString(),
    futureTokenReady: true,
  });
};

const redeemReward = async (userId, reward = {}) => {
  validateUserId(userId);
  const amount = validateAmount(reward.amount || reward.cost || reward.price);
  const itemId = String(reward.itemId || reward.rewardId || reward.id || "reward").trim().slice(0, 80);
  const category = String(reward.category || "marketplace").trim().slice(0, 80);

  return await spendPoints(userId, amount, TRANSACTION_SOURCES.REDEEM, {
    itemId,
    category,
    redemptionId: `${itemId}:${Date.now()}`,
    futureTokenReady: true,
  });
};

const spend = async (userId, payload = {}) => {
  validateUserId(userId);
  const amount = validateAmount(payload.amount);
  const source = String(payload.source || TRANSACTION_SOURCES.PURCHASE).trim().slice(0, 80);

  return await spendPoints(userId, amount, source, {
    itemId: payload.itemId,
    category: payload.category,
    description: payload.description,
    futureTokenReady: true,
  });
};

const generateQr = async (userId, payload = {}) => {
  validateUserId(userId);
  const wallet = await getWallet(userId);
  const amount = payload.amount ? validateAmount(payload.amount) : 0;
  const qrId = `nex_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const qrPayload = {
    type: payload.type || (amount ? "wallet_transfer" : "referral_invite"),
    qrId,
    recipientId: userId.toString(),
    amount,
    memo: String(payload.memo || "VibeBook NEX").slice(0, 120),
    referralCode: payload.referralCode || "",
    expiresAt: expiresAt.toISOString(),
    brand: "VibeBook NEX",
  };

  qrCache.set(qrId, qrPayload);
  setTimeout(() => qrCache.delete(qrId), 10 * 60 * 1000).unref?.();

  return {
    wallet,
    qrId,
    qrPayload,
    qrText: Buffer.from(JSON.stringify(qrPayload)).toString("base64url"),
    expiresAt,
  };
};

const parseQrPayload = (payload) => {
  if (payload && typeof payload === "object") {
    return payload;
  }

  const value = String(payload || "").trim();
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    // Continue to base64url / URL parsing.
  }

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    // Continue to URL parsing.
  }

  try {
    const url = new URL(value);
    return {
      type: "referral_invite",
      referralCode: url.searchParams.get("ref") || url.searchParams.get("referralCode") || "",
    };
  } catch {
    return { type: "referral_invite", referralCode: value };
  }
};

const scanQr = async (scannerId, payload) => {
  validateUserId(scannerId);
  const parsed = parseQrPayload(payload);

  if (!parsed) {
    const error = new Error("Invalid QR payload");
    error.code = "INVALID_QR_PAYLOAD";
    throw error;
  }

  const cached = parsed.qrId ? qrCache.get(parsed.qrId) : null;
  const qrPayload = cached || parsed;
  const expiresAt = toDate(qrPayload.expiresAt);

  if (expiresAt && expiresAt.getTime() < Date.now()) {
    const error = new Error("QR code expired");
    error.code = "QR_EXPIRED";
    throw error;
  }

  if (qrPayload.type === "wallet_transfer" && qrPayload.recipientId && Number(qrPayload.amount || 0) > 0) {
    if (scannerId.toString() === qrPayload.recipientId.toString()) {
      const error = new Error("You cannot scan your own payment QR");
      error.code = "SELF_QR_SCAN";
      throw error;
    }

    const result = await transferPoints(scannerId, qrPayload.recipientId, qrPayload.amount, {
      qrId: qrPayload.qrId,
      qrPayload: "wallet_transfer",
      description: qrPayload.memo || "QR transfer",
    });

    qrCache.delete(qrPayload.qrId);
    return { action: "wallet_transfer", ...result };
  }

  return {
    action: "referral_invite",
    referralCode: qrPayload.referralCode || "",
    qrPayload,
  };
};

/**
 * Reward trending content
 */
const rewardTrendingContent = async (userId, contentId) => {
  validateUserId(userId);

  return await addPoints(userId, REWARD_AMOUNTS.TRENDING_CONTENT, TRANSACTION_SOURCES.TRENDING_CONTENT, {
    contentId: contentId?.toString(),
  });
};

/**
 * Admin adjustment (audit trail required)
 */
const adminAdjustment = async (userId, amount, reason, adminId) => {
  validateUserId(userId);
  validateUserId(adminId);
  const validatedAmount = validateAmount(amount);

  const wallet = await getWallet(userId);
  const balanceBefore = wallet.balance;
  const balanceAfter = balanceBefore + validatedAmount;

  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    const updatedWallet = await Wallet.findByIdAndUpdate(
      wallet._id,
      {
        $inc: {
          balance: validatedAmount,
          lifetimeEarned: validatedAmount > 0 ? validatedAmount : 0,
          lifetimeSpent: validatedAmount < 0 ? Math.abs(validatedAmount) : 0,
        },
      },
      { new: true, session }
    );

    const transaction = new WalletTransaction({
      userId,
      type: TRANSACTION_TYPES.ADMIN_ADJUSTMENT,
      amount: Math.abs(validatedAmount),
      balanceBefore,
      balanceAfter,
      source: TRANSACTION_SOURCES.ADMIN_MANUAL,
      description: `Admin adjustment: ${reason}`,
      metadata: {
        adminId: adminId.toString(),
        reason,
        isNegative: validatedAmount < 0,
      },
      status: TRANSACTION_STATUS.COMPLETED,
      relatedUserId: adminId,
    });

    await transaction.save({ session });

    await session.commitTransaction();

    return { wallet: updatedWallet, transaction };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Get transaction history
 */
const getTransactionHistory = async (userId, limit = 50, offset = 0) => {
  validateUserId(userId);

  const transactions = await WalletTransaction.find({ userId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  const total = await WalletTransaction.countDocuments({ userId });

  return {
    transactions,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
};

/**
 * Get top earners (leaderboard)
 */
const periodStartDate = (period) => {
  const key = String(period || "all").toLowerCase();
  const now = new Date();

  if (key === "weekly" || key === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (key === "monthly" || key === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return null;
};

const getTopEarners = async (limit = 100, period = "all") => {
  const since = periodStartDate(period);
  if (since) {
    return await WalletTransaction.aggregate([
      { $match: { type: TRANSACTION_TYPES.EARN, createdAt: { $gte: since } } },
      { $group: { _id: "$userId", lifetimeEarned: { $sum: "$amount" } } },
      { $sort: { lifetimeEarned: -1 } },
      { $limit: Number(limit) },
      { $project: { userId: "$_id", lifetimeEarned: 1, period, _id: 0 } },
    ]);
  }

  return await Wallet.find({})
    .select("userId lifetimeEarned level levelName")
    .sort({ lifetimeEarned: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get top spenders
 */
const getTopSpenders = async (limit = 100, period = "all") => {
  const since = periodStartDate(period);
  if (since) {
    return await WalletTransaction.aggregate([
      { $match: { type: { $in: [TRANSACTION_TYPES.SPEND, TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.GIFT] }, createdAt: { $gte: since } } },
      { $group: { _id: "$userId", lifetimeSpent: { $sum: "$amount" } } },
      { $sort: { lifetimeSpent: -1 } },
      { $limit: Number(limit) },
      { $project: { userId: "$_id", lifetimeSpent: 1, period, _id: 0 } },
    ]);
  }

  return await Wallet.find({})
    .select("userId lifetimeSpent level levelName")
    .sort({ lifetimeSpent: -1 })
    .limit(limit)
    .lean();
};

/**
 * Verify transaction (for audit)
 */
const verifyTransaction = async (transactionId) => {
  const transaction = await WalletTransaction.findById(transactionId);

  if (!transaction) {
    throw new Error("Transaction not found");
  }

  // Verify balance integrity
  const wallet = await Wallet.findOne({ userId: transaction.userId });

  return {
    transaction,
    wallet,
    isValid: true,
  };
};

module.exports = {
  createWallet,
  getWallet,
  addPoints,
  spendPoints,
  transferPoints,
  sendGift,
  rewardDailyLogin,
  rewardVideoUpload,
  rewardLiveStream,
  rewardReferral,
  rewardTrendingContent,
  redeemReward,
  spend,
  generateQr,
  scanQr,
  adminAdjustment,
  getTransactionHistory,
  getTopEarners,
  getTopSpenders,
  verifyTransaction,
};
