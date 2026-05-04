// @ts-nocheck
import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { messageApi } from "../services/api";

const getErrorMessage = (error) => error.response?.data?.message || "Unable to load messages.";

const Inbox = () => {
  const { payAccess } = useAuth();
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadInbox = async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await messageApi.getInbox();
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch (requestError) {
      setMessages([]);
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInbox();
  }, []);

  const openMessage = async (messageId) => {
    setStatus("");
    setError("");

    try {
      const { data } = await messageApi.getById(messageId);
      setSelectedMessage(data.inboxMessage);
      await loadInbox();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  const handleReply = async (event) => {
    event.preventDefault();

    if (!selectedMessage || !reply.trim()) {
      return;
    }

    setSending(true);
    setStatus("");
    setError("");

    try {
      await messageApi.reply(selectedMessage._id, { message: reply.trim() });
      setReply("");
      setStatus("Reply sent.");
      await loadInbox();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSending(false);
    }
  };

  const handlePayAccess = async () => {
    setError("");
    setStatus("");

    try {
      await payAccess();
      setStatus("Access unlocked.");
      await loadInbox();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  };

  return (
    <section className="container-page py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase text-brand">Inbox</p>
        <h1 className="mt-2 text-3xl font-black text-navy">Messages</h1>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          {error.toLowerCase().includes("pay") && (
            <button type="button" className="btn-primary mt-3" onClick={handlePayAccess}>
              Pay to open messages
            </button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          {loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
          ) : messages.length ? (
            <div className="space-y-3">
              {messages.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  className="field w-full text-left"
                  onClick={() => openMessage(item._id)}
                >
                  <span className="block font-bold text-navy">{item.subject || "VibeBook message"}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    From {item.sender?.name || "VibeBook"} {item.readAt ? "" : "- unread"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-600">No messages yet.</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
          {selectedMessage ? (
            <div>
              <h2 className="text-xl font-black text-navy">{selectedMessage.subject || "VibeBook message"}</h2>
              <p className="mt-2 text-sm text-slate-500">From {selectedMessage.sender?.name || "VibeBook"}</p>
              <p className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-700">{selectedMessage.message}</p>

              <form className="mt-6 space-y-3" onSubmit={handleReply}>
                <textarea
                  className="field min-h-28 resize-y"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Write a reply"
                />
                <button type="submit" className="btn-primary" disabled={sending || !reply.trim()}>
                  {sending ? "Sending..." : "Reply"}
                </button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Select a message to open it.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default Inbox;
