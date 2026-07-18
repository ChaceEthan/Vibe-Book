// @ts-nocheck
import {
  Home,
  LogIn,
  MessageCircle,
  Settings,
  User,
  Users,
} from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import Upload from "./Upload.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { messageApi } from "../services/api";
import { connectSocket } from "../services/socket";
import { useLiveStreamStore } from "../store/livestreamStore";

const navClass = ({ isActive }) =>
  `group flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-0.5 text-[10px] font-black transition duration-200 sm:text-[11px] ${
    isActive ? "active rounded-lg bg-white/10 text-brand" : "text-slate-200 hover:bg-white/5 hover:text-white"
  }`;

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const notificationTitleFor = (payload = {}, fallback = "New message") => payload.sender?.name || payload.name || fallback;

const notificationBodyFor = (payload = {}) => payload.message || payload.text || "Open VibeBook to view it";

const Navbar = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState("image");
  const { isAuthenticated, user, token } = useAuth();
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
      { to: "/search", label: "Friends", icon: Users },
      { to: isAuthenticated ? "/chat" : "/login", label: "Chat", icon: MessageCircle, badge: unreadCount },
      { to: isAuthenticated && user?._id ? `/profile/${user._id}` : "/login", label: "Profile", icon: User },
    ],
    [isAuthenticated, unreadCount, user?._id]
  );

  const isHome = location.pathname === "/";
  const isImmersiveRoute = isHome || location.pathname === "/live" || location.pathname.startsWith("/live/");

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
      {!isImmersiveRoute && (
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
          <nav className="mx-auto flex min-h-14 w-full max-w-full items-center justify-between gap-1.5 overflow-hidden px-2 sm:min-h-16 sm:gap-3 sm:px-6 lg:max-w-7xl lg:px-8">
            <Link to="/" className="flex shrink-0 items-center gap-1.5 overflow-hidden transition-all sm:gap-3" onClick={refreshHomeIfActive}>
              <img src="/logo.png" alt="VibeBook logo" className="h-8 w-8 rounded-lg object-cover sm:h-10 sm:w-10" />
              <span className="whitespace-nowrap text-base font-black text-navy sm:text-lg">VibeBook</span>
            </Link>

            <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
              {isAuthenticated ? (
                <>
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
      )}

      <Upload open={uploadOpen} initialType={uploadType} onClose={() => setUploadOpen(false)} />

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-brand/25 bg-[#050806] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.48)]">
        <div className="mx-auto grid h-[3.7rem] w-full max-w-md grid-cols-5 items-center gap-0 bg-[#050806] px-1">
          {bottomNavItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass} onClick={item.to === "/" ? refreshHomeIfActive : undefined}>
                <Icon className="h-5 w-5 stroke-[2.4] transition group-[.active]:drop-shadow-[0_0_12px_rgba(34,197,94,0.75)]" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            className="flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-0.5 text-[10px] font-black text-white transition hover:bg-white/5 active:scale-95 sm:text-[11px]"
            onClick={() => openUpload("image")}
            aria-label="Upload new content"
            title="Upload new content"
          >
            <span className="vibebook-upload-button relative flex h-10 w-11 items-center justify-center">
              <span className="absolute inset-1 rounded-xl bg-brand/35 blur-md" />
              <span className="relative flex h-8 w-10 items-center justify-center rounded-xl border border-white/20 bg-gradient-to-br from-emerald-300 via-brand to-teal-400 shadow-[0_0_16px_rgba(34,197,94,0.38)]">
                <span className="vibebook-v-mark">V</span>
              </span>
            </span>
            <span className="font-black">Upload</span>
          </button>

          {bottomNavItems.slice(2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass}>
                <span className="relative">
                  <Icon className="h-5 w-5 stroke-[2.4] transition group-[.active]:drop-shadow-[0_0_12px_rgba(34,197,94,0.75)]" />
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
