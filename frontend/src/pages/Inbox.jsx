// @ts-nocheck
import { MessageCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl, messageApi } from "../services/api";

const getErrorMessage = (error) => error.response?.data?.message || "Unable to load messages.";

const idOf = (value) => value?._id || value || "";

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const buildConversations = (messages, currentUserId) => {
  const byUser = new Map();

  messages.forEach((message) => {
    const senderId = idOf(message.sender);
    const recipientId = idOf(message.recipient);
    const otherUser = senderId === currentUserId ? message.recipient : message.sender;
    const otherUserId = idOf(otherUser);

    if (!otherUserId || byUser.has(otherUserId)) {
      return;
    }

    byUser.set(otherUserId, {
      user: otherUser,
      lastMessage: message,
      unreadCount: recipientId === currentUserId && !message.readAt ? 1 : 0,
      online: false,
    });
  });

  return Array.from(byUser.values());
};

const Inbox = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadInbox = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const { data } = await messageApi.getInbox();
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const nextConversations = Array.isArray(data?.conversations)
        ? data.conversations
        : buildConversations(messages, user?._id);
      setConversations(nextConversations);
    } catch (requestError) {
      setConversations([]);
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => {
    loadInbox();
    const timer = setInterval(() => loadInbox({ silent: true }), 10000);
    return () => clearInterval(timer);
  }, [loadInbox]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0),
    [conversations]
  );

  return (
    <section className="container-page py-6 sm:py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase text-brand">Chat</p>
          <h1 className="mt-2 text-3xl font-black text-navy">Inbox</h1>
        </div>
        {totalUnread > 0 && (
          <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">{totalUnread} unread</span>
        )}
      </div>

      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="rounded-lg border border-slate-200 bg-white shadow-soft">
        {loading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : conversations.length ? (
          <div className="divide-y divide-slate-100">
            {conversations.map((item) => {
              const otherUser = item.user || {};
              const image = otherUser.profilePicture || otherUser.profileImage || otherUser.images?.[0] || otherUser.gallery?.[0];

              return (
                <Link key={otherUser._id} to={`/chat/${otherUser._id}`} className="flex items-center gap-3 p-4 transition hover:bg-slate-50">
                  <span className="relative shrink-0">
                    <img src={mediaUrl(image)} alt="" className="h-14 w-14 rounded-full object-cover" />
                    <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${item.online ? "bg-green-500" : "bg-slate-300"}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate font-black text-navy">{otherUser.name || "VibeBook user"}</span>
                      <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatTime(item.lastMessage?.createdAt)}</span>
                    </span>
                    <span className="mt-1 block truncate text-sm text-slate-500">{item.lastMessage?.message || "Open chat"}</span>
                  </span>
                  {item.unreadCount > 0 && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-2 text-xs font-black text-navy">
                      {item.unreadCount > 9 ? "9+" : item.unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <MessageCircle className="h-10 w-10 text-brand" />
            <h2 className="mt-4 text-xl font-black text-navy">No conversations yet</h2>
            <Link to="/search" className="btn-primary mt-5">
              Explore profiles
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default Inbox;
