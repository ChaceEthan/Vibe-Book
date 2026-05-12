import { create } from "zustand";

import { getApiErrorMessage, marketplaceApi, walletApi } from "../services/api";
import { connectSocket } from "../services/socket";

const HISTORY_LIMIT = 20;

const DEFAULT_WALLET = {
  userId: "",
  balance: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0,
  totalReceived: 0,
  totalSent: 0,
  streakCount: 0,
  lastLoginDate: null,
  level: 1,
  levelName: "Starter",
  createdAt: null,
  updatedAt: null,
};

const DEFAULT_PAGINATION = { limit: HISTORY_LIMIT, offset: 0, total: 0, hasMore: false };
const DEFAULT_LEADERBOARDS = { earners: [], spenders: [] };
const FALLBACK_STORE_ITEMS = [
  {
    itemId: "vision-frame-neon",
    name: "Vision Frame Neon",
    description: "Luxury neon profile frame for future NEX Coin creators.",
    category: "frames",
    price: 150,
    rarity: "epic",
    levelRequired: 1,
    preview: { emoji: "◇", gradient: "from-cyan-300 via-fuchsia-500 to-violet-700" },
  },
  {
    itemId: "creator-boost-24h",
    name: "Creator Boost 24h",
    description: "Visibility boost for your profile and top content.",
    category: "boosts",
    price: 250,
    rarity: "rare",
    levelRequired: 1,
    durationHours: 24,
    preview: { emoji: "↗", gradient: "from-emerald-300 to-sky-600" },
  },
  {
    itemId: "nex-founder-badge",
    name: "NEX Founder Badge",
    description: "Early economy badge for VibeBook wallet pioneers.",
    category: "badges",
    price: 500,
    rarity: "legendary",
    levelRequired: 1,
    preview: { emoji: "N", gradient: "from-amber-300 to-orange-700" },
  },
];

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeWallet = (wallet = {}) => {
  const source = wallet && typeof wallet === "object" ? wallet : {};

  return {
    ...DEFAULT_WALLET,
    ...source,
    balance: Number(source.balance ?? 0),
    lifetimeEarned: Number(source.lifetimeEarned ?? 0),
    lifetimeSpent: Number(source.lifetimeSpent ?? 0),
    totalReceived: Number(source.totalReceived ?? 0),
    totalSent: Number(source.totalSent ?? 0),
    streakCount: Number(source.streakCount ?? 0),
    lastLoginDate: source.lastLoginDate || null,
    level: Number(source.level ?? 1),
    levelName: source.levelName || "Starter",
  };
};

const mergeWallet = (current, update = {}) => normalizeWallet({ ...(current || {}), ...update });
const normalizePagination = (pagination = {}, fallback = DEFAULT_PAGINATION) => ({
  ...fallback,
  ...(pagination && typeof pagination === "object" ? pagination : {}),
  limit: Number(pagination?.limit ?? fallback.limit ?? HISTORY_LIMIT),
  offset: Number(pagination?.offset ?? fallback.offset ?? 0),
  total: Number(pagination?.total ?? fallback.total ?? 0),
  hasMore: Boolean(pagination?.hasMore),
});

const normalizeTransaction = (transaction = {}) => ({
  _id: transaction?._id || transaction?.id || "",
  type: transaction?.type || "reward",
  amount: Number(transaction?.amount ?? 0),
  source: transaction?.source || "wallet",
  description: transaction?.description || "Wallet transaction",
  balanceBefore: Number(transaction?.balanceBefore ?? 0),
  balanceAfter: Number(transaction?.balanceAfter ?? 0),
  status: transaction?.status || "completed",
  metadata: transaction?.metadata && typeof transaction.metadata === "object" ? transaction.metadata : {},
  createdAt: transaction?.createdAt || new Date().toISOString(),
});

const prependTransaction = (transactions, transaction) => {
  if (!transaction) return asArray(transactions);
  const id = transaction._id || transaction.id;
  return [transaction, ...asArray(transactions).filter((item) => !id || item._id !== id)];
};

const dailyCooldownFromWallet = (wallet = {}) => {
  if (!wallet?.lastLoginDate) return "";
  const next = new Date(new Date(wallet.lastLoginDate).getTime() + 24 * 60 * 60 * 1000);
  return next.getTime() > Date.now() ? next.toISOString() : "";
};

