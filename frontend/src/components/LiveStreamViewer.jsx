// @ts-nocheck
import {
  BookOpen,
  Check,
  Flag,
  Gift,
  Heart,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Send,
  Settings,
  Share2,
  Smile,
  Sparkles,
  SwitchCamera,
  UserCheck,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SafeAvatar from "./SafeAvatar.jsx";
import { connectSocket } from "../services/socket";
import { userApi } from "../services/api";
import { getLivePreviewStream, releaseLivePreviewStream, setLivePreviewStream } from "../services/livePreviewStream";
import { useLiveStreamStore } from "../store/livestreamStore";
import { useWalletStore } from "../store/walletStore";
import { useAuth } from "../context/AuthContext.jsx";

const MAX_COMMENTS = 120;
const HEARTBEAT_MS = 25000;
const COMMENT_SEND_COOLDOWN_MS = 850;
const GIFT_SEND_COOLDOWN_MS = 1000;
const TURN_URLS = String(import.meta.env.VITE_TURN_URL || import.meta.env.VITE_WEBRTC_TURN_URL || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME || import.meta.env.VITE_WEBRTC_TURN_USERNAME || "";
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL || import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL || "";
const TURN_ICE_SERVER = TURN_URLS.length
  ? {
      urls: TURN_URLS,
      ...(TURN_USERNAME ? { username: TURN_USERNAME } : {}),
      ...(TURN_CREDENTIAL ? { credential: TURN_CREDENTIAL } : {}),
    }
  : null;
const PEER_CONNECTION_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    ...(TURN_ICE_SERVER ? [TURN_ICE_SERVER] : []),
  ],
  iceCandidatePoolSize: 10,
};

const formatLiveDuration = (startedAt) => {
  const started = startedAt ? new Date(startedAt).getTime() : 0;
  if (!started || Number.isNaN(started)) return "0:00";

  const totalSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const reactionMeta = {
  heart: { Icon: Heart, className: "bg-red-500 text-white" },
  fire: { Icon: Zap, className: "bg-orange-500 text-white" },
  clap: { Icon: Sparkles, className: "bg-blue-500 text-white" },
  wow: { Icon: Smile, className: "bg-violet-500 text-white" },
  laugh: { Icon: Smile, className: "bg-emerald-500 text-white" },
  cry: { Icon: Heart, className: "bg-sky-500 text-white" },
};

const legacyGiftOptions = [
  { id: "heart", name: "Heart", value: 1, emoji: "❤️", tier: "small", animation: "floating_hearts" },
  { id: "rose", name: "Rose", value: 5, emoji: "🌹", tier: "small", animation: "flying_roses" },
  { id: "flower_bouquet", name: "Flower Bouquet", value: 15, emoji: "💐", tier: "small", animation: "bouquet_bloom" },
  { id: "fire", name: "Fire", value: 10, emoji: "🔥", tier: "small", animation: "fire_burst" },
  { id: "diamond", name: "Diamond", value: 25, emoji: "💎", tier: "small", animation: "diamond_sparkle" },
  { id: "crown", name: "Crown", value: 50, emoji: "👑", tier: "medium", animation: "crown_shine" },
  { id: "rocket", name: "Rocket", value: 100, emoji: "🚀", tier: "medium", animation: "rocket_launch" },
  { id: "sports_car", name: "Sports Car", value: 250, emoji: "🏎️", tier: "medium", animation: "car_sweep" },
  { id: "magic_box", name: "Magic Box", value: 500, emoji: "🎁", tier: "medium", animation: "magic_box" },
  { id: "lion", name: "Lion", value: 1000, emoji: "🦁", tier: "premium", animation: "lion_roar" },
  { id: "universe", name: "Universe", value: 5000, emoji: "🌌", tier: "premium", animation: "universe_burst" },
  { id: "castle", name: "Castle", value: 2000, emoji: "🏰", tier: "premium", animation: "castle_glow" },
  { id: "dragon", name: "Dragon", value: 3000, emoji: "🐉", tier: "premium", animation: "dragon_flight" },
  { id: "galaxy_storm", name: "Galaxy Storm", value: 7500, emoji: "✨", tier: "premium", animation: "galaxy_storm" },
];

const premiumGiftOptions = [
  { id: "heart", name: "Heart", value: 1, emoji: "\u2764\uFE0F", tier: "small", rarity: "common", colors: ["#fb7185", "#f43f5e", "#ffffff"], animation: "floating_hearts", animationDuration: 1800, comboMultiplier: 1, sound: "gift-heart" },
  { id: "rose", name: "Rose", value: 5, emoji: "\uD83C\uDF39", tier: "small", rarity: "common", colors: ["#f43f5e", "#be123c", "#fecdd3"], animation: "flying_roses", animationDuration: 2100, comboMultiplier: 1.1, sound: "gift-rose" },
  { id: "flower", name: "Flower", value: 10, emoji: "\uD83C\uDF38", tier: "small", rarity: "common", colors: ["#f9a8d4", "#a78bfa", "#86efac"], animation: "flower_bloom", animationDuration: 2200, comboMultiplier: 1.15, sound: "gift-flower" },
  { id: "like", name: "Like", value: 15, emoji: "\uD83D\uDC4D", tier: "small", rarity: "common", colors: ["#60a5fa", "#22d3ee", "#ffffff"], animation: "like_pop", animationDuration: 1700, comboMultiplier: 1.15, sound: "gift-like" },
  { id: "fire", name: "Fire", value: 25, emoji: "\uD83D\uDD25", tier: "small", rarity: "rare", colors: ["#fb923c", "#ef4444", "#fef3c7"], animation: "fire_burst", animationDuration: 2400, comboMultiplier: 1.25, sound: "gift-fire" },
  { id: "crown", name: "Crown", value: 50, emoji: "\uD83D\uDC51", tier: "medium", rarity: "rare", colors: ["#facc15", "#f97316", "#fff7ed"], animation: "crown_shine", animationDuration: 2600, comboMultiplier: 1.35, sound: "gift-crown" },
  { id: "rocket", name: "Rocket", value: 100, emoji: "\uD83D\uDE80", tier: "medium", rarity: "rare", colors: ["#60a5fa", "#f97316", "#f8fafc"], animation: "rocket_launch", animationDuration: 2800, comboMultiplier: 1.5, sound: "gift-rocket" },
  { id: "diamond", name: "Diamond", value: 150, emoji: "\uD83D\uDC8E", tier: "medium", rarity: "epic", colors: ["#67e8f9", "#38bdf8", "#ffffff"], animation: "diamond_sparkle", animationDuration: 2800, comboMultiplier: 1.65, sound: "gift-diamond" },
  { id: "super_chat", name: "Super Chat", value: 200, emoji: "\uD83D\uDCAC", tier: "medium", rarity: "epic", colors: ["#a78bfa", "#2563eb", "#f8fafc"], animation: "super_chat_wave", animationDuration: 3000, comboMultiplier: 1.75, sound: "gift-super-chat" },
  { id: "music", name: "Music", value: 250, emoji: "\uD83C\uDFB5", tier: "medium", rarity: "epic", colors: ["#34d399", "#06b6d4", "#ecfeff"], animation: "music_notes", animationDuration: 3000, comboMultiplier: 1.85, sound: "gift-music" },
  { id: "lion", name: "Lion", value: 500, emoji: "\uD83E\uDD81", tier: "premium", rarity: "legendary", colors: ["#f59e0b", "#d97706", "#fff7ed"], animation: "lion_roar", animationDuration: 4200, comboMultiplier: 2.2, fullscreen: true, sound: "gift-lion" },
  { id: "castle", name: "Castle", value: 750, emoji: "\uD83C\uDFF0", tier: "premium", rarity: "legendary", colors: ["#818cf8", "#312e81", "#f5f3ff"], animation: "castle_glow", animationDuration: 4200, comboMultiplier: 2.45, sound: "gift-castle" },
  { id: "galaxy", name: "Galaxy", value: 900, emoji: "\uD83C\uDF0C", tier: "premium", rarity: "mythic", colors: ["#e879f9", "#4f46e5", "#22d3ee"], animation: "galaxy_swirl", animationDuration: 4500, comboMultiplier: 2.6, fullscreen: true, sound: "gift-galaxy" },
  { id: "vibebook_book", name: "VibeBook Gift", value: 1000, emoji: "\uD83D\uDCD8", tier: "premium", rarity: "exclusive", colors: ["#14b8a6", "#2563eb", "#a7f3d0"], animation: "vibebook_3d_book", animationDuration: 5200, comboMultiplier: 3, fullscreen: true, special: true, sound: "gift-vibebook" },
  { id: "jet", name: "Jet", value: 1200, emoji: "\u2708\uFE0F", tier: "premium", rarity: "mythic", colors: ["#93c5fd", "#1d4ed8", "#f8fafc"], animation: "jet_flyby", animationDuration: 4600, comboMultiplier: 3.2, fullscreen: true, sound: "gift-jet" },
  { id: "dragon", name: "Dragon", value: 1500, emoji: "\uD83D\uDC09", tier: "premium", rarity: "mythic", colors: ["#34d399", "#064e3b", "#f8fafc"], animation: "dragon_flight", animationDuration: 5000, comboMultiplier: 3.5, fullscreen: true, sound: "gift-dragon" },
];

const liveGiftOptions = premiumGiftOptions;
const userIdFor = (user) => user?._id || user?.id || "";
const giftById = liveGiftOptions.reduce((map, gift) => ({ ...map, [gift.id]: gift }), {});
const giftGroups = [
  { id: "small", label: "Quick", gifts: liveGiftOptions.filter((gift) => gift.tier === "small") },
  { id: "medium", label: "Premium", gifts: liveGiftOptions.filter((gift) => gift.tier === "medium") },
  { id: "premium", label: "Legendary", gifts: liveGiftOptions.filter((gift) => gift.tier === "premium") },
];

const activeVideoTrackFor = (stream) => stream?.getVideoTracks?.().find((track) => track.readyState === "live" && track.enabled !== false);

const ensureMediaTrackState = (stream, { audioEnabled = true, videoEnabled = true } = {}) => {
  stream?.getAudioTracks?.().forEach((track) => {
    track.enabled = Boolean(audioEnabled);
  });
  stream?.getVideoTracks?.().forEach((track) => {
    track.enabled = Boolean(videoEnabled);
  });
};

const cameraDeviceForFacingMode = async (facingMode = "user") => {
  if (!navigator.mediaDevices?.enumerateDevices) return "";

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    const rearPattern = /(back|rear|environment|world|wide|0)/i;
    const frontPattern = /(front|user|face|selfie|1)/i;
    const pattern = facingMode === "environment" ? rearPattern : frontPattern;
    return videoDevices.find((device) => pattern.test(device.label || ""))?.deviceId || videoDevices[facingMode === "environment" && videoDevices.length > 1 ? videoDevices.length - 1 : 0]?.deviceId || "";
  } catch {
    return "";
  }
};

const makeGiftParticles = (tier = "small") => {
  const count = tier === "premium" ? 28 : tier === "medium" ? 16 : 9;
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: -150 + Math.random() * 300,
    y: -80 - Math.random() * 260,
    rotate: -35 + Math.random() * 70,
    delay: Math.random() * 0.45,
    scale: 0.7 + Math.random() * 0.8,
  }));
};

const gradientForGift = (gift = {}) => {
  const colors = gift.colors?.length ? gift.colors : ["#f59e0b", "#ef4444", "#ffffff"];
  return `linear-gradient(135deg, ${colors.join(", ")})`;
};

const compactNumber = (value = 0) => {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return String(number);
};

const textFromLiveValue = (value, fallback = "") => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return fallback;

  const candidate = value.text ?? value.message ?? value.body ?? value.content ?? value.value ?? value.label ?? value.name ?? value.giftName;
  if (candidate === value) return fallback;
  return textFromLiveValue(candidate, fallback);
};

const isFormEventLike = (value) =>
  Boolean(value && typeof value === "object" && (value.nativeEvent || value.target || value.currentTarget || value.preventDefault));

const liveUserFrom = (data = {}) => {
  const user = data.user || data.sender || data.viewer || data.author || {};
  return {
    userId: data.userId || data.senderId || user._id || user.id || "",
    username: textFromLiveValue(data.username || data.name || user.username || user.name, "Guest"),
    avatar: data.avatar || data.profilePicture || data.profileImage || user.avatar || user.profilePicture || user.profileImage || "",
  };
};

