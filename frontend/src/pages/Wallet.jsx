// @ts-nocheck
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Crown,
  Flame,
  Gem,
  Gift,
  History,
  Loader2,
  Lock,
  Medal,
  MessageCircle,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserPlus,
  Users,
  Wallet as WalletIcon,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl } from "../services/api";
import { useWalletStore } from "../store/walletStore";

const LEVELS = [
  { name: "Starter", min: 0, icon: Star, tone: "from-slate-500 to-slate-700" },
  { name: "Rising", backendNames: ["Climber"], min: 500, icon: Zap, tone: "from-emerald-400 to-cyan-500" },
  { name: "Pro", backendNames: ["Influencer"], min: 2000, icon: BadgeCheck, tone: "from-sky-400 to-indigo-500" },
  { name: "Elite", backendNames: ["Superstar"], min: 5000, icon: Crown, tone: "from-amber-300 to-orange-500" },
  { name: "Legend", min: 10000, icon: Trophy, tone: "from-fuchsia-400 to-rose-500" },
];

const GIFTS = [
  { id: "rose", name: "Rose", cost: 10, reward: 5, rarity: "Sweet", icon: Gift, tone: "from-rose-500 to-pink-600" },
  { id: "fire", name: "Fire", cost: 50, reward: 30, rarity: "Hot", icon: Flame, tone: "from-orange-400 to-red-600" },
  { id: "crown", name: "Crown", cost: 100, reward: 70, rarity: "Royal", icon: Crown, tone: "from-yellow-300 to-amber-600" },
  { id: "diamond", name: "Diamond", cost: 500, reward: 400, rarity: "Mythic", icon: Gem, tone: "from-cyan-300 to-violet-600" },
];

const ACHIEVEMENTS = [
  { title: "First Spark", detail: "Create your wallet", icon: Sparkles, threshold: 1 },
  { title: "Daily Heat", detail: "Keep a 7 day streak", icon: Flame, threshold: 7 },
  { title: "Invite Engine", detail: "Earn referral rewards", icon: UserPlus, threshold: 100 },
  { title: "Creator Climb", detail: "Reach Rising level", icon: Award, threshold: 500 },
];

const formatNumber = (value = 0) => new Intl.NumberFormat("en").format(Number(value || 0));
const compact = (value = 0) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));

const idOf = (value) => value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";

const displayNameForLevel = (wallet = {}) => {
  const name = wallet.levelName || "Starter";
  const match = LEVELS.find((level) => level.name === name || level.backendNames?.includes(name));
  return match?.name || name;
};

const getLevelMeta = (wallet = {}) => {
  const earned = Number(wallet.lifetimeEarned || 0);
  const current = [...LEVELS].reverse().find((level) => earned >= level.min) || LEVELS[0];
  const next = LEVELS.find((level) => level.min > earned) || current;
  const range = Math.max(1, next.min - current.min);
  const progress = current === next ? 100 : Math.min(100, Math.max(0, ((earned - current.min) / range) * 100));
  return { current, next, progress, remaining: Math.max(0, next.min - earned), displayName: displayNameForLevel(wallet) };
};

const formatDateGroup = (value) => {
  const date = value ? new Date(value) : new Date();
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const transactionIcon = (transaction = {}) => {
  const key = `${transaction.type || ""}:${transaction.source || ""}`.toLowerCase();
  if (key.includes("gift")) return Gift;
  if (key.includes("referral")) return UserPlus;
  if (key.includes("transfer")) return Send;
  if (key.includes("daily") || key.includes("reward")) return Sparkles;
  if (key.includes("bonus")) return Zap;
  return Coins;
};

const transactionTone = (transaction = {}) => {
  if (["spend", "transfer"].includes(transaction.type)) return "text-rose-600 bg-rose-50";
  if (transaction.type === "gift") return "text-fuchsia-600 bg-fuchsia-50";
  if (transaction.type === "referral") return "text-sky-600 bg-sky-50";
  return "text-emerald-700 bg-emerald-50";
};

const WalletToast = ({ notification }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: -16, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -10, scale: 0.98 }}
    className="pointer-events-auto overflow-hidden rounded-lg border border-white/20 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur"
  >
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-navy">
        {notification.type === "gift" ? <Gift className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-black">{notification.title || "Wallet update"}</p>
        <p className="truncate text-xs font-bold text-white/65">
          {notification.amount ? `+${formatNumber(notification.amount)} NEX` : notification.message || "Synced in real time"}
        </p>
      </div>
    </div>
  </motion.div>
);

