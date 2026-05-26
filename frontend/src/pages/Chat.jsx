// @ts-nocheck
import { AlertCircle, Check, CheckCheck, Clock3, Copy, FileText, MoreVertical, Paperclip, Plus, Reply, Search, Send, ShieldCheck, Trash2, UserCheck, UserMinus, UserPlus, Users, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import LiveAvatar from "../components/LiveAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { groupChatApi, mediaUrl, messageApi, userApi } from "../services/api";
import { connectSocket, getChatId } from "../services/socket";
import { handleAvatarError } from "../utils/profileImage";

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const requestMessage = (requestError, fallback) => {
  const message = requestError?.response?.data?.message || requestError?.message || "";

  if (requestError?.response?.status === 404 && message.toLowerCase().includes("route not found")) {
    return "Group chat is temporarily unavailable. Please try again shortly.";
  }

  return message || fallback;
};

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

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
  senderId: messageSenderId(item),
  receiverId: messageReceiverId(item),
  sender: item.sender || item.senderId,
  recipient: item.recipient || item.receiver || item.receiverId,
  receiver: item.receiver || item.recipient || item.receiverId,
  message: item.message || item.text || "",
  text: item.text || item.message || "",
  attachments: Array.isArray(item.attachments) ? item.attachments : [],
  replyTo: item.replyTo,
  replyPreview: item.replyPreview,
  deletedAt: item.deletedAt,
  createdAt: item.createdAt || new Date().toISOString(),
  deliveryStatus: messageStatus(item),
});

const groupMessageKey = (item) =>
  item?.clientId ||
  item?._id ||
  `${item?.groupId || idOf(item?.group)}:${idOf(item?.sender) || item?.senderId || ""}:${item?.createdAt || ""}:${item?.message || ""}`;

const normalizeGroupMessage = (item = {}) => ({
  ...item,
  groupId: item.groupId || idOf(item.group),
  senderId: item.senderId || idOf(item.sender),
  sender: item.sender || item.senderId,
  message: item.message || "",
  attachments: Array.isArray(item.attachments) ? item.attachments : [],
  replyTo: item.replyTo,
  replyPreview: item.replyPreview,
  deletedAt: item.deletedAt,
  type: item.type || "message",
  createdAt: item.createdAt || new Date().toISOString(),
  deliveryStatus: messageStatus(item),
});

const sortGroupMessages = (items = []) => {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).getTime() || 0;
    const rightTime = new Date(right?.createdAt || 0).getTime() || 0;
    return leftTime - rightTime;
  });
};

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

const memberCountLabel = (group = {}) => {
  const total = Array.isArray(group.members) ? group.members.length : Number(group.memberCount || 0);
  const online = Number(group.onlineUsersCount || group.activeUsers?.length || 0);
  return `${total} member${total === 1 ? "" : "s"} • ${online} online`;
};

