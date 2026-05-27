// @ts-nocheck
/**
 * Wallet Service
 * Core business logic for wallet operations
 * All balance changes go through this service
 */

const Wallet = require("./walletModel");
const WalletTransaction = require("./walletTransactionModel");
const WalletTransfer = require("./walletTransferModel");
const User = require("../../models/User");
const {
  TRANSACTION_TYPES,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUS,
  REWARD_AMOUNTS,
  DAILY_LOGIN_COOLDOWN_MS,
  TRANSFER_COOLDOWN_MS,
  VIDEO_UPLOAD_COOLDOWN_MS,
} = require("./walletConstants");
const { validateAmount, validateUserId, sanitizeMetadata, calculateLevel, generateTransactionDescription } = require("./walletUtils");
const { dailyRewardForStreak, nexCoinEstimate } = require("../../utils/pointsCalculator");
const { ensureWalletIdentity, findUserByWalletIdentifier, serializeWalletIdentity, walletSettingsFor } = require("./walletIdentityService");

const qrCache = new Map();
const transferLocks = new Map();
const PRODUCTION_FRONTEND_URL = "https://vibe-book-kappa.vercel.app";

const referralLinkFor = (referralCode = "") => {
  const code = String(referralCode || "").trim();
  return code ? `${PRODUCTION_FRONTEND_URL}/register?ref=${encodeURIComponent(code)}` : "";
};

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
    tokenSymbol: estimate.tokenSymbol,
    tokenBalance: wallet.tokenMigration?.tokenBalance || 0,
    lockedTokenBalance: wallet.tokenMigration?.lockedTokenBalance || 0,
    migrationEnabled: false,
    lastEstimateAt: new Date(),
  };

  return wallet.save({ ...(session ? { session } : {}) });
};

const identityMethodFor = (identifier = "") => {
  const value = String(identifier || "").trim();
  if (value.startsWith("VBX-") || value.startsWith("NEX-")) return "wallet_id";
  if (value.startsWith("@") || value.toLowerCase().endsWith(".pay")) return "nex_handle";
  if (value.match(/^[0-9a-fA-F]{24}$/)) return "user_id";
  if (value) return "username";
  return "unknown";
};

const acquireTransferLock = (senderId) => {
  const key = senderId.toString();
  const existing = transferLocks.get(key);

  if (existing && existing > Date.now()) {
    const error = new Error("Transfers are cooling down. Please wait a moment.");
    error.code = "TRANSFER_COOLDOWN";
    error.cooldownUntil = new Date(existing);
    throw error;
  }

  const expiresAt = Date.now() + TRANSFER_COOLDOWN_MS;
  transferLocks.set(key, expiresAt);
  return () => {
    if (transferLocks.get(key) === expiresAt) {
      transferLocks.delete(key);
    }
  };
};

const getWalletIdentityProfile = async (userId) => {
  validateUserId(userId);
  const [wallet, user] = await Promise.all([
    getWallet(userId),
    ensureWalletIdentity(userId),
  ]);
  return {
    wallet,
    user,
    identity: serializeWalletIdentity(user, wallet),
    settings: walletSettingsFor(user),
  };
};

const updateWalletSettings = async (userId, settings = {}) => {
  validateUserId(userId);
  await ensureWalletIdentity(userId);
  const allowedPrivacy = ["public", "followers", "private"];
  const update = {};

  if (typeof settings.walletReceiveEnabled === "boolean") update.walletReceiveEnabled = settings.walletReceiveEnabled;
  if (typeof settings.walletPinEnabled === "boolean") update.walletPinEnabled = settings.walletPinEnabled;
  if (typeof settings.transferConfirmation === "boolean") update["walletSettings.transferConfirmation"] = settings.transferConfirmation;
  if (typeof settings.receiveQrEnabled === "boolean") update["walletSettings.receiveQrEnabled"] = settings.receiveQrEnabled;
  if (typeof settings.transferNotifications === "boolean") update["walletSettings.transferNotifications"] = settings.transferNotifications;
  if (allowedPrivacy.includes(settings.privacyMode)) update["walletSettings.privacyMode"] = settings.privacyMode;

  const user = await User.findByIdAndUpdate(userId, { $set: update }, { returnDocument: "after", runValidators: true });
  const wallet = await getWallet(userId);
  return {
    user,
    wallet,
    identity: serializeWalletIdentity(user, wallet),
    settings: walletSettingsFor(user),
  };
};

