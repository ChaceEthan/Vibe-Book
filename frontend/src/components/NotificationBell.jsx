// @ts-nocheck
import { Bell, CheckCheck, MessageCircle, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { notificationApi } from "../services/api";
import { connectSocket } from "../services/socket";

const iconForType = (type) => {
  if (type === "follow") return UserPlus;
  if (type === "message" || type === "group_message" || type === "mention") return MessageCircle;
  return Bell;
};

export function NotificationBell() {
  const { isAuthenticated, token, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seenRealtimeRef = useRef(new Set());

  const visibleNotifications = useMemo(() => notifications.slice(0, 12), [notifications]);

  const fetchNotifications = async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);
    try {
      const { data } = await notificationApi.list({ limit: 12 });
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
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
    if (!isAuthenticated || !token || !user?._id) {
      return undefined;
    }

    const socket = connectSocket(token);

    if (!socket) {
      return undefined;
    }

    const handleNotification = (payload = {}) => {
      const notification = payload.notification || payload;
      const id = notification?._id?.toString?.() || "";

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
      fetchNotifications();
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
      await notificationApi.markRead(notification._id);
    } catch {
      fetchNotifications();
    }
  };

  const markAllAsRead = async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);

    try {
      await notificationApi.markAllRead();
    } catch {
      fetchNotifications();
    }
  };

  const deleteNotification = async (notificationId) => {
    setNotifications((current) => current.filter((item) => item._id !== notificationId));

    try {
      await notificationApi.delete(notificationId);
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
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-black leading-4 text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
            <h3 className="text-sm font-black text-navy">Notifications</h3>
            <div className="flex items-center gap-1">
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={markAllAsRead} aria-label="Mark all as read">
                <CheckCheck className="h-4 w-4" />
              </button>
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close notifications">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && !visibleNotifications.length ? (
              <div className="p-6 text-center text-sm font-bold text-slate-500">Loading...</div>
            ) : visibleNotifications.length ? (
              <div className="divide-y divide-slate-100">
                {visibleNotifications.map((notification) => {
                  const Icon = iconForType(notification.type);
                  return (
                    <article key={notification._id} className={`${notification.read ? "bg-white" : "bg-brand/10"} p-4`}>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-navy">
                          <Icon className="h-4 w-4" />
                        </span>
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => markAsRead(notification)}>
                          <p className="truncate text-sm font-black text-navy">{notification.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{notification.message}</p>
                          <p className="mt-2 text-xs font-bold text-slate-400">{new Date(notification.createdAt).toLocaleDateString()}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteNotification(notification._id)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                          aria-label="Delete notification"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-sm font-bold text-slate-500">No notifications</div>
            )}
          </div>

          <div className="border-t border-slate-200 p-3 text-center">
            <Link to="/creator-studio" className="text-sm font-bold text-navy hover:text-brand" onClick={() => setOpen(false)}>
              Open Creator Studio
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