const normalizeLeaderboardEntry = (entry = {}) => ({
  ...(entry && typeof entry === "object" ? entry : {}),
  userId: entry?.userId || entry?.user?._id || "",
  lifetimeEarned: Number(entry?.lifetimeEarned ?? 0),
  lifetimeSpent: Number(entry?.lifetimeSpent ?? 0),
  balance: Number(entry?.balance ?? 0),
  level: Number(entry?.level ?? 1),
  levelName: entry?.levelName || "Starter",
});

const dailyRewardEstimate = (wallet = {}) => {
  const nextStreak = Math.max(1, Number(wallet?.streakCount || 0) + 1);
  if (nextStreak % 30 === 0) return 500;
  if (nextStreak % 7 === 0) return 75;
  if (nextStreak % 3 === 0) return 25;
  return 10;
};

export const useWalletStore = create((set, get) => ({
  wallet: DEFAULT_WALLET,
  walletLoaded: false,
  transactions: [],
  pagination: DEFAULT_PAGINATION,
  leaderboards: DEFAULT_LEADERBOARDS,
  loading: false,
  historyLoading: false,
  leaderboardLoading: false,
  socketConnected: false,
  requestLocks: {},
  cooldowns: {},
  notifications: [],
  storeItems: [],
  inventory: { ownedFrames: [], ownedBadges: [], ownedReactions: [], ownedThemes: [], ownedBoosts: [], ownedFeatured: [], active: {} },
  activeBoosts: [],
  featuredQueue: [],
  storeLoading: false,
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
      const wallet = normalizeWallet(data?.wallet);
      set((state) => ({
        wallet,
        walletLoaded: true,
        loading: false,
        cooldowns: dailyCooldownFromWallet(wallet) ? { ...state.cooldowns, daily: dailyCooldownFromWallet(wallet) } : state.cooldowns,
      }));
      return wallet;
    } catch (error) {
      set({ wallet: DEFAULT_WALLET, walletLoaded: true, loading: false, error: getApiErrorMessage(error, "Unable to load wallet.") });
      return DEFAULT_WALLET;
    }
  },

  loadHistory: async ({ reset = false } = {}) => {
    const { pagination, historyLoading } = get();
    if (historyLoading) return;

    const offset = reset ? 0 : Number(pagination.offset || 0) + Number(pagination.limit || HISTORY_LIMIT);
    set({ historyLoading: true });

    try {
      const { data } = await walletApi.history({ limit: HISTORY_LIMIT, offset });
      const nextTransactions = asArray(data?.transactions).map(normalizeTransaction);
      set((state) => ({
        transactions: reset ? nextTransactions : [...asArray(state.transactions), ...nextTransactions],
        pagination: normalizePagination(data?.pagination, { ...DEFAULT_PAGINATION, offset }),
        historyLoading: false,
      }));
    } catch (error) {
      set({ historyLoading: false, error: getApiErrorMessage(error, "Unable to load wallet history.") });
    }
  },

  loadLeaderboards: async (period = "all") => {
    set({ leaderboardLoading: true });
    try {
      const [earners, spenders] = await Promise.all([
        walletApi.topEarners({ limit: 25, period }),
        walletApi.topSpenders({ limit: 25, period }),
      ]);
      set({
        leaderboards: {
          earners: asArray(earners.data?.earners).map(normalizeLeaderboardEntry),
          spenders: asArray(spenders.data?.spenders).map(normalizeLeaderboardEntry),
          period,
        },
        leaderboardLoading: false,
      });
    } catch (error) {
      set({ leaderboardLoading: false, error: getApiErrorMessage(error, "Unable to load leaderboards.") });
    }
  },

  loadStore: async (category = "") => {
    set({ storeLoading: true });
    try {
      const [{ data: itemsData }, { data: inventoryData }] = await Promise.all([
        marketplaceApi.items(category ? { category } : {}),
        marketplaceApi.inventory(),
      ]);
      set({
        storeItems: asArray(itemsData?.items),
        inventory: inventoryData?.inventory || { ownedFrames: [], ownedBadges: [], ownedReactions: [], ownedThemes: [], ownedBoosts: [], ownedFeatured: [], active: {} },
        activeBoosts: asArray(inventoryData?.boosts),
        featuredQueue: asArray(inventoryData?.featured),
        storeLoading: false,
      });
    } catch (error) {
      set({
        storeItems: FALLBACK_STORE_ITEMS,
        inventory: get().inventory,
        storeLoading: false,
        error: getApiErrorMessage(error, "Unable to load NEX Store."),
      });
    }
  },

  purchaseStoreItem: async (itemId, payload = {}) => {
    const { requestLocks, pushNotification } = get();
    if (requestLocks[`purchase:${itemId}`]) return { ok: false, message: "Purchase already in progress." };

    set((state) => ({ requestLocks: { ...state.requestLocks, [`purchase:${itemId}`]: true }, error: "" }));
    try {
      const { data } = await marketplaceApi.purchase(itemId, payload);
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet: normalizeWallet(data?.wallet || state.wallet),
        walletLoaded: true,
        inventory: data?.inventory || state.inventory,
        activeBoosts: data?.boost ? [data.boost, ...asArray(state.activeBoosts)] : state.activeBoosts,
        featuredQueue: data?.featured ? [data.featured, ...asArray(state.featuredQueue)] : state.featuredQueue,
        transactions: prependTransaction(state.transactions, transaction),
        requestLocks: { ...state.requestLocks, [`purchase:${itemId}`]: false },
      }));
      pushNotification({ type: "purchase", title: data?.item?.name || "Store item unlocked", message: data?.message || "Inventory updated." });
      return { ok: true, data };
    } catch (error) {
      if (error?.response?.status === 404 || error?.response?.status === 405) {
        const item = asArray(get().storeItems).find((entry) => entry.itemId === itemId) || {};
        try {
          const { data } = await walletApi.redeem({
            itemId,
            rewardId: itemId,
            name: item.name,
            category: item.category || "marketplace",
            amount: item.price || payload.amount,
          });
          const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
          set((state) => ({
            wallet: normalizeWallet(data?.wallet || state.wallet),
            walletLoaded: true,
            transactions: prependTransaction(state.transactions, transaction),
            requestLocks: { ...state.requestLocks, [`purchase:${itemId}`]: false },
          }));
          pushNotification({ type: "purchase", title: item.name || "Reward redeemed", message: data?.message || "NEX Points redeemed." });
          return { ok: true, data };
        } catch (redeemError) {
          error = redeemError;
        }
      }
      const message = getApiErrorMessage(error, "Purchase failed.");
      set((state) => ({
        requestLocks: { ...state.requestLocks, [`purchase:${itemId}`]: false },
        cooldowns: error.response?.data?.cooldownUntil ? { ...state.cooldowns, [`store:${itemId}`]: error.response.data.cooldownUntil } : state.cooldowns,
        error: message,
      }));
      pushNotification({ type: "warning", title: "Purchase failed", message });
      return { ok: false, message };
    }
  },

  equipStoreItem: async (itemId, action = "equip") => {
    const { requestLocks, pushNotification } = get();
    if (requestLocks[`equip:${itemId}`]) return { ok: false, message: "Inventory update already in progress." };

    set((state) => ({ requestLocks: { ...state.requestLocks, [`equip:${itemId}`]: true }, error: "" }));
    try {
      const { data } = await marketplaceApi.equip(itemId, action);
      set((state) => ({
        inventory: data?.inventory || state.inventory,
        requestLocks: { ...state.requestLocks, [`equip:${itemId}`]: false },
      }));
      pushNotification({ type: "inventory", title: action === "unequip" ? "Item removed" : "Item equipped", message: data?.message || "Profile prestige updated." });
      return { ok: true, data };
    } catch (error) {
      const message = getApiErrorMessage(error, "Unable to update inventory.");
      set((state) => ({ requestLocks: { ...state.requestLocks, [`equip:${itemId}`]: false }, error: message }));
      return { ok: false, message };
    }
  },

  claimDailyReward: async () => {
    const { requestLocks, wallet, pushNotification } = get();
    if (requestLocks.daily) return { ok: false, message: "Reward request already in progress." };
    const nextClaimMs = get().cooldowns?.daily ? new Date(get().cooldowns.daily).getTime() : 0;
    if (nextClaimMs > Date.now()) {
      const message = "Daily reward is still cooling down.";
      pushNotification({ type: "warning", title: "Come back soon", message });
      return { ok: false, message };
    }

    const optimisticAmount = dailyRewardEstimate(wallet);
    const previousWallet = normalizeWallet(wallet);
    const previousTransactions = asArray(get().transactions);
    const optimisticTransaction = normalizeTransaction({
      _id: `daily-optimistic-${Date.now()}`,
      type: "earn",
      amount: optimisticAmount,
      source: "daily_login",
      description: "Daily login bonus",
      balanceBefore: previousWallet.balance,
      balanceAfter: previousWallet.balance + optimisticAmount,
      status: "pending",
    });

    set((state) => ({
      wallet: mergeWallet(state.wallet, {
        balance: Number(state.wallet?.balance || 0) + optimisticAmount,
        lifetimeEarned: Number(state.wallet?.lifetimeEarned || 0) + optimisticAmount,
        streakCount: Number(state.wallet?.streakCount || 0) + 1,
      }),
      walletLoaded: true,
      transactions: [optimisticTransaction, ...asArray(state.transactions)],
      requestLocks: { ...state.requestLocks, daily: true },
      error: "",
    }));

    try {
      const { data } = await walletApi.claimDaily();
      const wallet = normalizeWallet(data?.wallet);
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet,
        walletLoaded: true,
        transactions: transaction
          ? prependTransaction(asArray(state.transactions).filter((item) => item._id !== optimisticTransaction._id), transaction)
          : asArray(state.transactions).map((item) => (item._id === optimisticTransaction._id ? { ...item, status: "completed" } : item)),
        requestLocks: { ...state.requestLocks, daily: false },
        cooldowns: { ...state.cooldowns, daily: data?.nextClaimTime || dailyCooldownFromWallet(wallet) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      }));
      pushNotification({ type: "reward", title: "Daily reward earned", amount: data?.rewardAmount || transaction?.amount || 5, message: data?.message });
      return { ok: true, data };
    } catch (error) {
      const message = getApiErrorMessage(error, "Daily reward could not be claimed.");
      set((state) => ({
        wallet: previousWallet,
        transactions: previousTransactions,
        requestLocks: { ...state.requestLocks, daily: false },
        cooldowns: error.response?.data?.nextClaimTime
          ? { ...state.cooldowns, daily: error.response.data.nextClaimTime }
          : state.cooldowns,
        error: message,
      }));
      pushNotification({ type: "warning", title: "Daily reward failed", message });
      return { ok: false, message };
    }
  },

  spendPoints: async (payload = {}) => {
    const { requestLocks, wallet, pushNotification } = get();
    if (requestLocks.spend) return { ok: false, message: "Spend already in progress." };

    const amount = Number(payload.amount || 0);
    const previousWallet = normalizeWallet(wallet);
    set((state) => ({
      wallet: mergeWallet(state.wallet, { balance: Math.max(0, Number(state.wallet?.balance || 0) - amount) }),
      requestLocks: { ...state.requestLocks, spend: true },
      error: "",
    }));

    try {
      const { data } = await walletApi.spend(payload);
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet: normalizeWallet(data?.wallet || state.wallet),
        transactions: prependTransaction(state.transactions, transaction),
        requestLocks: { ...state.requestLocks, spend: false },
      }));
      pushNotification({ type: "spend", title: "NEX spent", message: data?.message || "Transaction complete." });
      return { ok: true, data };
    } catch (error) {
      const message = getApiErrorMessage(error, "Spend failed.");
      set((state) => ({ wallet: previousWallet, requestLocks: { ...state.requestLocks, spend: false }, error: message }));
      pushNotification({ type: "warning", title: "Spend failed", message });
      return { ok: false, message };
    }
  },

  generateWalletQr: async (payload = {}) => {
    set((state) => ({ requestLocks: { ...state.requestLocks, qr: true }, error: "" }));
    try {
      const { data } = await walletApi.generateQr(payload);
      set((state) => ({ requestLocks: { ...state.requestLocks, qr: false } }));
      return { ok: true, data };
    } catch (error) {
      const message = getApiErrorMessage(error, "Unable to generate QR.");
      set((state) => ({ requestLocks: { ...state.requestLocks, qr: false }, error: message }));
      get().pushNotification({ type: "warning", title: "QR failed", message });
      return { ok: false, message };
    }
  },

  scanWalletQr: async (payload = {}) => {
    set((state) => ({ requestLocks: { ...state.requestLocks, scan: true }, error: "" }));
    try {
      const { data } = await walletApi.scanQr(payload);
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet: normalizeWallet(data?.sender || state.wallet),
        transactions: prependTransaction(state.transactions, transaction),
        requestLocks: { ...state.requestLocks, scan: false },
      }));
      get().pushNotification({ type: "qr", title: "QR scanned", message: data?.message || "QR processed." });
      return { ok: true, data };
    } catch (error) {
      const message = getApiErrorMessage(error, "Unable to scan QR.");
      set((state) => ({ requestLocks: { ...state.requestLocks, scan: false }, error: message }));
      get().pushNotification({ type: "warning", title: "QR scan failed", message });
      return { ok: false, message };
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
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet: normalizeWallet(data?.sender),
        walletLoaded: true,
        transactions: prependTransaction(state.transactions, transaction),
        requestLocks: { ...state.requestLocks, transfer: false },
      }));
      pushNotification({ type: "transfer", title: "Transfer sent", amount, message: "NEX Points moved instantly." });
      return { ok: true, data };
    } catch (error) {
      set((state) => ({
        wallet: normalizeWallet(wallet),
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
      if (!payload || typeof payload !== "object") return;
      set((state) => {
        const wallet = mergeWallet(state.wallet, payload);
        const daily = dailyCooldownFromWallet(wallet);
        return {
          wallet,
          walletLoaded: true,
          cooldowns: daily ? { ...state.cooldowns, daily } : state.cooldowns,
        };
      });
    };
    const handleReward = (payload = {}) => {
      if (!payload || typeof payload !== "object") return;
      const transaction = payload.transaction ? normalizeTransaction(payload.transaction) : null;
      set((state) => ({
        wallet: payload.wallet ? normalizeWallet(payload.wallet) : mergeWallet(state.wallet, { balance: Number(state.wallet?.balance ?? 0) + Number(payload.amount ?? 0) }),
        walletLoaded: true,
        transactions: prependTransaction(state.transactions, transaction),
        cooldowns: payload.nextClaimTime ? { ...state.cooldowns, daily: payload.nextClaimTime } : state.cooldowns,
      }));
      get().pushNotification({ type: "reward", title: payload.message || "Reward earned", amount: payload.amount, message: payload.source || payload.type });
    };
    const handleGift = (payload = {}) => {
      if (!payload || typeof payload !== "object") return;
      get().pushNotification({ type: "gift", title: payload.giftName || "Gift received", amount: payload.amount, message: payload.fromUserName ? `From ${payload.fromUserName}` : payload.message });
    };
    const handleBalance = (payload = {}) => {
      if (!payload || typeof payload !== "object") return;
      const nextBalance = payload.newBalance ?? payload.balance;
      if (nextBalance === undefined || nextBalance === null) return;
      syncWallet({ balance: nextBalance, updatedAt: payload.timestamp });
    };
    const handleError = (payload = {}) => {
      set((state) => ({
        error: payload.message || "Wallet update failed.",
        cooldowns: payload.nextClaimTime ? { ...state.cooldowns, daily: payload.nextClaimTime } : state.cooldowns,
      }));
    };
    const handleInventory = (payload = {}) => {
      if (payload.inventory) set({ inventory: payload.inventory });
    };
    const handlePurchase = (payload = {}) => {
      const transaction = payload.transaction ? normalizeTransaction(payload.transaction) : null;
      set((state) => ({
        wallet: payload.wallet ? normalizeWallet(payload.wallet) : state.wallet,
        inventory: payload.inventory || state.inventory,
        activeBoosts: payload.boost ? [payload.boost, ...asArray(state.activeBoosts)] : state.activeBoosts,
        featuredQueue: payload.featured ? [payload.featured, ...asArray(state.featuredQueue)] : state.featuredQueue,
        transactions: prependTransaction(state.transactions, transaction),
      }));
      get().pushNotification({ type: "purchase", title: payload.item?.name || "NEX purchase complete", message: payload.message || "Inventory synced." });
    };
    const handleRewardClaimed = (payload = {}) => {
      if (payload.nextClaimTime) {
        set((state) => ({ cooldowns: { ...state.cooldowns, daily: payload.nextClaimTime } }));
      }
    };
    const handleBoostUpdate = (payload = {}) => {
      if (payload.boost) set((state) => ({ activeBoosts: [payload.boost, ...asArray(state.activeBoosts).filter((boost) => boost._id !== payload.boost._id)] }));
    };
    const handleFeaturedUpdate = (payload = {}) => {
      if (payload.featured) set((state) => ({ featuredQueue: [payload.featured, ...asArray(state.featuredQueue).filter((item) => item._id !== payload.featured._id)] }));
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
    socket.on("reward:claimed", handleRewardClaimed);
    socket.on("referral:success", handleReward);
    socket.on("store:purchase", handlePurchase);
    socket.on("inventory:update", handleInventory);
    socket.on("creator:boost", handleBoostUpdate);
    socket.on("featured:update", handleFeaturedUpdate);
    socket.on("profile:theme", handleInventory);
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
      socket.off("reward:claimed", handleRewardClaimed);
      socket.off("referral:success", handleReward);
      socket.off("store:purchase", handlePurchase);
      socket.off("inventory:update", handleInventory);
      socket.off("creator:boost", handleBoostUpdate);
      socket.off("featured:update", handleFeaturedUpdate);
      socket.off("profile:theme", handleInventory);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      set({ socketBound: false, socketConnected: false });
    };
  },
}));