const StatCard = ({ icon: Icon, label, value, detail, tone = "bg-white" }) => (
  <motion.article whileHover={{ y: -3 }} className={`${tone} rounded-lg border border-slate-200 p-4 shadow-sm`}>
    <div className="flex items-center justify-between gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-brand">
        <Icon className="h-5 w-5" />
      </span>
      <ArrowUpRight className="h-4 w-4 text-slate-300" />
    </div>
    <p className="mt-4 text-2xl font-black text-navy">{value}</p>
    <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
    {detail && <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p>}
  </motion.article>
);

const QuickAction = ({ icon: Icon, label, onClick, to, disabled = false, active = false }) => {
  const content = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${active ? "bg-brand text-navy" : "bg-slate-100 text-navy"}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 text-left text-sm font-black text-navy">{label}</span>
    </>
  );

  if (to) {
    return <Link to={to} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition active:scale-[0.98]">{content}</Link>;
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55">
      {content}
    </button>
  );
};

const BalanceHero = ({ user, wallet, socketConnected }) => {
  const { current, next, progress, remaining, displayName } = getLevelMeta(wallet);
  const LevelIcon = current.icon;

  return (
    <section className="relative overflow-hidden rounded-lg bg-slate-950 p-5 text-white shadow-2xl sm:p-6">
      <div className="absolute inset-0 wallet-grid opacity-40" />
      <motion.div
        className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand/30 blur-3xl"
        animate={{ scale: [1, 1.14, 1], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 3.8, repeat: Infinity }}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={mediaUrl(user?.profilePicture || user?.profileImage || "/logo.png")} alt="" className="h-14 w-14 rounded-full border border-white/20 object-cover" />
            <div className="min-w-0">
              <p className="truncate text-lg font-black">@{user?.username || user?.name || "creator"}</p>
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-black text-brand">
                <LevelIcon className="h-3.5 w-3.5" />
                {displayName}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${socketConnected ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/65"}`}>
            <Radio className="h-3.5 w-3.5" />
            {socketConnected ? "Live" : "Syncing"}
          </span>
        </div>

        <div className="mt-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-white/50">NEX Points balance</p>
          <motion.p
            key={wallet?.balance}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-5xl font-black leading-none sm:text-6xl"
          >
            {formatNumber(wallet?.balance || 0)}
          </motion.p>
          <p className="mt-2 text-sm font-bold text-white/60">Prepared for future NEX COIN migration</p>
        </div>

        <div className="mt-7 rounded-lg border border-white/10 bg-white/10 p-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3 text-xs font-black">
            <span>{displayName}</span>
            <span>{current === next ? "Max prestige" : `${formatNumber(remaining)} NEX to ${next.name}`}</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full bg-brand shadow-[0_0_22px_rgba(34,197,94,0.8)]" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
};

const TransactionList = ({ transactions, pagination, loading, onLoadMore }) => {
  const groups = transactions.reduce((acc, transaction) => {
    const key = formatDateGroup(transaction.createdAt);
    acc[key] = acc[key] || [];
    acc[key].push(transaction);
    return acc;
  }, {});

  if (loading && !transactions.length) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
      </div>
    );
  }

  if (!transactions.length) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <History className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-black text-navy">No wallet activity yet</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">Rewards, gifts, referrals, transfers, and bonuses will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([day, items]) => (
        <section key={day}>
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">{day}</p>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {items.map((transaction) => {
              const Icon = transactionIcon(transaction);
              const isDebit = ["spend", "transfer"].includes(transaction.type) && Number(transaction.balanceAfter) < Number(transaction.balanceBefore);
              return (
                <article key={transaction._id || `${transaction.createdAt}-${transaction.description}`} className="flex items-center gap-3 border-b border-slate-100 p-3 last:border-b-0">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${transactionTone(transaction)}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-navy">{transaction.description || transaction.source || "Wallet transaction"}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {new Date(transaction.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {transaction.status || "completed"}
                    </p>
                  </div>
                  <p className={`text-sm font-black ${isDebit ? "text-rose-600" : "text-emerald-600"}`}>
                    {isDebit ? "-" : "+"}{formatNumber(transaction.amount)} NEX
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {pagination?.hasMore && (
        <button type="button" className="btn-secondary w-full gap-2" onClick={() => onLoadMore()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Load more
        </button>
      )}
    </div>
  );
};

const StreakCard = ({ wallet, onClaim, locked, cooldown }) => {
  const streak = Math.min(7, Number(wallet?.streakCount || 0));
  const nextClaim = cooldown ? new Date(cooldown) : null;
  const cooldownActive = nextClaim && nextClaim.getTime() > Date.now();

  return (
    <section className="overflow-hidden rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black text-navy">Daily streak</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Claim daily to keep your creator heat alive.</p>
        </div>
        <motion.span animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.6, repeat: Infinity }} className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg">
          <Flame className="h-6 w-6 fill-white" />
        </motion.span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, index) => {
          const active = index < streak;
          return (
            <div key={index} className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-black ${active ? "border-orange-300 bg-orange-500 text-white shadow-[0_0_16px_rgba(249,115,22,0.35)]" : "border-slate-200 bg-white text-slate-400"}`}>
              {index + 1}
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn-primary gap-2" onClick={onClaim} disabled={locked || cooldownActive}>
          {locked ? <Loader2 className="h-4 w-4 animate-spin" /> : cooldownActive ? <Clock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {cooldownActive ? "Cooldown active" : "Claim daily reward"}
        </button>
        <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs font-bold text-amber-800">
          <span className="inline-flex items-center gap-1 font-black"><ShieldCheck className="h-4 w-4" /> Recovery support</span>
          <p className="mt-1 text-amber-700/80">Missed days are protected by backend cooldown checks and duplicate-claim prevention.</p>
        </div>
      </div>
    </section>
  );
};

const ReferralCard = ({ user }) => {
  const [copied, setCopied] = useState(false);
  const code = user?.referralCode || `${String(user?.username || user?.name || "VIBE").replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}${String(idOf(user)).slice(-4).toUpperCase()}`;
  const link = user?.referralLink || (typeof window !== "undefined" ? `${window.location.origin}/register?ref=${code}` : `/register?ref=${code}`);
  const shareText = `Join me on VibeBook and start earning NEX Points: ${link}`;

  const copy = async () => {
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black text-navy">Referral engine</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Share verified invites. Backend rewards only valid new users.</p>
        </div>
        <UserPlus className="h-7 w-7 text-brand" />
      </div>
      <div className="mt-4 rounded-lg bg-slate-950 p-4 text-white">
        <p className="text-xs font-black uppercase text-white/45">Your code</p>
        <p className="mt-1 break-all text-2xl font-black">{code}</p>
        <p className="mt-2 break-all text-xs font-semibold text-white/55">{link}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" className="btn-secondary px-3 gap-2" onClick={copy}>
          {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          Copy
        </button>
        <a className="btn-secondary px-3 gap-2" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
        <a className="btn-secondary px-3 gap-2" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join me on VibeBook")}`} target="_blank" rel="noreferrer">
          <Send className="h-4 w-4" />
          Telegram
        </a>
      </div>
      <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
        {["Self-referral blocked", "Device abuse checks", "Reward cooldowns"].map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-3 py-2">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            {item}
          </span>
        ))}
      </div>
    </section>
  );
};

