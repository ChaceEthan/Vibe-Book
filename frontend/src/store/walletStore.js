import { create } from "zustand";

import { getApiErrorMessage, walletApi } from "../services/api";
import { connectSocket } from "../services/socket";

const HISTORY_LIMIT = 20;

const normalizeWallet = (wallet = {}) => ({
  balance: Number(wallet.balance || 0),
  lifetimeEarned: Number(wallet.lifetimeEarned || 0),
  lifetimeSpent: Number(wallet.lifetimeSpent || 0),
  totalReceived: Number(wallet.totalReceived || 0),
  totalSent: Number(wallet.totalSent || 0),
  streakCount: Number(wallet.streakCount || 0),
  level: Number(wallet.level || 1),
  levelName: wallet.levelName || "Starter",
  ...wallet,
});

const mergeWallet = (current, update = {}) => normalizeWallet({ ...(current || {}), ...update });

export const useWalletStore = create((set, get) => ({
  wallet: null,
  transactions: [],
  pagination: { limit: HISTORY_LIMIT, offset: 0, total: 0, hasMore: false },
  leaderboards: { earners: [], spenders: [] },
  loading: false,
  historyLoading: false,
  leaderboardLoading: false,
  socketConnected: false,
  requestLocks: {},
  cooldowns: {},
  notifications: [],
  error: "",
  socketBound: false,

  pushNotification: (notification = {}) => {
    const id = notification.id || `${notification.type || "wallet"}-${Date.now()}-${Math.random()}`;
    set((state) => ({
      notifications: [{ id, createdAt: new Date().toISOString(), ...notification }, ...state.notifications].slice(0, 6),
    }));
    window.setTimeout(() => {
      set((state) => ({ notifications: state.notifications.filter((item) => item.id !== id) }));
    }, notification.duration || 4200);
  },

  loadWallet: async () => {
    set({ loading: true, error: "" });
    try {
      const { data } = await walletApi.get();
      set({ wallet: normalizeWallet(data.wallet), loading: false });
      return data.wallet;
    } catch (error) {
      set({ loading: false, error: getApiErrorMessage(error, "Unable to load wallet.") });
      return null;
    }
  },

  loadHistory: async ({ reset = false } = {}) => {
    const { pagination, historyLoading } = get();
    if (historyLoading) return;

    const offset = reset ? 0 : Number(pagination.offset || 0) + Number(pagination.limit || HISTORY_LIMIT);
    set({ historyLoading: true });

    try {
      const { data } = await walletApi.history({ limit: HISTORY_LIMIT, offset });
      set((state) => ({
        transactions: reset ? data.transactions || [] : [...state.transactions, ...(data.transactions || [])],
        pagination: data.pagination || { limit: HISTORY_LIMIT, offset, total: 0, hasMore: false },
        historyLoading: false,
      }));
    } catch (error) {
      set({ historyLoading: false, error: getApiErrorMessage(error, "Unable to load wallet history.") });
    }
  },

  loadLeaderboards: async () => {
    set({ leaderboardLoading: true });
    try {
      const [earners, spenders] = await Promise.all([
        walletApi.topEarners({ limit: 25 }),
        walletApi.topSpenders({ limit: 25 }),
      ]);
      set({
        leaderboards: {
          earners: earners.data?.earners || [],
          spenders: spenders.data?.spenders || [],
        },
        leaderboardLoading: false,
      });
    } catch (error) {
      set({ leaderboardLoading: false, error: getApiErrorMessage(error, "Unable to load leaderboards.") });
    }
  },

  claimDailyReward: async () => {
    const { requestLocks, wallet, pushNotification } = get();
    if (requestLocks.daily) return { ok: false, message: "Reward request already in progress." };

    set((state) => ({ requestLocks: { ...state.requestLocks, daily: true }, error: "" }));
    try {
      const { data } = await walletApi.claimDaily();
      set((state) => ({
        wallet: normalizeWallet(data.wallet),
        transactions: data.transaction ? [data.transaction, ...state.transactions] : state.transactions,
        requestLocks: { ...state.requestLocks, daily: false },
      }));
      pushNotification({ type: "reward", title: "Daily reward earned", amount: data.transaction?.amount || 5, message: data.message });
      return { ok: true, data };
    } catch (error) {
      set((state) => ({
        wallet,
        requestLocks: { ...state.requestLocks, daily: false },
        cooldowns: error.response?.data?.nextClaimTime
          ? { ...state.cooldowns, daily: error.response.data.nextClaimTime }
          : state.cooldowns,
        error: getApiErrorMessage(error, "Daily reward could not be claimed."),
      }));
      return { ok: false, message: getApiErrorMessage(error, "Daily reward could not be claimed.") };
    }
  },

  transferPoints: async (payload = {}) => {
    const { requestLocks, wallet, pushNotification } = get();
    if (requestLocks.transfer) return { ok: false, message: "Transfer already in progress." };

    const amount = Number(payload.amount || 0);
    if (!payload.receiverId || !amount || amount < 1) {
      return { ok: false, message: "Enter a valid creator ID and amount." };
    }

    set((state) => ({
      wallet: mergeWallet(state.wallet, { balance: Math.max(0, Number(state.wallet?.balance || 0) - amount) }),
      requestLocks: { ...state.requestLocks, transfer: true },
      error: "",
    }));

    try {
      const { data } = await walletApi.transfer(payload);
      set((state) => ({
        wallet: normalizeWallet(data.sender),
        transactions: data.transaction ? [data.transaction, ...state.transactions] : state.transactions,
        requestLocks: { ...state.requestLocks, transfer: false },
      }));
      pushNotification({ type: "transfer", title: "Transfer sent", amount, message: "NEX Points moved instantly." });
      return { ok: true, data };
    } catch (error) {
      set((state) => ({
        wallet,
        requestLocks: { ...state.requestLocks, transfer: false },
        error: getApiErrorMessage(error, "Transfer failed. Your balance was restored."),
      }));
      return { ok: false, message: getApiErrorMessage(error, "Transfer failed. Your balance was restored.") };
    }
  },

  bindSocket: (token, userId) => {
    if (!token || !userId || get().socketBound) return undefined;

    const socket = connectSocket(token, { userId });
    if (!socket) return undefined;

    const syncWallet = (payload = {}) => {
      set((state) => ({ wallet: mergeWallet(state.wallet, payload) }));
    };
    const handleReward = (payload = {}) => {
      set((state) => ({
        wallet: payload.wallet ? normalizeWallet(payload.wallet) : mergeWallet(state.wallet, { balance: Number(state.wallet?.balance || 0) + Number(payload.amount || 0) }),
        transactions: payload.transaction ? [payload.transaction, ...state.transactions] : state.transactions,
      }));
      get().pushNotification({ type: "reward", title: payload.message || "Reward earned", amount: payload.amount, message: payload.source || payload.type });
    };
    const handleGift = (payload = {}) => {
      get().pushNotification({ type: "gift", title: payload.giftName || "Gift received", amount: payload.amount, message: payload.fromUserName ? `From ${payload.fromUserName}` : payload.message });
    };
    const handleBalance = (payload = {}) => {
      syncWallet({ balance: payload.newBalance ?? payload.balance, updatedAt: payload.timestamp });
    };
    const handleError = (payload = {}) => {
      set((state) => ({
        error: payload.message || "Wallet update failed.",
        cooldowns: payload.nextClaimTime ? { ...state.cooldowns, daily: payload.nextClaimTime } : state.cooldowns,
      }));
    };
    const handleConnect = () => {
      set({ socketConnected: true });
      socket.emit("wallet:get");
    };
    const handleDisconnect = () => set({ socketConnected: false });

    socket.on("wallet:data", syncWallet);
    socket.on("wallet:update", syncWallet);
    socket.on("wallet:reward", handleReward);
    socket.on("wallet:gift", handleGift);
    socket.on("wallet:balance", handleBalance);
    socket.on("wallet:balance-change", handleBalance);
    socket.on("wallet:error", handleError);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    if (socket.connected) handleConnect();
    set({ socketBound: true, socketConnected: socket.connected });

    return () => {
      socket.off("wallet:data", syncWallet);
      socket.off("wallet:update", syncWallet);
      socket.off("wallet:reward", handleReward);
      socket.off("wallet:gift", handleGift);
      socket.off("wallet:balance", handleBalance);
      socket.off("wallet:balance-change", handleBalance);
      socket.off("wallet:error", handleError);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      set({ socketBound: false, socketConnected: false });
    };
  },
}));
