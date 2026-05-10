// @ts-nocheck
import { Bell, CheckCheck, Heart, MessageCircle, MessageSquare, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl, notificationApi } from "../services/api";
import { connectSocket } from "../services/socket";

const notificationTypes = [
  { value: "all", label: "All", icon: Bell },
  { value: "like", label: "Likes", icon: Heart },
  { value: "comment", label: "Comments", icon: MessageSquare },
  { value: "follow", label: "Follows", icon: UserPlus },
  { value: "message", label: "Messages", icon: MessageCircle },
  { value: "group_message", label: "Groups", icon: MessageCircle },
  { value: "mention", label: "Mentions", icon: MessageCircle },
];

const iconForType = (type) => {
  if (type === "follow") return UserPlus;
  if (type === "like") return Heart;
  if (type === "comment") return MessageSquare;
  if (type === "message" || type === "group_message" || type === "mention") return MessageCircle;
  return Bell;
};

const colorForType = (type) => {
  if (type === "follow") return "bg-green-100 text-green-600";
  if (type === "like") return "bg-red-100 text-red-600";
  if (type === "comment") return "bg-blue-100 text-blue-600";
  if (type === "message" || type === "group_message" || type === "mention") return "bg-purple-100 text-purple-600";
  return "bg-slate-100 text-slate-600";
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

const mergeNotificationPage = (current, nextItems, replace = false) => {
  if (replace) return nextItems;

  const byId = new Map();
  [...current, ...nextItems].forEach((item) => {
    const id = idOf(item);
    if (id) byId.set(id, { ...(byId.get(id) || {}), ...item });
  });
  return Array.from(byId.values()).sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
};

const SkeletonLoader = () => (
  <div className="space-y-3 animate-pulse">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-3 rounded-lg border border-slate-200 p-4">
        <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-200" />
          <div className="h-3 w-1/2 rounded bg-slate-200" />
        </div>
      </div>
    ))}
  </div>
);

export default function NotificationCenter() {
  const { isAuthenticated, user, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const seenRealtimeRef = useRef(new Set());
  const observerRef = useRef(null);

  const filteredNotifications = useMemo(() => {
    if (selectedType === "all") return notifications;
    return notifications.filter((n) => n.type === selectedType);
  }, [notifications, selectedType]);

  const fetchNotifications = async (pageNum = 1, reset = false) => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const isInitial = pageNum === 1 && reset;
    if (isInitial) {
      setLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const type = selectedType === "all" ? "" : selectedType;
      const { data } = await notificationApi.list({
        limit: 20,
        page: pageNum,
        ...(type && { type }),
      });

      const newNotifications = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications((prev) => mergeNotificationPage(prev, newNotifications, pageNum === 1));
      setUnreadCount(Number(data.unreadCount || 0));
      setHasMore(data.pagination?.page < data.pagination?.pages);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      if (pageNum === 1) {
        setNotifications([]);
      }
    } finally {
      if (isInitial) {
        setLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  };

  // Initial fetch
  useEffect(() => {
    setPage(1);
    fetchNotifications(1, true);
  }, [isAuthenticated, selectedType]);

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

  // Setup real-time socket
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

        const updated = notification?._id ? [notification, ...current] : current;
        return updated;
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

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchNotifications(nextPage);
        }
      },
      { threshold: 0.1 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [page, hasMore, isLoadingMore, loading]);

  const markAsRead = async (notification) => {
    if (!notification?._id || notification.read) {
      return;
    }

    setNotifications((current) =>
      current.map((item) => (item._id === notification._id ? { ...item, read: true } : item))
    );
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
      fetchNotifications(1, true);
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
      fetchNotifications(1, true);
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
      fetchNotifications(1, true);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Sign in required</h1>
          <p className="mt-2 text-slate-600">
            <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
              Sign in to view notifications
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
            <button
              type="button"
              onClick={markAllAsRead}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-blue-600 transition duration-200 hover:bg-blue-50"
              disabled={unreadCount === 0}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          </div>

          {/* Type filters */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {notificationTypes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedType(value)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition duration-200 ${
                  selectedType === value
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-4 py-6">
        {loading ? (
          <SkeletonLoader />
        ) : filteredNotifications.length ? (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => {
              const Icon = iconForType(notification.type);
              const actor = actorFor(notification);
              const avatar = avatarFor(notification);
              return (
                <article
                  key={notification._id}
                  className={`flex gap-4 rounded-xl border border-slate-200 p-4 transition duration-200 hover:shadow-md ${
                    notification.read ? "bg-white" : "bg-blue-50"
                  }`}
                >
                  {/* Icon badge */}
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ${colorForType(notification.type)}`}>
                    {avatar ? (
                      <img src={mediaUrl(avatar)} alt="" className="h-full w-full object-cover" />
                    ) : actor?.name ? (
                      <span className="text-sm font-black">{initialsFor(actor.name)}</span>
                    ) : (
                      <Icon className="h-6 w-6" />
                    )}
                  </div>

                  {/* Content */}
                  <button
                    type="button"
                    onClick={() => markAsRead(notification)}
                    className="min-w-0 flex-1 text-left transition duration-200 hover:opacity-70"
                  >
                    <h3 className="truncate text-sm font-bold text-slate-900">{notification.title}</h3>
                    {actor?.username || actor?.name ? (
                      <p className="mt-1 truncate text-xs font-black text-slate-500">@{actor.username || actor.name}</p>
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{notification.message}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <time>{relativeTimeFor(notification.createdAt)}</time>
                      {!notification.read && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                    </div>
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => deleteNotification(notification._id)}
                    className="rounded-lg p-2 text-slate-400 transition duration-200 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete notification"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </article>
              );
            })}

            {/* Load more observer */}
            {hasMore && (
              <div ref={observerRef} className="py-8 text-center">
                {isLoadingMore ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Scroll to load more</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 py-16 text-center">
            <Bell className="h-16 w-16 text-slate-300" />
            <h2 className="text-lg font-semibold text-slate-600">No notifications</h2>
            <p className="text-sm text-slate-500">
              {selectedType === "all"
                ? "You're all caught up! Check back later for updates."
                : `No ${notificationTypes.find((t) => t.value === selectedType)?.label.toLowerCase()} yet.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
