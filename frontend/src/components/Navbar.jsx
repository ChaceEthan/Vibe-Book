// @ts-nocheck
import {
  BarChart3,
  Compass,
  Home,
  LogIn,
  MessageCircle,
  Plus,
  Settings,
  User,
  Wallet,
} from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import Upload from "./Upload.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { messageApi } from "../services/api";
import { connectSocket } from "../services/socket";
import { useLiveStreamStore } from "../store/livestreamStore";

const navClass = ({ isActive }) =>
  `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition ${
    isActive ? "text-brand" : "text-slate-500"
  }`;

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const notificationTitleFor = (payload = {}, fallback = "New message") => payload.sender?.name || payload.name || fallback;

const notificationBodyFor = (payload = {}) => payload.message || payload.text || "Open VibeBook to view it";

const Navbar = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState("image");
  const { isAuthenticated, user, token } = useAuth();
  const { language, languages, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const notificationCacheRef = useRef(new Map());
  const audioContextRef = useRef(null);
  const upsertLiveStream = useLiveStreamStore((state) => state.upsertLiveStream);
  const removeLiveStream = useLiveStreamStore((state) => state.removeLiveStream);
  const applyViewerCount = useLiveStreamStore((state) => state.applyViewerCount);
  const ensureLivePresence = useLiveStreamStore((state) => state.ensureLivePresence);

  const bottomNavItems = useMemo(
    () => [
      { to: "/", label: "Home", icon: Home },
      { to: "/explore", label: "Explore", icon: Compass },
      { to: isAuthenticated ? "/chat" : "/login", label: "Chat", icon: MessageCircle, badge: unreadCount },
      { to: isAuthenticated && user?._id ? `/profile/${user._id}` : "/login", label: "Profile", icon: User },
    ],
    [isAuthenticated, unreadCount, user?._id]
  );

  const activeLanguage = languages.find((item) => item.code === language);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return undefined;
    }

    let active = true;
    const loadUnreadCount = async () => {
      try {
        const { data } = await messageApi.getUnreadCount();
        if (active) {
          setUnreadCount(Number(data?.unreadCount || 0));
        }
      } catch {
        if (active) {
          setUnreadCount(0);
        }
      }
    };

    loadUnreadCount();
    const timer = setInterval(loadUnreadCount, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !token || !user?._id) {
      return undefined;
    }

    const socket = connectSocket(token, { userId: user._id });

    if (!socket) {
      return undefined;
    }

    const playMessageSound = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;

        if (!AudioContext) {
          return;
        }

        audioContextRef.current = audioContextRef.current || new AudioContext();
        const context = audioContextRef.current;
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.frequency.value = 660;
        gain.gain.value = 0.025;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.08);
      } catch {
        // Notification sound is best-effort.
      }
    };

    const notify = (key, title, body) => {
      const now = Date.now();
      const lastShown = notificationCacheRef.current.get(key) || 0;

      if (now - lastShown < 2500) {
        return;
      }

      notificationCacheRef.current.set(key, now);
      playMessageSound();

      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        new Notification(title, {
          body,
          icon: "/logo.png",
          tag: key,
        });
      }
    };

    const handleDirectMessage = (payload = {}) => {
      const senderId = idOf(payload.sender || payload.senderId);

      if (!senderId || senderId === user._id) {
        return;
      }

      setUnreadCount((current) => Math.max(0, Number(current || 0) + 1));
      notify(`dm:${payload._id || payload.clientId || senderId}`, notificationTitleFor(payload.sender, "New direct message"), notificationBodyFor(payload));
    };

    const handleGroupMessage = (payload = {}) => {
      const message = payload.message || payload;
      const senderId = idOf(message.sender || message.senderId);

      if (!senderId || senderId === user._id) {
        return;
      }

      const mention = new RegExp(`@${String(user.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(message.message || "");
      notify(
        `group:${message._id || message.clientId || message.groupId}`,
        mention ? "You were mentioned" : "New group message",
        `${notificationTitleFor(message.sender, "Group")}: ${notificationBodyFor(message)}`
      );
    };

    const handleUnreadUpdate = (payload = {}) => {
      setUnreadCount(Number(payload.unreadCount || 0));
    };

    const handleLiveStarted = (payload = {}) => {
      if (payload.stream) {
        upsertLiveStream(payload.stream);
      } else {
        ensureLivePresence();
      }
    };

    const handleLiveEnded = (payload = {}) => {
      removeLiveStream(payload.streamId || payload.stream?.id);
    };

    const handleLiveViewerUpdate = (payload = {}) => {
      if (payload.streamId) {
        applyViewerCount(payload.streamId, Number(payload.viewerCount || 0), payload.maxViewers ?? null);
      }
    };

    socket.on("receive_message", handleDirectMessage);
    socket.on("receive_group_message", handleGroupMessage);
    socket.on("unread:update", handleUnreadUpdate);
    socket.on("livestream:started", handleLiveStarted);
    socket.on("livestream:ended_global", handleLiveEnded);
    socket.on("livestream:viewers_updated_global", handleLiveViewerUpdate);

    return () => {
      socket.off("receive_message", handleDirectMessage);
      socket.off("receive_group_message", handleGroupMessage);
      socket.off("unread:update", handleUnreadUpdate);
      socket.off("livestream:started", handleLiveStarted);
      socket.off("livestream:ended_global", handleLiveEnded);
      socket.off("livestream:viewers_updated_global", handleLiveViewerUpdate);
    };
  }, [applyViewerCount, ensureLivePresence, isAuthenticated, removeLiveStream, token, upsertLiveStream, user?._id, user?.name]);

  useEffect(() => {
    const openFromEvent = (event) => {
      openUpload(event.detail?.type || "image");
    };

    window.addEventListener("vibebook:open-upload", openFromEvent);
    return () => window.removeEventListener("vibebook:open-upload", openFromEvent);
  }, [isAuthenticated]);

  const openUpload = (nextType = "image") => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    setUploadType(nextType);
    setUploadOpen(true);
  };

  const refreshHomeIfActive = () => {
    if (location.pathname === "/") {
      window.dispatchEvent(new CustomEvent("vibebook:home-refresh", { detail: { source: "home-tab" } }));
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex min-h-14 w-full max-w-full items-center justify-between gap-1.5 overflow-hidden px-2 sm:min-h-16 sm:gap-3 sm:px-6 lg:max-w-7xl lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-1.5 sm:gap-3" onClick={refreshHomeIfActive}>
            <img src="/logo.png" alt="VibeBook logo" className="h-8 w-8 rounded-lg object-cover sm:h-10 sm:w-10" />
            <span className="whitespace-nowrap text-base font-black text-navy sm:text-lg">VibeBook</span>
          </Link>

          <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
            <NavLink
              to="/creator-studio"
              aria-label="Creator Studio"
              className={({ isActive }) =>
                `inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border text-slate-600 transition hover:border-brand hover:bg-brand/10 hover:text-navy md:w-auto md:px-3 md:text-sm md:font-bold ${
                  isActive ? "border-brand bg-brand/15 text-navy" : "border-slate-200 bg-white"
                }`
              }
            >
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Creator Studio</span>
            </NavLink>
            <select
              className="h-9 w-11 shrink-0 rounded-lg border border-slate-200 bg-white px-1 text-xs font-bold uppercase text-slate-600 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 sm:w-16 sm:px-2"
              aria-label="Language"
              title={activeLanguage?.label || "Language"}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code.toUpperCase()}
                </option>
              ))}
            </select>
            {isAuthenticated ? (
              <>
                <NavLink
                  to="/wallet"
                  aria-label="NEX Wallet"
                  className={({ isActive }) =>
                    `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-slate-600 transition hover:border-brand hover:bg-brand/10 hover:text-navy ${
                      isActive ? "border-brand bg-brand/15 text-navy" : "border-slate-200 bg-white"
                    }`
                  }
                  title="NEX Wallet"
                >
                  <Wallet className="h-5 w-5" />
                </NavLink>
                <NotificationBell />
                <Link to="/settings" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Settings & Privacy" title="Settings & Privacy">
                  <Settings className="h-5 w-5" />
                </Link>
              </>
            ) : (
              <Link to="/login" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Login">
                <LogIn className="h-5 w-5" />
              </Link>
            )}
          </div>
        </nav>
      </header>

      <Upload open={uploadOpen} initialType={uploadType} onClose={() => setUploadOpen(false)} />

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto grid w-full max-w-xs grid-cols-5 items-end gap-1">
          {bottomNavItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass} onClick={item.to === "/" ? refreshHomeIfActive : undefined}>
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            className="flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold text-navy"
            onClick={() => openUpload("image")}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-navy shadow-lg ring-4 ring-white">
              <Plus className="h-5 w-5" />
            </span>
            <span>Upload</span>
          </button>

          {bottomNavItems.slice(2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass}>
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {item.badge ? (
                    <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default Navbar;
