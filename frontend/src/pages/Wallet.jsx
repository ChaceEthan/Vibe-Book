// @ts-nocheck
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Crown,
  Download,
  Flame,
  Gem,
  Gift,
  History,
  Loader2,
  Medal,
  MessageCircle,
  Play,
  QrCode,
  Radio,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Trophy,
  UserPlus,
  Wallet as WalletIcon,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import WalletErrorBoundary from "../components/WalletErrorBoundary.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl, referralUrlFor } from "../services/api";
import { useWalletStore } from "../store/walletStore";

const LEVELS = [
  { name: "Starter", min: 0, icon: Star },
  { name: "Rising", backendNames: ["Climber"], min: 500, icon: Zap },
  { name: "Pro", backendNames: ["Influencer"], min: 2000, icon: BadgeCheck },
  { name: "Elite", backendNames: ["Superstar"], min: 5000, icon: Crown },
  { name: "Legend", min: 10000, icon: Trophy },
];

const GIFTS = [
  { id: "rose", name: "Rose", cost: 10, reward: 5, rarity: "Sweet", icon: Gift, tone: "from-rose-500 to-pink-600" },
  { id: "fire", name: "Fire", cost: 50, reward: 30, rarity: "Hot", icon: Flame, tone: "from-orange-400 to-red-600" },
  { id: "crown", name: "Crown", cost: 100, reward: 70, rarity: "Royal", icon: Crown, tone: "from-yellow-300 to-amber-600" },
  { id: "diamond", name: "Diamond", cost: 500, reward: 400, rarity: "Mythic", icon: Gem, tone: "from-cyan-300 to-violet-600" },
];

const NAV = [
  { to: "/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/wallet/referrals", label: "Invite", icon: UserPlus },
  { to: "/wallet/leaderboard", label: "Ranks", icon: Trophy },
  { to: "/wallet/transactions", label: "History", icon: History },
  { to: "/wallet/rewards", label: "Rewards", icon: Store },
  { to: "/wallet/store", label: "Store", icon: Crown },
];

const formatNumber = (value = 0) => new Intl.NumberFormat("en").format(Number(value || 0));
const compact = (value = 0) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
const asArray = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (value && typeof value === "object" ? value : {});
const idOf = (value) => value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";

