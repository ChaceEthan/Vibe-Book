// @ts-nocheck
import { Bell, CheckCheck, Heart, MessageCircle, MessageSquare, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl, notificationApi } from "../services/api";
import { connectSocket } from "../services/socket";

const iconForType = (type) => {
  if (type === "follow") return UserPlus;
  if (type === "like") return Heart;
  if (type === "comment") return MessageSquare;
  if (type === "message" || type === "group_message" || type === "mention") return MessageCircle;
  return Bell;
};

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const initialsFor = (value = "VibeBook") =>
  String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "VB";

const actorFor = (notification = {}) => (notification.actorId && typeof notification.actorId === "object" ? notification.actorId : null);
const avatarFor = (notification = {}) => {
  const actor = actorFor(notification);
  return actor?.profilePicture || actor?.profileImage || "";
};
const NOTIFICATION_SYNC_EVENT = "vibebook:notifications-unread";
const broadcastNotificationSync = (detail = {}) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT, { detail }));
  }
};

const relativeTimeFor = (value) => {
  const timestamp = value ? new Date(value).getTime() : 0;

  if (!timestamp || Number.isNaN(timestamp)) return "now";

  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function NotificationBell() {
  const { isAuthenticated, token, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seenRealtimeRef = useRef(new Set());
  const fetchInFlightRef = useRef(false);
  const panelRef = useRef(null);

  const visibleNotifications = useMemo(() => notifications.slice(0, 12), [notifications]);

  const fetchNotifications = async () => {
    if (fetchInFlightRef.current) {
      return;
    }

    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    fetchInFlightRef.current = true;
    setLoading(true);
    try {
      const { data } = await notificationApi.list({ limit: 12 });
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      fetchInFlightRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    if (!isAuthenticated) {
      return undefined;
    }

    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    const handleSync = (event) => {
      const detail = event.detail || {};

      if (detail.unreadCount !== undefined) {
        setUnreadCount(Number(detail.unreadCount || 0));
      }

      if (detail.allRead) {
        setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      } else if (detail.readId) {
        setNotifications((current) => current.map((item) => (item._id === detail.readId ? { ...item, read: true } : item)));
      } else if (detail.deletedId) {
        setNotifications((current) => current.filter((item) => item._id !== detail.deletedId));
      }
    };

    window.addEventListener(NOTIFICATION_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(NOTIFICATION_SYNC_EVENT, handleSync);
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        const isButton = event.target?.closest('[aria-label="Notifications"]');
        if (!isButton) {
          setOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!isAuthenticated || !token || !user?._id) {
      return undefined;
    }

    const socket = connectSocket(token);

    if (!socket) {
      return undefined;
    }

    const handleNotification = (payload = {}) => {
      const notification = payload.notification || payload;
      const id = idOf(notification);

      if (id && seenRealtimeRef.current.has(id)) {
        return;
      }

      if (id) {
        seenRealtimeRef.current.add(id);
      }

      setNotifications((current) => {
        if (id && current.some((item) => item._id === id)) {
          return current;
        }

        return notification?._id ? [notification, ...current].slice(0, 20) : current;
      });
      if (payload.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      } else {
        setUnreadCount((current) => Number(current || 0) + 1);
      }
    };

    socket.on("notification:new", handleNotification);
    return () => {
      socket.off("notification:new", handleNotification);
    };
  }, [isAuthenticated, token, user?._id]);

  const markAsRead = async (notification) => {
    if (!notification?._id || notification.read) {
      return;
    }

    setNotifications((current) => current.map((item) => (item._id === notification._id ? { ...item, read: true } : item)));
    setUnreadCount((current) => Math.max(0, Number(current || 0) - 1));

    try {
      const { data } = await notificationApi.markRead(notification._id);
      if (data?.unreadCount !== undefined) {
        setUnreadCount(Number(data.unreadCount || 0));
        broadcastNotificationSync({ unreadCount: Number(data.unreadCount || 0), readId: notification._id });
      }
    } catch {
      fetchNotifications();
    }
  };

  const markAllAsRead = async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    broadcastNotificationSync({ unreadCount: 0, allRead: true });

    try {
      const { data } = await notificationApi.markAllRead();
      if (data?.unreadCount !== undefined) {
        setUnreadCount(Number(data.unreadCount || 0));
        broadcastNotificationSync({ unreadCount: Number(data.unreadCount || 0), allRead: true });
      }
    } catch {
      fetchNotifications();
    }
  };

  const deleteNotification = async (notificationId) => {
    const removed = notifications.find((item) => item._id === notificationId);
    setNotifications((current) => current.filter((item) => item._id !== notificationId));
    if (removed && !removed.read) {
      setUnreadCount((current) => Math.max(0, Number(current || 0) - 1));
    }

    try {
      const { data } = await notificationApi.delete(notificationId);
      if (data?.unreadCount !== undefined) {
        setUnreadCount(Number(data.unreadCount || 0));
        broadcastNotificationSync({ unreadCount: Number(data.unreadCount || 0), deletedId: notificationId });
      }
    } catch {
      fetchNotifications();
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() =>
          setOpen((value) => {
            const nextOpen = !value;
            if (nextOpen) {
              fetchNotifications();
            }
            return nextOpen;
          })
        }
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-center text-[10px] font-bold leading-none text-white shadow-md">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop for mobile/tablet */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
            role="presentation"
          />

          {/* Notification panel */}
          <div
            ref={panelRef}
            className="fixed inset-x-3 top-16 z-50 max-h-[calc(100svh-5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[min(22rem,calc(100vw-2rem))] sm:max-h-[min(500px,calc(100vh-5rem))]"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-600 transition duration-200 hover:bg-white hover:text-slate-900"
                  onClick={markAllAsRead}
                  aria-label="Mark all as read"
                  title="Mark all as read"
                  disabled={unreadCount === 0}
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-600 transition duration-200 hover:bg-white hover:text-slate-900"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[calc(100svh-10rem)] overflow-y-auto sm:max-h-[430px]">
              {loading && !visibleNotifications.length ? (
                <div className="flex items-center justify-center gap-2 px-6 py-8">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                </div>
              ) : visibleNotifications.length ? (
                <div className="divide-y divide-slate-100">
                  {visibleNotifications.map((notification) => {
                    const Icon = iconForType(notification.type);
                    const actor = actorFor(notification);
                    const avatar = avatarFor(notification);
                    return (
                      <article
                        key={notification._id}
                        className={`p-3 transition duration-200 hover:bg-slate-50 ${notification.read ? "bg-white" : "bg-blue-50"}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon badge */}
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${notification.read ? "bg-slate-200 text-slate-600" : "bg-blue-200 text-blue-600"}`}>
                            {avatar ? (
                              <img src={mediaUrl(avatar)} alt="" className="h-full w-full object-cover" />
                            ) : actor?.name ? (
                              <span className="text-xs font-black">{initialsFor(actor.name)}</span>
                            ) : (
                              <Icon className="h-5 w-5" />
                            )}
                          </div>

                          {/* Content */}
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left transition duration-200 hover:opacity-70"
                            onClick={() => {
                              markAsRead(notification);
                              setTimeout(() => setOpen(false), 100);
                            }}
                          >
                            <p className="truncate text-sm font-semibold text-slate-900">{notification.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{notification.message}</p>
                            <p className="mt-1 text-xs font-medium text-slate-400">
                              {relativeTimeFor(notification.createdAt)}
                            </p>
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => deleteNotification(notification._id)}
                            className="rounded-lg p-1 text-slate-400 transition duration-200 hover:bg-red-50 hover:text-red-600"
                            aria-label="Delete notification"
                            title="Delete"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                  <Bell className="h-12 w-12 text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">No notifications yet</p>
                  <p className="text-xs text-slate-400">We'll notify you when something happens</p>
                </div>
              )}
            </div>

            {/* Footer - View all link */}
            {visibleNotifications.length > 0 && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-center">
                <Link
                  to="/notifications"
                  className="text-sm font-semibold text-blue-600 transition duration-200 hover:text-blue-700"
                  onClick={() => setOpen(false)}
                >
                  View all notifications
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationBell;
