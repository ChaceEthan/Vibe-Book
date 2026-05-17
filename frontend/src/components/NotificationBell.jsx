// @ts-nocheck
import { BadgeCheck, Bell, CheckCheck, Heart, MessageCircle, MessageSquare, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";

import SafeAvatar from "./SafeAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl, notificationApi } from "../services/api";
import { connectSocket } from "../services/socket";
import {
  NOTIFICATION_SYNC_EVENT,
  actorFor,
  actorVerified,
  avatarFor,
  broadcastNotificationSync,
  groupNotificationsBySection,
  idOf,
  relativeNotificationTime,
  safeNavigateToNotification,
} from "../utils/notifications";

const iconForType = (type) => {
  if (type === "account_verification") return BadgeCheck;
  if (type === "follow") return UserPlus;
  if (type === "like") return Heart;
  if (type === "comment") return MessageSquare;
  if (type === "message" || type === "group_message" || type === "group_invite" || type === "mention") return MessageCircle;
  return Bell;
};

export function NotificationBell() {
  const { isAuthenticated, token, user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [panelPosition, setPanelPosition] = useState({});
  const seenRealtimeRef = useRef(new Set());
  const fetchInFlightRef = useRef(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);

  const visibleNotifications = useMemo(() => notifications.slice(0, 16), [notifications]);
  const notificationSections = useMemo(() => groupNotificationsBySection(visibleNotifications), [visibleNotifications]);

  const openNotifications = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setOpen(true);
    window.setTimeout(fetchNotifications, 0);
  };

  const closeNotifications = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setOpen(false);
  };

  const toggleNotifications = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (open) {
      setOpen(false);
      return;
    }

    openNotifications();
  };

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

      if (detail.cleared) {
        setNotifications([]);
      } else if (detail.allRead) {
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

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerOutside, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerOutside, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const updatePanelPosition = () => {
      if (typeof window === "undefined" || !rootRef.current) {
        return;
      }

      if (!window.matchMedia("(min-width: 768px)").matches) {
        setPanelPosition({});
        return;
      }

      const rect = rootRef.current.getBoundingClientRect();
      setPanelPosition({
        top: Math.round(rect.bottom + 10),
        right: Math.max(12, Math.round(window.innerWidth - rect.right)),
      });
    };

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
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
    const optimisticUnread = Math.max(0, Number(unreadCount || 0) - 1);
    setUnreadCount(optimisticUnread);
    broadcastNotificationSync({ unreadCount: optimisticUnread, readId: notification._id });

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
      const optimisticUnread = Math.max(0, Number(unreadCount || 0) - 1);
      setUnreadCount(optimisticUnread);
      broadcastNotificationSync({ unreadCount: optimisticUnread, deletedId: notificationId });
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

  const clearAllNotifications = async () => {
    const previous = notifications;
    setNotifications([]);
    setUnreadCount(0);
    broadcastNotificationSync({ unreadCount: 0, allRead: true, cleared: true });

    try {
      await notificationApi.clearAll();
    } catch {
      setNotifications(previous);
      fetchNotifications();
    }
  };

  const openNotification = (notification) => {
    markAsRead(notification);
    setOpen(false);
    safeNavigateToNotification(navigate, notification, user);
  };

  const NotificationRow = ({ notification }) => {
    const Icon = iconForType(notification.type);
    const actor = actorFor(notification);
    const avatar = avatarFor(notification);
    const verified = actorVerified(actor);

    return (
      <article className={`rounded-lg border p-3 transition duration-200 hover:bg-slate-50 ${notification.read ? "border-slate-200 bg-white" : "border-brand/40 bg-brand/10"}`}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative h-10 w-10 shrink-0">
            <div className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full ${notification.read ? "bg-slate-100 text-slate-600" : "bg-slate-950 text-brand"}`}>
              {actor || avatar ? <SafeAvatar user={actor} src={avatar ? mediaUrl(avatar) : ""} className="h-full w-full object-cover" /> : <Icon className="h-5 w-5" />}
            </div>
            {verified && <BadgeCheck className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full fill-sky-500 text-white ring-2 ring-white" />}
          </div>

          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openNotification(notification)}>
            <div className="flex min-w-0 items-start justify-between gap-2">
              <p className="min-w-0 break-words text-sm font-black leading-5 text-slate-950">{notification.title || "Notification"}</p>
              {!notification.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand ring-2 ring-white" />}
            </div>
            {actor?.username || actor?.name ? <p className="mt-0.5 truncate text-xs font-black text-slate-500">@{actor.username || actor.name}</p> : null}
            <p className="mt-1 line-clamp-3 break-words text-sm leading-5 text-slate-600">{notification.message || "Open VibeBook to view this update."}</p>
            <p className="mt-2 text-xs font-bold text-slate-400">{relativeNotificationTime(notification.createdAt)}</p>
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              deleteNotification(notification._id);
            }}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            aria-label="Delete notification"
            title="Delete"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </article>
    );
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div ref={rootRef} className={`relative ${open ? "z-[90]" : ""}`}>
      <button
        type="button"
        onClick={toggleNotifications}
        onPointerDown={(event) => event.stopPropagation()}
        className="relative z-[92] inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95"
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="notification-panel"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-center text-[10px] font-bold leading-none text-white shadow-md">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[110] bg-slate-950/25 backdrop-blur-sm md:hidden" onClick={closeNotifications} role="presentation" />
            <div
              id="notification-panel"
              ref={panelRef}
              className="notification-panel-in fixed inset-x-3 bottom-0 z-[120] flex max-h-[86dvh] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl md:inset-x-auto md:bottom-auto md:w-[min(25rem,calc(100vw-1.5rem))] md:max-h-[min(620px,calc(100vh-5rem))] md:rounded-2xl"
              style={panelPosition}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-navy">Notifications</h3>
                    <p className="mt-0.5 text-xs font-bold text-slate-500">{unreadCount} unread</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-brand/20 hover:text-navy disabled:opacity-40"
                      onClick={markAllAsRead}
                      aria-label="Mark all as read"
                      title="Mark all as read"
                      disabled={unreadCount === 0}
                    >
                      <CheckCheck className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      onClick={clearAllNotifications}
                      aria-label="Clear all notifications"
                      title="Clear all"
                      disabled={!notifications.length}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-navy"
                      onClick={closeNotifications}
                      aria-label="Close notifications"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                {loading && !visibleNotifications.length ? (
                  <div className="space-y-3">
                    {[0, 1, 2, 3].map((item) => (
                      <div key={item} className="flex animate-pulse gap-3 rounded-lg border border-slate-100 bg-white p-3">
                        <div className="h-10 w-10 rounded-full bg-slate-200" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-3 w-2/3 rounded bg-slate-200" />
                          <div className="h-3 w-full rounded bg-slate-100" />
                          <div className="h-3 w-1/3 rounded bg-slate-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notificationSections.length ? (
                  <div className="space-y-4">
                    {notificationSections.map((section) => (
                      <section key={section.id} className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">{section.label}</h4>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{section.items.length}</span>
                        </div>
                        <div className="space-y-2">
                          {section.items.map((notification) => <NotificationRow key={notification._id} notification={notification} />)}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                    <Bell className="h-12 w-12 text-slate-300" />
                    <p className="text-base font-black text-navy">No notifications</p>
                    <p className="text-sm font-semibold text-slate-500">You are all caught up.</p>
                  </div>
                )}
              </div>

              {visibleNotifications.length > 0 && (
                <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-center">
                  <Link to="/notifications" className="text-sm font-black text-navy transition hover:text-brand" onClick={() => setOpen(false)}>
                    View all notifications
                  </Link>
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

export default NotificationBell;