const formatFileSize = (value = 0) => {
  const size = Number(value || 0);

  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const roleForMember = (group = {}, memberId = "") => {
  const roles = group.roles || {};
  return roles[memberId] || (idOf(group.owner || group.createdBy || group.adminId) === memberId ? "owner" : (group.moderators || []).map(idOf).includes(memberId) ? "moderator" : "member");
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

const Chat = () => {
  const { userId } = useParams();
  const { user, token, payAccess } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(userId ? "direct" : "groups");
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [online, setOnline] = useState(false);
  const [message, setMessage] = useState("");
  const [directAttachments, setDirectAttachments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupMessage, setGroupMessage] = useState("");
  const [groupAttachments, setGroupAttachments] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberModalMode, setMemberModalMode] = useState("invite");
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [groupMemberSelection, setGroupMemberSelection] = useState([]);
  const [groupActionLoading, setGroupActionLoading] = useState("");
  const [messageAction, setMessageAction] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [directReply, setDirectReply] = useState(null);
  const [groupReply, setGroupReply] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const bottomRef = useRef(null);
  const groupBottomRef = useRef(null);
  const directFileInputRef = useRef(null);
  const groupFileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const groupsLoadingRef = useRef(false);
  const groupMessagesRequestRef = useRef(0);
  const groupsRefreshTimerRef = useRef(null);
  const activeTabRef = useRef(activeTab);
  const selectedGroupRef = useRef(selectedGroup);
  const userIdRef = useRef(userId);
  const userRef = useRef(user);
  const registeredUserRef = useRef("");
  const joinedGroupRef = useRef("");
  const longPressTimerRef = useRef(null);
  const directScrollRef = useRef(null);
  const groupScrollRef = useRef(null);

  activeTabRef.current = activeTab;
  selectedGroupRef.current = selectedGroup;
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

  const appendGroupMessage = (nextMessage) => {
    const normalized = normalizeGroupMessage(nextMessage);

    setGroupMessages((current) => {
      const existingIndex = current.findIndex((item) => groupMessageKey(item) === groupMessageKey(normalized));

      if (existingIndex >= 0) {
        return sortGroupMessages(
          current.map((item, index) =>
            index === existingIndex ? { ...item, ...normalized, pending: false, failed: false, deliveryStatus: messageStatus(normalized) } : item
          )
        );
      }

      const pendingIndex = current.findIndex((item) => {
        return (
          item.pending &&
          (item.groupId || idOf(item.group)) === normalized.groupId &&
          (idOf(item.sender) || item.senderId) === normalized.senderId &&
          item.message === normalized.message
        );
      });

      if (pendingIndex >= 0) {
        return sortGroupMessages(
          current.map((item, index) =>
            index === pendingIndex ? { ...item, ...normalized, pending: false, failed: false, deliveryStatus: messageStatus(normalized) } : item
          )
        );
      }

      return sortGroupMessages([...current, normalized]);
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

  const updateGroupMessageStatus = (identity = {}, updates = {}) => {
    setGroupMessages((current) =>
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

  const setGroupFiles = (files) => {
    setGroupAttachments((current) => {
      clearAttachmentPreviews(current);
      return filePreviewsFor(files);
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

  const loadGroups = async ({ silent = false } = {}) => {
    if (groupsLoadingRef.current) {
      return;
    }

    groupsLoadingRef.current = true;

    if (!silent) {
      setError("");
    }

    try {
      const { data } = await groupChatApi.list();
      const nextGroups = Array.isArray(data?.groups) ? data.groups : [];
      const requestedGroup = new URLSearchParams(window.location.search).get("group") || "";
      setGroups(nextGroups);
      setSelectedGroup((current) => {
        if (current && nextGroups.some((item) => item._id === current)) {
          return current;
        }

        if (requestedGroup && nextGroups.some((item) => item._id === requestedGroup)) {
          return requestedGroup;
        }

        return nextGroups[0]?._id || "";
      });
    } catch (requestError) {
      const rawMessage = requestError?.response?.data?.message || "";

      if (requestError?.response?.status === 404 && rawMessage.toLowerCase().includes("route not found")) {
        setGroups([]);
        setSelectedGroup("");
        setGroupMessages([]);
      }

      setError(requestMessage(requestError, "Unable to load groups."));
    } finally {
      groupsLoadingRef.current = false;
    }
  };

  const scheduleGroupsRefresh = () => {
    clearTimeout(groupsRefreshTimerRef.current);
    groupsRefreshTimerRef.current = setTimeout(() => loadGroups({ silent: true }), 500);
  };

  const loadMembers = async () => {
    try {
      const { data } = await userApi.search({});
      setMemberOptions((Array.isArray(data?.users) ? data.users : []).filter((item) => item._id !== user?._id).slice(0, 30));
    } catch {
      setMemberOptions([]);
    }
  };

  const loadGroupMessages = async (groupId, { silent = false, force = false } = {}) => {
    if (!groupId) {
      setGroupMessages([]);
      setLoading(false);
      return;
    }

    const selected = groups.find((item) => item._id === groupId);
    if (!force && selected?.isMember === false) {
      setGroupMessages([]);
      setLoading(false);
      setError("");
      return;
    }

    if (!silent) {
      setLoading(true);
    }

    const requestId = groupMessagesRequestRef.current + 1;
    groupMessagesRequestRef.current = requestId;

    try {
      const { data } = await groupChatApi.getMessages(groupId);
      if (requestId !== groupMessagesRequestRef.current) {
        return;
      }

      setGroupMessages(sortGroupMessages(Array.isArray(data?.messages) ? data.messages : []));
      setGroups((current) => current.map((item) => (item._id === data?.group?._id ? data.group : item)));
    } catch (requestError) {
      if (requestId === groupMessagesRequestRef.current) {
        setError(requestMessage(requestError, "Unable to load group chat."));
      }
    } finally {
      if (requestId === groupMessagesRequestRef.current) {
        setLoading(false);
      }
    }
  };

  const leaveGroupRoom = (socket, groupId = joinedGroupRef.current) => {
    if (!socket || !groupId) {
      return;
    }

    socket.emit("leave_group", groupId, () => undefined);

    if (joinedGroupRef.current === groupId) {
      joinedGroupRef.current = "";
    }
  };

  const joinSelectedGroupRoom = (socket) => {
    const groupId = selectedGroupRef.current;

    if (!socket || activeTabRef.current !== "groups" || !groupId || joinedGroupRef.current === groupId) {
      return;
    }

    if (joinedGroupRef.current) {
      leaveGroupRoom(socket, joinedGroupRef.current);
    }

    socket.emit("join_group", groupId, (response) => {
      if (response?.success) {
        joinedGroupRef.current = groupId;
        return;
      }

      if (selectedGroupRef.current === groupId) {
        setError(response?.message || "Unable to join group chat.");
      }
    });
  };

  useEffect(() => {
    setActiveTab(userId ? "direct" : "groups");
  }, [userId]);



  useEffect(() => {
    if (activeTab !== "direct") {
      return undefined;
    }

    loadConversation();
    const timer = setInterval(() => loadConversation({ silent: true }), 7000);
    return () => clearInterval(timer);
  }, [activeTab, userId]);

  useEffect(() => {
    return () => clearTimeout(groupsRefreshTimerRef.current);
  }, []);

  useEffect(() => {
    return () => {
      clearAttachmentPreviews(directAttachments);
      clearAttachmentPreviews(groupAttachments);
    };
  }, [directAttachments, groupAttachments]);

  useEffect(() => {
    if (activeTab !== "groups") {
      return undefined;
    }

    loadGroups();
    loadMembers();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "groups") {
      return undefined;
    }

    loadGroupMessages(selectedGroup);
  }, [activeTab, selectedGroup]);

  // Consolidated socket management for both direct and group chat
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
      joinedGroupRef.current = "";
      joinSelectedGroupRoom(socket);
    };

    const handleReconnect = () => {
      setSocketConnected(socket.connected);
      joinSelectedGroupRoom(socket);
      console.info("[socket] reconnected");
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
      registeredUserRef.current = "";
      joinedGroupRef.current = "";
    };

    // Direct message handlers
    const handleReceiveMessage = (payload) => {
      const normalized = normalizeSocketMessage(payload);
      const senderId = normalized.senderId;
      const receiverId = normalized.receiverId;
      const openUserId = userIdRef.current;
      const currentUserId = userRef.current?._id;
      const belongsToOpenChat =
        openUserId &&
        activeTabRef.current === "direct" &&
        ((senderId === currentUserId && receiverId === openUserId) || (senderId === openUserId && receiverId === currentUserId));

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
      if (activeTabRef.current !== "direct" || payload.senderId !== userIdRef.current || payload.receiverId !== userRef.current?._id) {
        return;
      }

      setTypingUser(payload.typing ? payload.senderId : "");
    };

    const handleDirectDeleted = (payload = {}) => {
      applyDirectDeleted(payload);
    };

    // Group message handlers
    const handleGroupMessage = (payload = {}) => {
      if (activeTabRef.current !== "groups") {
        scheduleGroupsRefresh();
        return;
      }

      const messagePayload = payload.message || payload;
      const normalized = normalizeGroupMessage(messagePayload);

      if (selectedGroupRef.current && normalized.groupId === selectedGroupRef.current) {
        appendGroupMessage(normalized);
      }

      scheduleGroupsRefresh();
    };

    const handleGroupMembership = (payload = {}) => {
      const messagePayload = payload.message || {};

      if (activeTabRef.current === "groups" && selectedGroupRef.current && idOf(payload.groupId) === selectedGroupRef.current && messagePayload.message) {
        appendGroupMessage(messagePayload);
      }

      if (payload.group?._id) {
        setGroups((current) => current.map((item) => (item._id === payload.group._id ? payload.group : item)));
      }

      scheduleGroupsRefresh();
    };

    const handleGroupDeleted = (payload = {}) => {
      const messagePayload = payload.message || payload;
      if (activeTabRef.current === "groups" && selectedGroupRef.current && normalizeGroupMessage(messagePayload).groupId === selectedGroupRef.current) {
        applyGroupDeleted(messagePayload);
      }
    };

    const handleGroupCreated = (payload = {}) => {
      if (payload.group?._id) {
        setGroups((current) => {
          const exists = current.some((item) => item._id === payload.group._id);
          return exists ? current.map((item) => (item._id === payload.group._id ? payload.group : item)) : [payload.group, ...current];
        });
        if (activeTabRef.current === "groups") {
          setSelectedGroup((current) => current || payload.group._id);
        }
      }

      scheduleGroupsRefresh();
    };

    const handleStats = (payload = {}) => {
      if (activeTabRef.current === "direct" && userIdRef.current && Array.isArray(payload.onlineUserIds)) {
        setOnline(payload.onlineUserIds.includes(userIdRef.current));
      }

      if (activeTabRef.current === "groups") {
        scheduleGroupsRefresh();
      }
    };

    // Register socket listeners (one-time, not duplicated)
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.io.on("reconnect", handleReconnect);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("message:delivery", handleDeliveryUpdate);
    socket.on("message:deleted", handleDirectDeleted);
    socket.on("typing", handleTyping);
    socket.on("receive_group_message", handleGroupMessage);
    socket.on("group:created", handleGroupCreated);
    socket.on("group:member-joined", handleGroupMembership);
    socket.on("group:member-left", handleGroupMembership);
    socket.on("group:updated", handleGroupMembership);
    socket.on("group:message_deleted", handleGroupDeleted);
    socket.on("global:stats", handleStats);

    // Initial registration on connection
    if (socket.connected) {
      register();
      joinSelectedGroupRoom(socket);
    }

    // Cleanup: remove listeners and handle disconnection
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.io.off("reconnect", handleReconnect);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("message:delivery", handleDeliveryUpdate);
      socket.off("message:deleted", handleDirectDeleted);
      socket.off("typing", handleTyping);
      socket.off("receive_group_message", handleGroupMessage);
      socket.off("group:created", handleGroupCreated);
      socket.off("group:member-joined", handleGroupMembership);
      socket.off("group:member-left", handleGroupMembership);
      socket.off("group:updated", handleGroupMembership);
      socket.off("group:message_deleted", handleGroupDeleted);
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
      leaveGroupRoom(socket);
    };
  }, [token, user?._id]);

  useEffect(() => {
    if (!token || !user?._id) {
      return undefined;
    }

    const socket = connectSocket(token);

    if (!socket) {
      return undefined;
    }

    if (activeTab !== "groups" || !selectedGroup) {
      leaveGroupRoom(socket);
      return undefined;
    }

    joinSelectedGroupRoom(socket);
    return undefined;
  }, [activeTab, selectedGroup, token, user?._id]);

  useEffect(() => {
    const container = directScrollRef.current;
    const nearBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight < 180;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const container = groupScrollRef.current;
    const nearBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight < 180;
    if (nearBottom) groupBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [groupMessages.length]);

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

  const handleGroupSend = async (event) => {
    event.preventDefault();

    await sendGroupText(groupMessage, null, groupAttachments);
  };

  const sendGroupText = async (value, retryMessage = null, attachments = []) => {
    if ((!String(value || "").trim() && !attachments.length) || !selectedGroup || !selectedGroupIsMember) {
      return;
    }

    const text = String(value || "").trim();
    const pendingId = retryMessage?.clientId || `pending-group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    appendGroupMessage({
      _id: pendingId,
      clientId: pendingId,
      group: selectedGroup,
      groupId: selectedGroup,
      sender: user,
      senderId: user?._id,
      message: text,
      attachments: attachments.map((item) => ({
        url: item.previewUrl || "",
        name: item.name,
        size: item.size,
        mimeType: item.type,
        kind: item.type?.startsWith("image/") ? "image" : "file",
      })),
      replyTo: groupReply?._id,
      replyPreview: groupReply
        ? {
            messageId: groupReply._id,
            senderName: groupReply.sender?.name || (groupReply.senderId === user?._id ? user?.name : "User"),
            snippet: groupReply.deletedAt ? "This message was deleted" : String(groupReply.message || "").slice(0, 180),
            deleted: Boolean(groupReply.deletedAt),
          }
        : undefined,
      createdAt: retryMessage?.createdAt || new Date().toISOString(),
      pending: true,
      failed: false,
      deliveryStatus: "sending",
    });
    if (!retryMessage) {
      setGroupMessage("");
      setGroupFiles([]);
      setGroupReply(null);
    }
    setSending(true);
    setStatus("");
    setError("");

    try {
      const socket = connectSocket(token);

      if (socket?.connected && !attachments.length) {
        socket.emit("send_group_message", { groupId: selectedGroup, senderId: user?._id, clientId: pendingId, message: text, replyTo: groupReply?._id }, (response) => {
          if (response?.success && response.data) {
            appendGroupMessage(response.data);
          } else if (response && !response.success) {
            updateGroupMessageStatus({ clientId: pendingId }, { pending: false, failed: true, deliveryStatus: "failed" });
            setError(response.message || "Group message failed.");
            loadGroupMessages(selectedGroup, { silent: true });
          }
        });
      } else {
        let data;
        if (attachments.length) {
          const formData = new FormData();
          formData.set("clientId", pendingId);
          formData.set("message", text);
          if (groupReply?._id) formData.set("replyTo", groupReply._id);
          attachments.forEach((item) => formData.append("attachments", item.file));
          ({ data } = await groupChatApi.sendWithAttachments(selectedGroup, formData));
        } else {
          ({ data } = await groupChatApi.send(selectedGroup, { message: text, clientId: pendingId, replyTo: groupReply?._id }));
        }
        if (data?.groupMessage) {
          appendGroupMessage(data.groupMessage);
        }
      }
    } catch (requestError) {
      updateGroupMessageStatus({ clientId: pendingId }, { pending: false, failed: true, deliveryStatus: "failed" });
      setError(requestMessage(requestError, "Group message failed."));
    } finally {
      setSending(false);
    }
  };

  const retryGroupMessage = (item) => {
    sendGroupText(item.message, item);
  };

  const closeMessageAction = () => {
    setMessageAction(null);
    clearTimeout(longPressTimerRef.current);
  };

  const openMessageAction = (event, kind, item, canDelete) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!item || item.type === "system") return;
    setMessageAction({ kind, item, canDelete: Boolean(canDelete) });
  };

  const startLongPress = (kind, item, canDelete) => {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => setMessageAction({ kind, item, canDelete: Boolean(canDelete) }), 420);
  };

  const copyMessage = async (item) => {
    const text = item?.message || item?.text || "";
    if (!text) return;
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setStatus("Message copied.");
    closeMessageAction();
  };

  const replyToMessage = (kind, item) => {
    if (kind === "group") {
      setGroupReply(item);
    } else {
      setDirectReply(item);
    }
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

  const applyGroupDeleted = (nextMessage) => {
    const normalized = normalizeGroupMessage(nextMessage);
    setGroupMessages((current) =>
      current.map((item) =>
        groupMessageKey(item) === groupMessageKey(normalized) || item._id === normalized._id
          ? { ...item, ...normalized, message: "This message was deleted", attachments: [], deletedAt: normalized.deletedAt || new Date().toISOString() }
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

  const handleDeleteGroupMessage = async (item) => {
    if (!selectedGroup || !item?._id || item.pending || item.deletedAt) {
      return;
    }

    const previous = groupMessages;
    applyGroupDeleted({ ...item, deletedAt: new Date().toISOString() });

    try {
      const socket = connectSocket(token);
      if (socket?.connected) {
        socket.emit("group:message_delete", { groupId: selectedGroup, messageId: item._id }, (response) => {
          if (response?.success && response.data) {
            applyGroupDeleted(response.data);
          } else if (response && !response.success) {
            setGroupMessages(previous);
            setError(response.message || "Unable to delete message.");
          }
        });
      } else {
        const { data } = await groupChatApi.deleteMessage(selectedGroup, item._id);
        applyGroupDeleted(data.groupMessage || item);
      }
    } catch (requestError) {
      setGroupMessages(previous);
      setError(requestMessage(requestError, "Unable to delete message."));
    }
  };

  const confirmDeleteMessage = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    closeMessageAction();

    if (!target?.item) return;
    if (target.kind === "group") {
      await handleDeleteGroupMessage(target.item);
    } else {
      await handleDeleteDirectMessage(target.item);
    }
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();

    if (!groupName.trim()) {
      setError("Group name is required.");
      return;
    }

    setStatus("");
    setError("");

    try {
      const { data } = await groupChatApi.create({
        groupName: groupName.trim(),
        description: groupDescription.trim(),
        members: selectedMembers,
      });
      setGroupName("");
      setGroupDescription("");
      setSelectedMembers([]);
      setSelectedGroup(data.group?._id || "");
      setStatus("Group created.");
      await loadGroups();
    } catch (requestError) {
      setError(requestMessage(requestError, "Unable to create group."));
    }
  };

  const handleLeaveGroup = async () => {
    if (!selectedGroup || !window.confirm("Leave this group?")) {
      return;
    }

    setStatus("");
    setError("");

    try {
      await groupChatApi.leave(selectedGroup);
      setSelectedGroup("");
      setGroupMessages([]);
      setStatus("You left the group.");
      await loadGroups();
    } catch (requestError) {
      setError(requestMessage(requestError, "Unable to leave group."));
    }
  };

  const handleJoinGroup = async (groupId = selectedGroup) => {
    if (!groupId) {
      return;
    }

    const group = groups.find((item) => item._id === groupId);

    if (group && !window.confirm(`Join ${group.groupName || group.name || "this group"}?`)) {
      return;
    }

    setGroupActionLoading(`join:${groupId}`);
    setStatus("");
    setError("");

    try {
      const { data } = await groupChatApi.joinById(groupId);
      if (data?.group) {
        setGroups((current) => current.map((item) => (item._id === data.group._id ? data.group : item)));
        setSelectedGroup(data.group._id);
      }
      if (data?.groupMessage) {
        appendGroupMessage(data.groupMessage);
      }
      setStatus("Joined group.");
      await loadGroupMessages(groupId, { force: true });
      await loadGroups({ silent: true });
    } catch (requestError) {
      setError(requestMessage(requestError, "Unable to join group."));
    } finally {
      setGroupActionLoading("");
    }
  };

  const openMemberModal = (mode = "invite") => {
    setMemberModalMode(mode);
    setGroupMemberSearch("");
    setGroupMemberSelection([]);
    setMemberModalOpen(true);
    loadMembers();
  };

  const handleGroupMemberSubmit = async () => {
    if (!selectedGroup || !groupMemberSelection.length) {
      return;
    }

    const mode = memberModalMode === "add" ? "add" : "invite";
    setGroupActionLoading(mode);
    setStatus("");
    setError("");

    try {
      const request = mode === "add" ? groupChatApi.addMember : groupChatApi.invite;
      const { data } = await request(selectedGroup, { members: groupMemberSelection });

      if (data?.group) {
        setGroups((current) => current.map((item) => (item._id === data.group._id ? data.group : item)));
      }

      if (data?.groupMessage) {
        appendGroupMessage(data.groupMessage);
      }

      setStatus(data?.message || (mode === "add" ? "Members added." : "Invite sent."));
      setMemberModalOpen(false);
      setGroupMemberSelection([]);
      await loadGroups({ silent: true });
    } catch (requestError) {
      setError(requestMessage(requestError, mode === "add" ? "Unable to add members." : "Unable to invite friends."));
    } finally {
      setGroupActionLoading("");
    }
  };

  const refreshSelectedGroup = async () => {
    await loadGroups({ silent: true });
    if (selectedGroup) {
      await loadGroupMessages(selectedGroup, { silent: true, force: true });
    }
  };

  const handleRoleChange = async (member, role) => {
    const memberId = idOf(member);
    if (!selectedGroup || !memberId) {
      return;
    }

    setGroupActionLoading(`role:${memberId}`);
    setError("");

    try {
      const { data } = await groupChatApi.updateRole(selectedGroup, memberId, { role });
      if (data?.group) {
        setGroups((current) => current.map((item) => (item._id === data.group._id ? data.group : item)));
      }
      setStatus(data?.message || "Role updated.");
    } catch (requestError) {
      setError(requestMessage(requestError, "Unable to update role."));
    } finally {
      setGroupActionLoading("");
    }
  };

  const handleRemoveMember = async (member) => {
    const memberId = idOf(member);
    if (!selectedGroup || !memberId || !window.confirm(`Remove ${member.name || "this member"}?`)) {
      return;
    }

    setGroupActionLoading(`remove:${memberId}`);
    setError("");

    try {
      const { data } = await groupChatApi.removeMember(selectedGroup, memberId);
      if (data?.group) {
        setGroups((current) => current.map((item) => (item._id === data.group._id ? data.group : item)));
      }
      if (data?.groupMessage) {
        appendGroupMessage(data.groupMessage);
      }
      setStatus(data?.message || "Member removed.");
      await refreshSelectedGroup();
    } catch (requestError) {
      setError(requestMessage(requestError, "Unable to remove member."));
    } finally {
      setGroupActionLoading("");
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
      setError(requestMessage(requestError, "Unable to unlock chat."));
    }
  };

  const selectedGroupInfo = groups.find((item) => item._id === selectedGroup);
  const selectedGroupIsMember = selectedGroupInfo ? selectedGroupInfo.isMember !== false : false;
  const viewerGroupRole = selectedGroupInfo?.viewerRole || roleForMember(selectedGroupInfo, user?._id);
  const viewerCanModerate = ["owner", "moderator"].includes(viewerGroupRole);
  const viewerCanAddMembers = viewerGroupRole === "owner";
  const selectedGroupMembers = new Set((selectedGroupInfo?.members || []).map(idOf));
  const selectedGroupPendingInvites = new Set((selectedGroupInfo?.pendingInvites || []).map(idOf));
  const memberSearch = groupMemberSearch.trim().toLowerCase();
  const filteredMemberOptions = memberOptions
    .filter((member) => !selectedGroupMembers.has(member._id))
    .filter((member) => memberModalMode === "add" || !selectedGroupPendingInvites.has(member._id))
    .filter((member) => {
      if (!memberSearch) {
        return true;
      }

      return [member.name, member.username, member.email].some((value) => String(value || "").toLowerCase().includes(memberSearch));
    });

  return (
    <section className="container-page py-10">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-brand">Chat</p>
          <h1 className="mt-2 truncate text-3xl font-black text-navy">
            {activeTab === "groups" ? selectedGroupInfo?.groupName || "Groups" : otherUser?.name || "Messages"}
          </h1>
          {activeTab === "direct" && otherUser && (
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-500" : "bg-slate-300"}`} />
              {online ? "Online" : "Offline"}
            </p>
          )}
          {activeTab === "groups" && selectedGroupInfo && (
            <p className="mt-2 text-sm text-slate-600">{memberCountLabel(selectedGroupInfo)}</p>
          )}
        </div>
        <Link to="/inbox" className="btn-secondary">
          Inbox
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-white p-1 shadow-soft">
        <button
          type="button"
          className={`rounded-lg px-4 py-3 text-sm font-black ${activeTab === "direct" ? "bg-brand text-navy" : "text-slate-500"}`}
          onClick={() => setActiveTab("direct")}
        >
          Direct
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-3 text-sm font-black ${activeTab === "groups" ? "bg-brand text-navy" : "text-slate-500"}`}
          onClick={() => setActiveTab("groups")}
        >
          Groups
        </button>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          {error.toLowerCase().includes("pay") && activeTab === "direct" && (
            <button type="button" className="btn-primary mt-3" onClick={handlePayAccess}>
              Pay to unlock chat
            </button>
          )}
        </div>
      )}

      {activeTab === "direct" ? (
        <div className="flex max-h-[calc(100dvh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
          {userId ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                <Avatar profile={otherUser} size="h-12 w-12" className="rounded-lg" />
                <div className="min-w-0">
                  <p className="truncate font-bold text-navy">{otherUser?.name || "Conversation"}</p>
                  <p className="truncate text-xs capitalize text-slate-500">
                    {socketConnected ? "Real-time connected" : otherUser?.role || "VibeBook user"}
                  </p>
                </div>
              </div>

              <div ref={directScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto scroll-smooth p-3 pb-5 sm:p-4">
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
                            onContextMenu={(event) => openMessageAction(event, "direct", item, isMine && !item.deletedAt && !item.pending)}
                            onPointerDown={(event) => event.pointerType === "touch" && startLongPress("direct", item, isMine && !item.deletedAt && !item.pending)}
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
                              <button type="button" className="inline-flex items-center text-slate-400 opacity-100 hover:text-navy sm:opacity-0 sm:group-hover/message:opacity-100" onClick={(event) => openMessageAction(event, "direct", item, isMine)}>
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
                  <p className="text-sm text-slate-600">No messages yet.</p>
                )}
                {typingUser && <p className="text-xs font-semibold text-slate-500">{otherUser?.name || "User"} is typing...</p>}
                <div ref={bottomRef} />
              </div>

              <form className="shrink-0 border-t border-slate-100 bg-white/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur sm:p-3" onSubmit={handleSend}>
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
                <div className="flex items-center gap-2">
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
                  className="field max-h-32 min-h-10 flex-1 resize-none rounded-2xl px-4 py-2"
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
            </>
          ) : (
            <div className="p-8 text-center">
              <h2 className="text-lg font-black text-navy">Choose a direct chat</h2>
              <Link className="btn-primary mt-4" to="/inbox">
                Open Inbox
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-5">
            <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={handleCreateGroup}>
              <div className="mb-4 flex items-center gap-2">
                <Plus className="h-5 w-5 text-brand" />
                <h2 className="text-lg font-black text-navy">New group</h2>
              </div>
              <label className="space-y-2">
                <span className="label">Group name</span>
                <input className="field" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
              </label>
              <label className="mt-3 block space-y-2">
                <span className="label">Description</span>
                <textarea
                  className="field min-h-20 resize-none"
                  value={groupDescription}
                  onChange={(event) => setGroupDescription(event.target.value)}
                  maxLength={240}
                  placeholder="What is this community about?"
                />
              </label>
              <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
                {memberOptions.map((member) => (
                  <label key={member._id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-surface p-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member._id)}
                      onChange={(event) =>
                        setSelectedMembers((current) =>
                          event.target.checked ? [...current, member._id] : current.filter((id) => id !== member._id)
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{member.name}</span>
                  </label>
                ))}
              </div>
              <button type="submit" className="btn-primary mt-4 w-full">
                Create Group
              </button>
            </form>

            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft">
              {groups.length ? (
                groups.map((group) => (
                  <div
                    key={group._id}
                    className={`mb-2 rounded-lg p-2 ${
                      selectedGroup === group._id ? "bg-brand text-navy" : "bg-surface text-slate-700"
                    }`}
                  >
                    <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setSelectedGroup(group._id)}>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy text-xs font-black text-white">
                        {group.avatar ? <img src={mediaUrl(group.avatar)} alt="" className="h-full w-full rounded-lg object-cover" onError={handleAvatarError} /> : initialsFor(group.groupName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-black">{group.groupName}</span>
                        {group.description && <span className="block truncate text-xs font-semibold opacity-70">{group.description}</span>}
                        <span className="mt-0.5 block truncate text-xs font-bold opacity-70">{memberCountLabel(group)}</span>
                      </span>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${Number(group.onlineUsersCount || 0) ? "bg-green-500" : "bg-slate-300"}`} />
                    </button>
                    {group.isMember === false && (
                      <button
                        type="button"
                        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-navy/10 bg-white px-3 py-2 text-xs font-black text-navy shadow-sm disabled:opacity-60"
                        onClick={() => handleJoinGroup(group._id)}
                        disabled={groupActionLoading === `join:${group._id}`}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {group.hasPendingInvite ? "Accept Invite" : "Join Group"}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="p-3 text-sm text-slate-600">No groups yet.</p>
              )}
            </div>
          </div>

          <div className="flex max-h-[calc(100dvh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
            <div className="shrink-0 border-b border-slate-100 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <button type="button" className="flex min-w-0 flex-1 gap-3 text-left" onClick={() => selectedGroupInfo && setDetailsModalOpen(true)}>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy text-sm font-black text-white">
                    {selectedGroupInfo?.avatar ? (
                      <img src={mediaUrl(selectedGroupInfo.avatar)} alt="" className="h-full w-full rounded-lg object-cover" onError={handleAvatarError} />
                    ) : (
                      initialsFor(selectedGroupInfo?.groupName || "Group")
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-navy">{selectedGroupInfo?.groupName || selectedGroupInfo?.name || "Group messages"}</p>
                    {selectedGroupInfo && <p className="mt-1 text-xs font-bold text-slate-500">{memberCountLabel(selectedGroupInfo)}</p>}
                  </div>
                </button>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {selectedGroup && !selectedGroupIsMember && (
                    <button
                      type="button"
                      className="btn-primary gap-2"
                      onClick={() => handleJoinGroup(selectedGroup)}
                      disabled={groupActionLoading === `join:${selectedGroup}`}
                    >
                      <UserPlus className="h-4 w-4" />
                      Join
                    </button>
                  )}
                  {selectedGroup && selectedGroupIsMember && (
                    <>
                      <button type="button" className="btn-secondary gap-2" onClick={() => openMemberModal("invite")}>
                        <UserPlus className="h-4 w-4" />
                        Invite
                      </button>
                      {viewerCanAddMembers && <button type="button" className="btn-secondary gap-2" onClick={() => openMemberModal("add")}>
                        <UserCheck className="h-4 w-4" />
                        Add
                      </button>}
                      <button type="button" className="btn-secondary gap-2 text-red-700" onClick={handleLeaveGroup}>
                        <UserMinus className="h-4 w-4" />
                        Leave
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div ref={groupScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto scroll-smooth p-3 pb-5 sm:p-4">
              {!selectedGroup ? (
                <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-lg bg-surface p-6 text-center">
                  <Users className="h-8 w-8 text-brand" />
                  <p className="mt-3 text-lg font-black text-navy">Choose a group</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Join a community or create one to start chatting.</p>
                </div>
              ) : !selectedGroupIsMember ? (
                <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-lg bg-surface p-6 text-center">
                  <UserPlus className="h-8 w-8 text-brand" />
                  <p className="mt-3 text-lg font-black text-navy">Join to view messages</p>
                  <p className="mt-1 max-w-sm text-sm font-semibold text-slate-500">Members can read previous messages, invite friends, and chat in real time.</p>
                  <button type="button" className="btn-primary mt-4 gap-2" onClick={() => handleJoinGroup(selectedGroup)} disabled={groupActionLoading === `join:${selectedGroup}`}>
                    <UserPlus className="h-4 w-4" />
                    {selectedGroupInfo?.hasPendingInvite ? "Accept Invite" : "Join Group"}
                  </button>
                </div>
              ) : loading ? (
                <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
              ) : groupMessages.length ? (
                groupMessages.map((item) => {
                  const isMine = item.sender?._id === user?._id || item.sender === user?._id;
                  if (item.type === "system") {
                    return (
                      <div key={item._id} className="flex justify-center">
                        <p className="rounded-full bg-brand/20 px-4 py-2 text-xs font-black text-navy">{item.message}</p>
                      </div>
                    );
                  }

                  return (
                    <div key={groupMessageKey(item)} className={`group/message flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
                      {!isMine && (
                        <button type="button" onClick={() => item.sender?._id && navigate(`/chat/${item.sender._id}`)} aria-label="Open direct chat">
                          <Avatar profile={item.sender} />
                        </button>
                      )}
                      <div className={`max-w-[78%] ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                        <div
                          className={`relative rounded-2xl px-3 py-2 transition active:scale-[0.99] ${isMine ? "rounded-br-md bg-brand text-navy" : "rounded-bl-md bg-surface text-slate-700"}`}
                          onContextMenu={(event) => openMessageAction(event, "group", item, (isMine || viewerCanModerate) && !item.deletedAt && !item.pending)}
                          onPointerDown={(event) => event.pointerType === "touch" && startLongPress("group", item, (isMine || viewerCanModerate) && !item.deletedAt && !item.pending)}
                          onPointerUp={() => clearTimeout(longPressTimerRef.current)}
                          onPointerCancel={() => clearTimeout(longPressTimerRef.current)}
                        >
                          <button
                            type="button"
                            className="block max-w-full truncate text-xs font-black opacity-70"
                            onClick={() => item.sender?._id && navigate(idOf(item.sender) === user?._id ? "/dashboard" : `/chat/${idOf(item.sender)}`)}
                          >
                            {item.sender?.name || "User"}
                          </button>
                          <ReplyPreview preview={item.replyPreview} />
                          <p className={`mt-1 whitespace-pre-line break-words text-sm leading-6 ${item.deletedAt ? "italic opacity-70" : ""}`}>{item.message}</p>
                          {!item.deletedAt && <LinkPreview text={item.message} />}
                          <AttachmentList attachments={item.attachments || []} />
                        </div>
                        <p className="mt-1 flex items-center gap-2 truncate px-1 text-[11px] font-semibold text-slate-400">
                          <span>{formatTime(item.createdAt)}</span>
                          {isMine && <DeliveryState status={messageStatus(item)} failed={item.failed} onRetry={() => retryGroupMessage(item)} />}
                          {!item.pending && !item.deletedAt && (
                            <button type="button" className="inline-flex items-center text-slate-400 opacity-100 hover:text-navy sm:opacity-0 sm:group-hover/message:opacity-100" onClick={(event) => openMessageAction(event, "group", item, isMine || viewerCanModerate)}>
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </p>
                      </div>
                      {isMine && <Avatar profile={user} />}
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-lg bg-surface p-6 text-center">
                  <Users className="h-8 w-8 text-brand" />
                  <p className="mt-3 text-lg font-black text-navy">No messages yet</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Invite friends to start chatting.</p>
                  <button type="button" className="btn-secondary mt-4 gap-2" onClick={() => openMemberModal("invite")}>
                    <UserPlus className="h-4 w-4" />
                    Invite Friends
                  </button>
                </div>
              )}
              <div ref={groupBottomRef} />
            </div>
            <form className="shrink-0 border-t border-slate-100 bg-white/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur sm:p-3" onSubmit={handleGroupSend}>
              {groupReply && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-slate-600">
                  <Reply className="h-4 w-4 text-brand" />
                  <span className="min-w-0 flex-1 truncate">Replying to {groupReply.sender?.name || "User"}: {groupReply.message}</span>
                  <button type="button" onClick={() => setGroupReply(null)} aria-label="Dismiss reply"><X className="h-4 w-4" /></button>
                </div>
              )}
              {groupAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {groupAttachments.map((item) => (
                    <span key={item.name} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-surface px-2 py-1 text-xs font-bold text-slate-600">
                      {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <FileText className="h-4 w-4" />}
                      <span className="max-w-40 truncate">{item.name}</span>
                      <button type="button" onClick={() => setGroupFiles([])} aria-label="Remove attachment">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
              <input
                ref={groupFileInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/markdown"
                multiple
                onChange={(event) => setGroupFiles(event.target.files)}
              />
              <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-slate-600 transition hover:text-navy disabled:opacity-50" onClick={() => groupFileInputRef.current?.click()} disabled={!selectedGroup || !selectedGroupIsMember} aria-label="Attach file">
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                rows={1}
                className="field max-h-32 min-h-10 flex-1 resize-none rounded-2xl px-4 py-2"
                value={groupMessage}
                onChange={(event) => setGroupMessage(event.target.value)}
                placeholder={selectedGroupIsMember ? "Write a group message" : "Join the group to chat"}
                disabled={!selectedGroup || !selectedGroupIsMember}
              />
              <button type="submit" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-navy shadow-sm transition hover:bg-green-400 disabled:opacity-50" disabled={sending || (!groupMessage.trim() && !groupAttachments.length) || !selectedGroup || !selectedGroupIsMember} aria-label="Send group message">
                {sending ? <Clock3 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {messageAction && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/30 p-3 backdrop-blur-sm sm:items-center sm:justify-center" onClick={closeMessageAction}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            {[
              { label: "Reply", icon: Reply, action: () => replyToMessage(messageAction.kind, messageAction.item) },
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
      {detailsModalOpen && selectedGroupInfo && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
          <div className="max-h-[86dvh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">{memberCountLabel(selectedGroupInfo)}</p>
                <h2 className="text-lg font-black text-navy">{selectedGroupInfo.groupName || selectedGroupInfo.name}</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-slate-600" onClick={() => setDetailsModalOpen(false)} aria-label="Close members">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[64dvh] space-y-2 overflow-y-auto p-4">
              {selectedGroupInfo.members?.map((member) => {
                const memberId = idOf(member);
                const memberRole = roleForMember(selectedGroupInfo, memberId);
                const onlineNow = selectedGroupInfo.activeUsers?.some((active) => idOf(active) === memberId);
                const canPromote = viewerGroupRole === "owner" && memberRole !== "owner";
                const canRemove = memberId !== user?._id && ((viewerGroupRole === "owner" && memberRole !== "owner") || (viewerGroupRole === "moderator" && memberRole === "member"));

                return (
                  <div key={memberId} className="flex min-w-0 items-center gap-3 rounded-lg bg-surface p-3">
                    <button type="button" className="relative" onClick={() => navigate(memberId === user?._id ? "/dashboard" : `/chat/${memberId}`)}>
                      <Avatar profile={member} size="h-10 w-10" />
                      <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${onlineNow ? "bg-green-500" : "bg-slate-300"}`} />
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-navy">{member.name || member.username || "Member"}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-black capitalize text-slate-500">
                        {memberRole !== "member" && <ShieldCheck className="h-3 w-3" />}
                        {memberRole}
                      </span>
                    </span>
                    {canPromote && <button type="button" className="rounded-md bg-white px-2 py-1 text-[10px] font-black text-navy disabled:opacity-50" onClick={() => handleRoleChange(member, memberRole === "moderator" ? "member" : "moderator")} disabled={groupActionLoading === `role:${memberId}`}>{memberRole === "moderator" ? "Demote" : "Mod"}</button>}
                    {canRemove && <button type="button" className="rounded-md bg-red-50 p-2 text-red-600 disabled:opacity-50" onClick={() => handleRemoveMember(member)} disabled={groupActionLoading === `remove:${memberId}`} aria-label="Remove member"><UserMinus className="h-4 w-4" /></button>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {memberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true">
          <div className="max-h-[86dvh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">{memberModalMode === "add" ? "Add members" : "Invite friends"}</p>
                <h2 className="text-lg font-black text-navy">{selectedGroupInfo?.groupName || "Group"}</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-slate-600" onClick={() => setMemberModalOpen(false)} aria-label="Close member modal">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="field pl-9"
                  value={groupMemberSearch}
                  onChange={(event) => setGroupMemberSearch(event.target.value)}
                  placeholder="Search users"
                />
              </label>

              <div className="max-h-[44dvh] space-y-2 overflow-y-auto pr-1">
                {filteredMemberOptions.length ? (
                  filteredMemberOptions.map((member) => {
                    const checked = groupMemberSelection.includes(member._id);
                    return (
                      <label key={member._id} className={`flex items-center gap-3 rounded-lg border p-3 ${checked ? "border-brand bg-brand/10" : "border-slate-200 bg-surface"}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setGroupMemberSelection((current) =>
                              event.target.checked ? [...current, member._id] : current.filter((id) => id !== member._id)
                            )
                          }
                        />
                        <Avatar profile={member} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-navy">{member.name || member.username || "VibeBook user"}</span>
                          {member.username && <span className="block truncate text-xs font-semibold text-slate-500">@{member.username}</span>}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="rounded-lg bg-surface p-4 text-center text-sm font-semibold text-slate-500">No available users found.</p>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" className="btn-secondary flex-1" onClick={() => setMemberModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary flex-1 gap-2" onClick={handleGroupMemberSubmit} disabled={!groupMemberSelection.length || Boolean(groupActionLoading)}>
                {groupActionLoading ? <Clock3 className="h-4 w-4" /> : memberModalMode === "add" ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {memberModalMode === "add" ? "Add" : "Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Chat;
