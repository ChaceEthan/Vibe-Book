// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl, messageApi } from "../services/api";

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const Chat = () => {
  const { userId } = useParams();
  const { user, payAccess } = useAuth();
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [online, setOnline] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadConversation = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const { data } = await messageApi.getConversation(userId);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setOtherUser(data?.otherUser || null);
      setOnline(Boolean(data?.online));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load chat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversation();
    const timer = setInterval(() => loadConversation({ silent: true }), 7000);
    return () => clearInterval(timer);
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async (event) => {
    event.preventDefault();

    if (!message.trim()) {
      return;
    }

    setSending(true);
    setStatus("");
    setError("");

    try {
      await messageApi.sendDirect(userId, { message: message.trim() });
      setMessage("");
      await loadConversation({ silent: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Message failed.");
    } finally {
      setSending(false);
    }
  };

  const handlePayAccess = async () => {
    setStatus("");
    setError("");

    try {
      await payAccess();
      setStatus("Chat unlocked.");
      await loadConversation();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to unlock chat.");
    }
  };

  return (
    <section className="container-page py-10">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-brand">Chat</p>
          <h1 className="mt-2 text-3xl font-black text-navy">{otherUser?.name || "Messages"}</h1>
          {otherUser && (
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-500" : "bg-slate-300"}`} />
              {online ? "Online" : "Offline"}
            </p>
          )}
        </div>
        <Link to="/inbox" className="btn-secondary">
          Inbox
        </Link>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          {error.toLowerCase().includes("pay") && (
            <button type="button" className="btn-primary mt-3" onClick={handlePayAccess}>
              Pay to unlock chat
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-soft">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <img
            src={mediaUrl(otherUser?.profilePicture || otherUser?.profileImage || otherUser?.images?.[0] || otherUser?.gallery?.[0])}
            alt=""
            className="h-12 w-12 rounded-lg object-cover"
          />
          <div>
            <p className="font-bold text-navy">{otherUser?.name || "Conversation"}</p>
            <p className="text-xs capitalize text-slate-500">{otherUser?.role || "VibeBook user"}</p>
          </div>
        </div>

        <div className="max-h-[520px] min-h-80 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
          ) : messages.length ? (
            messages.map((item) => {
              const isMine = item.sender?._id === user?._id || item.sender === user?._id;
              return (
                <div key={item._id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-lg p-3 ${isMine ? "bg-brand text-navy" : "bg-surface text-slate-700"}`}>
                    <p className="whitespace-pre-line text-sm leading-6">{item.message}</p>
                    <p className="mt-2 text-[11px] opacity-70">{formatTime(item.createdAt)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate-600">No messages yet.</p>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row" onSubmit={handleSend}>
          <input
            className="field flex-1"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Write a message"
          />
          <button type="submit" className="btn-primary" disabled={sending || !message.trim()}>
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default Chat;