const getLevelMeta = (wallet = {}) => {
  const earned = Number(wallet?.lifetimeEarned || 0);
  const current = [...LEVELS].reverse().find((level) => earned >= level.min) || LEVELS[0];
  const next = LEVELS.find((level) => level.min > earned) || current;
  const range = Math.max(1, next.min - current.min);
  const progress = current === next ? 100 : Math.min(100, Math.max(0, ((earned - current.min) / range) * 100));
  const displayName = LEVELS.find((level) => level.name === wallet?.levelName || level.backendNames?.includes(wallet?.levelName))?.name || wallet?.levelName || current.name;
  return { current, next, progress, remaining: Math.max(0, next.min - earned), displayName };
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

const formatDuration = (target) => {
  const remaining = Math.max(0, new Date(target).getTime() - Date.now());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const transactionIcon = (transaction = {}) => {
  const key = `${transaction.type || ""}:${transaction.source || ""}`.toLowerCase();
  if (key.includes("gift")) return Gift;
  if (key.includes("referral")) return UserPlus;
  if (key.includes("transfer")) return Send;
  if (key.includes("daily") || key.includes("reward")) return Sparkles;
  return Coins;
};

const TransactionRow = ({ transaction }) => {
  const item = safeObject(transaction);
  const Icon = transactionIcon(item);
  const isDebit = ["spend", "transfer"].includes(item.type) && Number(item.balanceAfter || 0) < Number(item.balanceBefore || 0);
  const tone = isDebit ? "text-rose-600 bg-rose-50" : item.source === "referral" ? "text-sky-600 bg-sky-50" : "text-emerald-700 bg-emerald-50";

  return (
    <article className="flex items-center gap-3 border-b border-slate-100 p-3 last:border-b-0">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-navy">{item.description || item.source || "Wallet transaction"}</p>
        <p className="mt-1 truncate text-xs font-semibold text-slate-500">
          {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {item.status || "completed"}
        </p>
      </div>
      <p className={`text-sm font-black ${isDebit ? "text-rose-600" : "text-emerald-600"}`}>
        {isDebit ? "-" : "+"}{formatNumber(item.amount)} NEX
      </p>
    </article>
  );
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
          {notification.amount ? `+${formatNumber(notification.amount)} NEX earned` : notification.message || "Synced in real time"}
        </p>
      </div>
    </div>
  </motion.div>
);

const WalletLoadingState = () => (
  <section className="min-h-screen bg-slate-100 pb-28">
    <div className="container-page py-4 sm:py-8">
      <div className="space-y-3">
        <div className="h-44 animate-pulse rounded-lg bg-slate-950" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-white" />)}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-white" />
      </div>
    </div>
  </section>
);

const StatCard = ({ icon: Icon, label, value, detail }) => (
  <motion.article whileHover={{ y: -2 }} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
    <div className="flex items-center justify-between gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-brand">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <ArrowUpRight className="h-4 w-4 text-slate-300" />
    </div>
    <p className="mt-3 text-xl font-black text-navy">{value}</p>
    <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
    {detail && <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>}
  </motion.article>
);

const WalletTopNav = ({ section }) => (
  <div className="sticky top-16 z-30 -mx-3 mb-3 border-y border-slate-200 bg-slate-100/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = item.to === "/wallet" ? section === "dashboard" : item.to.endsWith(section);
        return (
          <Link key={item.to} to={item.to} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-2 text-[11px] font-black transition active:scale-[0.98] ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
            <Icon className="h-4 w-4" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  </div>
);

const BalanceHero = ({ user, wallet, socketConnected }) => {
  const { current, next, progress, remaining, displayName } = getLevelMeta(wallet);
  const LevelIcon = current?.icon || Star;
  const points = Number(wallet?.balance || 0);
  const futureToken = Number(wallet?.tokenBalance || wallet?.futureTokenBalance || 0);

  return (
    <section className="relative overflow-hidden rounded-lg bg-slate-950 p-4 text-white shadow-2xl sm:p-5">
      <div className="absolute inset-0 wallet-grid opacity-35" />
      <motion.div className="absolute -right-16 -top-24 h-48 w-48 rounded-full bg-brand/30 blur-3xl" animate={{ scale: [1, 1.12, 1], opacity: [0.32, 0.52, 0.32] }} transition={{ duration: 3.6, repeat: Infinity }} />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={mediaUrl(user?.profilePicture || user?.profileImage || "/logo.png")} alt="" className="h-11 w-11 rounded-full border border-white/20 object-cover" />
            <div className="min-w-0">
              <p className="truncate text-base font-black">@{user?.username || user?.name || "creator"}</p>
              <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] font-black text-brand">
                <LevelIcon className="h-3.5 w-3.5" />
                {displayName}
              </p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black ${socketConnected ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/65"}`}>
            <Radio className="h-3.5 w-3.5" />
            {socketConnected ? "Live" : "Syncing"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/10 p-3 backdrop-blur">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">NEX Points</p>
            <motion.p key={points} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-1 text-4xl font-black leading-none">
              {formatNumber(points)}
            </motion.p>
            <p className="mt-1 text-xs font-bold text-white/60">Activity rewards and gifting</p>
          </div>
          <div className="rounded-lg border border-brand/20 bg-brand/10 p-3 backdrop-blur">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand/80">NEX Token</p>
            <motion.p key={futureToken} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-1 text-4xl font-black leading-none">
              {formatNumber(futureToken)}
            </motion.p>
            <p className="mt-1 text-xs font-bold text-white/60">Future convertible balance</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-white/10 p-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3 text-xs font-black">
            <span>Future NEX COIN migration ready</span>
            <span>{current === next ? "Max prestige" : `${formatNumber(remaining)} XP to ${next.name}`}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full bg-brand shadow-[0_0_22px_rgba(34,197,94,0.8)]" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
};

const DailyClaimCard = ({ wallet, onClaim, locked, cooldown }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const cooldownActive = cooldown && new Date(cooldown).getTime() > now;
  const streak = Math.min(7, Number(wallet?.streakCount || 0));

  return (
    <section className="rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-black text-navy">Daily reward</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Streak multipliers, mystery bonuses, and Day 7 prestige drops.</p>
        </div>
        <motion.span animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.6, repeat: Infinity }} className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg">
          <Flame className="h-5 w-5 fill-white" />
        </motion.span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-black ${index < streak ? "border-orange-300 bg-orange-500 text-white" : "border-slate-200 bg-white text-slate-400"}`}>
            {index + 1}{index === 6 ? "*" : ""}
          </div>
        ))}
      </div>
      <button type="button" className="btn-primary mt-4 w-full gap-2" onClick={onClaim} disabled={locked || cooldownActive}>
        {locked ? <Loader2 className="h-4 w-4 animate-spin" /> : cooldownActive ? <Clock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        {cooldownActive ? `Next claim in ${formatDuration(cooldown)}` : "Claim Daily Reward"}
      </button>
    </section>
  );
};

const QuickAction = ({ icon: Icon, label, to, onClick, disabled }) => {
  const className = "flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
  const content = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-navy"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1 text-sm font-black text-navy">{label}</span>
    </>
  );
  if (to) return <Link to={to} className={className}>{content}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} className={className}>{content}</button>;
};

const TransactionList = ({ transactions, pagination, loading, onLoadMore, filter = "all" }) => {
  const visible = asArray(transactions).filter((item) => {
    if (filter === "all") return true;
    const key = `${item?.type || ""}:${item?.source || ""}`.toLowerCase();
    return key.includes(filter);
  });
  const groups = visible.reduce((acc, transaction) => {
    const key = formatDateGroup(transaction?.createdAt);
    acc[key] = acc[key] || [];
    acc[key].push(transaction);
    return acc;
  }, {});

  if (loading && !visible.length) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}</div>;
  }

  if (!visible.length) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <History className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-black text-navy">No wallet activity here yet</p>
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
            {items.map((transaction) => <TransactionRow key={transaction?._id || `${transaction?.createdAt}-${transaction?.description}`} transaction={transaction} />)}
          </div>
        </section>
      ))}
      {pagination?.hasMore && filter === "all" && (
        <button type="button" className="btn-secondary w-full gap-2" onClick={onLoadMore} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Load more
        </button>
      )}
    </div>
  );
};

const ReferralPage = ({ user, transactions, generateWalletQr, scanWalletQr, requestLocks }) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrText, setQrText] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanResult, setScanResult] = useState("");
  const code = user?.referralCode || `${String(user?.username || user?.name || "VIBE").replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}${String(idOf(user)).slice(-4).toUpperCase()}`;
  const link = referralUrlFor(code);
  const shareText = `Join me on VibeBook and start earning NEX Points: ${link}`;
  const referralTx = asArray(transactions).filter((item) => `${item?.type || ""}:${item?.source || ""}`.toLowerCase().includes("referral"));
  const earned = referralTx.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  const invited = Number(user?.referredUsers || referralTx.length || 0);

  useEffect(() => {
    let canceled = false;
    const generate = async () => {
      const result = await generateWalletQr?.({ type: "referral_invite", referralCode: code, memo: "VibeBook referral invite" });
      if (!canceled && result?.data?.qrText) {
        setQrText(result.data.qrText);
      }
    };
    generate();
    return () => {
      canceled = true;
    };
  }, [code, generateWalletQr]);

  useEffect(() => {
    let canceled = false;
    QRCode.toDataURL(qrText || link, { width: 320, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } })
      .then((dataUrl) => {
        if (!canceled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!canceled) setQrDataUrl("");
      });
    return () => {
      canceled = true;
    };
  }, [link, qrText]);

  const copy = async () => {
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = `vibebook-referral-${code}.png`;
    anchor.click();
  };

  const scanQr = async (event) => {
    event.preventDefault();
    if (!scanValue.trim()) return;
    const result = await scanWalletQr?.({ payload: scanValue.trim() });
    setScanResult(result?.ok ? result.data?.message || "QR scanned" : result?.message || "Unable to scan QR");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Invite Friends" detail="Referral code first, share actions next, reward tracking always visible." />
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={UserPlus} label="Total invited" value={formatNumber(invited)} detail="Verified signups" />
        <StatCard icon={Coins} label="Earned" value={formatNumber(earned)} detail="Referral NEX" />
        <StatCard icon={Clock} label="Pending" value="0" detail="Awaiting checks" />
      </div>
      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_13rem]">
        <div>
          <div className="rounded-lg bg-slate-950 p-4 text-white">
            <p className="text-xs font-black uppercase text-white/45">Your referral code</p>
            <p className="mt-1 break-all text-3xl font-black">{code}</p>
            <p className="mt-2 break-all text-xs font-semibold text-white/55">{link}</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <a className="btn-primary gap-2" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" />
              WhatsApp Share
            </a>
            <button type="button" className="btn-secondary gap-2" onClick={copy}>
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              Copy Link
            </button>
            <button type="button" className="btn-secondary gap-2" onClick={downloadQr} disabled={!qrDataUrl}>
              <Download className="h-4 w-4" />
              Download QR
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`Referral QR for ${code}`} className="mx-auto aspect-square w-full rounded-lg bg-white p-2" />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-lg bg-white text-slate-400">
              <QrCode className="h-10 w-10" />
            </div>
          )}
          <p className="mt-2 text-center text-xs font-bold text-slate-500">Scans open signup with your code applied.</p>
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-base font-black text-navy">Referral safeguards</p>
        <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
          {["Self-referral blocked", "Device checks prepared", "Rewards paid after valid signup"].map((item) => (
            <span key={item} className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />{item}</span>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-base font-black text-navy">QR scanner</p>
        <p className="mt-1 text-xs font-bold text-slate-500">Paste a VibeBook NEX QR payload or referral URL to validate it.</p>
        <form className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={scanQr}>
          <input className="field" value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="Paste QR payload or referral link" />
          <button type="submit" className="btn-primary gap-2" disabled={requestLocks?.scan || !scanValue.trim()}>
            {requestLocks?.scan ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Scan
          </button>
        </form>
        {scanResult && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs font-bold text-slate-600">{scanResult}</p>}
      </section>
    </div>
  );
};

const LeaderboardPage = ({ leaderboards, loading, user, loadLeaderboards }) => {
  const [tab, setTab] = useState("earners");
  const [period, setPeriod] = useState(leaderboards?.period || "all");
  const tabs = [
    { id: "earners", label: "Top Earners", data: asArray(leaderboards?.earners) },
    { id: "creators", label: "Creators", data: asArray(leaderboards?.earners) },
    { id: "gifters", label: "Gifters", data: asArray(leaderboards?.spenders) },
    { id: "referrals", label: "Referrals", data: asArray(leaderboards?.earners) },
  ];
  const periods = [
    { id: "all", label: "All Time" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
  ];
  const active = tabs.find((item) => item.id === tab) || tabs[0];
  const entries = active.data;

  const changePeriod = (nextPeriod) => {
    setPeriod(nextPeriod);
    loadLeaderboards?.(nextPeriod);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Leaderboard" detail="TikTok-style creator ranks for NEX earning, gifting, and invite momentum." />
      <div className="grid grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-lg px-2 py-2 text-xs font-black ${tab === item.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{item.label}</button>)}
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        {periods.map((item) => (
          <button key={item.id} type="button" onClick={() => changePeriod(item.id)} className={`rounded-lg px-2 py-2 text-xs font-black ${period === item.id ? "bg-brand text-navy" : "bg-slate-100 text-slate-600"}`}>
            {item.label}
          </button>
        ))}
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : (
          <div className="space-y-2">
            {entries.slice(0, 25).map((entry, index) => {
              const rank = index + 1;
              const creator = safeObject(entry.user || entry.userId || entry);
              const me = idOf(creator) && idOf(creator) === idOf(user);
              return (
                <article key={idOf(creator) || `${active.id}-${index}`} className={`flex items-center gap-3 rounded-lg border p-3 ${rank <= 3 ? "border-amber-200 bg-amber-50" : me ? "border-brand/50 bg-brand/10" : "border-slate-200 bg-white"}`}>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${rank === 1 ? "bg-amber-400 text-white" : "bg-slate-100 text-navy"}`}>{rank <= 3 ? <Crown className="h-4 w-4" /> : rank}</span>
                  <img src={mediaUrl(creator?.profilePicture || creator?.profileImage || "/logo.png")} alt="" className="h-10 w-10 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-navy">@{creator?.username || creator?.name || (me ? user?.username : "creator")}</p>
                    <p className="text-xs font-bold text-slate-500">{rank <= 3 ? "Podium creator" : "Creator economy rank"}</p>
                  </div>
                  <p className="text-sm font-black text-navy">{compact(entry.lifetimeEarned || entry.lifetimeSpent || entry.balance || 0)}</p>
                </article>
              );
            })}
            {!entries.length && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">Leaderboard data is warming up.</p>}
          </div>
        )}
      </section>
    </div>
  );
};

