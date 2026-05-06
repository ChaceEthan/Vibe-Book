// @ts-nocheck
import { Plus, Send, UserMinus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { groupChatApi, mediaUrl, messageApi, userApi } from "../services/api";
import { connectSocket, disconnectSocket, getChatId } from "../services/socket";

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const messageSenderId = (item) => item?.senderId || idOf(item?.sender);
const messageReceiverId = (item) => item?.receiverId || idOf(item?.recipient || item?.receiver);
const messageKey = (item) =>
  item?._id ||
  item?.clientId ||
  `${messageSenderId(item)}:${messageReceiverId(item)}:${item?.createdAt || ""}:${item?.message || item?.text || ""}`;

const normalizeSocketMessage = (item = {}) => ({
  ...item,
  senderId: messageSenderId(item),
  receiverId: messageReceiverId(item),
  sender: item.sender || item.senderId,
  recipient: item.recipient || item.receiver || item.receiverId,
  receiver: item.receiver || item.recipient || item.receiverId,
  message: item.message || item.text || "",
  text: item.text || item.message || "",
  createdAt: item.createdAt || new Date().toISOString(),
});

const groupMessageKey = (item) =>
  item?._id ||
  item?.clientId ||
  `${item?.groupId || idOf(item?.group)}:${idOf(item?.sender) || item?.senderId || ""}:${item?.createdAt || ""}:${item?.message || ""}`;

const normalizeGroupMessage = (item = {}) => ({
  ...item,
  groupId: item.groupId || idOf(item.group),
  senderId: item.senderId || idOf(item.sender),
  sender: item.sender || item.senderId,
  message: item.message || "",
  type: item.type || "message",
  createdAt: item.createdAt || new Date().toISOString(),
});

const Chat = () => {
  const { userId } = useParams();
  const { user, token, payAccess } = useAuth();
  const [activeTab, setActiveTab] = useState(userId ? "direct" : "groups");
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [online, setOnline] = useState(false);
  const [message, setMessage] = useState("");
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupMessage, setGroupMessage] = useState("");
  const [groupName, setGroupName] = useState("");
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const bottomRef = useRef(null);
  const groupBottomRef = useRef(null);
  const typingTimerRef = useRef(null);

  const appendDirectMessage = (nextMessage) => {
    const normalized = normalizeSocketMessage(nextMessage);

    setMessages((current) => {
      const existingIndex = current.findIndex((item) => messageKey(item) === messageKey(normalized));

      if (existingIndex >= 0) {
        return current.map((item, index) => (index === existingIndex ? { ...item, ...normalized, pending: false } : item));
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
        return current.map((item, index) => (index === pendingIndex ? { ...normalized, pending: false } : item));
      }

      return [...current, normalized];
    });
  };

  const appendGroupMessage = (nextMessage) => {
    const normalized = normalizeGroupMessage(nextMessage);

    setGroupMessages((current) => {
      const existingIndex = current.findIndex((item) => groupMessageKey(item) === groupMessageKey(normalized));

      if (existingIndex >= 0) {
        return current.map((item, index) => (index === existingIndex ? { ...item, ...normalized, pending: false } : item));
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
        return current.map((item, index) => (index === pendingIndex ? { ...normalized, pending: false } : item));
      }

      return [...current, normalized];
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
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setOtherUser(data?.otherUser || null);
      setOnline(Boolean(data?.online));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load chat.");
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const { data } = await groupChatApi.list();
      const nextGroups = Array.isArray(data?.groups) ? data.groups : [];
      setGroups(nextGroups);
      setSelectedGroup((current) => current || nextGroups[0]?._id || "");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load groups.");
    }
  };

  const loadMembers = async () => {
    try {
      const { data } = await userApi.search({});
      setMemberOptions((Array.isArray(data?.users) ? data.users : []).filter((item) => item._id !== user?._id).slice(0, 30));
    } catch {
      setMemberOptions([]);
    }
  };

  const loadGroupMessages = async (groupId, { silent = false } = {}) => {
    if (!groupId) {
      setGroupMessages([]);
      return;
    }

    if (!silent) {
      setLoading(true);
    }

    try {
      const { data } = await groupChatApi.getMessages(groupId);
      setGroupMessages(Array.isArray(data?.messages) ? data.messages : []);
      setGroups((current) => current.map((item) => (item._id === data?.group?._id ? data.group : item)));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load group chat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActiveTab(userId ? "direct" : "groups");
  }, [userId]);

  useEffect(() => {
    if (!token || !user?._id || activeTab !== "direct") {
      return undefined;
    }

    const socket = connectSocket(token);

    if (!socket) {
      return undefined;
    }

    const register = () => {
      socket.emit("register_user", { userId: user._id }, (response) => {
        setSocketConnected(Boolean(response?.success));
      });
    };

    const handleConnect = () => {
      setSocketConnected(true);
      register();
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleReceiveMessage = (payload) => {
      const normalized = normalizeSocketMessage(payload);
      const senderId = normalized.senderId;
      const receiverId = normalized.receiverId;
      const belongsToOpenChat =
        userId &&
        ((senderId === user._id && receiverId === userId) || (senderId === userId && receiverId === user._id));

      if (belongsToOpenChat) {
        appendDirectMessage(normalized);
      }
    };

    const handleTyping = (payload = {}) => {
      if (payload.senderId !== userId || payload.receiverId !== user._id) {
        return;
      }

      setTypingUser(payload.typing ? payload.senderId : "");
    };

    const handleStats = (payload = {}) => {
      if (userId && Array.isArray(payload.onlineUserIds)) {
        setOnline(payload.onlineUserIds.includes(userId));
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("global:stats", handleStats);

    if (socket.connected) {
      register();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("global:stats", handleStats);
      clearTimeout(typingTimerRef.current);
      disconnectSocket();
    };
  }, [activeTab, token, user?._id, userId]);

  useEffect(() => {
    if (activeTab !== "direct") {
      return undefined;
    }

    loadConversation();
    const timer = setInterval(() => loadConversation({ silent: true }), 7000);
    return () => clearInterval(timer);
  }, [activeTab, userId]);

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

  useEffect(() => {
    if (!token || !user?._id || activeTab !== "groups") {
      return undefined;
    }

    const socket = connectSocket(token);

    if (!socket) {
      return undefined;
    }

    const register = () => {
      socket.emit("register_user", { userId: user._id }, (response) => {
        setSocketConnected(Boolean(response?.success));
      });
    };

    const joinSelectedGroup = () => {
      if (selectedGroup) {
        socket.emit("join_group", { groupId: selectedGroup });
      }
    };

    const handleConnect = () => {
      setSocketConnected(true);
      register();
      joinSelectedGroup();
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    const handleGroupMessage = (payload = {}) => {
      const messagePayload = payload.message || payload;
      const normalized = normalizeGroupMessage(messagePayload);

      if (selectedGroup && normalized.groupId === selectedGroup) {
        appendGroupMessage(normalized);
      }

      loadGroups();
    };

    const handleGroupMembership = (payload = {}) => {
      const messagePayload = payload.message || {};

      if (selectedGroup && idOf(payload.groupId) === selectedGroup && messagePayload.message) {
        appendGroupMessage(messagePayload);
      }

      loadGroups();
    };

    const handleStats = () => {
      loadGroups();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("receive_group_message", handleGroupMessage);
    socket.on("group:message", handleGroupMessage);
    socket.on("group:member-joined", handleGroupMembership);
    socket.on("group:member-left", handleGroupMembership);
    socket.on("global:stats", handleStats);

    if (socket.connected) {
      register();
      joinSelectedGroup();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receive_group_message", handleGroupMessage);
      socket.off("group:message", handleGroupMessage);
      socket.off("group:member-joined", handleGroupMembership);
      socket.off("group:member-left", handleGroupMembership);
      socket.off("global:stats", handleStats);
      disconnectSocket();
    };
  }, [activeTab, selectedGroup, token, user?._id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    groupBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [groupMessages.length]);

  const handleSend = async (event) => {
    event.preventDefault();

    const text = message.trim();

    if (!text || !userId || !user?._id) {
      return;
    }

    const chatId = getChatId(user._id, userId);
    const pendingId = `pending-${Date.now()}`;
    const optimisticMessage = {
      _id: pendingId,
      clientId: pendingId,
      chatId,
      senderId: user._id,
      receiverId: userId,
      sender: user._id,
      recipient: userId,
      receiver: userId,
      message: text,
      text,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setSending(true);
    setStatus("");
    setError("");
    setMessage("");
    appendDirectMessage(optimisticMessage);

    try {
      const socket = connectSocket(token);

      if (socket?.connected) {
        socket.emit(
          "send_message",
          {
            senderId: user._id,
            receiverId: userId,
            chatId,
            message: text,
          },
          (response) => {
            if (!response?.success) {
              setError(response?.message || "Message failed.");
              return;
            }

            appendDirectMessage(response.data);
          }
        );
      } else {
        const { data } = await messageApi.sendDirect(userId, { message: text, chatId });
        appendDirectMessage(data.chatMessage || data.inboxMessage);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Message failed.");
    } finally {
      setSending(false);
    }
  };

  const handleGroupSend = async (event) => {
    event.preventDefault();

    if (!groupMessage.trim() || !selectedGroup) {
      return;
    }

    const text = groupMessage.trim();
    const pendingId = `pending-group-${Date.now()}`;
    appendGroupMessage({
      _id: pendingId,
      clientId: pendingId,
      group: selectedGroup,
      groupId: selectedGroup,
      sender: user,
      senderId: user?._id,
      message: text,
      createdAt: new Date().toISOString(),
      pending: true,
    });
    setGroupMessage("");
    setSending(true);
    setStatus("");
    setError("");

    try {
      const socket = connectSocket(token);

      if (socket?.connected) {
        socket.emit("send_group_message", { groupId: selectedGroup, senderId: user?._id, message: text }, (response) => {
          if (response?.success && response.data) {
            appendGroupMessage(response.data);
          } else if (response && !response.success) {
            setError(response.message || "Group message failed.");
            loadGroupMessages(selectedGroup, { silent: true });
          }
        });
      } else {
        const { data } = await groupChatApi.send(selectedGroup, { message: text });
        if (data?.groupMessage) {
          appendGroupMessage(data.groupMessage);
        }
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Group message failed.");
    } finally {
      setSending(false);
    }
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();

    if (!groupName.trim() || !selectedMembers.length) {
      setError("Group name and members are required.");
      return;
    }

    setStatus("");
    setError("");

    try {
      const { data } = await groupChatApi.create({
        groupName: groupName.trim(),
        members: selectedMembers,
      });
      setGroupName("");
      setSelectedMembers([]);
      setSelectedGroup(data.group?._id || "");
      setStatus("Group created.");
      await loadGroups();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create group.");
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
      setError(requestError.response?.data?.message || "Unable to leave group.");
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

  const selectedGroupInfo = groups.find((item) => item._id === selectedGroup);

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
            <p className="mt-2 text-sm text-slate-600">{selectedGroupInfo.onlineUsersCount || 0} online</p>
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
        <div className="rounded-lg border border-slate-200 bg-white shadow-soft">
          {userId ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                <img
                  src={mediaUrl(otherUser?.profilePicture || otherUser?.profileImage || otherUser?.images?.[0] || otherUser?.gallery?.[0])}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate font-bold text-navy">{otherUser?.name || "Conversation"}</p>
                  <p className="truncate text-xs capitalize text-slate-500">
                    {socketConnected ? "Real-time connected" : otherUser?.role || "VibeBook user"}
                  </p>
                </div>
              </div>

              <div className="max-h-[520px] min-h-80 space-y-4 overflow-y-auto p-4">
                {loading ? (
                  <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
                ) : messages.length ? (
                  messages.map((item) => {
                    const isMine = messageSenderId(item) === user?._id;
                    return (
                      <div key={item._id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-lg p-3 ${isMine ? "bg-brand text-navy" : "bg-surface text-slate-700"}`}>
                          <p className="whitespace-pre-line break-words text-sm leading-6">{item.message}</p>
                          <p className="mt-2 truncate text-[11px] opacity-70">
                            {item.pending ? "Sending..." : formatTime(item.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-600">No messages yet.</p>
                )}
                {typingUser && <p className="text-xs font-semibold text-slate-500">{otherUser?.name || "User"} is typing...</p>}
                <div ref={bottomRef} />
              </div>

              <form className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row" onSubmit={handleSend}>
                <input
                  className="field flex-1"
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
                <button type="submit" className="btn-primary" disabled={sending || !message.trim()}>
                  {sending ? "Sending..." : "Send"}
                </button>
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
                  <button
                    key={group._id}
                    type="button"
                    className={`mb-2 flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left ${
                      selectedGroup === group._id ? "bg-brand text-navy" : "bg-surface text-slate-700"
                    }`}
                    onClick={() => setSelectedGroup(group._id)}
                  >
                    <span className="min-w-0 truncate font-black">{group.groupName}</span>
                    <span className="shrink-0 text-xs font-bold">{group.onlineUsersCount || 0} online</span>
                  </button>
                ))
              ) : (
                <p className="p-3 text-sm text-slate-600">No groups yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-soft">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-navy">{selectedGroupInfo?.groupName || selectedGroupInfo?.name || "Group messages"}</p>
                  {selectedGroupInfo?.members?.length ? (
                    <p className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-semibold text-slate-500">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {selectedGroupInfo.members.map((member) => member.name || "Member").join(", ")}
                    </p>
                  ) : null}
                  {selectedGroupInfo?.activeUsers?.length ? (
                    <p className="mt-1 truncate text-xs font-bold text-green-700">
                      Active now: {selectedGroupInfo.activeUsers.map((member) => member.name || "Member").join(", ")}
                    </p>
                  ) : null}
                </div>
                {selectedGroup && (
                  <button type="button" className="btn-secondary gap-2 text-red-700" onClick={handleLeaveGroup}>
                    <UserMinus className="h-4 w-4" />
                    Leave
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[520px] min-h-80 space-y-4 overflow-y-auto p-4">
              {loading ? (
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
                    <div key={item._id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[82%] rounded-lg p-3 ${isMine ? "bg-brand text-navy" : "bg-surface text-slate-700"}`}>
                        <p className="truncate text-xs font-black opacity-70">{item.sender?.name || "User"}</p>
                        <p className="mt-1 whitespace-pre-line break-words text-sm leading-6">{item.message}</p>
                        <p className="mt-2 truncate text-[11px] opacity-70">{formatTime(item.createdAt)}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-600">No group messages yet.</p>
              )}
              <div ref={groupBottomRef} />
            </div>
            <form className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row" onSubmit={handleGroupSend}>
              <input
                className="field flex-1"
                value={groupMessage}
                onChange={(event) => setGroupMessage(event.target.value)}
                placeholder="Write a group message"
                disabled={!selectedGroup}
              />
              <button type="submit" className="btn-primary gap-2" disabled={sending || !groupMessage.trim() || !selectedGroup}>
                <Send className="h-4 w-4" />
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default Chat;
