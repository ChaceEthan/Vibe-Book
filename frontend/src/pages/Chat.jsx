// @ts-nocheck
import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock3, Copy, FileText, MessageCircle, MoreVertical, Paperclip, Reply, Search, Send, Trash2, UserPlus, Users, WifiOff, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import LiveAvatar from "../components/LiveAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl, messageApi, userApi } from "../services/api";
import { connectSocket, getChatId } from "../services/socket";

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatShortTime = (value) => {
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

const requestMessage = (requestError, fallback) => requestError?.response?.data?.message || requestError?.message || fallback;

const idOf = (value) =>
  value?.userId?._id?.toString?.() ||
  value?.userId?.id?.toString?.() ||
  value?.userId?.toString?.() ||
  value?.user?._id?.toString?.() ||
  value?.user?.id?.toString?.() ||
  value?.user?.toString?.() ||
  value?._id?.toString?.() ||
  value?.id?.toString?.() ||
  value?.toString?.() ||
  "";

const textOf = (value) => (typeof value === "string" ? value : "");

const messageSenderId = (item) => item?.senderId || idOf(item?.sender);
const messageReceiverId = (item) => item?.receiverId || idOf(item?.recipient || item?.receiver);
const messageKey = (item) =>
  item?.clientId ||
  item?._id ||
  `${messageSenderId(item)}:${messageReceiverId(item)}:${item?.createdAt || ""}:${item?.message || item?.text || ""}`;

const messageStatus = (item) => {
  if (item?.failed || item?.deliveryStatus === "failed") {
    return "failed";
  }

  if (item?.pending || item?.deliveryStatus === "sending") {
    return "sending";
  }

  return item?.deliveryStatus || item?.status || (item?.readAt ? "seen" : item?.deliveredAt ? "delivered" : "sent");
};

const normalizeSocketMessage = (item = {}) => ({
  ...item,
  type: "direct-message",
  senderId: messageSenderId(item),
  receiverId: messageReceiverId(item),
  sender: item.sender || item.senderId,
  recipient: item.recipient || item.receiver || item.receiverId,
  receiver: item.receiver || item.recipient || item.receiverId,
  message: textOf(item.message) || textOf(item.text),
  text: textOf(item.text) || textOf(item.message),
  attachments: Array.isArray(item.attachments) ? item.attachments : [],
  replyTo: item.replyTo,
  replyPreview: item.replyPreview,
  deletedAt: item.deletedAt,
  createdAt: item.createdAt || new Date().toISOString(),
  deliveryStatus: messageStatus(item),
});

const initialsFor = (value = "") => {
  const words = String(value || "VB").trim().split(/\s+/).slice(0, 2);
  return words.map((word) => word[0]?.toUpperCase()).join("") || "VB";
};

const avatarImageFor = (profile = {}) =>
  profile?.profilePicture || profile?.profileImage || profile?.images?.[0] || profile?.gallery?.[0] || "";

const Avatar = memo(({ profile, size = "h-9 w-9", className = "" }) => {
  const image = avatarImageFor(profile || {});
  return <LiveAvatar user={profile} src={image} className={`${size} shrink-0 rounded-full object-cover ${className}`} />;
});

Avatar.displayName = "Avatar";

const DeliveryState = ({ status, failed, onRetry }) => {
  const state = failed ? "failed" : status;

  if (state === "failed") {
    return (
      <button type="button" className="inline-flex items-center gap-1 font-bold text-red-700" onClick={onRetry}>
        <AlertCircle className="h-3.5 w-3.5" />
        Retry
      </button>
    );
  }

  if (state === "sending") {
    return (
      <span className="inline-flex items-center gap-1">
        <Clock3 className="h-3.5 w-3.5" />
        Sending
      </span>
    );
  }

  if (state === "delivered" || state === "seen") {
    return (
      <span className="inline-flex items-center gap-1">
        <CheckCheck className="h-3.5 w-3.5" />
        {state === "seen" ? "Seen" : "Delivered"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Check className="h-3.5 w-3.5" />
      Sent
    </span>
  );
};

const formatFileSize = (value = 0) => {
  const size = Number(value || 0);

  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentList = ({ attachments = [] }) => {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className="mt-2 grid gap-2">
      {attachments.map((attachment, index) => {
        const isImage = attachment.kind === "image" || String(attachment.mimeType || "").startsWith("image/");
        const href = mediaUrl(attachment.url);

        return isImage ? (
          <a key={`${attachment.url}-${index}`} href={href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-black/5 bg-white/20">
            <img src={href} alt={attachment.name || "Shared image"} className="max-h-56 w-full object-cover" loading="lazy" />
          </a>
        ) : (
          <a key={`${attachment.url}-${index}`} href={href} target="_blank" rel="noreferrer" className="flex max-w-xs items-center gap-2 rounded-lg border border-black/5 bg-white/30 p-2 text-xs font-bold">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{attachment.name || "Attachment"}</span>
              {formatFileSize(attachment.size) && <span className="block text-[11px] opacity-70">{formatFileSize(attachment.size)}</span>}
            </span>
          </a>
        );
      })}
    </div>
  );
};

const firstUrlIn = (text = "") => {
  const match = String(text || "").match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[),.]+$/, "") : "";
};

const LinkPreview = ({ text = "" }) => {
  const url = firstUrlIn(text);

  if (!url) {
    return null;
  }

  let label = url;
  try {
    label = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the original URL label if URL parsing fails.
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 flex max-w-xs items-center gap-2 rounded-lg border border-black/5 bg-white/30 p-2 text-xs font-bold">
      <Paperclip className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        <span className="block truncate text-[11px] opacity-70">{url}</span>
      </span>
    </a>
  );
};

const ReplyPreview = ({ preview }) => {
  if (!preview?.messageId && !preview?.snippet) {
    return null;
  }

  return (
    <div className="mb-2 border-l-2 border-current/40 bg-white/20 px-2 py-1 text-xs">
      <p className="truncate font-black opacity-80">{preview.senderName || "User"}</p>
      <p className="line-clamp-2 opacity-70">{preview.deleted ? "Original message was deleted" : preview.snippet || "Message"}</p>
    </div>
  );
};

const conversationTime = (item) => new Date(item?.lastMessage?.createdAt || item?.updatedAt || 0).getTime() || 0;
const sortConversations = (items = []) => [...items].sort((left, right) => conversationTime(right) - conversationTime(left));

const PersonRow = ({ profile, subtitle, unreadCount, online, onClick }) => (
  <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-surface">
    <span className="relative shrink-0">
      <Avatar profile={profile} size="h-12 w-12" />
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate font-black text-navy">{profile?.name || profile?.username || "VibeBook user"}</span>
      {subtitle && <span className={`mt-0.5 block truncate text-xs ${unreadCount ? "font-black text-navy" : "font-semibold text-slate-500"}`}>{subtitle}</span>}
    </span>
    {Boolean(unreadCount) && (
      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-black text-navy">
        {unreadCount > 9 ? "9+" : unreadCount}
      </span>
    )}
  </button>
);

const Chat = () => {
  const { userId } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  // ---- Open 1:1 conversation state ----
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [online, setOnline] = useState(false);
  const [message, setMessage] = useState("");
  const [directAttachments, setDirectAttachments] = useState([]);
  const [messageAction, setMessageAction] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [directReply, setDirectReply] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [typingUser, setTypingUser] = useState("");

  // ---- People / conversations landing state ----
  const [conversations, setConversations] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState("");
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [relationsLoading, setRelationsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);

  const bottomRef = useRef(null);
  const directFileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const userIdRef = useRef(userId);
  const userRef = useRef(user);
  const registeredUserRef = useRef("");
  const longPressTimerRef = useRef(null);
  const directScrollRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const searchRequestRef = useRef(0);

  userIdRef.current = userId;
  userRef.current = user;

  const appendDirectMessage = (nextMessage) => {
    const normalized = normalizeSocketMessage(nextMessage);

    setMessages((current) => {
      const existingIndex = current.findIndex((item) => messageKey(item) === messageKey(normalized));

      if (existingIndex >= 0) {
        return current.map((item, index) =>
          index === existingIndex ? { ...item, ...normalized, pending: false, failed: false, deliveryStatus: messageStatus(normalized) } : item
        );
      }

      const pendingIndex = current.findIndex((item) => {
        return (
          item.pending &&
          messageSenderId(item) === normalized.senderId &&
          messageReceiverId(item) === normalized.receiverId &&
          (item.message || item.text) === normalized.message
        );
      });

      if (pendingIndex >= 0) {
        return current.map((item, index) =>
          index === pendingIndex ? { ...item, ...normalized, pending: false, failed: false, deliveryStatus: messageStatus(normalized) } : item
        );
      }

      return [...current, normalized];
    });
  };

  const updateDirectMessageStatus = (identity = {}, updates = {}) => {
    setMessages((current) =>
      current.map((item) => {
        const sameClient = identity.clientId && item.clientId === identity.clientId;
        const sameMessage = identity.messageId && item._id === identity.messageId;

        if (!sameClient && !sameMessage) {
          return item;
        }

        return { ...item, ...updates };
      })
    );
  };

  const filePreviewsFor = (files = []) =>
    Array.from(files)
      .slice(0, 4)
      .map((file) => ({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: file.type?.startsWith("image/") ? URL.createObjectURL(file) : "",
      }));

  const clearAttachmentPreviews = (items = []) => {
    items.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  };

  const setDirectFiles = (files) => {
    setDirectAttachments((current) => {
      clearAttachmentPreviews(current);
      return filePreviewsFor(files);
    });
  };

  // Merges an inbound/outbound direct message into the conversation-summary
  // list shown on the Chat landing screen, regardless of which view is open.
  const mergeConversationSummary = (payload = {}) => {
    const currentUserId = userRef.current?._id;
    if (!currentUserId) return;

    const senderId = messageSenderId(payload);
    const receiverId = messageReceiverId(payload);
    const otherUserProfile = senderId === currentUserId ? payload.recipient || payload.receiver : payload.sender;
    const otherUserId = idOf(otherUserProfile) || (senderId === currentUserId ? receiverId : senderId);

    if (!otherUserId) return;

    setConversations((current) => {
      const existing = current.find((item) => idOf(item.user) === otherUserId);
      const viewingThisChat = userIdRef.current === otherUserId;
      const isUnread = receiverId === currentUserId && senderId !== currentUserId && !viewingThisChat;
      const nextItem = {
        ...(existing || {}),
        user: existing?.user || otherUserProfile || { _id: otherUserId },
        lastMessage: payload,
        unreadCount: viewingThisChat ? 0 : Math.max(0, Number(existing?.unreadCount || 0) + (isUnread ? 1 : 0)),
        online: existing?.online || false,
      };
      return sortConversations([nextItem, ...current.filter((item) => idOf(item.user) !== otherUserId)]);
    });
  };

  const loadConversation = async ({ silent = false } = {}) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const { data } = await messageApi.getConversation(userId);
      setMessages((Array.isArray(data?.messages) ? data.messages : []).map(normalizeSocketMessage));
      setOtherUser(data?.otherUser || null);
      setOnline(Boolean(data?.online));
      setConversations((current) => current.map((item) => (idOf(item.user) === userId ? { ...item, unreadCount: 0 } : item)));

      const socket = connectSocket(token);
      if (socket?.connected) {
        socket.emit("message:seen", { userId }, () => undefined);
      }
    } catch (requestError) {
      setError(requestMessage(requestError, "Unable to load chat."));
    } finally {
      setLoading(false);
    }
  };

  const loadPeople = async ({ silent = false } = {}) => {
    if (!silent) {
      setPeopleLoading(true);
    }
    setPeopleError("");

    try {
      const { data } = await messageApi.getInbox();
      setConversations(sortConversations(Array.isArray(data?.conversations) ? data.conversations : []));
    } catch (requestError) {
      setPeopleError(requestMessage(requestError, "Unable to load messages."));
    } finally {
      setPeopleLoading(false);
    }
  };

  const loadRelationships = async () => {
    setRelationsLoading(true);

    try {
      const [followingRes, followersRes] = await Promise.all([userApi.getFollowing(), userApi.getFollowers()]);
      setFollowing(Array.isArray(followingRes.data?.users) ? followingRes.data.users : []);
      setFollowers(Array.isArray(followersRes.data?.users) ? followersRes.data.users : []);
    } catch {
      // Non-fatal: the conversations list still works without relationship data.
    } finally {
      setRelationsLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      return undefined;
    }

    loadPeople();
    loadRelationships();
    const timer = setInterval(() => loadPeople({ silent: true }), 12000);
    return () => clearInterval(timer);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    loadConversation();
    const timer = setInterval(() => loadConversation({ silent: true }), 7000);
    return () => clearInterval(timer);
  }, [userId]);

  useEffect(() => {
    return () => clearAttachmentPreviews(directAttachments);
  }, [directAttachments]);

  useEffect(() => {
    const term = searchTerm.trim();
    clearTimeout(searchDebounceRef.current);

    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }

    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const requestId = searchRequestRef.current + 1;
      searchRequestRef.current = requestId;

      try {
        const { data } = await userApi.search({ q: term });
        if (requestId !== searchRequestRef.current) return;
        setSearchResults((Array.isArray(data?.users) ? data.users : []).filter((item) => item._id !== user?._id));
      } catch {
        if (requestId === searchRequestRef.current) setSearchResults([]);
      } finally {
        if (requestId === searchRequestRef.current) setSearching(false);
      }
    }, 350);

    return () => clearTimeout(searchDebounceRef.current);
  }, [searchTerm, user?._id]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Single consolidated socket lifecycle for direct messaging.
  useEffect(() => {
    if (!token || !user?._id) {
      return undefined;
    }

    const socket = connectSocket(token);

    if (!socket) {
      return undefined;
    }

    const register = () => {
      const currentUserId = userRef.current?._id;

      if (!currentUserId || registeredUserRef.current === currentUserId) {
        return;
      }

      socket.emit("register_user", { userId: currentUserId }, (response) => {
        setSocketConnected(Boolean(response?.success));

        if (response?.success) {
          registeredUserRef.current = currentUserId;
          return;
        }

        registeredUserRef.current = "";
      });
    };

    const handleConnect = () => {
      setSocketConnected(true);
      registeredUserRef.current = "";
      register();
    };

    const handleReconnect = () => {
      setSocketConnected(socket.connected);
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
      registeredUserRef.current = "";
    };

    const handleReceiveMessage = (payload) => {
      if (payload?.type && payload.type !== "direct-message") {
        return;
      }

      const normalized = normalizeSocketMessage(payload);
      mergeConversationSummary(normalized);

      const senderId = normalized.senderId;
      const receiverId = normalized.receiverId;
      const openUserId = userIdRef.current;
      const currentUserId = userRef.current?._id;
      const belongsToOpenChat =
        openUserId && ((senderId === currentUserId && receiverId === openUserId) || (senderId === openUserId && receiverId === currentUserId));

      if (belongsToOpenChat) {
        appendDirectMessage(normalized);

        if (senderId === openUserId && receiverId === currentUserId) {
          socket.emit("message:seen", { userId: senderId }, () => undefined);
        }
      }
    };

    const handleDeliveryUpdate = (payload = {}) => {
      updateDirectMessageStatus(
        { messageId: payload.messageId, clientId: payload.clientId },
        {
          deliveryStatus: payload.status,
          deliveredAt: payload.deliveredAt,
          seenAt: payload.seenAt,
          readAt: payload.readAt,
          pending: false,
          failed: false,
        }
      );
    };

    const handleTyping = (payload = {}) => {
      if (payload.senderId !== userIdRef.current || payload.receiverId !== userRef.current?._id) {
        return;
      }

      setTypingUser(payload.typing ? payload.senderId : "");
    };

    const handleDirectDeleted = (payload = {}) => {
      applyDirectDeleted(payload);
    };

    const handleStats = (payload = {}) => {
      if (userIdRef.current && Array.isArray(payload.onlineUserIds)) {
        setOnline(payload.onlineUserIds.includes(userIdRef.current));
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.io.on("reconnect", handleReconnect);
    socket.on("chat:message", handleReceiveMessage);
    socket.on("message:delivery", handleDeliveryUpdate);
    socket.on("message:deleted", handleDirectDeleted);
    socket.on("typing", handleTyping);
    socket.on("global:stats", handleStats);

    if (socket.connected) {
      register();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.io.off("reconnect", handleReconnect);
      socket.off("chat:message", handleReceiveMessage);
      socket.off("message:delivery", handleDeliveryUpdate);
      socket.off("message:deleted", handleDirectDeleted);
      socket.off("typing", handleTyping);
      socket.off("global:stats", handleStats);
      clearTimeout(typingTimerRef.current);
      if (userIdRef.current && userRef.current?._id) {
        socket.emit("typing", {
          senderId: userRef.current._id,
          receiverId: userIdRef.current,
          chatId: getChatId(userRef.current._id, userIdRef.current),
          typing: false,
        });
      }
    };
  }, [token, user?._id]);

  useEffect(() => {
    const container = directScrollRef.current;
    const nearBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight < 180;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const handleSend = async (event) => {
    event.preventDefault();

    const text = message.trim();

    await sendDirectText(text, null, directAttachments);
  };

  const sendDirectText = async (text, retryMessage = null, attachments = []) => {
    const cleanText = String(text || "").trim();

    if ((!cleanText && !attachments.length) || !userId || !user?._id) {
      return;
    }

    const chatId = getChatId(user._id, userId);
    const pendingId = retryMessage?.clientId || `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage = {
      _id: pendingId,
      clientId: pendingId,
      chatId,
      senderId: user._id,
      receiverId: userId,
      sender: user._id,
      recipient: userId,
      receiver: userId,
      message: cleanText,
      text: cleanText,
      attachments: attachments.map((item) => ({
        url: item.previewUrl || "",
        name: item.name,
        size: item.size,
        mimeType: item.type,
        kind: item.type?.startsWith("image/") ? "image" : "file",
      })),
      replyTo: directReply?._id,
      replyPreview: directReply
        ? {
            messageId: directReply._id,
            senderName: (messageSenderId(directReply) === user._id ? user : otherUser)?.name || "User",
            snippet: directReply.deletedAt ? "This message was deleted" : String(directReply.message || directReply.text || "").slice(0, 180),
            deleted: Boolean(directReply.deletedAt),
          }
        : undefined,
      createdAt: retryMessage?.createdAt || new Date().toISOString(),
      pending: true,
      failed: false,
      deliveryStatus: "sending",
    };

    setSending(true);
    setStatus("");
    setError("");
    if (!retryMessage) {
      setMessage("");
      setDirectFiles([]);
      setDirectReply(null);
    }
    clearTimeout(typingTimerRef.current);
    connectSocket(token)?.emit("typing", {
      senderId: user._id,
      receiverId: userId,
      chatId,
      typing: false,
    });
    appendDirectMessage(optimisticMessage);
    mergeConversationSummary(optimisticMessage);

    try {
      const socket = connectSocket(token);

      if (socket?.connected && !attachments.length) {
        socket.emit(
          "send_message",
          {
            senderId: user._id,
            receiverId: userId,
            chatId,
            clientId: pendingId,
            message: cleanText,
            replyTo: directReply?._id,
          },
          (response) => {
            if (!response?.success) {
              setError(response?.message || "Message failed.");
              updateDirectMessageStatus({ clientId: pendingId }, { pending: false, failed: true, deliveryStatus: "failed" });
              return;
            }

            appendDirectMessage(response.data);
          }
        );
      } else {
        let data;
        if (attachments.length) {
          const formData = new FormData();
          formData.set("recipientId", userId);
          formData.set("chatId", chatId);
          formData.set("clientId", pendingId);
          formData.set("message", cleanText);
          if (directReply?._id) formData.set("replyTo", directReply._id);
          attachments.forEach((item) => formData.append("attachments", item.file));
          ({ data } = await messageApi.sendDirectWithAttachments(formData));
        } else {
          ({ data } = await messageApi.sendDirect(userId, { message: cleanText, chatId, clientId: pendingId, replyTo: directReply?._id }));
        }
        appendDirectMessage(data.chatMessage || data.inboxMessage);
      }
    } catch (requestError) {
      updateDirectMessageStatus({ clientId: pendingId }, { pending: false, failed: true, deliveryStatus: "failed" });
      setError(requestMessage(requestError, "Message failed."));
    } finally {
      setSending(false);
    }
  };

  const retryDirectMessage = (item) => {
    sendDirectText(item.message || item.text, item);
  };

  const closeMessageAction = () => {
    setMessageAction(null);
    clearTimeout(longPressTimerRef.current);
  };

  const openMessageAction = (event, item, canDelete) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!item) return;
    setMessageAction({ item, canDelete: Boolean(canDelete) });
  };

  const startLongPress = (item, canDelete) => {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => setMessageAction({ item, canDelete: Boolean(canDelete) }), 420);
  };

  const copyMessage = async (item) => {
    const text = item?.message || item?.text || "";
    if (!text) return;
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setStatus("Message copied.");
    closeMessageAction();
  };

  const replyToMessage = (item) => {
    setDirectReply(item);
    closeMessageAction();
  };

  const applyDirectDeleted = (nextMessage) => {
    const normalized = normalizeSocketMessage(nextMessage);
    setMessages((current) =>
      current.map((item) =>
        messageKey(item) === messageKey(normalized) || item._id === normalized._id
          ? { ...item, ...normalized, message: "This message was deleted", text: "This message was deleted", attachments: [], deletedAt: normalized.deletedAt || new Date().toISOString() }
          : item
      )
    );
  };

  const handleDeleteDirectMessage = async (item) => {
    if (!item?._id || item.pending || item.deletedAt) {
      return;
    }

    const previous = messages;
    applyDirectDeleted({ ...item, deletedAt: new Date().toISOString() });

    try {
      const socket = connectSocket(token);
      if (socket?.connected) {
        socket.emit("message:delete", { messageId: item._id }, (response) => {
          if (response?.success && response.data) {
            applyDirectDeleted(response.data);
          } else if (response && !response.success) {
            setMessages(previous);
            setError(response.message || "Unable to delete message.");
          }
        });
      } else {
        const { data } = await messageApi.delete(item._id);
        applyDirectDeleted(data.chatMessage || data.inboxMessage || item);
      }
    } catch (requestError) {
      setMessages(previous);
      setError(requestMessage(requestError, "Unable to delete message."));
    }
  };

  const confirmDeleteMessage = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    closeMessageAction();

    if (!target?.item) return;
    await handleDeleteDirectMessage(target.item);
  };

  const openConversationWith = (person) => {
    const id = idOf(person);
    if (!id) return;
    setSearchTerm("");
    setSearchResults([]);
    navigate(`/chat/${id}`);
  };

  const followingOnly = following;
  const followersOnly = followers.filter((person) => !following.some((item) => idOf(item) === idOf(person)));

  // ---------------------------------------------------------------------
  // Open 1:1 conversation view
  // ---------------------------------------------------------------------
  if (userId) {
    return (
      <section className="container-page flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom))] pt-3 sm:py-6">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 p-3">
            <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-surface" onClick={() => navigate("/chat")} aria-label="Back to messages">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Avatar profile={otherUser} size="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-navy">{otherUser?.name || "Conversation"}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                <span className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-slate-300"}`} />
                {online ? "Online" : "Offline"}
              </p>
            </div>
          </div>

          {error && (
            <div className="mx-3 mt-3 shrink-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div ref={directScrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto scroll-smooth p-3 pb-4 sm:p-3">
            {loading ? (
              <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
            ) : messages.length ? (
              messages.map((item) => {
                const isMine = messageSenderId(item) === user?._id;
                const senderProfile = isMine ? user : otherUser;
                const state = messageStatus(item);
                return (
                  <div key={messageKey(item)} className={`group/message flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                    {!isMine && <Avatar profile={senderProfile} />}
                    <div className={`max-w-[78%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                      <div
                        className={`relative rounded-2xl px-3 py-2 transition active:scale-[0.99] ${isMine ? "rounded-br-md bg-brand text-navy" : "rounded-bl-md bg-surface text-slate-700"}`}
                        onContextMenu={(event) => openMessageAction(event, item, isMine && !item.deletedAt && !item.pending)}
                        onPointerDown={(event) => event.pointerType === "touch" && startLongPress(item, isMine && !item.deletedAt && !item.pending)}
                        onPointerUp={() => clearTimeout(longPressTimerRef.current)}
                        onPointerCancel={() => clearTimeout(longPressTimerRef.current)}
                      >
                        <ReplyPreview preview={item.replyPreview} />
                        <p className={`whitespace-pre-line break-words text-sm leading-6 ${item.deletedAt ? "italic opacity-70" : ""}`}>{item.message}</p>
                        {!item.deletedAt && <LinkPreview text={item.message} />}
                        <AttachmentList attachments={item.attachments || []} />
                      </div>
                      <p className="mt-1 flex items-center gap-2 truncate px-1 text-[11px] font-semibold text-slate-400">
                        <span>{formatTime(item.createdAt)}</span>
                        {isMine && <DeliveryState status={state} failed={item.failed} onRetry={() => retryDirectMessage(item)} />}
                        {!item.pending && !item.deletedAt && (
                          <button type="button" className="inline-flex items-center text-slate-400 opacity-100 hover:text-navy sm:opacity-0 sm:group-hover/message:opacity-100" onClick={(event) => openMessageAction(event, item, isMine)}>
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </p>
                    </div>
                    {isMine && <Avatar profile={senderProfile} />}
                  </div>
                );
              })
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <MessageCircle className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">No messages yet. Say hello!</p>
              </div>
            )}
            {typingUser && <p className="text-xs font-semibold text-slate-500">{otherUser?.name || "User"} is typing...</p>}
            <div ref={bottomRef} />
          </div>

          <form className="shrink-0 border-t border-slate-100 bg-white/95 p-2 backdrop-blur sm:p-3" onSubmit={handleSend}>
            {isOffline && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                <WifiOff className="h-3.5 w-3.5" />
                You're offline. Messages will send when you're connected.
              </div>
            )}
            {directReply && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-slate-600">
                <Reply className="h-4 w-4 text-brand" />
                <span className="min-w-0 flex-1 truncate">Replying to {directReply.senderId === user?._id ? "yourself" : otherUser?.name || "User"}: {directReply.message}</span>
                <button type="button" onClick={() => setDirectReply(null)} aria-label="Dismiss reply"><X className="h-4 w-4" /></button>
              </div>
            )}
            {directAttachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {directAttachments.map((item) => (
                  <span key={item.name} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-surface px-2 py-1 text-xs font-bold text-slate-600">
                    {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <FileText className="h-4 w-4" />}
                    <span className="max-w-40 truncate">{item.name}</span>
                    <button type="button" onClick={() => setDirectFiles([])} aria-label="Remove attachment">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex min-w-0 items-end gap-2">
              <input
                ref={directFileInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/markdown"
                multiple
                onChange={(event) => setDirectFiles(event.target.files)}
              />
              <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-slate-600 transition hover:text-navy" onClick={() => directFileInputRef.current?.click()} aria-label="Attach file">
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                rows={1}
                className="field max-h-[120px] min-h-11 min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl px-3 py-2 text-base"
                value={message}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setMessage(nextValue);
                  const socket = connectSocket(token);

                  if (socket?.connected && user?._id && userId) {
                    socket.emit("typing", {
                      senderId: user._id,
                      receiverId: userId,
                      chatId: getChatId(user._id, userId),
                      typing: Boolean(nextValue.trim()),
                    });

                    clearTimeout(typingTimerRef.current);
                    typingTimerRef.current = setTimeout(() => {
                      socket.emit("typing", {
                        senderId: user._id,
                        receiverId: userId,
                        chatId: getChatId(user._id, userId),
                        typing: false,
                      });
                    }, 1200);
                  }
                }}
                placeholder="Write a message"
              />
              <button type="submit" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-navy shadow-sm transition hover:bg-green-400 disabled:opacity-50" disabled={sending || (!message.trim() && !directAttachments.length)} aria-label="Send message">
                {sending ? <Clock3 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </div>

        {messageAction && (
          <div className="fixed inset-0 z-50 flex items-end bg-slate-950/30 p-3 backdrop-blur-sm sm:items-center sm:justify-center" onClick={closeMessageAction}>
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              {[
                { label: "Reply", icon: Reply, action: () => replyToMessage(messageAction.item) },
                { label: "Copy", icon: Copy, action: () => copyMessage(messageAction.item) },
                ...(messageAction.canDelete ? [{ label: "Delete message", icon: Trash2, danger: true, action: () => setDeleteTarget(messageAction) }] : []),
              ].map((action) => (
                <button key={action.label} type="button" className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-black ${action.danger ? "text-red-600" : "text-navy"} hover:bg-surface`} onClick={action.action}>
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </button>
              ))}
              <button type="button" className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm font-black text-slate-500 hover:bg-surface" onClick={closeMessageAction}>
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>
        )}
        {deleteTarget && (
          <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/40 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
              <h2 className="text-lg font-black text-navy">Delete this message?</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">Everyone will see "This message was deleted".</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button type="button" className="btn-primary bg-red-500 text-white hover:bg-red-600" onClick={confirmDeleteMessage}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // ---------------------------------------------------------------------
  // People / conversations landing view
  // ---------------------------------------------------------------------
  const showingSearch = searchTerm.trim().length > 0;

  return (
    <section className="container-page flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom))] pt-3 sm:py-6">
      <div className="mb-3 shrink-0">
        <p className="text-sm font-semibold uppercase text-brand">Chat</p>
        <h1 className="mt-1 text-2xl font-black text-navy">Messages</h1>
      </div>

      {isOffline && (
        <div className="mb-3 flex shrink-0 items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          <WifiOff className="h-3.5 w-3.5" />
          You're offline. Messages will send when you're connected.
        </div>
      )}

      <label className="relative mb-4 block shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="field pl-9"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search people"
        />
        {searchTerm && (
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setSearchTerm("")} aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      {peopleError && <div className="mb-4 shrink-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{peopleError}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showingSearch ? (
          <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-soft">
            {searching ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2].map((key) => <div key={key} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
              </div>
            ) : searchResults.length ? (
              searchResults.map((person) => <PersonRow key={person._id} profile={person} onClick={() => openConversationWith(person)} />)
            ) : (
              <p className="p-4 text-center text-sm font-semibold text-slate-500">No people found for "{searchTerm.trim()}".</p>
            )}
          </div>
        ) : (
          <div className="space-y-6 pb-4">
            <div>
              <h2 className="mb-2 px-1 text-xs font-black uppercase tracking-wide text-slate-400">Messages</h2>
              <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-soft">
                {peopleLoading ? (
                  <div className="space-y-2 p-2">
                    {[0, 1, 2].map((key) => <div key={key} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
                  </div>
                ) : conversations.length ? (
                  conversations.map((item) => {
                    const preview = item.lastMessage?.message || item.lastMessage?.text || (item.lastMessage?.attachments?.length ? "Sent an attachment" : "");
                    const isMine = messageSenderId(item.lastMessage) === user?._id;
                    return (
                      <PersonRow
                        key={idOf(item.user)}
                        profile={item.user}
                        subtitle={`${isMine ? "You: " : ""}${preview || "Say hello"} · ${formatShortTime(item.lastMessage?.createdAt)}`}
                        unreadCount={item.unreadCount}
                        online={item.online}
                        onClick={() => navigate(`/chat/${idOf(item.user)}`)}
                      />
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center gap-2 p-8 text-center">
                    <MessageCircle className="h-8 w-8 text-slate-300" />
                    <p className="font-black text-navy">No messages yet</p>
                    <p className="text-sm font-semibold text-slate-500">Find someone you follow and start a conversation.</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-2 px-1 text-xs font-black uppercase tracking-wide text-slate-400">Following</h2>
              <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-soft">
                {relationsLoading ? (
                  <div className="space-y-2 p-2">
                    {[0, 1].map((key) => <div key={key} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
                  </div>
                ) : followingOnly.length ? (
                  followingOnly.map((person) => (
                    <PersonRow
                      key={person._id}
                      profile={person}
                      subtitle={person.followsViewer ? "Follows you" : "@" + (person.username || "user")}
                      online={person.online}
                      onClick={() => openConversationWith(person)}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 p-8 text-center">
                    <Users className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-500">You're not following anyone yet.</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-2 px-1 text-xs font-black uppercase tracking-wide text-slate-400">Followers</h2>
              <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-soft">
                {relationsLoading ? (
                  <div className="space-y-2 p-2">
                    {[0, 1].map((key) => <div key={key} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}
                  </div>
                ) : followersOnly.length ? (
                  followersOnly.map((person) => (
                    <PersonRow
                      key={person._id}
                      profile={person}
                      subtitle={"@" + (person.username || "user")}
                      online={person.online}
                      onClick={() => openConversationWith(person)}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center gap-2 p-8 text-center">
                    <UserPlus className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-500">No followers yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {status && <div className="mt-3 shrink-0 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
    </section>
  );
};

export default Chat;