const TransactionsPage = ({ transactions, pagination, loading, onLoadMore }) => {
  const [filter, setFilter] = useState("all");
  return (
    <div className="space-y-4">
      <PageHeader title="Transactions" detail="Grouped history with filters and live reward icons." />
      <div className="grid grid-cols-5 gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        {["all", "daily", "referral", "transfer", "gift"].map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-lg px-2 py-2 text-xs font-black capitalize ${filter === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{item}</button>)}
      </div>
      <TransactionList transactions={transactions} pagination={pagination} loading={loading} onLoadMore={onLoadMore} filter={filter} />
    </div>
  );
};

const TransferPage = ({ wallet, user, transferPoints }) => {
  const [form, setForm] = useState({ receiverId: "", amount: "" });
  const [message, setMessage] = useState("");
  const locks = useWalletStore((state) => state.requestLocks);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    if (form.receiverId.trim() === user?._id) {
      setMessage("Self-transfer blocked to protect wallet integrity.");
      return;
    }
    const result = await transferPoints({ receiverId: form.receiverId.trim(), amount: Number(form.amount) });
    setMessage(result.ok ? "Transfer sent. NEX Points moved instantly." : result.message);
    if (result.ok) setForm({ receiverId: "", amount: "" });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Transfer Points" detail="Move usable NEX Points to another creator wallet." />
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 rounded-lg bg-slate-950 p-4 text-white">
          <p className="text-xs font-black uppercase text-white/45">Available NEX Points</p>
          <p className="mt-1 text-3xl font-black">{formatNumber(wallet?.balance || 0)}</p>
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <input className="field" placeholder="Creator user ID" value={form.receiverId} onChange={(event) => setForm((current) => ({ ...current, receiverId: event.target.value }))} />
          <input className="field" placeholder="Amount" inputMode="numeric" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value.replace(/[^\d]/g, "") }))} />
          <button type="submit" className="btn-primary sticky bottom-24 z-20 gap-2 sm:static" disabled={locks.transfer}>
            {locks.transfer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Points
          </button>
        </form>
        {message && <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"><AlertTriangle className="h-4 w-4" />{message}</p>}
      </section>
    </div>
  );
};

