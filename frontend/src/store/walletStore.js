// @ts-nocheck
import { create } from "zustand";

import { getApiErrorMessage, marketplaceApi, walletApi } from "../services/api";
import { connectSocket } from "../services/socket";

const HISTORY_LIMIT = 20;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STREAK_MISS_MS = DAILY_COOLDOWN_MS * 2;
let dailyClaimRequestInFlight = false;

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
  identity: {},
  tokenMigration: {},
  dailyProgress: {},
  createdAt: null,
  updatedAt: null,
};

const DEFAULT_PAGINATION = { limit: HISTORY_LIMIT, offset: 0, total: 0, hasMore: false };
const DEFAULT_LEADERBOARDS = { earners: [], spenders: [] };
const FALLBACK_STORE_ITEMS = [
  {
    itemId: "frame_starter_neon",
    name: "Starter Neon",
    description: "Clean neon creator frame with soft animated glow for first NEX store unlocks.",
    category: "frames",
    price: 50,
    rarity: "common",
    levelRequired: 1,
    preview: { icon: "sparkles", gradient: "from-cyan-300 via-lime-300 to-emerald-500", animation: "pulse", frameStyle: "neon" },
    metadata: { frameStyle: "neon", collection: "Neon Creator Frames" },
  },
  {
    itemId: "frame_gold_aura",
    name: "Gold Aura",
    description: "Royal gold profile frame with glass depth and metallic sweep.",
    category: "frames",
    price: 250,
    rarity: "rare",
    levelRequired: 1,
    preview: { icon: "crown", gradient: "from-yellow-200 via-amber-400 to-orange-600", animation: "shine", frameStyle: "royal" },
    metadata: { frameStyle: "royal", collection: "Royal Gold Frames" },
  },
  {
    itemId: "frame_diamond_elite",
    name: "Diamond Elite",
    description: "Crystalline profile frame with elite sparkle depth.",
    category: "frames",
    price: 1200,
    rarity: "legendary",
    levelRequired: 3,
    preview: { icon: "gem", gradient: "from-cyan-200 via-white to-violet-500", animation: "sparkle", frameStyle: "diamond" },
    metadata: { frameStyle: "diamond", collection: "Diamond Elite Frames" },
  },
  {
    itemId: "frame_nex_genesis_founder",
    name: "NEX Genesis Founder",
    description: "Founder-exclusive genesis frame for VibeBook creator finance leaders.",
    category: "frames",
    price: 5000,
    rarity: "mythic",
    levelRequired: 5,
    preview: { icon: "trophy", gradient: "from-black via-lime-300 to-cyan-200", animation: "orbit", frameStyle: "genesis" },
    metadata: { frameStyle: "genesis", founderExclusive: true, collection: "NEX Genesis Founder Frames" },
  },
  {
    itemId: "vision-frame-neon",
    name: "Vision Neon Archive",
    description: "Archive neon profile frame kept as a fallback store item.",
    category: "frames",
    price: 150,
    rarity: "epic",
    levelRequired: 1,
    preview: { icon: "sparkles", gradient: "from-cyan-300 via-fuchsia-500 to-violet-700", frameStyle: "neon" },
    metadata: { frameStyle: "neon", collection: "Neon Creator Frames" },
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
    preview: { icon: "rocket", gradient: "from-emerald-300 to-sky-600" },
  },
  {
    itemId: "nex-founder-badge",
    name: "NEX Founder Badge",
    description: "Early economy badge for VibeBook wallet pioneers.",
    category: "badges",
    price: 500,
    rarity: "legendary",
    levelRequired: 1,
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
    identity: source.identity && typeof source.identity === "object" ? source.identity : {},
    tokenMigration: source.tokenMigration && typeof source.tokenMigration === "object" ? source.tokenMigration : {},
    dailyProgress: source.dailyProgress && typeof source.dailyProgress === "object" ? source.dailyProgress : {},
    tokenBalance: Number(source.tokenBalance ?? source.tokenMigration?.estimatedCoins ?? 0),
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
  const lastLoginMs = wallet?.lastLoginDate ? new Date(wallet.lastLoginDate).getTime() : 0;
  const missedStreak = lastLoginMs && Date.now() - lastLoginMs >= STREAK_MISS_MS;
  const baseStreak = missedStreak ? 0 : Number(wallet?.streakCount || 0);
  const nextStreak = Math.max(1, baseStreak + 1);
  if (nextStreak % 30 === 0) return 500;
  if (nextStreak % 7 === 0) return 75;
  if (nextStreak % 3 === 0) return 25;
  return 10;
};

const logWalletError = () => undefined;

const apiDataOrThrow = (response, fallback = "Wallet request failed.") => {
  const body = response?.data || {};
  const nestedData = body?.data && typeof body.data === "object" ? body.data : {};
  const data = { ...nestedData, ...body };

  if (body?.success === false) {
    const error = new Error(body?.message || fallback);
    error.response = { data: body, status: response?.status };
    throw error;
  }

  return data;
};

const itemIdOf = (itemOrId) => {
  if (typeof itemOrId === "string") return itemOrId.trim();
  return String(itemOrId?.itemId || itemOrId?._id || itemOrId?.id || "").trim();
};

const purchaseLockKey = (itemId) => `purchase:${itemId}`;

const syncUserCosmetics = (inventory = {}) => {
  if (typeof window === "undefined" || !inventory || typeof inventory !== "object") return;
  const activeBadges = asArray(inventory?.active?.badges).slice(0, 5);
  const patch = {
    equippedFrame: inventory?.active?.frame || "",
    equippedBadges: activeBadges,
    creatorBadges: activeBadges,
    profileTheme: inventory?.active?.theme || "classic",
    premiumBadge: activeBadges.length > 0,
    marketplace: {
      equippedFrame: inventory?.active?.frame || "",
      equippedTheme: inventory?.active?.theme || "",
      equippedBadges: activeBadges,
      ownedReactions: asArray(inventory?.active?.reactions),
    },
  };
  window.dispatchEvent(new CustomEvent("vibebook:user-patch", { detail: { user: patch } }));
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
  walletIdentity: {},
  walletSettings: {},
  receiveProfile: {},
  activeBoosts: [],
  featuredQueue: [],
  storeLoading: false,
  error: "",
  socketBound: false,

  pushNotification: (notification = {}) => {
    const id = notification.id || `${notification.type || "wallet"}-${Date.now()}-${Math.random()}`;
    set((state) => {
      if (state.notifications.some((item) => item.id === id)) {
        return { notifications: state.notifications };
      }

      return {
        notifications: [{ id, createdAt: new Date().toISOString(), ...notification }, ...state.notifications].slice(0, 6),
      };
    });
    window.setTimeout(() => {
      set((state) => ({ notifications: state.notifications.filter((item) => item.id !== id) }));
    }, notification.duration || 4200);
  },

  loadWallet: async () => {
    set({ loading: true, error: "" });
    try {
      const response = await walletApi.get();
      const data = apiDataOrThrow(response, "Unable to load wallet.");
      const wallet = normalizeWallet(data?.wallet || get().wallet);
      set((state) => ({
        wallet: normalizeWallet({ ...wallet, identity: data?.identity || wallet.identity }),
        walletIdentity: data?.identity || state.walletIdentity,
        walletSettings: data?.settings || state.walletSettings,
        walletLoaded: true,
        cooldowns: dailyCooldownFromWallet(wallet) ? { ...state.cooldowns, daily: dailyCooldownFromWallet(wallet) } : state.cooldowns,
      }));
      return wallet;
    } catch (error) {
      logWalletError(error);
      set({ walletLoaded: true, error: getApiErrorMessage(error, "Unable to load wallet.") });
      return normalizeWallet(get().wallet || DEFAULT_WALLET);
    } finally {
      set({ loading: false });
    }
  },

  loadHistory: async ({ reset = false } = {}) => {
    const { pagination, historyLoading } = get();
    if (historyLoading) return;

    const offset = reset ? 0 : Number(pagination.offset || 0) + Number(pagination.limit || HISTORY_LIMIT);
    set({ historyLoading: true });

    try {
      const response = await walletApi.history({ limit: HISTORY_LIMIT, offset });
      const data = apiDataOrThrow(response, "Unable to load wallet history.");
      const nextTransactions = asArray(data?.transactions).map(normalizeTransaction);
      set((state) => ({
        transactions: reset ? nextTransactions : [...asArray(state.transactions), ...nextTransactions],
        pagination: normalizePagination(data?.pagination, { ...DEFAULT_PAGINATION, offset }),
      }));
    } catch (error) {
      logWalletError(error);
      set({ error: getApiErrorMessage(error, "Unable to load wallet history.") });
    } finally {
      set({ historyLoading: false });
    }
  },

  loadLeaderboards: async (period = "all") => {
    set({ leaderboardLoading: true });
    try {
      const [earners, spenders] = await Promise.all([
        walletApi.topEarners({ limit: 25, period }),
        walletApi.topSpenders({ limit: 25, period }),
      ]);
      const earnersData = apiDataOrThrow(earners, "Unable to load top earners.");
      const spendersData = apiDataOrThrow(spenders, "Unable to load top spenders.");
      set({
        leaderboards: {
          earners: asArray(earnersData?.earners).map(normalizeLeaderboardEntry),
          spenders: asArray(spendersData?.spenders).map(normalizeLeaderboardEntry),
          period,
        },
      });
    } catch (error) {
      logWalletError(error);
      set({ error: getApiErrorMessage(error, "Unable to load leaderboards.") });
    } finally {
      set({ leaderboardLoading: false });
    }
  },

  loadStore: async (category = "") => {
    set({ storeLoading: true });
    try {
      const [itemsResponse, inventoryResponse] = await Promise.all([
        marketplaceApi.items(category ? { category } : {}),
        marketplaceApi.inventory(),
      ]);
      const itemsData = apiDataOrThrow(itemsResponse, "Unable to load NEX Store.");
      const inventoryData = apiDataOrThrow(inventoryResponse, "Unable to load inventory.");
      set({
        storeItems: asArray(itemsData?.items),
        inventory: inventoryData?.inventory || { ownedFrames: [], ownedBadges: [], ownedReactions: [], ownedThemes: [], ownedBoosts: [], ownedFeatured: [], active: {} },
        activeBoosts: asArray(inventoryData?.boosts),
        featuredQueue: asArray(inventoryData?.featured),
      });
    } catch (error) {
      logWalletError(error);
      set({
        storeItems: FALLBACK_STORE_ITEMS,
        inventory: get().inventory,
        error: getApiErrorMessage(error, "Unable to load NEX Store."),
      });
    } finally {
      set({ storeLoading: false });
    }
  },

  loadWalletIdentity: async () => {
    set((state) => ({ requestLocks: { ...state.requestLocks, identity: true }, error: "" }));
    try {
      const response = await walletApi.identity();
      const data = apiDataOrThrow(response, "Unable to load wallet identity.");
      set((state) => ({
        wallet: normalizeWallet({ ...(data?.wallet || state.wallet), identity: data?.identity || state.walletIdentity }),
        walletIdentity: data?.identity || state.walletIdentity,
        walletSettings: data?.settings || state.walletSettings,
        walletLoaded: true,
      }));
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Unable to load wallet identity.");
      set({ error: message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, identity: false } }));
    }
  },

  loadReceiveProfile: async () => {
    set((state) => ({ requestLocks: { ...state.requestLocks, receive: true }, error: "" }));
    try {
      const response = await walletApi.receive();
      const data = apiDataOrThrow(response, "Unable to load receive profile.");
      set((state) => ({
        wallet: normalizeWallet({ ...(data?.wallet || state.wallet), identity: data?.identity || state.walletIdentity }),
        walletIdentity: data?.identity || state.walletIdentity,
        walletSettings: data?.settings || state.walletSettings,
        receiveProfile: data,
        walletLoaded: true,
      }));
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Unable to load receive profile.");
      set({ error: message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, receive: false } }));
    }
  },

  loadWalletSettings: async () => {
    set((state) => ({ requestLocks: { ...state.requestLocks, settings: true }, error: "" }));
    try {
      const response = await walletApi.settings();
      const data = apiDataOrThrow(response, "Unable to load wallet settings.");
      set((state) => ({
        walletIdentity: data?.identity || state.walletIdentity,
        walletSettings: data?.settings || state.walletSettings,
      }));
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Unable to load wallet settings.");
      set({ error: message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, settings: false } }));
    }
  },

  updateWalletSettings: async (payload = {}) => {
    set((state) => ({ requestLocks: { ...state.requestLocks, settingsSave: true }, error: "" }));
    try {
      const response = await walletApi.updateSettings(payload);
      const data = apiDataOrThrow(response, "Unable to update wallet settings.");
      set((state) => ({
        wallet: data?.wallet ? normalizeWallet({ ...data.wallet, identity: data?.identity || state.walletIdentity }) : state.wallet,
        walletIdentity: data?.identity || state.walletIdentity,
        walletSettings: data?.settings || state.walletSettings,
      }));
      get().pushNotification({ type: "settings", title: "Wallet settings saved", message: data?.message || "Security preferences updated." });
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Unable to update wallet settings.");
      set({ error: message });
      get().pushNotification({ type: "warning", title: "Settings failed", message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, settingsSave: false } }));
    }
  },

  purchaseStoreItem: async (itemId, payload = {}) => {
    const safeItemId = itemIdOf(itemId || payload?.itemId);
    const { requestLocks, pushNotification } = get();

    if (!safeItemId) {
      const message = "Choose a valid store item first.";
      pushNotification({ type: "warning", title: "Purchase failed", message });
      return { ok: false, message };
    }

    const lockKey = purchaseLockKey(safeItemId);
    if (requestLocks?.[lockKey]) return { ok: false, message: "Purchase already in progress." };

    const storeItem = asArray(get().storeItems).find((entry) => itemIdOf(entry) === safeItemId);
    if (!storeItem?.price) {
      const error = new Error("Invalid item price");
      pushNotification({ type: "warning", title: "Purchase failed", message: error.message });
      throw error;
    }

    const amount = Number(storeItem.price);
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error("Invalid item price");
      pushNotification({ type: "warning", title: "Purchase failed", message: error.message });
      throw error;
    }

    const previousWallet = normalizeWallet(get().wallet);
    if (amount > Number(previousWallet.balance || 0)) {
      const message = "Not enough NEX Points for this purchase.";
      pushNotification({ type: "warning", title: "Purchase failed", message });
      return { ok: false, message };
    }

    set((state) => ({
      wallet: amount > 0 ? mergeWallet(state.wallet, {
        balance: Math.max(0, Number(state.wallet?.balance || 0) - amount),
        lifetimeSpent: Number(state.wallet?.lifetimeSpent || 0) + amount,
      }) : state.wallet,
      requestLocks: { ...state.requestLocks, [lockKey]: true },
      error: "",
    }));

    try {
      const response = await marketplaceApi.purchase(safeItemId, payload);
      const data = apiDataOrThrow(response, "Purchase failed.");
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet: normalizeWallet(data?.wallet || state.wallet),
        walletLoaded: true,
        inventory: data?.inventory || state.inventory,
        activeBoosts: data?.boost ? [data.boost, ...asArray(state.activeBoosts)] : state.activeBoosts,
        featuredQueue: data?.featured ? [data.featured, ...asArray(state.featuredQueue)] : state.featuredQueue,
        transactions: prependTransaction(state.transactions, transaction),
      }));
      if (data?.inventory) syncUserCosmetics(data.inventory);
      pushNotification({ type: "purchase", title: data?.item?.name || "Store item unlocked", message: data?.message || "Inventory updated." });
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Purchase failed.");
      set((state) => ({
        wallet: previousWallet,
        cooldowns: error?.response?.data?.cooldownUntil ? { ...state.cooldowns, [`store:${safeItemId}`]: error.response.data.cooldownUntil } : state.cooldowns,
        error: message,
      }));
      pushNotification({ type: "warning", title: "Purchase failed", message });
      throw error;
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, [lockKey]: false } }));
    }
  },

  equipStoreItem: async (itemId, action = "equip") => {
    const safeItemId = itemIdOf(itemId);
    const { requestLocks, pushNotification } = get();

    if (!safeItemId) {
      const message = "Choose a valid inventory item first.";
      pushNotification({ type: "warning", title: "Inventory update failed", message });
      return { ok: false, message };
    }

    if (requestLocks?.[`equip:${safeItemId}`]) return { ok: false, message: "Inventory update already in progress." };

    set((state) => ({ requestLocks: { ...state.requestLocks, [`equip:${safeItemId}`]: true }, error: "" }));
    try {
      const response = await marketplaceApi.equip(safeItemId, action);
      const data = apiDataOrThrow(response, "Unable to update inventory.");
      set((state) => ({
        inventory: data?.inventory || state.inventory,
      }));
      if (data?.inventory) syncUserCosmetics(data.inventory);
      pushNotification({ type: "inventory", title: action === "unequip" ? "Item removed" : "Item equipped", message: data?.message || "Profile prestige updated." });
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Unable to update inventory.");
      set({ error: message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, [`equip:${safeItemId}`]: false } }));
    }
  },

  claimDailyReward: async () => {
    const { loading, requestLocks, wallet, pushNotification } = get();
    if (loading || requestLocks.daily || dailyClaimRequestInFlight) {
      return { ok: false, message: "Reward request already in progress." };
    }

    const nextClaimMs = get().cooldowns?.daily ? new Date(get().cooldowns.daily).getTime() : 0;
    if (nextClaimMs > Date.now()) {
      const message = "Daily reward is still cooling down.";
      pushNotification({ id: "daily-reward-cooldown", type: "warning", title: "Come back soon", message });
      return { ok: false, message };
    }

    dailyClaimRequestInFlight = true;

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
      const response = await walletApi.claimDaily();
      const data = apiDataOrThrow(response, "Daily reward could not be claimed.");
      const wallet = normalizeWallet(data?.wallet || get().wallet);
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet,
        walletLoaded: true,
        transactions: transaction
          ? prependTransaction(asArray(state.transactions).filter((item) => item._id !== optimisticTransaction._id), transaction)
          : asArray(state.transactions).map((item) => (item._id === optimisticTransaction._id ? { ...item, status: "completed" } : item)),
        cooldowns: { ...state.cooldowns, daily: data?.nextClaimTime || dailyCooldownFromWallet(wallet) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
      }));
      pushNotification({ id: `daily-reward-${transaction?._id || data?.nextClaimTime || "claimed"}`, type: "reward", title: "Daily reward earned", amount: data?.rewardAmount || transaction?.amount || optimisticAmount, message: data?.message || "Daily reward claimed successfully" });
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Daily reward could not be claimed.");
      set((state) => ({
        wallet: previousWallet,
        transactions: previousTransactions,
        cooldowns: error?.response?.data?.nextClaimTime
          ? { ...state.cooldowns, daily: error.response.data.nextClaimTime }
          : state.cooldowns,
        error: message,
      }));
      pushNotification({ id: "daily-reward-failed", type: "warning", title: "Daily reward failed", message });
      return { ok: false, message };
    } finally {
      dailyClaimRequestInFlight = false;
      set((state) => ({ requestLocks: { ...state.requestLocks, daily: false } }));
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
      const response = await walletApi.spend(payload);
      const data = apiDataOrThrow(response, "Spend failed.");
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet: normalizeWallet(data?.wallet || state.wallet),
        transactions: prependTransaction(state.transactions, transaction),
      }));
      pushNotification({ type: "spend", title: "NEX spent", message: data?.message || "Transaction complete." });
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Spend failed.");
      set({ wallet: previousWallet, error: message });
      pushNotification({ type: "warning", title: "Spend failed", message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, spend: false } }));
    }
  },

  generateWalletQr: async (payload = {}) => {
    set((state) => ({ requestLocks: { ...state.requestLocks, qr: true }, error: "" }));
    try {
      const response = await walletApi.generateQr(payload);
      const data = apiDataOrThrow(response, "Unable to generate QR.");
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Unable to generate QR.");
      set({ error: message });
      get().pushNotification({ type: "warning", title: "QR failed", message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, qr: false } }));
    }
  },

  scanWalletQr: async (payload = {}) => {
    set((state) => ({ requestLocks: { ...state.requestLocks, scan: true }, error: "" }));
    try {
      const response = await walletApi.scanQr(payload);
      const data = apiDataOrThrow(response, "Unable to scan QR.");
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet: normalizeWallet(data?.sender || state.wallet),
        transactions: prependTransaction(state.transactions, transaction),
      })); 
      get().pushNotification({ type: "qr", title: "QR scanned", message: data?.message || "QR processed." });
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Unable to scan QR.");
      set({ error: message });
      get().pushNotification({ type: "warning", title: "QR scan failed", message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, scan: false } }));
    }
  },

  transferPoints: async (payload = {}) => {
    const { requestLocks, wallet, pushNotification } = get();
    if (requestLocks.transfer) return { ok: false, message: "Transfer already in progress." };

    const amount = Number(payload.amount || 0);
    const recipient = payload.receiverId || payload.recipient || payload.walletId || payload.nexHandle || payload.username;
    if (!recipient || !amount || amount < 1) {
      return { ok: false, message: "Enter a valid wallet ID, NEX handle, username, and amount." };
    }

    const previousWallet = normalizeWallet(wallet);
    if (amount > Number(previousWallet.balance || 0)) {
      const message = "Not enough NEX Points for this transfer.";
      pushNotification({ type: "warning", title: "Transfer blocked", message });
      return { ok: false, message };
    }

    set((state) => ({
      wallet: mergeWallet(state.wallet, { balance: Math.max(0, Number(state.wallet?.balance || 0) - amount) }),
      requestLocks: { ...state.requestLocks, transfer: true },
      error: "",
    }));

    try {
      const response = await walletApi.transfer(payload);
      const data = apiDataOrThrow(response, "Transfer failed. Your balance was restored.");
      const transaction = data?.transaction ? normalizeTransaction(data.transaction) : null;
      set((state) => ({
        wallet: normalizeWallet(data?.sender || state.wallet),
        walletLoaded: true,
        transactions: prependTransaction(state.transactions, transaction),
      }));
      pushNotification({ type: "transfer", title: "Transfer sent", amount, message: "NEX Points moved instantly." });
      return { ok: true, data };
    } catch (error) {
      logWalletError(error);
      const message = getApiErrorMessage(error, "Transfer failed. Your balance was restored.");
      set({
        wallet: previousWallet,
        error: message,
      });
      pushNotification({ type: "warning", title: "Transfer failed", message });
      return { ok: false, message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, transfer: false } }));
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
      const notificationId = payload.type === "daily_login"
        ? `daily-reward-${transaction?._id || payload.nextClaimTime || "claimed"}`
        : undefined;
      get().pushNotification({ id: notificationId, type: "reward", title: payload.message || "Reward earned", amount: payload.amount, message: payload.source || payload.type });
    };
    const handleTransfer = (payload = {}) => {
      if (!payload || typeof payload !== "object") return;
      const transaction = payload.transaction ? normalizeTransaction(payload.transaction) : null;
      set((state) => ({
        wallet: payload.wallet ? normalizeWallet(payload.wallet) : state.wallet,
        walletLoaded: true,
        transactions: prependTransaction(state.transactions, transaction),
      }));
      get().pushNotification({ type: "transfer", title: payload.message || "Transfer completed", amount: payload.amount, message: payload.recipient ? `To ${payload.recipient}` : payload.type });
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
      if (payload.inventory) {
        set({ inventory: payload.inventory });
        syncUserCosmetics(payload.inventory);
      }
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
      if (payload.inventory) syncUserCosmetics(payload.inventory);
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
    socket.on("wallet:transfer", handleTransfer);
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
      socket.off("wallet:transfer", handleTransfer);
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