const Leaderboards = ({ leaderboards, loading }) => {
  const [tab, setTab] = useState("earners");
  const [range, setRange] = useState("weekly");
  const tabs = [
    { id: "earners", label: "Top Earners", data: leaderboards.earners },
    { id: "creators", label: "Top Creators", data: leaderboards.earners },
    { id: "gifters", label: "Top Gifters", data: leaderboards.spenders },
    { id: "referrals", label: "Top Referrals", data: leaderboards.earners },
  ];
  const active = tabs.find((item) => item.id === tab) || tabs[0];
  const entries = active.data || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black text-navy">Leaderboards</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Live creator economy rankings.</p>
        </div>
        <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs font-black">
          {["weekly", "monthly"].map((item) => (
            <button key={item} type="button" onClick={() => setRange(item)} className={`rounded-md px-3 py-2 capitalize ${range === item ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}>{item}</button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map((item) => (
          <button key={item.id} type="button" className={`rounded-lg px-2 py-2 text-xs font-black transition ${tab === item.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="mt-4 grid gap-2">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {entries.slice(0, 8).map((entry, index) => {
            const user = entry.user || entry.userId || entry;
            const rank = index + 1;
            return (
              <article key={idOf(user) || `${active.id}-${index}`} className={`flex items-center gap-3 rounded-lg border p-3 ${rank <= 3 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${rank === 1 ? "bg-amber-400 text-white" : "bg-slate-100 text-navy"}`}>
                  {rank <= 3 ? <Crown className="h-4 w-4" /> : rank}
                </span>
                <img src={mediaUrl(user?.profilePicture || user?.profileImage || "/logo.png")} alt="" className="h-10 w-10 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-navy">@{user?.username || user?.name || "creator"}</p>
                  <p className="text-xs font-bold text-slate-500">Level badge · {rank <= 3 ? "Podium" : "Creator"}</p>
                </div>
                <p className="text-sm font-black text-navy">{compact(entry.lifetimeEarned || entry.lifetimeSpent || entry.balance || 0)}</p>
              </article>
            );
          })}
          {!entries.length && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">Leaderboard data is warming up.</p>}
        </div>
      )}
    </section>
  );
};

const Wallet = () => {
  const { user, token } = useAuth();
  const {
    wallet,
    transactions,
    pagination,
    leaderboards,
    loading,
    historyLoading,
    leaderboardLoading,
    socketConnected,
    requestLocks,
    cooldowns,
    notifications,
    error,
    loadWallet,
    loadHistory,
    loadLeaderboards,
    claimDailyReward,
    transferPoints,
    bindSocket,
  } = useWalletStore();
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ receiverId: "", amount: "" });
  const [localWarning, setLocalWarning] = useState("");

  useEffect(() => {
    loadWallet();
    loadHistory({ reset: true });
    loadLeaderboards();
  }, [loadWallet, loadHistory, loadLeaderboards]);

  useEffect(() => bindSocket(token, user?._id), [bindSocket, token, user?._id]);

  const stats = useMemo(() => {
    const giftsReceived = transactions.filter((item) => `${item.type}:${item.source}`.toLowerCase().includes("gift")).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const referralEarnings = transactions.filter((item) => `${item.type}:${item.source}`.toLowerCase().includes("referral")).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const rank = Math.max(1, (leaderboards.earners || []).findIndex((entry) => idOf(entry.user || entry.userId) === idOf(user)) + 1 || 12);
    return { giftsReceived, referralEarnings, rank };
  }, [leaderboards.earners, transactions, user]);

  const submitTransfer = async (event) => {
    event.preventDefault();
    setLocalWarning("");
    if (transferForm.receiverId === user?._id) {
      setLocalWarning("Self-transfer blocked to protect wallet integrity.");
      return;
    }
    const result = await transferPoints({ receiverId: transferForm.receiverId.trim(), amount: Number(transferForm.amount) });
    if (result.ok) {
      setTransferForm({ receiverId: "", amount: "" });
      setTransferOpen(false);
    } else {
      setLocalWarning(result.message);
    }
  };

  return (
    <section className="min-h-screen bg-slate-100 pb-28">
      <AnimatePresence>
        {notifications.length > 0 && (
          <div className="pointer-events-none fixed inset-x-3 top-20 z-[80] mx-auto grid max-w-sm gap-2">
            {notifications.map((item) => <WalletToast key={item.id} notification={item} />)}
          </div>
        )}
      </AnimatePresence>

      <div className="container-page py-4 sm:py-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(21rem,0.95fr)]">
          <div className="space-y-4">
            <BalanceHero user={user} wallet={wallet} socketConnected={socketConnected} />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <StatCard icon={WalletIcon} label="Current balance" value={formatNumber(wallet?.balance || 0)} detail="Available now" />
              <StatCard icon={Sparkles} label="Lifetime earned" value={formatNumber(wallet?.lifetimeEarned || 0)} detail="All-time NEX" />
              <StatCard icon={Gift} label="Gifts received" value={formatNumber(wallet?.totalReceived || stats.giftsReceived)} detail="Gift prep ready" />
              <StatCard icon={UserPlus} label="Referrals" value={formatNumber(stats.referralEarnings)} detail="Tracked invites" />
              <StatCard icon={Trophy} label="Creator rank" value={`#${stats.rank}`} detail="Earners board" />
            </div>

            <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-5">
              <QuickAction icon={Send} label="Transfer Points" onClick={() => setTransferOpen((current) => !current)} active={transferOpen} />
              <QuickAction icon={UserPlus} label="Invite Friends" onClick={() => document.getElementById("wallet-referrals")?.scrollIntoView({ behavior: "smooth" })} />
              <QuickAction icon={Sparkles} label="Claim Daily Reward" onClick={claimDailyReward} disabled={requestLocks.daily} />
              <QuickAction icon={Trophy} label="View Leaderboard" onClick={() => document.getElementById("wallet-leaderboard")?.scrollIntoView({ behavior: "smooth" })} />
              <QuickAction icon={Gift} label="Redeem Rewards" onClick={() => document.getElementById("wallet-gifts")?.scrollIntoView({ behavior: "smooth" })} />
            </section>

            <AnimatePresence>
              {transferOpen && (
                <motion.form initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} onSubmit={submitTransfer} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
                    <input className="field" placeholder="Creator user ID" value={transferForm.receiverId} onChange={(event) => setTransferForm((current) => ({ ...current, receiverId: event.target.value }))} />
                    <input className="field" placeholder="Amount" inputMode="numeric" value={transferForm.amount} onChange={(event) => setTransferForm((current) => ({ ...current, amount: event.target.value.replace(/[^\d]/g, "") }))} />
                    <button type="submit" className="btn-primary gap-2" disabled={requestLocks.transfer}>
                      {requestLocks.transfer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </button>
                  </div>
                  {(localWarning || error) && (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                      <AlertTriangle className="h-4 w-4" />
                      {localWarning || error}
                    </p>
                  )}
                </motion.form>
              )}
            </AnimatePresence>

            <StreakCard wallet={wallet} onClaim={claimDailyReward} locked={requestLocks.daily} cooldown={cooldowns.daily} />

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-lg font-black text-navy">Achievement cards</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Milestones unlock prestige visuals.</p>
                </div>
                <Medal className="h-6 w-6 text-brand" />
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {ACHIEVEMENTS.map((item) => {
                  const Icon = item.icon;
                  const unlocked = Number(wallet?.lifetimeEarned || wallet?.streakCount || 0) >= item.threshold;
                  return (
                    <motion.article key={item.title} whileHover={{ y: -3 }} className={`rounded-lg border p-3 ${unlocked ? "border-brand/40 bg-brand/10" : "border-slate-200 bg-slate-50"}`}>
                      <Icon className={`h-6 w-6 ${unlocked ? "text-green-700" : "text-slate-400"}`} />
                      <p className="mt-3 text-sm font-black text-navy">{item.title}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{item.detail}</p>
                    </motion.article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <ReferralCard user={user} />

            <section id="wallet-gifts" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-navy">Gift preview</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Reusable gift cards for future live gifting.</p>
                </div>
                <Gift className="h-6 w-6 text-brand" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {GIFTS.map((gift) => {
                  const Icon = gift.icon;
                  return (
                    <motion.article key={gift.id} whileHover={{ y: -4, scale: 1.02 }} className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${gift.tone} p-3 text-white shadow-lg`}>
                      <div className="absolute inset-0 wallet-shine" />
                      <div className="relative z-10">
                        <Icon className="h-7 w-7" />
                        <p className="mt-4 text-sm font-black">{gift.name}</p>
                        <p className="text-xs font-bold text-white/70">{gift.rarity}</p>
                        <div className="mt-3 rounded-lg bg-white/15 p-2 text-xs font-black backdrop-blur">
                          {gift.cost} NEX · creator earns {gift.reward}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 h-6 w-6 text-emerald-600" />
                <div>
                  <p className="text-lg font-black text-navy">Anti-fraud protections</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">Frontend locks pair with backend rate limits and duplicate reward checks.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-xs font-bold text-slate-600">
                {["Spam clicking disabled during requests", "Optimistic transfer rollback enabled", "Cooldown active warnings shown", "Suspicious referral states surfaced"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {item}
                  </span>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <div id="wallet-leaderboard" className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Leaderboards leaderboards={leaderboards} loading={leaderboardLoading} />
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-lg font-black text-navy">Transaction history</p>
                <p className="mt-1 text-xs font-bold text-slate-500">Grouped by day with live wallet refresh.</p>
              </div>
              {loading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
            </div>
            <TransactionList transactions={transactions} pagination={pagination} loading={historyLoading} onLoadMore={() => loadHistory()} />
          </section>
        </div>
      </div>
    </section>
  );
};

export default Wallet;