const RewardsPage = ({ wallet, storeItems, inventory, storeLoading, requestLocks, loadStore, purchaseStoreItem, equipStoreItem }) => {
  const [selected, setSelected] = useState(null);
  const rewardItems = asArray(storeItems).filter((item) => ["frames", "badges", "boosts", "featured", "reactions", "themes"].includes(item.category));

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  const confirmPurchase = async (item, payload) => {
    const result = await purchaseStoreItem(item.itemId, payload);
    if (result.ok) setSelected(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Redeem Rewards" detail="Spend NEX Points on live inventory, reach, creator status, reactions, and themes." />
      <section className="rounded-lg bg-slate-950 p-4 text-white shadow-2xl">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand">Active NEX Points economy</p>
            <h2 className="mt-2 text-2xl font-black">Earn, spend, flex, compete, earn more.</h2>
            <p className="mt-2 text-sm font-semibold text-white/60">Every redeem action deducts points, writes a wallet transaction, updates inventory, and syncs over sockets.</p>
          </div>
          <Link to="/wallet/store" className="btn-primary gap-2">
            <Store className="h-4 w-4" />
            Full Store
          </Link>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Profile Frames", "Cosmetic status for profile cards", Sparkles],
          ["Boosts + Featured", "Spend points for distribution", Rocket],
          ["Badges + Reactions", "Unlock creator identity", Medal],
        ].map(([label, detail, Icon]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <Icon className="h-5 w-5 text-brand" />
            <p className="mt-3 text-sm font-black text-navy">{label}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{detail}</p>
          </div>
        ))}
      </section>
      {storeLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-72 animate-pulse rounded-lg bg-white" />)}</div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rewardItems.slice(0, 9).map((item) => <StoreItemCard key={item.itemId} item={item} inventory={inventory} wallet={wallet} requestLocks={requestLocks} onBuy={setSelected} onEquip={equipStoreItem} />)}
          {!rewardItems.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500 sm:col-span-2 lg:col-span-3">Reward store is warming up.</p>}
        </section>
      )}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-base font-black text-navy">NEX Token roadmap</p>
        <div className="mt-3 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
          {["Phase 1: NEX Points Economy active now", "Phase 2: Stellar-ready token preparation", "Phase 3: NEX COIN launch future only"].map((item) => (
            <span key={item} className="rounded-lg bg-slate-50 px-3 py-2">{item}</span>
          ))}
        </div>
        <p className="mt-3 text-xs font-bold text-slate-500">Points are an internal reward system. Conversion to NEX Token will be enabled later, and the exchange rate will be announced later. Example only: 1000 NEX Points to 1 NEX Token.</p>
      </section>
      <PurchaseModal item={selected} wallet={wallet} onClose={() => setSelected(null)} onConfirm={confirmPurchase} busy={Boolean(selected && requestLocks[`purchase:${selected.itemId}`])} />
    </div>
  );
};