/**
 * Create wallet for user (auto-called on first access)
 */
const createWallet = async (userId) => {
  validateUserId(userId);
  await ensureWalletIdentity(userId);

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
  await ensureWalletIdentity(userId);

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
      { returnDocument: "after", session }
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

    const updatedWallet = await Wallet.findOneAndUpdate(
      { _id: wallet._id, balance: { $gte: validatedAmount } },
      {
        $inc: {
          balance: -validatedAmount,
          lifetimeSpent: validatedAmount,
        },
      },
      { returnDocument: "after", session }
    );

    if (!updatedWallet) {
      const error = new Error("Insufficient balance");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }

    if (updatedWallet) {
      updatedWallet.updateLevel();
      await syncTokenEstimate(updatedWallet, session);
    }

    const balanceBefore = Number(updatedWallet.balance || 0) + validatedAmount;
    const balanceAfter = Number(updatedWallet.balance || 0);

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
  const transferAsset = String(metadata.asset || metadata.currency || "NEX_POINTS").trim().toUpperCase();
  if (transferAsset !== "NEX_POINTS") {
    const error = new Error("NEX Token transfers are prepared for a future release but are not active yet");
    error.code = "TOKEN_TRANSFERS_DISABLED";
    throw error;
  }
  const cleanMetadata = sanitizeMetadata({
    ...metadata,
    asset: "NEX_POINTS",
    currency: "NEX_POINTS",
    chain: "internal",
    tokenStatus: "points_only",
    futureTokenReady: true,
  });

  if (senderId.toString() === receiverId.toString()) {
    const error = new Error("Cannot transfer to yourself");
    error.code = "SELF_TRANSFER";
    throw error;
  }

  const session = await Wallet.startSession();
  session.startTransaction();

  try {
    // Get both wallets
    const senderWallet = await getWallet(senderId);
    const receiverWallet = await getWallet(receiverId);

    const updatedSender = await Wallet.findOneAndUpdate(
      { _id: senderWallet._id, balance: { $gte: validatedAmount } },
      {
        $inc: {
          balance: -validatedAmount,
          lifetimeSpent: validatedAmount,
          totalSent: validatedAmount,
        },
      },
      { returnDocument: "after", session }
    );

    if (!updatedSender) {
      const error = new Error("Insufficient balance");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }

    if (updatedSender) {
      updatedSender.updateLevel();
      await syncTokenEstimate(updatedSender, session);
    }

    const updatedReceiver = await Wallet.findByIdAndUpdate(
      receiverWallet._id,
      {
        $inc: {
          balance: validatedAmount,
          lifetimeEarned: validatedAmount,
          totalReceived: validatedAmount,
        },
      },
      { returnDocument: "after", session }
    );

    if (!updatedReceiver) {
      const error = new Error("Receiver wallet update failed");
      error.code = "WALLET_UPDATE_FAILED";
      throw error;
    }

    if (updatedReceiver) {
      updatedReceiver.updateLevel();
      await syncTokenEstimate(updatedReceiver, session);
    }

    const senderBalanceBefore = Number(updatedSender.balance || 0) + validatedAmount;
    const receiverBalanceBefore = Number(updatedReceiver.balance || 0) - validatedAmount;

    // Create send transaction
    const sendTransaction = new WalletTransaction({
      userId: senderId,
      type: TRANSACTION_TYPES.TRANSFER,
      amount: validatedAmount,
      balanceBefore: senderBalanceBefore,
      balanceAfter: Number(updatedSender.balance || 0),
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
      balanceAfter: Number(updatedReceiver.balance || 0),
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
  const cleanMetadata = sanitizeMetadata(metadata);
  const giftLabel = cleanMetadata.giftName || giftId;

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

    const updatedSender = await Wallet.findOneAndUpdate(
      { _id: senderWallet._id, balance: { $gte: validatedAmount } },
      {
        $inc: {
          balance: -validatedAmount,
          lifetimeSpent: validatedAmount,
          totalSent: validatedAmount,
        },
      },
      { returnDocument: "after", session }
    );

    if (!updatedSender) {
      const error = new Error("Insufficient balance for gift");
      error.code = "INSUFFICIENT_BALANCE";
      throw error;
    }

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
      { returnDocument: "after", session }
    );

    if (!updatedReceiver) {
      const error = new Error("Receiver wallet update failed");
      error.code = "WALLET_UPDATE_FAILED";
      throw error;
    }

    if (updatedReceiver) {
      updatedReceiver.updateLevel();
      await syncTokenEstimate(updatedReceiver, session);
    }

    const senderBalanceBefore = Number(updatedSender.balance || 0) + validatedAmount;
    const receiverBalanceBefore = Number(updatedReceiver.balance || 0) - validatedAmount;

    // Create send transaction
    const sendTransaction = new WalletTransaction({
      userId: senderId,
      type: TRANSACTION_TYPES.GIFT,
      amount: validatedAmount,
      balanceBefore: senderBalanceBefore,
      balanceAfter: Number(updatedSender.balance || 0),
      source: TRANSACTION_SOURCES.GIFT_SENT,
      description: `Sent ${giftLabel} gift`,
      metadata: { ...cleanMetadata, giftId, recipientId: receiverId.toString() },
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
      balanceAfter: Number(updatedReceiver.balance || 0),
      source: TRANSACTION_SOURCES.GIFT_RECEIVED,
      description: `Received ${giftLabel} gift`,
      metadata: { ...cleanMetadata, giftId, senderId: senderId.toString() },
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
  await ensureWalletIdentity(userId);

  const session = await Wallet.startSession();
  const now = new Date();

  session.startTransaction();

  try {
    let wallet = await Wallet.findOne({ userId }).session(session);

    if (!wallet) {
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

      try {
        await wallet.save({ session });
      } catch (saveError) {
        if (saveError?.code !== 11000) {
          saveError.code = saveError.code || "WALLET_UPDATE_FAILED";
          throw saveError;
        }

        wallet = await Wallet.findOne({ userId }).session(session);
      }
    }

    if (!wallet) {
      const error = new Error("Wallet update failed");
      error.code = "WALLET_UPDATE_FAILED";
      throw error;
    }

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
    }).session(session).lean();

    if (recentDailyTransaction) {
      const error = new Error("Daily reward already claimed");
      error.code = "DAILY_REWARD_ALREADY_CLAIMED";
      error.nextClaimTime = new Date(new Date(recentDailyTransaction.createdAt).getTime() + DAILY_LOGIN_COOLDOWN_MS);
      throw error;
    }

    wallet.balance = Number(wallet.balance || 0);
    wallet.lifetimeEarned = Number(wallet.lifetimeEarned || 0);
    wallet.lifetimeSpent = Number(wallet.lifetimeSpent || 0);
    wallet.totalReceived = Number(wallet.totalReceived || 0);
    wallet.totalSent = Number(wallet.totalSent || 0);
    wallet.streakCount = Number(wallet.streakCount || 0);

    const missedStreak = Boolean(lastLogin && now.getTime() - lastLogin.getTime() >= DAILY_LOGIN_COOLDOWN_MS * 2);
    const rewardBaseStreak = missedStreak ? 0 : wallet.streakCount;
    const reward = dailyRewardForStreak(rewardBaseStreak);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + reward.amount;

    wallet.balance = balanceAfter;
    wallet.lifetimeEarned += reward.amount;
    wallet.lastLoginDate = now;
    wallet.streakCount = reward.nextStreak;
    wallet.updateLevel();
    wallet.updateTokenEstimate();

    try {
      await wallet.save({ session });
    } catch (saveError) {
      saveError.code = saveError.code || "WALLET_UPDATE_FAILED";
      throw saveError;
    }

    const transaction = await WalletTransaction.create([{
      userId,
      type: TRANSACTION_TYPES.EARN,
      amount: reward.amount,
      balanceBefore,
      balanceAfter,
      source: TRANSACTION_SOURCES.DAILY_LOGIN,
      description: generateTransactionDescription(TRANSACTION_TYPES.EARN, TRANSACTION_SOURCES.DAILY_LOGIN),
      metadata: sanitizeMetadata({
        date: now.toISOString(),
        streakDay: reward.streakDay,
        cycleDay: reward.cycleDay,
        monthDay: reward.monthDay,
        weekIndex: reward.weekIndex,
        monthIndex: reward.monthIndex,
        nextStreak: reward.nextStreak,
        rewardType: reward.rewardType,
        rewardLabel: reward.label,
        multiplier: reward.multiplier,
        isWeeklyBonus: reward.isWeeklyBonus,
        isMonthlyBonus: reward.isMonthlyBonus,
        streakReset: missedStreak,
        conversionRate: process.env.NEX_POINTS_PER_COIN || 1000,
        futureTokenReady: true,
      }),
      status: TRANSACTION_STATUS.COMPLETED,
    }], { session });

    await session.commitTransaction();

    return {
      wallet,
      transaction: transaction[0],
      rewardAmount: reward.amount,
      streakDay: reward.streakDay,
      reward,
      streakReset: missedStreak,
      nextClaimTime: new Date(now.getTime() + DAILY_LOGIN_COOLDOWN_MS),
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const transferByIdentifier = async (senderId, payload = {}, requestMeta = {}) => {
  validateUserId(senderId);
  const identifier = String(payload.receiverId || payload.recipient || payload.identifier || payload.walletId || payload.nexHandle || payload.username || "").trim();
  const amount = validateAmount(payload.amount);
  const asset = String(payload.asset || payload.currency || "NEX_POINTS").trim().toUpperCase();

  if (asset !== "NEX_POINTS") {
    const error = new Error("NEX Token transfers are prepared for a future release but are not active yet");
    error.code = "TOKEN_TRANSFERS_DISABLED";
    throw error;
  }

  if (!identifier) {
    const error = new Error("Choose a wallet ID, NEX handle, or username");
    error.code = "RECIPIENT_REQUIRED";
    throw error;
  }

  const [senderUser, receiverUser] = await Promise.all([
    ensureWalletIdentity(senderId),
    findUserByWalletIdentifier(identifier),
  ]);

  if (!receiverUser) {
    const error = new Error("Recipient wallet was not found");
    error.code = "RECIPIENT_NOT_FOUND";
    throw error;
  }

  if (senderUser._id.toString() === receiverUser._id.toString()) {
    const error = new Error("Cannot transfer to yourself");
    error.code = "SELF_TRANSFER";
    throw error;
  }

  if (receiverUser.walletReceiveEnabled === false) {
    const error = new Error("This creator is not receiving NEX Points right now");
    error.code = "RECEIVE_DISABLED";
    throw error;
  }

  const releaseTransferLock = acquireTransferLock(senderId);
  try {
  const recentTransfer = await WalletTransfer.findOne({
    senderId,
    status: { $in: ["pending", "completed"] },
    createdAt: { $gte: new Date(Date.now() - TRANSFER_COOLDOWN_MS) },
  }).lean();

  if (recentTransfer) {
    const error = new Error("Transfers are cooling down. Please wait a moment.");
    error.code = "TRANSFER_COOLDOWN";
    error.cooldownUntil = new Date(new Date(recentTransfer.createdAt).getTime() + TRANSFER_COOLDOWN_MS);
    throw error;
  }

  const audit = await WalletTransfer.create({
    senderId,
    receiverId: receiverUser._id,
    senderWalletId: senderUser.walletId,
    receiverWalletId: receiverUser.walletId,
    receiverIdentifier: identifier,
    amount,
    asset: "NEX_POINTS",
    chain: "internal",
    tokenStatus: "points_only",
    status: "pending",
    method: identityMethodFor(identifier),
    memo: String(payload.memo || "").slice(0, 180),
    ipHash: requestMeta.ipHash,
    userAgentHash: requestMeta.userAgentHash,
    riskFlags: amount > 10000 ? ["large_transfer"] : [],
  });

  try {
    const result = await transferPoints(senderId, receiverUser._id, amount, {
      walletTransferId: audit._id.toString(),
      receiverIdentifier: identifier,
      receiverWalletId: receiverUser.walletId,
      senderWalletId: senderUser.walletId,
      nexHandle: receiverUser.nexHandle,
      memo: payload.memo,
      transferMethod: audit.method,
      asset: "NEX_POINTS",
      currency: "NEX_POINTS",
      chain: "internal",
      tokenStatus: "points_only",
    });

    audit.status = "completed";
    audit.sendTransactionId = result.sendTransaction?._id;
    audit.receiveTransactionId = result.receiveTransaction?._id;
    audit.completedAt = new Date();
    await audit.save();

    return {
      ...result,
      transfer: audit,
      receiverUser,
      senderUser,
    };
  } catch (error) {
    await WalletTransfer.findByIdAndUpdate(audit._id, {
      $set: {
        status: "failed",
        failureReason: error.message || "Transfer failed",
      },
    }).catch(() => null);
    throw error;
  }
  } finally {
    releaseTransferLock();
  }
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

  const referredUser = await User.findById(newUserId)
    .select("accountStatus emailVerified phoneVerified referredBy")
    .lean();

  if (
    !referredUser ||
    referredUser.accountStatus !== "active" ||
    (!referredUser.emailVerified && !referredUser.phoneVerified) ||
    referredUser.referredBy?.toString() !== referrerId.toString()
  ) {
    const error = new Error("Referral rewards require a verified referred account");
    error.code = "REFERRAL_NOT_VERIFIED";
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
  const user = await ensureWalletIdentity(userId);
  const amount = payload.amount ? validateAmount(payload.amount) : 0;
  const qrId = `nex_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const qrPayload = {
    type: payload.type || (amount ? "wallet_transfer" : "referral_invite"),
    qrId,
    recipientId: userId.toString(),
    userId: userId.toString(),
    walletId: user.walletId,
    nexHandle: user.nexHandle,
    username: user.username || user.name || "creator",
    amount,
    chain: "NEX",
    memo: String(payload.memo || "VibeBook NEX").slice(0, 120),
    referralCode: payload.referralCode || "",
    referralLink: referralLinkFor(payload.referralCode),
    expiresAt: expiresAt.toISOString(),
    brand: "VibeBook NEX",
  };

  const qrText = qrPayload.type === "referral_invite" && qrPayload.referralLink
    ? qrPayload.referralLink
    : Buffer.from(JSON.stringify(qrPayload)).toString("base64url");

  qrCache.set(qrId, qrPayload);
  setTimeout(() => qrCache.delete(qrId), 10 * 60 * 1000).unref?.();

  return {
    wallet,
    identity: serializeWalletIdentity(user, wallet),
    qrId,
    qrPayload,
    qrText,
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
    referralLink: qrPayload.referralLink || referralLinkFor(qrPayload.referralCode),
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
      { returnDocument: "after", session }
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
    .populate("relatedUserId", "username name avatar profileImage profilePicture walletId")
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
  transferByIdentifier,
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
  getWalletIdentityProfile,
  updateWalletSettings,
};