const sanitizeLiveComment = (data = {}, fallbackText = "") => {
  const user = liveUserFrom(data);
  const type = data.type === "gift" || data.giftId || data.giftName ? "gift" : "comment";
  const giftName = textFromLiveValue(data.giftName || data.gift?.name || data.gift, "");
  const text = type === "gift"
    ? textFromLiveValue(data.text || data.message, giftName ? `sent ${giftName}` : "sent a gift")
    : textFromLiveValue(data.text ?? data.message ?? data.body ?? data.comment, fallbackText);
  const timestamp = data.timestamp || data.createdAt || new Date().toISOString();

  return {
    ...data,
    ...user,
    id: data.id || data.clientId || `${type}:${user.userId || user.username}:${timestamp}:${text || giftName}`,
    type,
    giftName,
    text,
    timestamp,
  };
};

const LiveStreamViewer = ({ streamId, onClose }) => {
  const navigate = useNavigate();
  const { user: currentUser, token } = useAuth();
  const socketRef = useRef(null);
  const previewVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const chatListRef = useRef(null);
  const commentInputRef = useRef(null);
  const sessionIdRef = useRef("");
  const heartbeatRef = useRef(null);
  const reactionTimersRef = useRef(new Set());
  const giftTimersRef = useRef(new Set());
  const joinTimersRef = useRef(new Set());
  const peerConnectionsRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());
  const videoRetryTimerRef = useRef(null);
  const videoRequestTimersRef = useRef(new Set());
  const hostEndCleanupTimerRef = useRef(null);
  const hostMediaCleanupTimerRef = useRef(null);
  const previewStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const isCreatorRef = useRef(false);
  const webrtcReadyRef = useRef(false);
  const mediaStateRef = useRef({ muted: false, cameraEnabled: true });
  const endedRef = useRef(false);
  const creatorCameraRequestRef = useRef(0);
  const seenCommentIdsRef = useRef(new Set());
  const seenGiftIdsRef = useRef(new Set());
  const lastCommentAtRef = useRef(0);
  const lastGiftAtRef = useRef(0);
  const mountedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const doubleTapRef = useRef({ lastTap: 0, x: 0, y: 0, count: 0 });
  const tapTimerRef = useRef(null);

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reactionQueue, setReactionQueue] = useState([]);
  const [giftEvents, setGiftEvents] = useState([]);
  const [joinEvents, setJoinEvents] = useState([]);
  const [giftLeaderboard, setGiftLeaderboard] = useState({});
  const [sendingGiftId, setSendingGiftId] = useState("");
  const [showGiftMenu, setShowGiftMenu] = useState(false);
  const [showLiveSettings, setShowLiveSettings] = useState(false);
  const [selectedGiftId, setSelectedGiftId] = useState("heart");
  const [giftCombo, setGiftCombo] = useState({});
  const [liveViewers, setLiveViewers] = useState([]);
  const [panelUsers, setPanelUsers] = useState([]);
  const [panelRequests, setPanelRequests] = useState([]);
  const [panelLimit, setPanelLimit] = useState(10);
  const [activeSheet, setActiveSheet] = useState("");
  const [activeGuest, setActiveGuest] = useState(null);
  const [panelBusyId, setPanelBusyId] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [isFollowingCreator, setIsFollowingCreator] = useState(false);
  const [showCreatorCard, setShowCreatorCard] = useState(false);
  const [localLoading, setLocalLoading] = useState(true);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [liveFacingMode, setLiveFacingMode] = useState("user");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState("720p");
  const [reportedLive, setReportedLive] = useState(false);
  const [cameraFlipNonce, setCameraFlipNonce] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [ended, setEnded] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [clockTick, setClockTick] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState({ giftsReceived: 0, nexEarned: 0, peakViewers: 0 });
  const [heartCombo, setHeartCombo] = useState(0);

  const {
    currentStream,
    clearCurrentStream,
    endLiveStream,
    getStreamDetails,
    joinLiveStream,
    leaveLiveStream,
    removeLiveStream,
    updateStreamMetadata,
    updateViewerCount,
    upsertLiveStream,
  } = useLiveStreamStore();
  const wallet = useWalletStore((state) => state.wallet);
  const walletLoaded = useWalletStore((state) => state.walletLoaded);
  const loadWallet = useWalletStore((state) => state.loadWallet);

  const fallbackLiveStream = useMemo(() => {
    if (!previewStream) return null;

    return {
      id: streamId,
      creatorId: userIdFor(currentUser),
      creator: currentUser || {},
      title: "Starting live",
      description: "",
      category: "live",
      viewerCount: 1,
      maxViewers: 1,
      status: "live",
      isLive: true,
      startedAt: new Date().toISOString(),
      stats: {},
      settings: {
        commentsEnabled: true,
        giftsEnabled: true,
        allowReactions: true,
      },
    };
  }, [currentUser, previewStream, streamId]);
  const liveStream = currentStream || fallbackLiveStream;
  const creator = liveStream?.creator || {};
  const isCreator = Boolean(userIdFor(currentUser) && (String(userIdFor(currentUser)) === String(creator.id || liveStream?.creatorId || "") || previewStream));
  const commentsEnabled = liveStream?.settings?.commentsEnabled !== false;
  const reactionsEnabled = liveStream?.settings?.allowReactions !== false;
  const giftsEnabled = liveStream?.settings?.giftsEnabled !== false;
  const liveDuration = formatLiveDuration(liveStream?.startedAt || clockTick);
  const visibleVideoStream = previewStream || remoteStream;
  const hasActiveVideo = Boolean(activeVideoTrackFor(visibleVideoStream));

  const streamBackground = useMemo(() => {
    if (liveStream?.coverImage) {
      return { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.65)), url(${liveStream.coverImage})` };
    }
    return {};
  }, [liveStream?.coverImage]);

  const topSupporter = useMemo(() => {
    return Object.values(giftLeaderboard)
      .sort((left, right) => Number(right.total || 0) - Number(left.total || 0))[0];
  }, [giftLeaderboard]);
  const selectedGift = giftById[selectedGiftId] || liveGiftOptions[0];
  const currentUserId = userIdFor(currentUser);
  const creatorId = String(creator.id || creator._id || liveStream?.creatorId || "");
  const isPanelGuest = panelUsers.some((guest) => String(guest.userId || "") === String(currentUserId || "") || String(guest.socketId || "") === String(socketRef.current?.id || ""));

  const addReactionBubble = (data) => {
    const id = data.id || `${data.reaction || "heart"}:${Date.now()}:${Math.random()}`;
    setReactionQueue((current) => [
      ...current,
      {
        ...data,
        id,
        driftX: -60 - Math.random() * 120,
        driftY: -240 - Math.random() * 90,
        right: 72 + Math.random() * 24,
        bottom: 120 + Math.random() * 80,
      },
    ].slice(-24));

    const timer = window.setTimeout(() => {
      setReactionQueue((current) => current.filter((reaction) => reaction.id !== id));
      reactionTimersRef.current.delete(timer);
    }, 2100);
    reactionTimersRef.current.add(timer);
  };

  const appendLiveComment = (entry = {}, options = {}) => {
    const comment = sanitizeLiveComment(entry);
    const id = comment.id || `${comment.type || "comment"}:${Date.now()}:${Math.random()}`;
    const text = textFromLiveValue(comment.text, comment.type === "gift" ? "sent a gift" : "");
    const username = textFromLiveValue(comment.username, "Guest");

    if (!text && comment.type !== "gift") return null;
    if (!options.allowDuplicate && seenCommentIdsRef.current.has(id)) return null;

    seenCommentIdsRef.current.add(id);
    if (seenCommentIdsRef.current.size > 240) {
      seenCommentIdsRef.current = new Set(Array.from(seenCommentIdsRef.current).slice(-160));
    }

    const nextComment = { ...comment, id, username, text };
    setComments((current) => [...current.slice(-(MAX_COMMENTS - 1)), nextComment]);
    return nextComment;
  };

  const playGiftSound = (tier = "small") => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      audioContextRef.current = audioContextRef.current || new AudioContext();
      const context = audioContextRef.current;
      context.resume?.();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const premium = tier === "premium";

      oscillator.type = "sine";
      oscillator.frequency.value = premium ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(premium ? 0.09 : 0.055, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (premium ? 0.34 : 0.2));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + (premium ? 0.36 : 0.22));
    } catch {
      // Gift sound is best-effort and depends on browser audio permissions.
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    mediaStateRef.current = { muted, cameraEnabled };
  }, [cameraEnabled, muted]);

  useEffect(() => {
    const handleSocketStatus = (event) => {
      const status = event.detail?.status || "";
      if (status === "reconnecting") {
        setStatusMessage("Reconnecting...");
      } else if (status === "offline") {
        setStatusMessage("Reconnecting...");
      } else if (status === "connected") {
        setStatusMessage((current) => (current === "Reconnecting..." || current === "Reconnecting live video..." ? "" : current));
      }
    };

    window.addEventListener("vibebook:socket-status", handleSocketStatus);
    return () => window.removeEventListener("vibebook:socket-status", handleSocketStatus);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previewStreamRef.current = previewStream;

    const facingMode = previewStream?.getVideoTracks?.()[0]?.getSettings?.().facingMode;
    if (facingMode === "user" || facingMode === "environment") {
      setLiveFacingMode(facingMode);
    }
  }, [previewStream]);

  useEffect(() => {
    remoteStreamRef.current = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    isCreatorRef.current = isCreator;
  }, [isCreator]);

  useEffect(() => {
    endedRef.current = ended;
  }, [ended]);

  useEffect(() => {
    if (!isCreator && !walletLoaded) {
      loadWallet?.();
    }
  }, [isCreator, loadWallet, walletLoaded]);

  useEffect(() => {
    const following = currentUser?.following || [];
    setIsFollowingCreator(Boolean(
      creator?.isFollowing ||
      (creatorId && following.some((id) => String(id?._id || id?.id || id) === String(creatorId)))
    ));
  }, [creator?.isFollowing, creatorId, currentUser?.following]);

  useEffect(() => {
    if (!chatListRef.current) return;
    chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
  }, [comments.length]);

  useEffect(() => {
    if (!liveStream) return;
    setLiveMetrics((current) => ({
      giftsReceived: Math.max(Number(current.giftsReceived || 0), Number(liveStream.stats?.giftsReceived || 0)),
      nexEarned: Math.max(Number(current.nexEarned || 0), Number(liveStream.stats?.giftValue || 0)),
      peakViewers: Math.max(Number(current.peakViewers || 0), Number(liveStream.maxViewers || liveStream.viewerCount || 0)),
    }));
    if (Array.isArray(liveStream.stats?.topSupporters)) {
      setGiftLeaderboard(liveStream.stats.topSupporters.reduce((map, supporter) => ({
        ...map,
        [supporter.userId || supporter.username]: {
          username: supporter.username || "Viewer",
          total: Number(supporter.total || 0),
          count: Number(supporter.count || 0),
        },
      }), {}));
    }
  }, [liveStream?.id, liveStream?.maxViewers, liveStream?.stats?.giftValue, liveStream?.stats?.giftsReceived, liveStream?.stats?.topSupporters, liveStream?.viewerCount]);

  useEffect(() => {
    const streamQuality = liveStream?.settings?.selectedQuality || liveStream?.settings?.quality;
    if (streamQuality) {
      setSelectedQuality(streamQuality);
    }
  }, [liveStream?.settings?.quality, liveStream?.settings?.selectedQuality]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!streamId) return undefined;

    const mediaStream = getLivePreviewStream(streamId);
    setPreviewStream(mediaStream);
  }, [streamId]);

  useEffect(() => {
    if (!streamId || !isCreator || previewStream || localLoading || ended) {
      return undefined;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaStream === "undefined") {
      setStatusMessage("Camera is not available in this browser");
      return undefined;
    }

    let canceled = false;
    const requestId = creatorCameraRequestRef.current + 1;
    creatorCameraRequestRef.current = requestId;
    setStatusMessage("Restoring camera...");

    const videoConstraints = {
      facingMode: { ideal: liveFacingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };

    const requestCreatorMedia = async () => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: true,
        });
      } catch (mediaError) {
        if (mediaError?.name === "NotAllowedError") {
          throw mediaError;
        }

        try {
          setMuted(true);
          return await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch (videoError) {
          if (videoError?.name === "NotAllowedError") {
            throw videoError;
          }

          return navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }
    };

    requestCreatorMedia().then((stream) => {
      if (canceled || creatorCameraRequestRef.current !== requestId) {
        stream.getTracks?.().forEach((track) => track.stop());
        return;
      }

      ensureMediaTrackState(stream, { audioEnabled: !muted, videoEnabled: cameraEnabled });
      previewStreamRef.current = stream;
      setPreviewStream(stream);
      setLivePreviewStream(streamId, stream);
      setStatusMessage("");
      socketRef.current?.emit("live:creator-ready", { streamId });
    }).catch((error) => {
      if (canceled || creatorCameraRequestRef.current !== requestId) return;
      setStatusMessage(error?.name === "NotAllowedError" ? "Camera permission was denied" : "Camera could not restart");
    });

    return () => {
      canceled = true;
    };
  }, [cameraEnabled, ended, isCreator, liveFacingMode, localLoading, muted, previewStream, streamId]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video || !previewStream) return undefined;

    video.srcObject = previewStream;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    ensureMediaTrackState(previewStream, { audioEnabled: !muted, videoEnabled: cameraEnabled });
    video.play?.().catch(() => null);

    return () => {
      if (video.srcObject === previewStream) {
        video.srcObject = null;
      }
    };
  }, [currentStream?.id, localLoading, previewStream]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video || !remoteStream) return undefined;

    video.srcObject = remoteStream;
    video.muted = muted;
    video.defaultMuted = muted;
    video.playsInline = true;
    remoteStream.getVideoTracks?.().forEach((track) => {
      track.enabled = true;
    });
    video.play?.().catch(() => null);

    return () => {
      if (video.srcObject === remoteStream) {
        video.srcObject = null;
      }
    };
  }, [currentStream?.id, localLoading, muted, remoteStream]);

  useEffect(() => {
    if (isCreator) {
      ensureMediaTrackState(previewStream, { audioEnabled: !muted, videoEnabled: cameraEnabled });
    }
  }, [cameraEnabled, isCreator, muted, previewStream]);

  useEffect(() => {
    if (!localLoading && !isCreator) {
      setMuted(true);
    }
  }, [isCreator, localLoading, streamId]);

  useEffect(() => {
    if (!streamId) return undefined;

    window.clearTimeout(hostEndCleanupTimerRef.current);
    hostEndCleanupTimerRef.current = null;
    window.clearTimeout(hostMediaCleanupTimerRef.current);
    hostMediaCleanupTimerRef.current = null;

    let canceled = false;
    const viewerName = currentUser?.username || currentUser?.name || "Guest";
    const activeSocket = connectSocket(token, { liveStreamId: streamId });
    socketRef.current = activeSocket;
    setLocalLoading(true);
    endedRef.current = false;
    setEnded(false);
    setStatusMessage("");
    setComments([]);
    setLiveViewers([]);
    setPanelUsers([]);
    setPanelRequests([]);
    setActiveSheet("");
    setShowGiftMenu(false);

    const cleanupSocketHandlers = () => {
      if (!activeSocket) return;
      activeSocket.off("livestream:comment", handleComment);
      activeSocket.off("live:message", handleComment);
      activeSocket.off("livestream:reaction", handleReaction);
      activeSocket.off("live:reaction", handleReaction);
      activeSocket.off("live:double-tap", handleDoubleTapReaction);
      activeSocket.off("livestream:gift", handleGift);
      activeSocket.off("live:gift", handleGift);
      activeSocket.off("livestream:viewers_updated", handleViewersUpdated);
      activeSocket.off("live:viewers_updated", handleViewersUpdated);
      activeSocket.off("livestream:viewer_joined", handleViewerJoined);
      activeSocket.off("live:viewer_joined", handleViewerJoined);
      activeSocket.off("live:room-state", handleRoomState);
      activeSocket.off("live:panel-updated", handleRoomState);
      activeSocket.off("live:panel-requested", handlePanelRequested);
      activeSocket.off("live:panel-invite", handlePanelInvite);
      activeSocket.off("live:panel-removed", handlePanelRemoved);
      activeSocket.off("live:panel-muted", handlePanelMuted);
      activeSocket.off("live:blocked-from-stream", handleBlockedFromStream);
      activeSocket.off("live:user-blocked", handleUserBlocked);
      activeSocket.off("livestream:ended", handleEnded);
      activeSocket.off("live:ended", handleEnded);
      activeSocket.off("livestream:metadata_updated", handleMetadataUpdated);
      activeSocket.off("live:metadata_updated", handleMetadataUpdated);
      activeSocket.off("livestream:error", handleSocketError);
      activeSocket.off("connect", emitSocketJoin);
    };

    const cleanupHeartbeat = () => {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };

    function handleComment(data) {
      if (data.streamId && data.streamId !== streamId) return;
      appendLiveComment(data);
    }

    function handleReaction(data) {
      if (data.streamId && data.streamId !== streamId) return;
      addReactionBubble(data);
    }

    function handleDoubleTapReaction(data) {
      if (data.streamId && data.streamId !== streamId) return;
      // Show floating hearts from other users' double-taps
      for (let i = 0; i < 2; i++) {
        const delay = i * 40;
        window.setTimeout(() => {
          addReactionBubble({
            reaction: "heart",
            right: (Number(data.x) / window.innerWidth * 100).toFixed(1),
            bottom: (Number(data.y) / window.innerHeight * 100).toFixed(1),
          });
        }, delay);
      }
    }

    function handleGift(data) {
      if (data.streamId && data.streamId !== streamId) return;
      const giftId = data.giftId || data.gift;
      const eventId = data.clientId || data.id || data.transactionId || `gift:${giftId}:${data.userId || data.username || "viewer"}:${data.timestamp || Date.now()}`;
      if (seenGiftIdsRef.current.has(eventId)) return;
      seenGiftIdsRef.current.add(eventId);
      if (seenGiftIdsRef.current.size > 180) {
        seenGiftIdsRef.current = new Set(Array.from(seenGiftIdsRef.current).slice(-120));
      }

      const giftMeta = giftById[giftId] || liveGiftOptions[0];
      const giftName = data.giftName || giftMeta.name;
      const amount = Number(data.value || giftMeta.value || 0);
      const senderId = data.userId || data.username || data.id || "viewer";
      const id = eventId;
      const tier = data.tier || giftMeta.tier || "small";
      appendLiveComment({
        ...data,
        id: data.chatId || `gift-chat:${eventId}`,
        type: "gift",
        giftId: giftMeta.id,
        giftName,
        text: `${data.username || "Someone"} sent ${giftName}`,
        value: amount,
      });

      setGiftEvents((current) => [
        ...current,
        {
          ...data,
          id,
          giftName,
          giftId: giftMeta.id,
          emoji: data.emoji || giftMeta.emoji,
          tier,
          value: amount,
          left: 14 + Math.random() * 46,
          bottom: 28 + Math.random() * 20,
          particles: makeGiftParticles(tier),
        },
      ].slice(-12));
      playGiftSound(tier);
      setLiveMetrics((current) => ({
        giftsReceived: Number(current.giftsReceived || 0) + 1,
        nexEarned: Number(current.nexEarned || 0) + amount,
        peakViewers: Number(current.peakViewers || 0),
      }));
      setGiftLeaderboard((current) => {
        if (Array.isArray(data.topSupporters) && data.topSupporters.length) {
          return data.topSupporters.reduce((map, supporter) => ({
            ...map,
            [supporter.userId || supporter.username]: {
              username: supporter.username || "Viewer",
              total: Number(supporter.total || 0),
              count: Number(supporter.count || 0),
            },
          }), {});
        }
        const previous = current[senderId] || { username: data.username || "Viewer", total: 0, count: 0 };
        return {
          ...current,
          [senderId]: {
            ...previous,
            username: data.username || previous.username,
            total: Number(previous.total || 0) + amount,
            count: Number(previous.count || 0) + 1,
          },
        };
      });
      const timer = window.setTimeout(() => {
        setGiftEvents((current) => current.filter((gift) => gift.id !== id));
        giftTimersRef.current.delete(timer);
      }, tier === "premium" ? 5200 : 3400);
      giftTimersRef.current.add(timer);

      setStatusMessage(`${data.username || "Someone"} sent ${giftName}`);
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2400);
    }

    function handleViewersUpdated(data) {
      if (data.streamId && data.streamId !== streamId) return;
      updateViewerCount(Number(data.viewerCount || 0), data.maxViewers ?? null);
      setLiveMetrics((current) => ({
        ...current,
        peakViewers: Math.max(Number(current.peakViewers || 0), Number(data.maxViewers || data.viewerCount || 0)),
      }));
    }

    function handleViewerJoined(data) {
      if (data.streamId && data.streamId !== streamId) return;
      const viewer = data.viewer || {};
      const joinedUserId = viewer.userId || data.userId || "";
      if (joinedUserId && joinedUserId === userIdFor(currentUser)) return;

      const id = `${joinedUserId || viewer.username || "viewer"}:${Date.now()}:${Math.random()}`;
      setJoinEvents((current) => [
        ...current,
        {
          id,
          username: viewer.username || data.username || "Viewer",
          avatar: viewer.avatar || "",
        },
      ].slice(-3));

      const timer = window.setTimeout(() => {
        setJoinEvents((current) => current.filter((event) => event.id !== id));
        joinTimersRef.current.delete(timer);
      }, 2400);
      joinTimersRef.current.add(timer);
    }

    function handleRoomState(data = {}) {
      if (data.streamId && data.streamId !== streamId) return;
      setLiveViewers(Array.isArray(data.viewers) ? data.viewers : []);
      setPanelUsers(Array.isArray(data.panelUsers) ? data.panelUsers.slice(0, 10) : []);
      setPanelRequests(Array.isArray(data.requests) ? data.requests : []);
      setPanelLimit(Number(data.panelLimit || 10));
    }

    function handlePanelRequested(data = {}) {
      if (data.streamId && data.streamId !== streamId) return;
      if (data.roomState) handleRoomState(data.roomState);
      if (isCreatorRef.current && data.request?.username) {
        setStatusMessage(`${data.request.username} requested panel`);
        window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2200);
      }
    }

    function handlePanelInvite(data = {}) {
      if (data.streamId && data.streamId !== streamId) return;
      setStatusMessage("You were added to the live panel");
      setActiveSheet("panel");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2400);
    }

    function handlePanelRemoved(data = {}) {
      if (data.streamId && data.streamId !== streamId) return;
      setStatusMessage("You left the live panel");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2200);
    }

    function handlePanelMuted(data = {}) {
      if (data.streamId && data.streamId !== streamId) return;
      setStatusMessage(data.muted ? "Panel mic muted by host" : "Panel mic unmuted");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2200);
    }

    function handleBlockedFromStream(data = {}) {
      if (data.streamId && data.streamId !== streamId) return;
      setStatusMessage(data.reason || "You were removed from this live");
      window.setTimeout(() => mountedRef.current && onCloseRef.current?.(), 900);
    }

    function handleUserBlocked(data = {}) {
      if (data.streamId && data.streamId !== streamId) return;
      if (data.userId && String(data.userId) === String(userIdFor(currentUser))) {
        handleBlockedFromStream(data);
      }
    }

    function handleEnded(data) {
      if (data.streamId && data.streamId !== streamId && data.stream?.id !== streamId) return;
      window.clearTimeout(hostEndCleanupTimerRef.current);
      hostEndCleanupTimerRef.current = null;
      endedRef.current = true;
      setEnded(true);
      setStatusMessage("Live has ended");
      removeLiveStream(streamId);
      window.setTimeout(() => {
        if (mountedRef.current) onCloseRef.current?.();
      }, 1200);
    }

    function handleMetadataUpdated(data) {
      if (data.stream?.id === streamId) {
        upsertLiveStream(data.stream);
      }
    }

    function handleSocketError(data) {
      setStatusMessage(data?.error || "Live connection needs a moment");
    }

    function emitSocketJoin() {
      if (!activeSocket || !streamId) return;
      activeSocket.emit(
        "livestream:join",
        {
          streamId,
          sessionId: sessionIdRef.current,
          username: viewerName,
        },
        (ack = {}) => {
          if (ack.roomState) handleRoomState(ack.roomState);
        }
      );
      if (isCreatorRef.current && previewStreamRef.current) {
        activeSocket.emit("live:creator-ready", { streamId });
      } else if (webrtcReadyRef.current) {
        activeSocket.emit("live:request-video", { streamId, username: viewerName });
      }
    }

    const attachSocketHandlers = () => {
      if (!activeSocket) return;

      cleanupSocketHandlers();
      activeSocket.on("livestream:comment", handleComment);
      activeSocket.on("live:message", handleComment);
      activeSocket.on("livestream:reaction", handleReaction);
      activeSocket.on("live:reaction", handleReaction);
      activeSocket.on("live:double-tap", handleDoubleTapReaction);
      activeSocket.on("livestream:gift", handleGift);
      activeSocket.on("live:gift", handleGift);
      activeSocket.on("livestream:viewers_updated", handleViewersUpdated);
      activeSocket.on("live:viewers_updated", handleViewersUpdated);
      activeSocket.on("livestream:viewer_joined", handleViewerJoined);
      activeSocket.on("live:viewer_joined", handleViewerJoined);
      activeSocket.on("live:room-state", handleRoomState);
      activeSocket.on("live:panel-updated", handleRoomState);
      activeSocket.on("live:panel-requested", handlePanelRequested);
      activeSocket.on("live:panel-invite", handlePanelInvite);
      activeSocket.on("live:panel-removed", handlePanelRemoved);
      activeSocket.on("live:panel-muted", handlePanelMuted);
      activeSocket.on("live:blocked-from-stream", handleBlockedFromStream);
      activeSocket.on("live:user-blocked", handleUserBlocked);
      activeSocket.on("livestream:ended", handleEnded);
      activeSocket.on("live:ended", handleEnded);
      activeSocket.on("livestream:metadata_updated", handleMetadataUpdated);
      activeSocket.on("live:metadata_updated", handleMetadataUpdated);
      activeSocket.on("livestream:error", handleSocketError);
      activeSocket.on("connect", emitSocketJoin);

      if (activeSocket.connected) {
        emitSocketJoin();
      }

      cleanupHeartbeat();
      heartbeatRef.current = window.setInterval(() => {
        if (sessionIdRef.current && activeSocket.connected) {
          activeSocket.emit("livestream:heartbeat", { streamId, sessionId: sessionIdRef.current });
        }
      }, HEARTBEAT_MS);
    };

    const join = async () => {
      const detailsResult = await getStreamDetails(streamId);
      if (canceled) return;

      if (!detailsResult.ok) {
        setStatusMessage(detailsResult.error || "Unable to open live");
        setLocalLoading(false);
        return;
      }

      if (detailsResult.stream?.status === "ended" || detailsResult.stream?.isLive === false) {
        setEnded(true);
        setStatusMessage("Live has ended");
        setLocalLoading(false);
        return;
      }

      const joinResult = await joinLiveStream(streamId, viewerName);
      if (canceled) {
        if (joinResult.session?.id) {
          leaveLiveStream(joinResult.session.id);
        }
        return;
      }

      if (!joinResult.ok) {
        setStatusMessage(joinResult.error || "Unable to join live");
        setLocalLoading(false);
        return;
      }

      sessionIdRef.current = joinResult.session?.id || "";
      attachSocketHandlers();
      setLocalLoading(false);
    };

    join();

    return () => {
      canceled = true;
      cleanupHeartbeat();
      cleanupSocketHandlers();
      clearTimeout(tapTimerRef.current);

      const sessionId = sessionIdRef.current;
      if (activeSocket?.connected && sessionId) {
        activeSocket.emit("livestream:leave", { streamId, sessionId });
      } else if (sessionId) {
        leaveLiveStream(sessionId);
      }

      sessionIdRef.current = "";
      reactionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      reactionTimersRef.current.clear();
      giftTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      giftTimersRef.current.clear();
      joinTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      joinTimersRef.current.clear();
      window.clearInterval(videoRetryTimerRef.current);
      videoRetryTimerRef.current = null;
      if (isCreatorRef.current && streamId && !endedRef.current) {
        const streamToEnd = streamId;
        window.clearTimeout(hostEndCleanupTimerRef.current);
        hostEndCleanupTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current && !endedRef.current) {
            endedRef.current = true;
            endLiveStream(streamToEnd).catch(() => null);
          }
        }, 1200);
      }
      if (isCreatorRef.current && previewStreamRef.current) {
        const streamToRelease = streamId;
        window.clearTimeout(hostMediaCleanupTimerRef.current);
        hostMediaCleanupTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) {
            releaseLivePreviewStream(streamToRelease);
            previewStreamRef.current = null;
          }
        }, 1200);
      }
      clearCurrentStream();
    };
  }, [
    clearCurrentStream,
    currentUser?._id,
    currentUser?.id,
    currentUser?.name,
    currentUser?.username,
    endLiveStream,
    getStreamDetails,
    joinLiveStream,
    leaveLiveStream,
    removeLiveStream,
    streamId,
    token,
    updateViewerCount,
    upsertLiveStream,
  ]);

  useEffect(() => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || localLoading || typeof RTCPeerConnection === "undefined") {
      return undefined;
    }

    const closePeerConnection = (peerSocketId) => {
      const peerId = String(peerSocketId || "");
      const connection = peerConnectionsRef.current.get(peerId);
      if (connection) {
        connection.onicecandidate = null;
        connection.ontrack = null;
        connection.onconnectionstatechange = null;
        connection.oniceconnectionstatechange = null;
        connection.close();
        peerConnectionsRef.current.delete(peerId);
      }
      pendingIceCandidatesRef.current.delete(peerId);
    };

    const queueIceCandidate = (peerSocketId, candidate) => {
      const peerId = String(peerSocketId || "");
      if (!peerId || !candidate) return;

      const pending = pendingIceCandidatesRef.current.get(peerId) || [];
      pending.push(candidate);
      pendingIceCandidatesRef.current.set(peerId, pending.slice(-24));
    };

    const flushPendingIceCandidates = async (peerSocketId, connection) => {
      const peerId = String(peerSocketId || "");
      const pending = pendingIceCandidatesRef.current.get(peerId) || [];
      if (!peerId || !connection || !pending.length || !connection.remoteDescription) return;

      pendingIceCandidatesRef.current.delete(peerId);
      await Promise.allSettled(pending.map((candidate) => connection.addIceCandidate(new RTCIceCandidate(candidate))));
    };

    const clearVideoRetry = () => {
      window.clearInterval(videoRetryTimerRef.current);
      videoRetryTimerRef.current = null;
    };

    const clearVideoRequestTimers = () => {
      videoRequestTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      videoRequestTimersRef.current.clear();
    };

    const getPeerConnection = (peerSocketId) => {
      const peerId = String(peerSocketId || "");
      if (!peerId) return null;

      const existing = peerConnectionsRef.current.get(peerId);
      if (existing && existing.connectionState !== "closed") {
        return existing;
      }

      const connection = new RTCPeerConnection(PEER_CONNECTION_CONFIG);
      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        activeSocket.emit("live:webrtc-ice", {
          streamId,
          targetSocketId: peerId,
          candidate: event.candidate,
        });
      };
      connection.ontrack = (event) => {
        const incomingStream = event.streams?.[0] || remoteStreamRef.current || new MediaStream();
        if (event.track && !incomingStream.getTracks().some((track) => track.id === event.track.id)) {
          event.track.enabled = true;
          incomingStream.addTrack(event.track);
        }
        event.track?.addEventListener?.("unmute", () => {
          remoteStreamRef.current = incomingStream;
          setRemoteStream(incomingStream);
          remoteVideoRef.current?.play?.().catch(() => null);
        }, { once: true });
        remoteStreamRef.current = incomingStream;
        setRemoteStream(incomingStream);
        setStatusMessage("");
        clearVideoRetry();
      };
      connection.onconnectionstatechange = () => {
        if (["failed", "closed"].includes(connection.connectionState)) {
          closePeerConnection(peerId);
          if (!isCreatorRef.current) {
            scheduleVideoRequests([650, 1800]);
          }
        } else if (connection.connectionState === "disconnected" && !isCreatorRef.current) {
          scheduleVideoRequests([900, 2200]);
        } else if (connection.connectionState === "connected") {
          clearVideoRetry();
          setStatusMessage("");
        }
      };
      connection.oniceconnectionstatechange = () => {
        if (isCreatorRef.current) return;
        if (connection.iceConnectionState === "failed") {
          connection.restartIce?.();
          scheduleVideoRequests([700, 1800]);
        } else if (connection.iceConnectionState === "disconnected") {
          scheduleVideoRequests([1200, 3000]);
        }
      };

      const localStream = previewStreamRef.current;
      if (isCreatorRef.current && localStream) {
        const mediaState = mediaStateRef.current;
        ensureMediaTrackState(localStream, { audioEnabled: !mediaState.muted, videoEnabled: mediaState.cameraEnabled });
        localStream.getTracks?.().forEach((track) => {
          const alreadyAdded = connection.getSenders().some((sender) => sender.track === track);
          if (!alreadyAdded) {
            connection.addTrack(track, localStream);
          }
        });
      }

      peerConnectionsRef.current.set(peerId, connection);
      return connection;
    };

    const requestCreatorVideo = () => {
      if (!activeSocket.connected || isCreatorRef.current) return;
      const payload = {
        streamId,
        username: currentUser?.username || currentUser?.name || "Guest",
      };
      const handleAck = (error, ack = {}) => {
        if (error || ack?.ok === false) {
          setStatusMessage("Waiting for host video...");
          return;
        }

        if (!Number(ack.hosts || 0) && !activeVideoTrackFor(remoteStreamRef.current)) {
          setStatusMessage("Waiting for host video...");
        }
      };

      if (typeof activeSocket.timeout === "function") {
        activeSocket.timeout(5000).emit("live:request-video", payload, handleAck);
      } else {
        activeSocket.emit("live:request-video", payload, (ack = {}) => handleAck(null, ack));
      }
    };

    const scheduleVideoRequests = (delays = [0, 700, 2200]) => {
      if (isCreatorRef.current) return;

      delays.forEach((delay) => {
        const timer = window.setTimeout(() => {
          videoRequestTimersRef.current.delete(timer);
          if (!mountedRef.current || activeVideoTrackFor(remoteStreamRef.current)) {
            return;
          }
          requestCreatorVideo();
        }, Math.max(0, Number(delay) || 0));
        videoRequestTimersRef.current.add(timer);
      });
    };

    const startVideoRetry = () => {
      if (isCreatorRef.current || videoRetryTimerRef.current) return;

      let attempts = 0;
      videoRetryTimerRef.current = window.setInterval(() => {
        if (!mountedRef.current || isCreatorRef.current || activeVideoTrackFor(remoteStreamRef.current)) {
          clearVideoRetry();
          return;
        }

        attempts += 1;
        requestCreatorVideo();
        if (attempts >= 8) {
          clearVideoRetry();
          setStatusMessage("Waiting for creator video...");
        }
      }, 5000);
    };

    const announceCreatorReady = () => {
      if (!activeSocket.connected || !isCreatorRef.current || !previewStreamRef.current) return;
      activeSocket.emit("live:creator-ready", { streamId });
    };

    const handleCreatorReady = (data = {}) => {
      if (data.streamId && data.streamId !== streamId) return;
      scheduleVideoRequests([0, 650]);
    };

    const handleViewerReady = async (data = {}) => {
      if (data.streamId && data.streamId !== streamId) return;
      const viewerSocketId = data.viewerSocketId || data.fromSocketId;
      const localStream = previewStreamRef.current;
      if (!isCreatorRef.current || !localStream || !viewerSocketId || viewerSocketId === activeSocket.id) return;

      try {
        closePeerConnection(viewerSocketId);
        const connection = getPeerConnection(viewerSocketId);
        if (!connection) return;
        const mediaState = mediaStateRef.current;
        ensureMediaTrackState(localStream, { audioEnabled: !mediaState.muted, videoEnabled: mediaState.cameraEnabled });
        const offer = await connection.createOffer({ iceRestart: true });
        await connection.setLocalDescription(offer);
        activeSocket.emit("live:webrtc-offer", {
          streamId,
          targetSocketId: viewerSocketId,
          offer: connection.localDescription,
        });
      } catch {
        setStatusMessage("Realtime video needs a moment");
      }
    };

    const handleOffer = async (data = {}) => {
      if (data.streamId && data.streamId !== streamId) return;
      if (isCreatorRef.current) return;
      const creatorSocketId = data.creatorSocketId || data.fromSocketId;
      if (!creatorSocketId || !data.offer) return;

      try {
        let connection = getPeerConnection(creatorSocketId);
        if (connection?.signalingState !== "stable") {
          closePeerConnection(creatorSocketId);
          connection = getPeerConnection(creatorSocketId);
        }
        if (!connection) return;
        setStatusMessage("Waiting for live video...");
        await connection.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushPendingIceCandidates(creatorSocketId, connection);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        activeSocket.emit("live:webrtc-answer", {
          streamId,
          targetSocketId: creatorSocketId,
          answer: connection.localDescription,
        });
      } catch {
        setStatusMessage("Waiting for live video...");
      }
    };

    const handleAnswer = async (data = {}) => {
      if (data.streamId && data.streamId !== streamId) return;
      const viewerSocketId = data.viewerSocketId || data.fromSocketId;
      const connection = peerConnectionsRef.current.get(String(viewerSocketId || ""));
      if (!connection || !data.answer) return;

      try {
        await connection.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushPendingIceCandidates(viewerSocketId, connection);
      } catch {
        closePeerConnection(viewerSocketId);
      }
    };

    const handleIce = async (data = {}) => {
      if (data.streamId && data.streamId !== streamId) return;
      const peerSocketId = data.fromSocketId || data.creatorSocketId || data.viewerSocketId;
      if (!peerSocketId || !data.candidate) return;

      try {
        const connection = getPeerConnection(peerSocketId);
        if (!connection) return;
        if (!connection.remoteDescription) {
          queueIceCandidate(peerSocketId, data.candidate);
          return;
        }
        await connection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch {
        // ICE can arrive during renegotiation; the next candidate or offer recovers.
      }
    };

    const handlePeerLeft = (data = {}) => {
      if (data.streamId && data.streamId !== streamId) return;
      closePeerConnection(data.socketId || data.fromSocketId);
      if (!isCreatorRef.current) {
        setRemoteStream(null);
        startVideoRetry();
      }
    };

    const handleConnect = () => {
      if (isCreatorRef.current) {
        announceCreatorReady();
      } else {
        scheduleVideoRequests([0, 700, 2200]);
        startVideoRetry();
      }
    };

    webrtcReadyRef.current = true;
    activeSocket.on("live:viewer-ready", handleViewerReady);
    activeSocket.on("live:creator-ready", handleCreatorReady);
    activeSocket.on("live:webrtc-offer", handleOffer);
    activeSocket.on("live:webrtc-answer", handleAnswer);
    activeSocket.on("live:webrtc-ice", handleIce);
    activeSocket.on("live:peer-left", handlePeerLeft);
    activeSocket.on("connect", handleConnect);

    if (isCreator) {
      announceCreatorReady();
    } else {
      scheduleVideoRequests([0, 450, 1500, 3500]);
      startVideoRetry();
    }

    return () => {
      webrtcReadyRef.current = false;
      activeSocket.off("live:viewer-ready", handleViewerReady);
      activeSocket.off("live:creator-ready", handleCreatorReady);
      activeSocket.off("live:webrtc-offer", handleOffer);
      activeSocket.off("live:webrtc-answer", handleAnswer);
      activeSocket.off("live:webrtc-ice", handleIce);
      activeSocket.off("live:peer-left", handlePeerLeft);
      activeSocket.off("connect", handleConnect);
      peerConnectionsRef.current.forEach((connection) => connection.close());
      peerConnectionsRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      clearVideoRetry();
      clearVideoRequestTimers();
      if (!isCreatorRef.current) {
        remoteStreamRef.current?.getTracks?.().forEach((track) => track.stop());
        remoteStreamRef.current = null;
        setRemoteStream(null);
      }
    };
  }, [currentUser?.name, currentUser?.username, isCreator, localLoading, previewStream, streamId]);

  const sendComment = (retryText = "", retryId = "") => {
    const retrying = !isFormEventLike(retryText) && Boolean(textFromLiveValue(retryText, ""));
    const textSource = retrying ? retryText : commentText;
    const text = textFromLiveValue(textSource, "").trim();
    const activeSocket = socketRef.current;

    if (!text || !activeSocket || !streamId || !commentsEnabled) return;
    if (Date.now() - lastCommentAtRef.current < COMMENT_SEND_COOLDOWN_MS) {
      setStatusMessage("Slow down before sending another comment");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1600);
      return;
    }

    lastCommentAtRef.current = Date.now();
    setSending(true);
    if (!retrying) {
      setCommentText("");
    }
    if (retryId) {
      setComments((prev) => prev.filter((comment) => comment.id !== retryId));
      seenCommentIdsRef.current.delete(retryId);
    }

    const clientId = `comment:${streamId}:${userIdFor(currentUser) || "guest"}:${Date.now()}`;
    const optimisticComment = {
      id: clientId,
      streamId,
      userId: userIdFor(currentUser),
      username: currentUser?.username || currentUser?.name || "Guest",
      avatar: currentUser?.avatar || currentUser?.profilePicture || "",
      text,
      timestamp: new Date().toISOString(),
      optimistic: true,
    };

    seenCommentIdsRef.current.add(clientId);
    setComments((prev) => [...prev.slice(Math.max(0, prev.length - MAX_COMMENTS + 1)), optimisticComment]);

    if (chatListRef.current) {
      window.setTimeout(() => {
        chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    }

    let acknowledged = false;
    const timeout = window.setTimeout(() => {
      if (acknowledged) return;
      acknowledged = true;
      setSending(false);
      seenCommentIdsRef.current.delete(clientId);
      setComments((prev) => prev.map((c) => (
        c.id === clientId
          ? { ...c, optimistic: false, failed: true, error: "Comment timed out" }
          : c
      )));
      setStatusMessage("Comment timed out. Tap retry.");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2400);
    }, 8000);

    activeSocket.emit(
      "live:message",
      {
        streamId,
        clientId,
        text,
        user: currentUser,
        username: currentUser?.username || currentUser?.name || "Guest",
      },
      (ack = {}) => {
        if (acknowledged) return;
        acknowledged = true;
        window.clearTimeout(timeout);
        setSending(false);
        
        if (!ack.ok) {
          seenCommentIdsRef.current.delete(clientId);
          setComments((prev) => prev.map((c) => (
            c.id === clientId
              ? { ...c, optimistic: false, failed: true, error: ack.error || "Comment failed" }
              : c
          )));
          setStatusMessage(ack.error || "Comment failed");
          window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2400);
        } else {
          seenCommentIdsRef.current.add(clientId);
          setComments((prev) => 
            prev.map((c) => c.id === clientId ? { ...c, optimistic: false } : c)
          );
        }
      }
    );
  };

  const sendReaction = (reaction) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || !reactionsEnabled) return;

    activeSocket.emit("live:reaction", { streamId, reaction });
  };

  const handleDoubleTap = (event) => {
    const now = Date.now();
    const dt = doubleTapRef.current;

    // Check if this is a second tap within 300ms
    if (now - dt.lastTap < 300) {
      // Double tap detected!
      dt.count = (dt.count || 0) + 1;

      // Increment combo and reset after 100 taps
      setHeartCombo((prev) => {
        const newCombo = prev + 1;
        if (newCombo >= 100) {
          setHeartCombo(0);
          return 0;
        }
        return newCombo;
      });

      // Send heart reaction
      sendReaction("heart");

      // Create floating hearts at tap location
      const rect = event.currentTarget.getBoundingClientRect();
      const point = event.changedTouches?.[0] || event;
      const x = Number(point.clientX || rect.left + rect.width / 2) - rect.left;
      const y = Number(point.clientY || rect.top + rect.height / 2) - rect.top;

      // Emit heart bursts to other viewers
      const activeSocket = socketRef.current;
      if (activeSocket) {
        activeSocket.emit("live:double-tap", {
          streamId,
          x: Math.round(x),
          y: Math.round(y),
          userId: userIdFor(currentUser),
        });
      }

      // Add floating hearts locally
      for (let i = 0; i < 3; i++) {
        const delay = i * 80;
        window.setTimeout(() => {
          addReactionBubble({
            reaction: "heart",
            right: (50 + Math.random() * 20).toFixed(1),
            bottom: (30 + Math.random() * 15).toFixed(1),
          });
        }, delay);
      }

      // Clear double tap tracking
      dt.count = 0;
      dt.lastTap = 0;
    } else {
      dt.lastTap = now;
      dt.count = 1;

      // Clear tracking after 400ms
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => {
        dt.count = 0;
        dt.lastTap = 0;
      }, 400);
    }
  };

  const sendGift = async (giftId, giftValue) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || !giftsEnabled || sendingGiftId || isCreator) {
      if (isCreator) setStatusMessage("Hosts cannot gift their own live");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
      return;
    }
    if (Date.now() - lastGiftAtRef.current < GIFT_SEND_COOLDOWN_MS) {
      setStatusMessage("Please wait before sending another gift");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1600);
      return;
    }

    const giftMeta = giftById[giftId] || selectedGift;
    const pointCost = Math.max(0, Number(giftValue || giftMeta.value || 0));
    if (!pointCost) {
      setStatusMessage("Gift is not available");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
      return;
    }

    setSendingGiftId(giftId);
    let latestWallet = wallet;
    if (!walletLoaded && loadWallet) {
      latestWallet = await loadWallet();
    }

    const currentBalance = Number(latestWallet?.balance ?? wallet?.balance ?? 0);
    if (currentBalance < pointCost) {
      setSendingGiftId("");
      setStatusMessage("Not enough NEX points");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2200);
      return;
    }

    const clientId = `gift:${streamId}:${giftId}:${Date.now()}`;
    const giftChatId = `gift-chat:${clientId}`;
    const senderKey = userIdFor(currentUser) || activeSocket.id || "viewer";
    const senderName = currentUser?.username || currentUser?.name || "You";
    const tier = giftMeta.tier || "small";
    const optimisticGift = {
      id: clientId,
      clientId,
      streamId,
      userId: userIdFor(currentUser),
      username: senderName,
      gift: giftMeta.id,
      giftId: giftMeta.id,
      giftName: giftMeta.name,
      emoji: giftMeta.emoji,
      tier,
      rarity: giftMeta.rarity,
      value: pointCost,
      colors: giftMeta.colors || [],
      fullscreen: Boolean(giftMeta.fullscreen || giftMeta.special),
      special: Boolean(giftMeta.special),
      soundHook: giftMeta.sound || `gift-${giftMeta.id.replace(/_/g, "-")}`,
      left: 14 + Math.random() * 46,
      bottom: 28 + Math.random() * 20,
      particles: makeGiftParticles(tier),
      optimistic: true,
      timestamp: new Date().toISOString(),
    };
    let giftRemovalTimer = null;
    let acknowledged = false;

    const rollbackOptimisticGift = () => {
      seenGiftIdsRef.current.delete(clientId);
      if (giftRemovalTimer) {
        window.clearTimeout(giftRemovalTimer);
        giftTimersRef.current.delete(giftRemovalTimer);
      }
      setGiftEvents((current) => current.filter((gift) => gift.id !== clientId));
      seenCommentIdsRef.current.delete(giftChatId);
      setComments((current) => current.filter((comment) => comment.id !== giftChatId));
      setLiveMetrics((current) => ({
        ...current,
        giftsReceived: Math.max(0, Number(current.giftsReceived || 0) - 1),
        nexEarned: Math.max(0, Number(current.nexEarned || 0) - pointCost),
      }));
      setGiftLeaderboard((current) => {
        const previous = current[senderKey];
        if (!previous) return current;
        const nextCount = Math.max(0, Number(previous.count || 0) - 1);
        const nextTotal = Math.max(0, Number(previous.total || 0) - pointCost);
        if (!nextCount && !nextTotal) {
          const { [senderKey]: _removed, ...rest } = current;
          return rest;
        }
        return {
          ...current,
          [senderKey]: {
            ...previous,
            count: nextCount,
            total: nextTotal,
          },
        };
      });
      useWalletStore.setState((state) => ({
        wallet: {
          ...state.wallet,
          balance: Number(state.wallet?.balance || 0) + pointCost,
          lifetimeSpent: Math.max(0, Number(state.wallet?.lifetimeSpent || 0) - pointCost),
          totalSent: Math.max(0, Number(state.wallet?.totalSent || 0) - pointCost),
          updatedAt: new Date().toISOString(),
        },
        walletLoaded: true,
      }));
    };

    seenGiftIdsRef.current.add(clientId);
    setGiftEvents((current) => [...current, optimisticGift].slice(-12));
    playGiftSound(tier);
    appendLiveComment({
      id: giftChatId,
      streamId,
      type: "gift",
      userId: userIdFor(currentUser),
      username: senderName,
      avatar: currentUser?.avatar || currentUser?.profilePicture || currentUser?.profileImage || "",
      giftId: giftMeta.id,
      giftName: giftMeta.name,
      text: `sent ${giftMeta.name}`,
      value: pointCost,
      timestamp: optimisticGift.timestamp,
      optimistic: true,
    });
    setLiveMetrics((current) => ({
      ...current,
      giftsReceived: Number(current.giftsReceived || 0) + 1,
      nexEarned: Number(current.nexEarned || 0) + pointCost,
    }));
    setGiftLeaderboard((current) => {
      const previous = current[senderKey] || { username: senderName, total: 0, count: 0 };
      return {
        ...current,
        [senderKey]: {
          ...previous,
          username: senderName,
          total: Number(previous.total || 0) + pointCost,
          count: Number(previous.count || 0) + 1,
        },
      };
    });
    useWalletStore.setState((state) => ({
      wallet: {
        ...state.wallet,
        balance: Math.max(0, Number(state.wallet?.balance || 0) - pointCost),
        lifetimeSpent: Number(state.wallet?.lifetimeSpent || 0) + pointCost,
        totalSent: Number(state.wallet?.totalSent || 0) + pointCost,
        updatedAt: new Date().toISOString(),
      },
      walletLoaded: true,
    }));

    giftRemovalTimer = window.setTimeout(() => {
      setGiftEvents((current) => current.filter((gift) => gift.id !== clientId));
      giftTimersRef.current.delete(giftRemovalTimer);
    }, Math.max(3400, Number(giftMeta.animationDuration || 0) + 500));
    giftTimersRef.current.add(giftRemovalTimer);

    lastGiftAtRef.current = Date.now();
    const ackTimer = window.setTimeout(() => {
      if (acknowledged) return;
      acknowledged = true;
      giftTimersRef.current.delete(ackTimer);
      setSendingGiftId("");
      rollbackOptimisticGift();
      setStatusMessage("Gift send timed out. Try again.");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2600);
    }, 12000);
    giftTimersRef.current.add(ackTimer);

    activeSocket.emit("live:gift", { streamId, giftId, giftValue: pointCost, clientId }, (ack = {}) => {
      if (acknowledged) return;
      acknowledged = true;
      window.clearTimeout(ackTimer);
      giftTimersRef.current.delete(ackTimer);
      setSendingGiftId("");
      if (!ack.ok) {
        rollbackOptimisticGift();
        setStatusMessage(ack.error || "Gift could not be sent");
        window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2400);
      } else {
        setGiftCombo((current) => ({
          ...current,
          [giftId]: Number(current[giftId] || 0) + 1,
        }));
        if (Array.isArray(ack.gift?.topSupporters) && ack.gift.topSupporters.length) {
          setGiftLeaderboard(ack.gift.topSupporters.reduce((map, supporter) => ({
            ...map,
            [supporter.userId || supporter.username]: {
              username: supporter.username || "Viewer",
              total: Number(supporter.total || 0),
              count: Number(supporter.count || 0),
            },
          }), {}));
        }
        if (ack.wallet) {
          useWalletStore.setState((state) => ({
            wallet: { ...state.wallet, ...ack.wallet },
            walletLoaded: true,
          }));
        } else {
          loadWallet?.();
        }
        setComments((current) => current.map((comment) => (
          comment.id === giftChatId ? { ...comment, optimistic: false } : comment
        )));
        setStatusMessage(`${giftMeta.name} sent`);
        window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
      }
    });
    setShowGiftMenu(false);
    setActiveSheet("");
  };

  const handleSwitchLiveCamera = async () => {
    if (!isCreator || switchingCamera || ended || !previewStreamRef.current || !navigator.mediaDevices?.getUserMedia || typeof MediaStream === "undefined") {
      return;
    }

    const currentLocalStream = previewStreamRef.current;
    const nextFacingMode = liveFacingMode === "user" ? "environment" : "user";

    setSwitchingCamera(true);
    setStatusMessage("Switching camera...");

    try {
      let cameraOnlyStream;
      try {
        cameraOnlyStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: nextFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (cameraError) {
        if (cameraError?.name === "NotAllowedError") {
          throw cameraError;
        }

        const deviceId = await cameraDeviceForFacingMode(nextFacingMode);
        cameraOnlyStream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : {
                facingMode: { ideal: nextFacingMode },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: false,
        });
      }
      const [nextVideoTrack] = cameraOnlyStream.getVideoTracks();

      if (!nextVideoTrack) {
        cameraOnlyStream.getTracks().forEach((track) => track.stop());
        throw new Error("Camera track unavailable");
      }
      nextVideoTrack.enabled = Boolean(cameraEnabled);

      const nextLocalStream = currentLocalStream || new MediaStream();
      const previousVideoTracks = nextLocalStream.getVideoTracks();
      previousVideoTracks.forEach((track) => nextLocalStream.removeTrack(track));
      nextLocalStream.addTrack(nextVideoTrack);
      ensureMediaTrackState(nextLocalStream, { audioEnabled: !muted, videoEnabled: cameraEnabled });

      const replacements = [];
      peerConnectionsRef.current.forEach((connection) => {
        if (!connection || connection.connectionState === "closed") return;

        const videoSender = connection.getSenders().find((sender) => sender.track?.kind === "video");
        if (videoSender) {
          replacements.push(videoSender.replaceTrack(nextVideoTrack));
        } else {
          connection.addTrack(nextVideoTrack, nextLocalStream);
        }
      });
      await Promise.allSettled(replacements);

      previousVideoTracks.forEach((track) => track.stop());
      previewStreamRef.current = nextLocalStream;
      setPreviewStream(nextLocalStream);
      setLivePreviewStream(streamId, nextLocalStream);
      setLiveFacingMode(nextFacingMode);
      setCameraFlipNonce((current) => current + 1);
      socketRef.current?.emit("live:creator-ready", { streamId });
      socketRef.current?.emit("live:media-state", { streamId, facingMode: nextFacingMode, cameraEnabled, muted });
      setStatusMessage(nextFacingMode === "user" ? "Front camera active" : "Back camera active");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1600);
    } catch (error) {
      setStatusMessage(error?.name === "NotAllowedError" ? "Camera permission was denied" : "Could not switch camera");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2200);
    } finally {
      setSwitchingCamera(false);
    }
  };

  const handleToggleMuted = () => {
    setMuted((current) => {
      const nextMuted = !current;
      setStatusMessage(isCreator ? (nextMuted ? "Microphone muted" : "Microphone on") : (nextMuted ? "Live audio muted" : "Live audio on"));
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1500);
      return nextMuted;
    });
  };

  const handleToggleCameraEnabled = () => {
    if (!isCreator) return;
    setCameraEnabled((current) => {
      const nextEnabled = !current;
      ensureMediaTrackState(previewStreamRef.current, { audioEnabled: !muted, videoEnabled: nextEnabled });
      setStatusMessage(nextEnabled ? "Camera on" : "Camera off");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1500);
      return nextEnabled;
    });
  };

  const handleQualityChange = (quality) => {
    setSelectedQuality(quality);
    setStatusMessage(`${quality} quality selected`);
    window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1500);
    if (isCreator && streamId && updateStreamMetadata) {
      updateStreamMetadata(streamId, {
        settings: {
          ...(liveStream?.settings || {}),
          selectedQuality: quality,
          quality,
        },
      });
    }
  };

  const handleReportLive = () => {
    if (reportedLive) return;
    setReportedLive(true);
    socketRef.current?.emit("live:report", { streamId, creatorId });
    setStatusMessage("Report submitted");
    window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/live/${streamId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: liveStream?.title || "VibeBook Live", url: shareUrl });
      } else {
        await navigator.clipboard?.writeText(shareUrl);
        setStatusMessage("Live link copied");
        window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
      }
    } catch {
      // Share cancellation is not an error for the viewer.
    }
  };

  const toggleGiftTray = () => {
    setShowGiftMenu((current) => {
      const next = !current;
      setShowLiveSettings(false);
      setActiveSheet(next ? "gifts" : "");
      return next;
    });
  };

  const applyRoomState = (payload = {}) => {
    if (Array.isArray(payload.viewers)) setLiveViewers(payload.viewers);
    if (Array.isArray(payload.panelUsers)) setPanelUsers(payload.panelUsers.slice(0, 10));
    if (Array.isArray(payload.requests)) setPanelRequests(payload.requests);
    if (payload.panelLimit) setPanelLimit(Number(payload.panelLimit || 10));
  };

  const requestRoomState = (sheet = "") => {
    const activeSocket = socketRef.current;
    if (sheet) {
      setActiveSheet(sheet);
      setShowGiftMenu(false);
      setShowLiveSettings(false);
    }
    if (!activeSocket || !streamId) return;
    activeSocket.emit("live:viewers:list", { streamId }, (ack = {}) => {
      if (ack.ok) applyRoomState(ack);
      else if (ack.error) setStatusMessage(ack.error);
    });
  };

  const handleFollowCreator = async () => {
    if (!creatorId || isCreator || followBusy) return;
    setFollowBusy(true);
    setIsFollowingCreator(true);
    try {
      await userApi.follow(creatorId);
      setStatusMessage("Following");
    } catch (error) {
      setIsFollowingCreator(false);
      setStatusMessage(error?.response?.data?.message || "Unable to follow");
    } finally {
      setFollowBusy(false);
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
    }
  };

  const handlePanelRequest = () => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || isCreator) {
      requestRoomState("panel");
      return;
    }
    setPanelBusyId("request");
    activeSocket.emit("live:panel-request", { streamId, username: currentUser?.username || currentUser?.name || "Viewer" }, (ack = {}) => {
      setPanelBusyId("");
      if (ack.ok) {
        applyRoomState(ack.roomState || ack);
        setActiveSheet("panel");
        setShowGiftMenu(false);
        setShowLiveSettings(false);
        setStatusMessage("Panel request sent");
      } else {
        setStatusMessage(ack.error || "Unable to request panel");
      }
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2200);
    });
  };

  const handlePanelAccept = (viewer) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || !viewer) return;
    const targetId = viewer.socketId || viewer.userId;
    setPanelBusyId(targetId);
    activeSocket.emit("live:panel-accept", { streamId, socketId: viewer.socketId, userId: viewer.userId }, (ack = {}) => {
      setPanelBusyId("");
      if (ack.ok) applyRoomState(ack.roomState || ack);
      setStatusMessage(ack.ok ? "Added to panel" : ack.error || "Panel update failed");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
    });
  };

  const handlePanelInvite = (viewer) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || !viewer) return;
    const targetId = viewer.socketId || viewer.userId;
    setPanelBusyId(targetId);
    activeSocket.emit("live:panel-invite", { streamId, socketId: viewer.socketId, userId: viewer.userId }, (ack = {}) => {
      setPanelBusyId("");
      if (ack.ok) applyRoomState(ack.roomState || ack);
      setStatusMessage(ack.ok ? "Viewer added to panel" : ack.error || "Invite failed");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
    });
  };

  const handlePanelRemove = (viewer) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || !viewer) return;
    const targetId = viewer.socketId || viewer.userId;
    setPanelBusyId(targetId);
    activeSocket.emit("live:panel-remove", { streamId, socketId: viewer.socketId, userId: viewer.userId }, (ack = {}) => {
      setPanelBusyId("");
      if (ack.ok) applyRoomState(ack.roomState || ack);
      setStatusMessage(ack.ok ? "Removed from panel" : ack.error || "Remove failed");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
    });
  };

  const handlePanelMute = (viewer) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || !viewer) return;
    const targetId = viewer.socketId || viewer.userId;
    setPanelBusyId(targetId);
    activeSocket.emit("live:panel-mute", { streamId, socketId: viewer.socketId, userId: viewer.userId, muted: !viewer.muted }, (ack = {}) => {
      setPanelBusyId("");
      if (ack.ok) applyRoomState(ack.roomState || ack);
      setStatusMessage(ack.ok ? (viewer.muted ? "Guest unmuted" : "Guest muted") : ack.error || "Mute failed");
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
    });
  };

  const handleEndLive = async () => {
    if (!streamId || !isCreator) return;
    window.clearTimeout(hostEndCleanupTimerRef.current);
    hostEndCleanupTimerRef.current = null;
    const result = await endLiveStream(streamId);
    if (result.ok) {
      endedRef.current = true;
      setEnded(true);
      onClose?.();
    } else {
      setStatusMessage(result.error || "Unable to end live");
    }
  };

  if (!liveStream && localLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950">
        <div className="rounded-2xl bg-white/10 px-5 py-4 text-center text-white backdrop-blur">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          <p className="mt-3 text-sm font-black">Opening live...</p>
        </div>
      </div>
    );
  }

  if (!liveStream) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-white">
        <div className="rounded-2xl bg-white/10 px-5 py-4 text-center backdrop-blur">
          <VideoOff className="mx-auto h-8 w-8 text-white/70" />
          <p className="mt-3 text-sm font-black">{statusMessage || "Live is unavailable"}</p>
          <button type="button" className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-950" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const hasPremiumGift = giftEvents.some((gift) => gift.tier === "premium");
  const liveTitle = liveStream.title || "VibeBook Live";

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-950 text-white"
      initial={{ opacity: 0 }}
      animate={hasPremiumGift ? { opacity: 1, x: [0, -4, 5, -3, 2, 0] } : { opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: hasPremiumGift ? 0.55 : 0.2 }}
    >
      <div className="absolute inset-0 bg-slate-950">
        <div className={`absolute inset-0 bg-cover bg-center transition-opacity duration-300 ${hasActiveVideo ? "opacity-0" : "opacity-100"}`} style={streamBackground} onClick={handleDoubleTap} onTouchEnd={handleDoubleTap} />
        {previewStream && (
          <video
            ref={previewVideoRef}
            className={`absolute inset-0 h-full w-full object-cover transition duration-300 ${liveFacingMode === "user" ? "-scale-x-100" : ""} ${switchingCamera ? "opacity-80 blur-[1px]" : ""}`}
            autoPlay
            muted
            playsInline
            disablePictureInPicture
            controlsList="nodownload noplaybackrate"
            onCanPlay={(event) => event.currentTarget.play?.().catch(() => null)}
            onPlaying={() => setStatusMessage("")}
            onClick={handleDoubleTap}
            onTouchEnd={handleDoubleTap}
          />
        )}
        <AnimatePresence>
          {switchingCamera && (
            <motion.div
              key={`camera-flip-${cameraFlipNonce}`}
              className="pointer-events-none absolute inset-0 bg-white/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
            />
          )}
        </AnimatePresence>
        {remoteStream && !previewStream && (
          <video
            ref={remoteVideoRef}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            playsInline
            muted={muted}
            disablePictureInPicture
            controlsList="nodownload noplaybackrate"
            onCanPlay={(event) => event.currentTarget.play?.().catch(() => null)}
            onPlaying={() => setStatusMessage("")}
            onClick={handleDoubleTap}
            onTouchEnd={handleDoubleTap}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/34 via-transparent to-black/52" />
        {!hasActiveVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-black via-slate-950 to-emerald-950">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/6 via-transparent to-brand/10" />
            <div className="relative mx-6 w-full max-w-xs overflow-hidden rounded-2xl border border-white/10 bg-black/42 p-4 text-center shadow-2xl backdrop-blur-xl">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10">
                <Video className="h-9 w-9 text-white/70" />
              </div>
              <p className="mt-3 text-sm font-black">{isCreator ? "Restoring camera..." : "Waiting for live video..."}</p>
              <p className="mt-1 text-xs font-semibold text-white/55">Video will appear as soon as the stream is ready.</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.span
                  className="block h-full w-1/2 rounded-full bg-white/70"
                  animate={{ x: ["-80%", "220%"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-5">
        <div className="relative flex min-w-0 items-start gap-2">
          <button type="button" className="flex shrink-0 flex-col items-center" onClick={() => setShowCreatorCard((current) => !current)} aria-label="Open host profile card">
            <SafeAvatar user={creator} src={creator.avatar} className="h-12 w-12 rounded-full border-2 border-white object-cover shadow-[0_0_22px_rgba(255,255,255,0.34)]" />
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[0.58rem] font-black shadow-[0_0_18px_rgba(220,38,38,0.65)]">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          </button>
          <div className="min-w-0 pt-1">
            <p className="max-w-[48vw] truncate text-sm font-black">{creator.name || creator.username || "Creator"}</p>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="rounded-full bg-slate-950/50 px-2.5 py-1 text-[0.64rem] font-black backdrop-blur">{liveDuration}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/50 px-2.5 py-1 text-[0.64rem] font-black backdrop-blur">
                <Users className="h-3.5 w-3.5" />
                {compactNumber(liveStream.viewerCount || liveViewers.length || 0)}
              </span>
            </div>
          </div>
        </div>

        <button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950/50 text-white backdrop-blur" onClick={onClose} aria-label="Close livestream">
          <X className="h-5 w-5" />
        </button>
      </header>

      <AnimatePresence>
        {showCreatorCard && (
          <motion.div
            className="absolute left-3 top-[calc(5.9rem+env(safe-area-inset-top))] z-40 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-white shadow-2xl backdrop-blur-xl sm:left-5"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
          >
            <div className="flex items-center gap-3">
              <SafeAvatar user={creator} src={creator.avatar} className="h-12 w-12 rounded-full border border-white/25 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{creator.name || creator.username || "Creator"}</p>
                <p className="truncate text-[0.68rem] font-bold text-white/55">{creator.username ? `@${creator.username}` : liveTitle}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" className="rounded-full bg-white px-3 py-2 text-[0.68rem] font-black text-slate-950 disabled:opacity-55" onClick={handleFollowCreator} disabled={isCreator || followBusy || isFollowingCreator}>
                {isFollowingCreator ? "Following" : "Follow"}
              </button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-2 text-[0.68rem] font-black text-white" onClick={() => creatorId && navigate(`/profile/${creatorId}`)}>
                View profile
              </button>
              <button type="button" className="rounded-full bg-white/10 px-3 py-2 text-[0.68rem] font-black text-white" onClick={() => creatorId && navigate(`/chat/${creatorId}`)} disabled={isCreator}>
                Message
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGiftMenu && (
          <motion.div
            className="absolute bottom-[calc(5.8rem+env(safe-area-inset-bottom))] left-2 right-2 z-40 max-h-[58dvh] overflow-hidden rounded-t-2xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-20 sm:w-[26rem] sm:rounded-2xl"
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 18 }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-black">Gifts</p>
                <p className="text-[0.68rem] font-bold text-white/55">Select, confirm, and send live.</p>
              </div>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white" onClick={() => { setShowGiftMenu(false); setActiveSheet(""); }} aria-label="Close gifts">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[34dvh] overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {giftGroups.map((group) => (
                <div key={group.id} className="mb-4 last:mb-0">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[0.68rem] font-black uppercase text-white/60">{group.label}</p>
                    {group.id === "premium" && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[0.62rem] font-black text-slate-950">Fullscreen</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {group.gifts.map((gift) => {
                      const selected = selectedGiftId === gift.id;
                      return (
                        <button
                          key={gift.id}
                          type="button"
                          className={`relative flex min-h-[5.4rem] flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center text-[0.66rem] font-black text-white transition disabled:opacity-55 ${selected ? "border-white bg-white/18 shadow-[0_0_22px_rgba(255,255,255,0.16)]" : "border-white/10 bg-white/8 hover:bg-white/14"}`}
                          onClick={() => setSelectedGiftId(gift.id)}
                          disabled={Boolean(sendingGiftId)}
                          style={{ boxShadow: selected ? `0 0 24px ${gift.colors?.[0] || "#fff"}55` : undefined }}
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none" style={{ background: gradientForGift(gift) }}>{gift.emoji}</span>
                          <span className="line-clamp-1 max-w-full">{gift.name}</span>
                          <span className="text-[0.62rem] text-white/55">{gift.value} NEX</span>
                          {giftCombo[gift.id] > 1 && <span className="absolute right-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[0.55rem] text-slate-950">x{giftCombo[gift.id]}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 p-3">
              <div className="flex items-center gap-3 rounded-lg bg-white/10 p-2">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg text-2xl" style={{ background: gradientForGift(selectedGift) }}>{selectedGift.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{selectedGift.name}</p>
                  <p className="text-[0.68rem] font-bold text-white/55">{selectedGift.rarity} - x{selectedGift.comboMultiplier} combo - {selectedGift.value} NEX</p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 text-xs font-black text-slate-950 shadow-lg transition hover:scale-105 disabled:opacity-55"
                  onClick={() => sendGift(selectedGift.id, selectedGift.value)}
                  disabled={Boolean(sendingGiftId) || !giftsEnabled || ended || isCreator}
                >
                  {sendingGiftId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLiveSettings && (
          <motion.div
            className="absolute bottom-[calc(5.8rem+env(safe-area-inset-bottom))] left-2 right-2 z-40 max-h-[58dvh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-xl [scrollbar-width:none] sm:left-auto sm:right-5 sm:w-[22rem] [&::-webkit-scrollbar]:hidden"
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 18 }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black">Live settings</p>
                <p className="text-[0.68rem] font-bold text-white/55">{isCreator ? "Stream controls" : "Viewer controls"}</p>
              </div>
              <button type="button" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white" onClick={() => setShowLiveSettings(false)} aria-label="Close live settings">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-2">
              {isCreator && (
                <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white disabled:opacity-55" onClick={handleSwitchLiveCamera} disabled={switchingCamera || ended || !previewStream}>
                  <span className="inline-flex items-center gap-2"><SwitchCamera className="h-4 w-4" /> Switch camera</span>
                  <span className="text-[0.65rem] uppercase text-white/50">{switchingCamera ? "Switching" : liveFacingMode === "user" ? "Front" : "Back"}</span>
                </button>
              )}
              <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white" onClick={handleToggleMuted}>
                <span className="inline-flex items-center gap-2">
                  {isCreator ? (muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />) : (muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />)}
                  {isCreator ? "Mute mic" : "Mute live audio"}
                </span>
                <span className="text-[0.65rem] uppercase text-white/50">{muted ? "Muted" : "On"}</span>
              </button>
              {!isCreator && (
                <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white disabled:opacity-55" onClick={handleFollowCreator} disabled={followBusy || isFollowingCreator}>
                  <span className="inline-flex items-center gap-2">{isFollowingCreator ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} Follow host</span>
                  <span className="text-[0.65rem] uppercase text-white/50">{followBusy ? "Saving" : isFollowingCreator ? "Done" : "Add"}</span>
                </button>
              )}
              <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white" onClick={handleShare}>
                <span className="inline-flex items-center gap-2"><Share2 className="h-4 w-4" /> Share live</span>
                <span className="text-[0.65rem] uppercase text-white/50">Link</span>
              </button>
              <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white" onClick={() => requestRoomState("viewers")}>
                <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Viewers</span>
                <span className="text-[0.65rem] uppercase text-white/50">{compactNumber(liveStream.viewerCount || liveViewers.length || 0)}</span>
              </button>
              <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white disabled:opacity-50" onClick={() => sendReaction("heart")} disabled={!reactionsEnabled || ended}>
                <span className="inline-flex items-center gap-2"><Heart className="h-4 w-4 fill-current text-red-300" /> Send heart</span>
                <span className="text-[0.65rem] uppercase text-white/50">{compactNumber(heartCombo || liveMetrics.giftsReceived || 0)}</span>
              </button>
              {isCreator && (
                <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white" onClick={handleToggleCameraEnabled}>
                  <span className="inline-flex items-center gap-2">{cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />} {cameraEnabled ? "Disable camera" : "Enable camera"}</span>
                  <span className="text-[0.65rem] uppercase text-white/50">{cameraEnabled ? "On" : "Off"}</span>
                </button>
              )}
              <label className="grid gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-black text-white">
                <span>Quality</span>
                <select className="h-10 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none" value={selectedQuality} onChange={(event) => handleQualityChange(event.target.value)}>
                  <option value="480p">480p Data saver</option>
                  <option value="720p">720p Balanced</option>
                  <option value="1080p">1080p High</option>
                </select>
              </label>
              <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white disabled:opacity-55" onClick={handlePanelRequest} disabled={panelBusyId === "request"}>
                <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> {isCreator ? "Panel controls" : isPanelGuest ? "On panel" : "Request panel"}</span>
                <span className="text-[0.65rem] uppercase text-white/50">{panelUsers.length}/{panelLimit}</span>
              </button>
              {!isCreator && (
                <button type="button" className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-xs font-black text-white disabled:opacity-55" onClick={handleReportLive} disabled={reportedLive}>
                  <span className="inline-flex items-center gap-2"><Flag className="h-4 w-4" /> Report stream</span>
                  <span className="text-[0.65rem] uppercase text-white/50">{reportedLive ? "Sent" : "Safety"}</span>
                </button>
              )}
              {isCreator && (
                <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white" onClick={handleEndLive}>
                  <X className="h-4 w-4" />
                  End live
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {joinEvents.map((event, index) => (
          <motion.div
            key={event.id}
            className="absolute left-3 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/60 px-3 py-2 text-xs font-black text-white shadow-xl backdrop-blur sm:left-5"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: [0, 1, 1, 0], y: [16, 0, 0, -12], scale: [0.96, 1, 1, 0.98] }}
            transition={{ duration: 2.4, ease: "easeOut" }}
            style={{ bottom: `${34 + index * 5}%` }}
          >
            <SafeAvatar user={{ username: event.username, profilePicture: event.avatar }} src={event.avatar} className="h-7 w-7 rounded-full border border-white/50 object-cover" />
            <span>{event.username} joined</span>
          </motion.div>
        ))}

        {giftEvents.map((gift) => {
          const giftMeta = giftById[gift.giftId] || liveGiftOptions[0];
          const isPremium = gift.fullscreen || gift.tier === "premium";
          const isVibeBookGift = gift.giftId === "vibebook_book" || gift.special;
          const giftGlow = gift.colors?.[0] || giftMeta.colors?.[0] || "#facc15";
          return (
            <div key={gift.id}>
              {gift.particles?.map((particle) => (
                <motion.span
                  key={`${gift.id}:particle:${particle.id}`}
                  className={`absolute ${isPremium ? "text-2xl" : "text-lg"} drop-shadow-[0_0_14px_rgba(255,255,255,0.75)]`}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
                  animate={{ x: particle.x, y: particle.y, opacity: [0, 1, 1, 0], scale: particle.scale, rotate: particle.rotate }}
                  transition={{ duration: isPremium ? 2.9 : 2.2, delay: particle.delay, ease: "easeOut" }}
                  style={{ left: `${gift.left + 8}%`, bottom: `${gift.bottom + 8}%` }}
                >
                  {isPremium ? "✨" : giftMeta.emoji}
                </motion.span>
              ))}
              {isPremium ? (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center bg-slate-950/20 px-4 backdrop-blur-[2px]"
                  initial={{ opacity: 0, scale: 0.72, y: 30 }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [0.72, 1.06, 1, 0.96], y: [30, 0, 0, -28] }}
                  transition={{ duration: 4.6, ease: "easeOut" }}
                >
                  <div className="relative flex w-[min(22rem,86vw)] flex-col items-center rounded-2xl border border-white/20 bg-slate-950/70 px-5 py-6 text-center shadow-[0_0_80px_rgba(250,204,21,0.38)] backdrop-blur" style={{ boxShadow: `0 0 92px ${giftGlow}66` }}>
                    <span className="absolute inset-0 rounded-2xl opacity-35 blur-xl" style={{ background: gradientForGift(gift.colors?.length ? gift : giftMeta) }} />
                    <span className="relative flex h-24 w-24 items-center justify-center rounded-2xl text-6xl leading-none drop-shadow-[0_0_36px_rgba(255,255,255,0.8)]" style={{ background: gradientForGift(gift.colors?.length ? gift : giftMeta) }}>
                      {isVibeBookGift ? <img src="/logo.png" alt="" className="h-16 w-16 rounded-xl object-contain" /> : (gift.emoji || giftMeta.emoji)}
                    </span>
                    {isVibeBookGift && <BookOpen className="relative mt-3 h-7 w-7 text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.8)]" />}
                    <span className="relative mt-3 text-sm font-black uppercase text-amber-200">{gift.username || "Viewer"} sent</span>
                    <span className="relative mt-1 text-3xl font-black">{gift.giftName}</span>
                    <span className="relative mt-2 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-950">{gift.value} NEX</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  className="absolute flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/70 px-3 py-2 text-xs font-black text-white shadow-2xl backdrop-blur"
                  initial={{ y: 40, opacity: 0, scale: 0.9 }}
                  animate={{ y: -150, opacity: [0, 1, 1, 0], scale: [0.9, 1.05, 1, 0.96] }}
                  transition={{ duration: 3.2, ease: "easeOut" }}
                  style={{ left: `${gift.left}%`, bottom: `${gift.bottom}%` }}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xl shadow-[0_0_18px_rgba(255,255,255,0.45)]">{gift.emoji || giftMeta.emoji}</span>
                  <span>{gift.username || "Viewer"} sent {gift.giftName}</span>
                </motion.div>
              )}
            </div>
          );
        })}

        {reactionQueue.map((reaction) => {
          const meta = reactionMeta[reaction.reaction] || reactionMeta.heart;
          const Icon = meta.Icon;
          return (
            <motion.div
              key={reaction.id}
              className={`absolute flex h-11 w-11 items-center justify-center rounded-full shadow-xl ${meta.className}`}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
              animate={{ x: reaction.driftX, y: reaction.driftY, opacity: [0, 1, 1, 0], scale: [0.6, 1, 1.1, 0.8] }}
              transition={{ duration: 2.1, ease: "easeOut" }}
              style={{ right: reaction.right, bottom: reaction.bottom }}
            >
              <Icon className="h-5 w-5" />
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {activeSheet && activeSheet !== "gifts" && (
          <motion.div
            className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom))] left-2 right-2 z-40 max-h-[46dvh] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-xl sm:left-5 sm:right-auto sm:w-[26rem]"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-black">{activeSheet === "panel" ? "Live Panel" : "Viewers"}</p>
                <p className="text-[0.68rem] font-bold text-white/55">{activeSheet === "panel" ? `${panelUsers.length}/${panelLimit} seats active` : `${liveViewers.length || liveStream.viewerCount || 0} watching`}</p>
              </div>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white" onClick={() => { setActiveSheet(""); setActiveGuest(null); }} aria-label="Close live sheet">
                <X className="h-4 w-4" />
              </button>
            </div>

            {activeSheet === "viewers" ? (
              <div className="max-h-[36dvh] overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(liveViewers.length ? liveViewers : panelUsers).map((viewer) => (
                  <div key={viewer.socketId || viewer.userId || viewer.username} className="mb-1.5 flex items-center gap-2 rounded-lg bg-white/8 px-2 py-2 last:mb-0">
                    <SafeAvatar user={viewer} src={viewer.avatar} className="h-9 w-9 rounded-full border border-white/20 object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black">{viewer.username || "Viewer"}</p>
                      <p className="text-[0.62rem] font-bold text-white/45">{viewer.isHost ? "Host" : viewer.role || "Viewer"}</p>
                    </div>
                    {isCreator && !viewer.isHost && (
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-950 disabled:opacity-55" onClick={() => handlePanelInvite(viewer)} disabled={panelBusyId === (viewer.socketId || viewer.userId)} aria-label="Invite viewer to panel">
                        {panelBusyId === (viewer.socketId || viewer.userId) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
                {!liveViewers.length && !panelUsers.length && <p className="px-2 py-5 text-center text-xs font-bold text-white/50">Viewer list will appear as people join.</p>}
              </div>
            ) : (
              <div className="max-h-[36dvh] overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="mb-2 grid grid-cols-5 gap-2">
                  {panelUsers.map((guest) => (
                    <button key={guest.socketId || guest.userId || guest.username} type="button" className="flex min-w-0 flex-col items-center gap-1 rounded-lg bg-white/8 p-2" onClick={() => setActiveGuest(guest)} aria-label="Open guest profile">
                      <span className={`rounded-full p-0.5 ${guest.activeSpeaker ? "bg-emerald-300" : guest.isHost ? "bg-amber-300" : "bg-white/20"}`}>
                        <SafeAvatar user={guest} src={guest.avatar} className="h-10 w-10 rounded-full object-cover" />
                      </span>
                      <span className="w-full truncate text-[0.58rem] font-black">{guest.isHost ? "Host" : guest.username || "Guest"}</span>
                    </button>
                  ))}
                </div>
                {isCreator && panelRequests.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="px-1 text-[0.64rem] font-black uppercase text-white/50">Requests</p>
                    {panelRequests.map((request) => (
                      <div key={request.socketId || request.userId} className="flex items-center gap-2 rounded-lg bg-white/8 px-2 py-2">
                        <SafeAvatar user={request} src={request.avatar} className="h-8 w-8 rounded-full object-cover" />
                        <span className="min-w-0 flex-1 truncate text-xs font-black">{request.username || "Viewer"}</span>
                        <button type="button" className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-[0.64rem] font-black text-slate-950 disabled:opacity-55" onClick={() => handlePanelAccept(request)} disabled={panelBusyId === (request.socketId || request.userId)}>
                          {panelBusyId === (request.socketId || request.userId) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!isCreator && (
                  <button type="button" className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-white text-xs font-black text-slate-950 disabled:opacity-55" onClick={handlePanelRequest} disabled={panelBusyId === "request" || isPanelGuest}>
                    {panelBusyId === "request" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    {isPanelGuest ? "On panel" : "Request panel"}
                  </button>
                )}
              </div>
            )}

            {activeGuest && (
              <div className="border-t border-white/10 p-3">
                <div className="flex items-center gap-2">
                  <SafeAvatar user={activeGuest} src={activeGuest.avatar} className="h-10 w-10 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{activeGuest.username || "Guest"}</p>
                    <p className="text-[0.64rem] font-bold text-white/50">{activeGuest.isHost ? "Host" : activeGuest.muted ? "Muted guest" : "Panel guest"}</p>
                  </div>
                  {isCreator && !activeGuest.isHost && (
                    <>
                      <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10" onClick={() => handlePanelMute(activeGuest)} aria-label={activeGuest.muted ? "Unmute guest" : "Mute guest"}>
                        {activeGuest.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </button>
                      <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white" onClick={() => handlePanelRemove(activeGuest)} aria-label="Remove guest">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <section className="absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))] sm:px-5">
        <div className="max-w-[calc(100%-4.9rem)] sm:max-w-xl">
          {panelUsers.length > 0 && (
            <div className="mb-2 flex max-w-full gap-2 overflow-x-auto pb-0.5 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {panelUsers.slice(0, 10).map((guest) => (
                <button key={guest.socketId || guest.userId || guest.username} type="button" className="flex shrink-0 flex-col items-center gap-1" onClick={() => { setActiveGuest(guest); setActiveSheet("panel"); }} aria-label="Open panel guest">
                  <span className={`rounded-full p-0.5 ${guest.activeSpeaker ? "bg-emerald-300" : guest.isHost ? "bg-amber-300" : "bg-white/25"}`}>
                    <SafeAvatar user={guest} src={guest.avatar} className="h-9 w-9 rounded-full object-cover" />
                  </span>
                  <span className="max-w-12 truncate text-[0.56rem] font-black">{guest.isHost ? "Host" : guest.username || "Guest"}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 max-w-md rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 backdrop-blur">
            <p className="truncate text-sm font-black">{liveTitle}</p>
            {!!liveStream.description && <p className="mt-0.5 line-clamp-2 text-[0.68rem] font-semibold leading-4 text-white/58">{liveStream.description}</p>}
          </div>

          {isCreator && (
            <div className="mb-2 grid max-w-md grid-cols-4 gap-1.5 rounded-lg border border-white/10 bg-slate-950/40 p-2 text-center text-[0.64rem] font-black backdrop-blur">
              <span><strong className="block text-sm">{compactNumber(liveMetrics.giftsReceived)}</strong> Gifts</span>
              <span><strong className="block text-sm">{compactNumber(liveMetrics.nexEarned)}</strong> NEX</span>
              <span><strong className="block truncate text-sm">{topSupporter?.username || "-"}</strong> Top</span>
              <span><strong className="block text-sm">{compactNumber(liveMetrics.peakViewers)}</strong> Peak</span>
            </div>
          )}

          <div ref={chatListRef} className="flex max-h-[24dvh] flex-col gap-1.5 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <AnimatePresence initial={false}>
              {comments.map((comment) => {
                const giftComment = comment.type === "gift";
                const commentBody = textFromLiveValue(comment.text, giftComment ? `sent ${comment.giftName || "a gift"}` : "");
                return (
                  <motion.div
                    key={comment.id}
                    className={`flex max-w-[94%] items-start gap-2 rounded-lg px-2.5 py-2 text-xs shadow-lg backdrop-blur ${giftComment ? "border border-amber-300/25 bg-amber-300/20" : "bg-slate-950/40"} ${comment.optimistic ? "opacity-70" : ""}`}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <SafeAvatar user={comment} src={comment.avatar} className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-white/20 object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="mr-1.5 font-black text-white">{comment.username || "Guest"}:</span>
                      {giftComment && <Gift className="mb-0.5 mr-1 inline h-3.5 w-3.5 text-amber-200" />}
                      <span className="break-words font-semibold text-white/82">{giftComment ? `sent ${comment.giftName || "a gift"}` : commentBody}</span>
                      {comment.failed && (
                        <button
                          type="button"
                          className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[0.62rem] font-black text-white"
                          onClick={() => sendComment(comment.text, comment.id)}
                        >
                          Retry
                        </button>
                      )}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {statusMessage && (
              <motion.div
                className="mt-2 inline-flex max-w-full rounded-full bg-white/14 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
              >
                {statusMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-2 flex max-w-[calc(100%-4.9rem)] items-center gap-2 sm:max-w-xl">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 px-3 py-2 backdrop-blur">
            <MessageCircle className="h-4 w-4 shrink-0 text-white/58" />
            <input
              ref={commentInputRef}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/45 disabled:opacity-55"
              placeholder={commentsEnabled ? "Add comment..." : "Comments off"}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendComment();
              }}
              disabled={!commentsEnabled || ended}
              maxLength={500}
            />
          </div>
          <button type="button" onClick={() => sendComment()} disabled={!commentText.trim() || sending || !commentsEnabled || ended} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-950 shadow-lg transition hover:scale-105 disabled:opacity-50" aria-label="Send live comment">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
          <button type="button" onClick={toggleGiftTray} disabled={!giftsEnabled || ended || isCreator} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-300 text-slate-950 shadow-lg transition hover:scale-105 disabled:opacity-50" aria-label="Open gifts">
            <Gift className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLiveSettings((current) => !current);
              setShowGiftMenu(false);
              setActiveSheet("");
            }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950/60 text-white shadow-lg backdrop-blur transition hover:scale-105"
            aria-label="Open live settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </section>
    </motion.div>
  );
};

export default LiveStreamViewer;