const STORE_TABS = [
  { id: "store", label: "All", category: "", icon: Store },
  { id: "frames", label: "Frames", category: "frames", icon: Sparkles },
  { id: "badges", label: "Badges", category: "badges", icon: Medal },
  { id: "boosts", label: "Boosts", category: "boosts", icon: Rocket },
  { id: "reactions", label: "Reactions", category: "reactions", icon: Gift },
  { id: "featured", label: "Featured", category: "featured", icon: Play },
  { id: "themes", label: "Themes", category: "themes", icon: Crown },
];

const rarityTone = (rarity = "common") => ({
  common: "from-slate-400 to-slate-700 border-slate-300",
  rare: "from-emerald-300 to-cyan-500 border-emerald-300",
  epic: "from-fuchsia-400 to-indigo-600 border-fuchsia-300",
  legendary: "from-amber-300 to-orange-600 border-amber-300",
  mythic: "from-cyan-300 via-fuchsia-400 to-amber-300 border-fuchsia-300",
  seasonal: "from-sky-500 via-yellow-300 to-emerald-500 border-sky-300",
}[rarity] || "from-slate-400 to-slate-700 border-slate-300");

const inventoryFieldFor = (category) => ({
  frames: "ownedFrames",
  badges: "ownedBadges",
  boosts: "ownedBoosts",
  reactions: "ownedReactions",
  featured: "ownedFeatured",
  themes: "ownedThemes",
}[category] || "");

const itemOwned = (inventory, item) => {
  const field = inventoryFieldFor(item?.category);
  return Boolean(field && asArray(inventory?.[field]).some((entry) => entry.itemId === item.itemId && (!entry.expiresAt || new Date(entry.expiresAt) > new Date())));
};

const itemEquipped = (inventory, item) => {
  if (item?.category === "frames") return inventory?.active?.frame === item.itemId;
  if (item?.category === "themes") return inventory?.active?.theme === (item.metadata?.themeKey || item.itemId);
  if (item?.category === "badges") return asArray(inventory?.active?.badges).includes(item.itemId);
  if (item?.category === "reactions") return asArray(inventory?.active?.reactions).includes(item.itemId);
  return false;
};

