// @ts-nocheck
/**
 * Wallet Socket Integration
 * Real-time wallet updates via Socket.IO
 * Safe integration with existing socket architecture
 */

const walletService = require("./walletService");
const { formatWalletResponse, formatTransactionResponse } = require("./walletUtils");

/**
 * Initialize wallet socket events
 * Call this from socket.js initialization
 */
const initializeWalletSockets = (io, onlineUsers) => {
  io.on("connection", (socket) => {
    const userId = socket.handshake.auth?.userId;

    // wallet:get - Fetch current wallet
    socket.on("wallet:get", async () => {
      try {
        if (!userId) {
          return socket.emit("wallet:error", { message: "Not authenticated" });
        }

        const wallet = await walletService.getWallet(userId);
        socket.emit("wallet:data", formatWalletResponse(wallet));
      } catch (error) {
        console.error("[wallet:get socket error]", error.message);
        socket.emit("wallet:error", { message: "Failed to fetch wallet" });
      }
    });

    // wallet:history - Fetch transaction history
    socket.on("wallet:history", async (data) => {
      try {
        if (!userId) {
          return socket.emit("wallet:error", { message: "Not authenticated" });
        }

        const limit = Math.min(data?.limit || 50, 100);
        const offset = data?.offset || 0;

        const result = await walletService.getTransactionHistory(userId, limit, offset);

        socket.emit("wallet:history", {
          transactions: result.transactions.map(formatTransactionResponse),
          pagination: {
            limit: result.limit,
            offset: result.offset,
            total: result.total,
            hasMore: result.hasMore,
          },
        });
      } catch (error) {
        console.error("[wallet:history socket error]", error.message);
        socket.emit("wallet:error", { message: "Failed to fetch history" });
      }
    });

    // wallet:claim-daily - Claim daily reward
    socket.on("wallet:claim-daily", async () => {
      try {
        if (!userId) {
          return socket.emit("wallet:error", { message: "Not authenticated" });
        }

        const result = await walletService.rewardDailyLogin(userId);
        const rewardAmount = Number(result.transaction?.amount || 0);
        const wallet = formatWalletResponse(result.wallet);
        const transaction = formatTransactionResponse(result.transaction);
        const nextClaimTime = result.wallet?.lastLoginDate
          ? new Date(new Date(result.wallet.lastLoginDate).getTime() + 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Emit success to requesting user
        const payload = {
          type: "daily_login",
          amount: rewardAmount,
          wallet,
          transaction,
          nextClaimTime,
          streakCount: wallet?.streakCount,
          message: "Daily reward claimed successfully",
        };
        socket.emit("wallet:reward", payload);
        socket.emit("reward:claimed", payload);

        // Broadcast balance update to user's other connections
        io.to(userId?.toString()).emit("wallet:update", wallet);
      } catch (error) {
        if (error.code === "DAILY_REWARD_ALREADY_CLAIMED") {
          return socket.emit("wallet:error", {
            message: error.message,
            code: "DAILY_REWARD_ALREADY_CLAIMED",
            nextClaimTime: error.nextClaimTime,
          });
        }

        console.error("[wallet:claim-daily socket error]", error.message);
        socket.emit("wallet:error", { message: "Failed to claim daily reward" });
      }
    });
  });
};

/**
 * Emit wallet update to user
 * Call this from services when wallet changes
 */
const emitWalletUpdate = (io, userId, walletData) => {
  if (!io || !userId) return;

  try {
    io.to(userId?.toString()).emit("wallet:update", {
      balance: walletData.balance,
      lifetimeEarned: walletData.lifetimeEarned,
      lifetimeSpent: walletData.lifetimeSpent,
      level: walletData.level,
      levelName: walletData.levelName,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("[wallet socket emit error]", error.message);
  }
};

/**
 * Emit reward notification
 */
const emitRewardNotification = (io, userId, rewardData) => {
  if (!io || !userId) return;

  try {
    io.to(userId?.toString()).emit("wallet:reward", {
      type: rewardData.type,
      amount: rewardData.amount,
      source: rewardData.source,
      message: rewardData.message,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[wallet reward socket error]", error.message);
  }
};

/**
 * Emit gift notification
 */
const emitGiftNotification = (io, userId, giftData) => {
  if (!io || !userId) return;

  try {
    io.to(userId?.toString()).emit("wallet:gift", {
      giftId: giftData.giftId,
      giftName: giftData.giftName,
      amount: giftData.amount,
      fromUserId: giftData.fromUserId,
      fromUserName: giftData.fromUserName,
      message: giftData.message,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[wallet gift socket error]", error.message);
  }
};

/**
 * Emit balance change notification
 */
const emitBalanceChange = (io, userId, changeData) => {
  if (!io || !userId) return;

  try {
    io.to(userId?.toString()).emit("wallet:balance-change", {
      previousBalance: changeData.previousBalance,
      newBalance: changeData.newBalance,
      change: changeData.change,
      reason: changeData.reason,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[wallet balance change socket error]", error.message);
  }
};

module.exports = {
  initializeWalletSockets,
  emitWalletUpdate,
  emitRewardNotification,
  emitGiftNotification,
  emitBalanceChange,
};
