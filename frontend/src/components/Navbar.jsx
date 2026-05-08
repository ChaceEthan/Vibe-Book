// @ts-nocheck
import {
  Compass,
  Home,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  Settings,
  User,
} from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import Upload from "./Upload.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { messageApi } from "../services/api";
import { connectSocket } from "../services/socket";

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
  const { isAuthenticated, logout, user, token } = useAuth();
  const { language, languages, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const notificationCacheRef = useRef(new Map());
  const audioContextRef = useRef(null);

  const navItems = useMemo(
    () => [
      { to: "/", label: "Home", icon: Home },
      { to: "/explore", label: "Explore", icon: Compass },
      { to: isAuthenticated ? "/chat" : "/login", label: "Chat", icon: MessageCircle, badge: unreadCount },
      { to: isAuthenticated ? "/dashboard" : "/login", label: "Profile", icon: User },
    ],
    [isAuthenticated, unreadCount]
  );

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

    const socket = connectSocket(token);

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

    socket.on("receive_message", handleDirectMessage);
    socket.on("receive_group_message", handleGroupMessage);
    socket.on("unread:update", handleUnreadUpdate);

    return () => {
      socket.off("receive_message", handleDirectMessage);
      socket.off("receive_group_message", handleGroupMessage);
      socket.off("unread:update", handleUnreadUpdate);
    };
  }, [isAuthenticated, token, user?._id, user?.name]);

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

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="container-page flex min-h-16 items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="VibeBook logo" className="h-10 w-10 rounded-lg object-cover" />
            <span className="truncate text-lg font-black text-navy">VibeBook</span>
          </Link>

          <div className="flex items-center gap-2">
            <select
              className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 sm:block"
              aria-label="Language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            {isAuthenticated ? (
              <>
                {(user?.role === "admin" || user?.accountRole === "admin") && (
                  <Link to="/admin" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Admin">
                    <User className="h-5 w-5" />
                  </Link>
                )}
                <Link to="/settings" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Settings">
                  <Settings className="h-5 w-5" />
                </Link>
                <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={handleLogout} aria-label="Logout">
                  <LogOut className="h-5 w-5" />
                </button>
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
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end gap-1">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass}>
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            className="-mt-8 flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold text-navy"
            onClick={() => openUpload("image")}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-navy shadow-lg ring-4 ring-white">
              <Plus className="h-8 w-8" />
            </span>
            <span>Upload</span>
          </button>

          {navItems.slice(2).map((item) => {
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