const StorePreview = ({ item }) => {
  const tone = rarityTone(item.rarity);
  const emoji = item.preview?.emoji;
  return (
    <div className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${item.preview?.gradient || tone}`}>
      <motion.div className="absolute inset-0 wallet-shine opacity-60" animate={{ x: ["-60%", "60%"] }} transition={{ duration: 2.8, repeat: Infinity, repeatType: "mirror" }} />
      <motion.div animate={{ scale: [1, 1.08, 1], rotate: item.preview?.animation === "orbit" ? [0, 8, -8, 0] : 0 }} transition={{ duration: 2.2, repeat: Infinity }} className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full border border-white/35 bg-slate-950/35 text-white shadow-2xl backdrop-blur">
        {emoji ? <span className="text-4xl">{emoji}</span> : item.category === "frames" ? <Sparkles className="h-9 w-9" /> : item.category === "badges" ? <Medal className="h-9 w-9" /> : item.category === "boosts" ? <Rocket className="h-9 w-9" /> : item.category === "featured" ? <Play className="h-9 w-9" /> : <Crown className="h-9 w-9" />}
      </motion.div>
    </div>
  );
};

const PurchaseModal = ({ item, wallet, onClose, onConfirm, busy }) => {
  const [postId, setPostId] = useState("");
  if (!item) return null;
  const canAfford = Number(wallet?.balance || 0) >= Number(item.price || 0);
  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/70 p-3 backdrop-blur sm:items-center sm:justify-center">
      <motion.section initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full overflow-hidden rounded-lg border border-white/15 bg-white shadow-2xl sm:max-w-md">
        <StorePreview item={item} />
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xl font-black text-navy">{item.name}</p>
              <p className="mt-1 text-xs font-black uppercase text-slate-400">{item.rarity} {item.category}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 p-2 text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{item.description}</p>
          {item.category === "featured" && (
            <input className="field mt-3" value={postId} onChange={(event) => setPostId(event.target.value.trim())} placeholder="Video post ID to feature" />
          )}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-black text-navy">{formatNumber(item.price)}</p><p className="text-[10px] font-black uppercase text-slate-400">NEX cost</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-black text-navy">{item.durationHours ? `${item.durationHours}h` : item.durationDays ? `${item.durationDays}d` : "Forever"}</p><p className="text-[10px] font-black uppercase text-slate-400">Duration</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-black text-navy">{item.metadata?.estimatedReach || `Lv ${item.levelRequired}`}</p><p className="text-[10px] font-black uppercase text-slate-400">Reach</p></div>
          </div>
          <button type="button" className="btn-primary mt-4 w-full gap-2" disabled={busy || !canAfford || (item.category === "featured" && !postId)} onClick={() => onConfirm(item, { postId })}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            {canAfford ? "Unlock instantly" : "Need more NEX"}
          </button>
        </div>
      </motion.section>
    </div>
  );
};

const StoreItemCard = ({ item, inventory, wallet, requestLocks, onBuy, onEquip }) => {
  const owned = itemOwned(inventory, item);
  const equipped = itemEquipped(inventory, item);
  const busy = requestLocks[`purchase:${item.itemId}`] || requestLocks[`equip:${item.itemId}`];
  const comingSoon = item.status === "coming_soon";
  return (
    <motion.article layout whileHover={{ y: -4 }} className={`overflow-hidden rounded-lg border bg-white shadow-sm ${rarityTone(item.rarity).split(" ").find((part) => part.startsWith("border-")) || "border-slate-200"}`}>
      <StorePreview item={item} />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-navy">{item.name}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{item.rarity} - Level {item.levelRequired}</p>
          </div>
          <span className="rounded-full bg-slate-950 px-2 py-1 text-[11px] font-black text-brand">{formatNumber(item.price)} NEX</span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-slate-500">{item.description}</p>
        <div className="mt-3 flex items-center gap-2">
          {owned && ["frames", "badges", "reactions", "themes"].includes(item.category) ? (
            <button type="button" className={equipped ? "btn-secondary flex-1 gap-2 py-2" : "btn-primary flex-1 gap-2 py-2"} disabled={busy} onClick={() => onEquip(item, equipped ? "unequip" : "equip")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {equipped ? "Equipped" : "Equip"}
            </button>
          ) : (
            <button type="button" className="btn-primary flex-1 gap-2 py-2" disabled={busy || comingSoon || Number(wallet?.balance || 0) < Number(item.price || 0)} onClick={() => onBuy(item)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
              {comingSoon ? "Soon" : owned && !["boosts", "featured"].includes(item.category) ? "Owned" : "Buy"}
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
};

const NexStorePage = ({ wallet, storeItems, inventory, activeBoosts, featuredQueue, storeLoading, requestLocks, loadStore, purchaseStoreItem, equipStoreItem, section }) => {
  const [selected, setSelected] = useState(null);
  const tab = STORE_TABS.find((item) => item.id === section) || STORE_TABS[0];
  const visibleItems = asArray(storeItems).filter((item) => !tab.category || item.category === tab.category);

  useEffect(() => {
    loadStore(tab.category);
  }, [loadStore, tab.category]);

  const confirmPurchase = async (item, payload) => {
    const result = await purchaseStoreItem(item.itemId, payload);
    if (result.ok) setSelected(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="NEX Store" detail="Spend points on creator status, reach, cosmetics, reactions, and featured placement." />
      <section className="overflow-hidden rounded-lg bg-slate-950 p-4 text-white shadow-2xl">
        <div className="wallet-grid absolute opacity-0" />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand">Creator economy marketplace</p>
            <h2 className="mt-2 text-3xl font-black">Flex prestige. Buy reach. Make NEX useful.</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-white/60">Frames, badges, boosts, featured video placement, premium reactions, and profile themes are all tracked in your inventory.</p>
          </div>
          <div className="rounded-lg border border-brand/20 bg-brand/10 p-3">
            <p className="text-xs font-black uppercase text-brand/80">Balance</p>
            <p className="text-3xl font-black">{formatNumber(wallet?.balance || 0)}</p>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-7">
        {STORE_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.id} to={item.id === "store" ? "/wallet/store" : `/wallet/store/${item.id}`} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-black ${tab.id === item.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Sparkles} label="Owned frames" value={formatNumber(asArray(inventory?.ownedFrames).length)} detail={inventory?.active?.frame || "No frame equipped"} />
        <StatCard icon={Medal} label="Badges active" value={formatNumber(asArray(inventory?.active?.badges).length)} detail="Shown on profile and ranks" />
        <StatCard icon={Rocket} label="Active boosts" value={formatNumber(asArray(activeBoosts).length)} detail={asArray(featuredQueue).length ? "Featured queue live" : "No featured queue"} />
      </div>
      {storeLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-72 animate-pulse rounded-lg bg-white" />)}</div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => <StoreItemCard key={item.itemId} item={item} inventory={inventory} wallet={wallet} requestLocks={requestLocks} onBuy={setSelected} onEquip={equipStoreItem} />)}
          {!visibleItems.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500 sm:col-span-2 lg:col-span-3">This shelf is warming up.</p>}
        </section>
      )}
      <PurchaseModal item={selected} wallet={wallet} onClose={() => setSelected(null)} onConfirm={confirmPurchase} busy={Boolean(selected && requestLocks[`purchase:${selected.itemId}`])} />
    </div>
  );
};

const PageHeader = ({ title, detail }) => {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => navigate("/wallet")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-navy shadow-sm">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-black text-navy">{title}</h1>
        <p className="mt-1 text-xs font-bold text-slate-500">{detail}</p>
      </div>
    </div>
  );
};

const Dashboard = ({ user, wallet, stats, claimDailyReward, requestLocks, cooldowns, transactions, pagination, historyLoading, loadHistory, socketConnected }) => (
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <div className="space-y-4">
      <WalletErrorBoundary title="Balance temporarily unavailable">
        <BalanceHero user={user} wallet={wallet} socketConnected={socketConnected} />
      </WalletErrorBoundary>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Sparkles} label="Lifetime earned" value={formatNumber(wallet?.lifetimeEarned || 0)} detail="Creator XP" />
        <StatCard icon={Coins} label="Future value" value="Ready" detail="Conversion placeholder" />
        <StatCard icon={UserPlus} label="Referrals" value={formatNumber(stats.referralEarnings)} detail="NEX earned" />
        <StatCard icon={Trophy} label="Creator rank" value={`#${stats.rank}`} detail="Earners board" />
      </div>
      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-5">
        <QuickAction icon={Send} label="Transfer Points" to="/wallet/transfer" />
        <QuickAction icon={UserPlus} label="Invite Friends" to="/wallet/referrals" />
        <QuickAction icon={Sparkles} label="Claim Daily Reward" onClick={claimDailyReward} disabled={requestLocks.daily} />
        <QuickAction icon={Trophy} label="View Leaderboard" to="/wallet/leaderboard" />
        <QuickAction icon={Gift} label="Redeem Rewards" to="/wallet/rewards" />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-base font-black text-navy">Recent activity</p>
            <p className="mt-1 text-xs font-bold text-slate-500">Live grouped wallet movement.</p>
          </div>
          <Link to="/wallet/transactions" className="text-xs font-black text-brand">View all</Link>
        </div>
        <TransactionList transactions={asArray(transactions).slice(0, 5)} pagination={{ hasMore: false }} loading={historyLoading} onLoadMore={loadHistory} />
      </section>
    </div>
    <aside className="space-y-4">
      <DailyClaimCard wallet={wallet} onClaim={claimDailyReward} locked={requestLocks.daily} cooldown={cooldowns.daily} />
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-base font-black text-navy">Creator badges</p>
          <Medal className="h-5 w-5 text-brand" />
        </div>
        <div className="mt-3 grid gap-2">
          {[
            ["First Spark", wallet?.createdAt, Sparkles],
            ["Daily Heat", Number(wallet?.streakCount || 0) >= 7, Flame],
            ["Invite Engine", stats.referralEarnings > 0, UserPlus],
          ].map(([label, unlocked, Icon]) => (
            <div key={label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${unlocked ? "bg-brand/10 text-green-800" : "bg-slate-50 text-slate-500"}`}>
              <Icon className="h-4 w-4" />
              {label}
            </div>
          ))}
        </div>
      </section>
    </aside>
  </div>
);

const Wallet = () => {
  const location = useLocation();
  const { user, token } = useAuth();
  const {
    wallet,
    walletLoaded,
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
    storeItems,
    inventory,
    activeBoosts,
    featuredQueue,
    storeLoading,
    loadWallet,
    loadHistory,
    loadLeaderboards,
    loadStore,
    claimDailyReward,
    transferPoints,
    generateWalletQr,
    scanWalletQr,
    purchaseStoreItem,
    equipStoreItem,
    bindSocket,
  } = useWalletStore();

  useEffect(() => {
    loadWallet();
    loadHistory({ reset: true });
    loadLeaderboards();
  }, [loadWallet, loadHistory, loadLeaderboards]);

  useEffect(() => bindSocket(token, user?._id), [bindSocket, token, user?._id]);

  const section = location.pathname.replace(/\/+$/, "").split("/")[2] || "dashboard";
  const storeSection = location.pathname.replace(/\/+$/, "").split("/")[3] || "store";
  const safeWallet = safeObject(wallet);
  const safeTransactions = asArray(transactions);
  const safeNotifications = asArray(notifications);

  const stats = useMemo(() => {
    const referralEarnings = safeTransactions.filter((item) => `${item?.type || ""}:${item?.source || ""}`.toLowerCase().includes("referral")).reduce((sum, item) => sum + Number(item?.amount || 0), 0);
    const rankIndex = asArray(leaderboards?.earners).findIndex((entry) => idOf(entry?.user || entry?.userId) === idOf(user));
    return { referralEarnings, rank: rankIndex >= 0 ? rankIndex + 1 : 12 };
  }, [leaderboards?.earners, safeTransactions, user]);

  if (loading && !walletLoaded) return <WalletLoadingState />;

  const pageProps = {
    user,
    wallet: safeWallet,
    stats,
    transactions: safeTransactions,
    pagination,
    leaderboards,
    historyLoading,
    leaderboardLoading,
    requestLocks: safeObject(requestLocks),
    cooldowns: safeObject(cooldowns),
    socketConnected,
    loadHistory: () => loadHistory(),
    claimDailyReward,
    transferPoints,
    generateWalletQr,
    scanWalletQr,
    storeItems,
    inventory,
    activeBoosts,
    featuredQueue,
    storeLoading,
    loadStore,
    purchaseStoreItem,
    equipStoreItem,
  };

  const renderPage = () => {
    if (section === "dashboard") return <Dashboard {...pageProps} />;
    if (section === "referrals") return <ReferralPage {...pageProps} />;
    if (section === "leaderboard") return <LeaderboardPage leaderboards={leaderboards} loading={leaderboardLoading} user={user} loadLeaderboards={loadLeaderboards} />;
    if (section === "transactions") return <TransactionsPage transactions={safeTransactions} pagination={pagination} loading={historyLoading} onLoadMore={() => loadHistory()} />;
    if (section === "rewards") return <RewardsPage {...pageProps} />;
    if (section === "transfer") return <TransferPage wallet={safeWallet} user={user} transferPoints={transferPoints} />;
    if (section === "store") return <NexStorePage {...pageProps} section={storeSection} />;
    return <Navigate to="/wallet" replace />;
  };

  return (
    <section className="min-h-screen bg-slate-100 pb-28">
      <AnimatePresence>
        {safeNotifications.length > 0 && (
          <div className="pointer-events-none fixed inset-x-3 top-20 z-[80] mx-auto grid max-w-sm gap-2">
            {safeNotifications.map((item) => <WalletToast key={item?.id || item?.createdAt || Math.random()} notification={safeObject(item)} />)}
          </div>
        )}
      </AnimatePresence>
      <div className="container-page py-4 sm:py-8">
        <WalletTopNav section={section} />
        <motion.div key={section} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
          <WalletErrorBoundary title="NEX Wallet section unavailable" onRetry={loadWallet}>
            {renderPage()}
          </WalletErrorBoundary>
        </motion.div>
      </div>
    </section>
  );
};

export default Wallet;
