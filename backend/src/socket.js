// @ts-nocheck
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const ChatMessage = require("./models/ChatMessage");
const ChatGroup = require("./models/ChatGroup");
const GroupMessage = require("./models/GroupMessage");
const Message = require("./models/Message");
const User = require("./models/User");
const VisitorStat = require("./models/VisitorStat");
const { validateChatMessage } = require("./utils/chatModeration");
const { createNotification } = require("./utils/notifications");
const { initializeWalletSockets } = require("./modules/wallet/walletSocket");
const purchaseService = require("./modules/marketplace/purchaseService");

let ioInstance = null;
const onlineUsers = new Map();
const isProduction = process.env.NODE_ENV === "production";

const getDateKey = () => new Date().toISOString().slice(0, 10);
const logSocketError = (scope, error) => {
  const message = error?.message || "Unexpected socket error";

  if (isProduction) {
    console.error(`[${scope}] ${message}`);
    return;
  }

  console.error(`[${scope}]`, error);
};

const saveSocketDocument = async (document, scope) => {
  try {
    return await document.save();
  } catch (error) {
    logSocketError(`${scope}:mongoose-save`, error);
    error.vibeBookLogged = true;
    throw error;
  }
};

const getOnlineUsersCount = () => onlineUsers.size;

const isUserOnline = (userId) => {
  return onlineUsers.has(userId?.toString());
};

const getOnlineUserIds = () => Array.from(onlineUsers.keys());

const addOnlineUser = (userId, socketId) => {
  const id = userId?.toString();

  if (!id) {
    return;
  }

  const sockets = onlineUsers.get(id) || new Set();
  sockets.add(socketId);
  onlineUsers.set(id, sockets);
};

const removeOnlineUser = (userId, socketId) => {
  const id = userId?.toString();
  const sockets = onlineUsers.get(id);

  if (!id || !sockets) {
    return;
  }

  sockets.delete(socketId);

  if (!sockets.size) {
    onlineUsers.delete(id);
  }
};

const chatIdFor = (left, right) => [left?.toString(), right?.toString()].filter(Boolean).sort().join(":");
const groupRoomFor = (groupId) => `group:${groupId?.toString?.() || groupId}`;
const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";
const normalizeObjectId = (value) => {
  const id = value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";
  return mongoose.isValidObjectId(id) ? id : "";
};
const queueNotification = (payload) => {
  createNotification(payload).catch((error) => {
    logSocketError("socket:notification", error);
  });
};
const textMentionsName = (text = "", name = "") => {
  const safeName = String(name || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (!safeName) {
    return false;
  }

  return new RegExp(`(^|\\s)@${safeName}(?=\\s|$|[.,!?])`, "i").test(text);
};

const serializeDirectMessage = (message) => ({
  _id: message._id,
  chatId: message.chatId,
  clientId: message.clientId,
  senderId: message.senderId || message.sender?.toString?.() || "",
  receiverId: message.receiverId || message.recipient?.toString?.() || message.receiver?.toString?.() || "",
  message: message.message,
  text: message.text || message.message,
  createdAt: message.createdAt,
  deliveredAt: message.deliveredAt,
  readAt: message.readAt,
  seenAt: message.seenAt,
  deliveryStatus: message.deliveryStatus || (message.readAt ? "seen" : message.deliveredAt ? "delivered" : "sent"),
  status: message.deliveryStatus || (message.readAt ? "seen" : message.deliveredAt ? "delivered" : "sent"),
  sender: message.sender,
  recipient: message.recipient,
  receiver: message.receiver || message.recipient,
});

const serializeGroupMessage = (message) => ({
  _id: message._id,
  clientId: message.clientId,
  group: message.group,
  groupId: message.group?._id?.toString?.() || message.group?.toString?.() || "",
  sender: message.sender,
  senderId: message.sender?._id?.toString?.() || message.sender?.toString?.() || "",
  message: message.message,
  text: message.message,
  type: message.type || "message",
  createdAt: message.createdAt,
  timestamp: message.createdAt,
});

const userIsGroupMember = (group, userId) => {
  const id = userId?.toString?.() || String(userId || "");
  return Array.isArray(group?.members) && group.members.some((member) => {
    const memberId = member?._id?.toString?.() || member?.toString?.() || "";
    return memberId === id;
  });
};

const joinUserGroupRooms = async (socket, userId) => {
  const groups = await ChatGroup.find({
    members: userId,
    isActive: true,
  }).select("_id");

  groups.forEach((group) => socket.join(groupRoomFor(group._id)));
};

const unreadCountFor = (userId) =>
  Message.countDocuments({
    $or: [{ recipient: userId }, { receiver: userId }],
    isDraft: false,
    readAt: { $exists: false },
    hiddenFor: { $ne: userId },
  });

const emitUnreadCount = async (userId) => {
  if (!ioInstance || !userId) {
    return;
  }

  const unreadCount = await unreadCountFor(userId);
  ioInstance.to(userId.toString()).emit("unread:update", { unreadCount });
};

const markPendingMessagesDelivered = async (userId) => {
  const pendingMessages = await Message.find({
    $or: [{ recipient: userId }, { receiver: userId }],
    isDraft: false,
    deliveredAt: { $exists: false },
    deliveryStatus: { $in: ["sent", null] },
  }).select("_id chatId clientId sender");

  if (!pendingMessages.length) {
    await emitUnreadCount(userId);
    return;
  }

  const deliveredAt = new Date();
  const ids = pendingMessages.map((message) => message._id);

  await Message.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        deliveredAt,
        deliveryStatus: "delivered",
      },
    }
  );

  pendingMessages.forEach((message) => {
    ioInstance?.to(idOf(message.sender)).emit("message:delivery", {
      messageId: message._id,
      clientId: message.clientId,
      chatId: message.chatId,
      status: "delivered",
      deliveredAt,
    });
  });

  await emitUnreadCount(userId);
};

const emitStats = async () => {
  if (!ioInstance) {
    return;
  }

  try {
    const [totalRegisteredUsers, dailyVisitors] = await Promise.all([
      User.countDocuments({ isBlocked: false }),
      VisitorStat.findOne({ dateKey: getDateKey() }),
    ]);

    ioInstance.emit("global:stats", {
      onlineUsers: getOnlineUsersCount(),
      onlineUserIds: getOnlineUserIds(),
      totalRegisteredUsers,
      dailyVisitors: dailyVisitors?.visitors || 0,
    });
  } catch (error) {
    console.error(`Socket stats failed: ${error.message}`);
  }
};

const getUserFromSocket = async (socket) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");

  if (!token) {
    return null;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.id || decoded._id || decoded.userId || decoded.sub;
  return User.findById(userId).select("-password");
};

const initSocket = (server, corsOptions = {}) => {
  if (ioInstance) {
    console.warn("[socket] initSocket called more than once; reusing existing instance");
    return ioInstance;
  }

  const socketCorsConfig = {
    credentials: true,
    methods: corsOptions.methods || ["GET", "POST", "OPTIONS"],
    allowedHeaders: corsOptions.allowedHeaders || ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  };

  // Handle different CORS origin formats
  if (typeof corsOptions.origin === "string") {
    socketCorsConfig.origin = corsOptions.origin;
  } else if (Array.isArray(corsOptions.origin)) {
    socketCorsConfig.origin = corsOptions.origin;
  } else if (corsOptions.origin === true || !corsOptions.origin) {
    socketCorsConfig.origin = true;
  } else {
    socketCorsConfig.origin = corsOptions.origin;
  }

  ioInstance = new Server(server, {
    cors: socketCorsConfig,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  ioInstance.use(async (socket, next) => {
    try {
      const user = await getUserFromSocket(socket);

      if (!user || user.isBlocked || user.accountStatus === "pending_verification" || user.accountStatus === "suspended") {
        console.warn("[socket] unauthorized connection attempt");
        return next(new Error("Unauthorized"));
      }

      socket.user = user;
      return next();
    } catch (error) {
      console.warn(`[socket] authentication failed: ${error.message}`);
      return next(new Error("Unauthorized"));
    }
  });

  ioInstance.engine.on("connection_error", (error) => {
    console.warn(`[socket] connection failed: ${error.message}`);
  });

  ioInstance.on("connection", async (socket) => {
    const userId = socket.user._id.toString();

    try {
      addOnlineUser(userId, socket.id);
      socket.join("global");
      socket.join(userId);
      await joinUserGroupRooms(socket, userId);
      await markPendingMessagesDelivered(userId);
      socket.data.activeGroupRoom = "";
      console.log(`Socket connected: ${userId}${socket.recovered ? " (recovered)" : ""}`);
      await emitStats();
    } catch (error) {
      removeOnlineUser(userId, socket.id);
      console.error(`[socket] connection setup failed for ${userId}: ${error.message}`);
      socket.disconnect(true);
      return;
    }

    socket.on("register_user", async (payload = {}, callback) => {
      const requestedUserId = payload.userId?.toString?.() || payload.senderId?.toString?.() || payload?.toString?.() || "";

      if (requestedUserId !== userId) {
        callback?.({ success: false, message: "Cannot register another user" });
        return;
      }

      addOnlineUser(userId, socket.id);
      socket.join(userId);
      await markPendingMessagesDelivered(userId);
      await emitStats();
      callback?.({ success: true, userId, socketId: socket.id, onlineUserIds: getOnlineUserIds() });
    });

    socket.on("send_message", async (payload = {}, callback) => {
      try {
        const senderId = payload.senderId?.toString?.() || userId;
        const receiverId = payload.receiverId?.toString?.() || payload.recipientId?.toString?.() || "";

        if (senderId !== userId) {
          callback?.({ success: false, message: "Cannot send as another user" });
          return;
        }

        if (!receiverId || receiverId === userId) {
          callback?.({ success: false, message: "Valid receiverId is required" });
          return;
        }

        const validation = validateChatMessage(payload.message || payload.text);

        if (validation.error) {
          callback?.({ success: false, message: validation.error });
          return;
        }

        const receiver = await User.findOne({
          _id: receiverId,
          isBlocked: false,
          role: { $ne: "admin" },
        }).select("_id");

        if (!receiver) {
          callback?.({ success: false, message: "Receiver not found" });
          return;
        }

        const receiverOnline = isUserOnline(receiver._id);
        const directMessage = await Message.create({
          chatId: payload.chatId || chatIdFor(userId, receiverId),
          clientId: payload.clientId,
          sender: userId,
          senderId: userId,
          recipient: receiver._id,
          receiver: receiver._id,
          receiverId: receiver._id.toString(),
          subject: "VibeBook chat",
          message: validation.message,
          text: validation.message,
          type: "reply",
          deliveryStatus: receiverOnline ? "delivered" : "sent",
          deliveredAt: receiverOnline ? new Date() : undefined,
        });

        await directMessage.populate([
          { path: "sender", select: "name role profileImage profilePicture images gallery" },
          { path: "recipient", select: "name role profileImage profilePicture images gallery" },
          { path: "receiver", select: "name role profileImage profilePicture images gallery" },
        ]);
        const messagePayload = serializeDirectMessage(directMessage);

        ioInstance.to(receiver._id.toString()).emit("receive_message", messagePayload);
        ioInstance.to(userId).emit("receive_message", messagePayload);
        ioInstance.to(userId).emit("message:delivery", {
          messageId: directMessage._id,
          clientId: directMessage.clientId,
          chatId: directMessage.chatId,
          status: directMessage.deliveryStatus,
          deliveredAt: directMessage.deliveredAt,
        });
        await emitUnreadCount(receiver._id);
        queueNotification({
          userId: receiver._id,
          type: "message",
          title: "New message",
          message: `${socket.user.name || "Someone"} sent you a message`,
          actorId: socket.user._id,
          messageId: directMessage._id,
          dedupeKey: `message:${directMessage._id}`,
        });
        callback?.({ success: true, message: "Message sent", data: messagePayload });
      } catch (error) {
        logSocketError("socket:send_message", error);
        callback?.({ success: false, message: "Message failed" });
      }
    });

    socket.on("typing", (payload = {}) => {
      const receiverId = payload.receiverId?.toString?.() || "";

      if (!receiverId || payload.senderId?.toString?.() !== userId) {
        return;
      }

      ioInstance.to(receiverId).emit("typing", {
        senderId: userId,
        receiverId,
        chatId: payload.chatId || chatIdFor(userId, receiverId),
        typing: Boolean(payload.typing),
      });
    });

    socket.on("message:seen", async (payload = {}, callback) => {
      try {
        const otherUserId = normalizeObjectId(payload.userId || payload.senderId || payload.otherUserId);

        if (!otherUserId) {
          callback?.({ success: false, message: "Valid userId is required" });
          return;
        }

        const unseenMessages = await Message.find({
          sender: otherUserId,
          $or: [{ recipient: userId }, { receiver: userId }],
          isDraft: false,
          readAt: { $exists: false },
        }).select("_id chatId clientId sender");

        if (!unseenMessages.length) {
          await emitUnreadCount(userId);
          callback?.({ success: true, count: 0 });
          return;
        }

        const seenAt = new Date();
        const ids = unseenMessages.map((message) => message._id);

        await Message.updateMany(
          { _id: { $in: ids } },
          {
            $set: {
              readAt: seenAt,
              seenAt,
              deliveryStatus: "seen",
            },
          }
        );

        unseenMessages.forEach((message) => {
          ioInstance.to(otherUserId).emit("message:delivery", {
            messageId: message._id,
            clientId: message.clientId,
            chatId: message.chatId,
            status: "seen",
            seenAt,
            readAt: seenAt,
          });
        });

        await emitUnreadCount(userId);
        callback?.({ success: true, count: unseenMessages.length });
      } catch (error) {
        logSocketError("socket:message_seen", error);
        callback?.({ success: false, message: "Unable to mark messages seen" });
      }
    });

    socket.on("join_group", async (payload = {}, callback) => {
      try {
        const groupId = normalizeObjectId(payload.groupId || payload);

        if (!groupId) {
          callback?.({ success: false, message: "Valid groupId is required" });
          return;
        }

        const group = await ChatGroup.findOne({ _id: groupId, isActive: true }).select("members");

        if (!group || !userIsGroupMember(group, userId)) {
          callback?.({ success: false, message: "You are not a member of this group" });
          return;
        }

        const room = groupRoomFor(group._id);
        if (socket.data.activeGroupRoom && socket.data.activeGroupRoom !== room) {
          socket.leave(socket.data.activeGroupRoom);
        }

        socket.join(room);
        socket.data.activeGroupRoom = room;
        console.log(`[socket] ${userId} joined group ${group._id}`);
        callback?.({ success: true, groupId: group._id.toString() });
      } catch (error) {
        callback?.({ success: false, message: "Unable to join group room" });
      }
    });

    socket.on("leave_group", (payload = {}, callback) => {
      try {
        const groupId = normalizeObjectId(payload.groupId || payload);

        if (!groupId) {
          callback?.({ success: false, message: "Valid groupId is required" });
          return;
        }

        const room = groupRoomFor(groupId);
        socket.leave(room);

        if (socket.data.activeGroupRoom === room) {
          socket.data.activeGroupRoom = "";
        }

        console.log(`[socket] ${userId} left group ${groupId}`);
        callback?.({ success: true, groupId });
      } catch (error) {
        logSocketError("socket:leave_group", error);
        callback?.({ success: false, message: "Unable to leave group room" });
      }
    });

    socket.on("send_group_message", async (payload = {}, callback) => {
      try {
        const groupId = normalizeObjectId(payload.groupId);
        const rawMessage = payload.message || payload.text;

        if (!groupId || !rawMessage) {
          callback?.({ success: false, message: "Invalid payload" });
          return;
        }

        const validation = validateChatMessage(rawMessage);

        if (validation.error) {
          callback?.({ success: false, message: validation.error });
          return;
        }

        const group = await ChatGroup.findOne({
          _id: groupId,
          isActive: true,
          members: userId,
        });

        if (!group) {
          callback?.({ success: false, message: "You are not a member of this group" });
          return;
        }

        const groupMessage = await GroupMessage.create({
          group: group._id,
          sender: socket.user._id,
          clientId: payload.clientId,
          message: validation.message,
        });

        group.updatedAt = new Date();
        await saveSocketDocument(group, "socket:send_group_message");
        await groupMessage.populate("sender", "name role profileImage profilePicture images gallery");

        const room = groupRoomFor(group._id);
        const messagePayload = serializeGroupMessage(groupMessage);
        ioInstance.to(room).emit("receive_group_message", messagePayload);
        ioInstance.to(room).emit("group:message", {
          groupId: group._id,
          message: messagePayload,
        });
        User.find({ _id: { $in: group.members }, isBlocked: false })
          .select("name")
          .then((members) => {
            members
              .filter((member) => idOf(member._id) !== userId)
              .forEach((member) => {
                const mentioned = textMentionsName(validation.message, member.name);

                queueNotification({
                  userId: member._id,
                  type: mentioned ? "mention" : "group_message",
                  title: mentioned ? "You were mentioned" : "New group message",
                  message: `${socket.user.name || "Someone"} posted in ${group.groupName || group.name || "a group"}`,
                  actorId: socket.user._id,
                  groupId: group._id,
                  data: { groupMessageId: groupMessage._id?.toString?.() || "" },
                  dedupeKey: `${mentioned ? "mention" : "group-message"}:${groupMessage._id}:${member._id}`,
                });
              });
          })
          .catch((error) => logSocketError("socket:group_notification", error));
        callback?.({ success: true, message: "Message sent", data: messagePayload });
      } catch (error) {
        if (!error?.vibeBookLogged) {
          logSocketError("socket:send_group_message", error);
        }
        callback?.({ success: false, message: "Group message failed" });
      }
    });

    socket.on("global:send", async (payload = {}, callback) => {
      try {
        const validation = validateChatMessage(payload.message);

        if (validation.error) {
          callback?.({ success: false, message: validation.error });
          return;
        }

        const chatMessage = await ChatMessage.create({
          user: socket.user._id,
          name: socket.user.name,
          message: validation.message,
        });

        await chatMessage.populate("user", "name role profileImage");
        ioInstance.to("global").emit("global:message", chatMessage);
        callback?.({ success: true, data: { chatMessage }, message: "Message sent" });
      } catch (error) {
        callback?.({ success: false, message: "Message failed" });
      }
    });

    socket.on("store:purchase", async (payload = {}, callback) => {
      try {
        const itemId = String(payload.itemId || "").trim().toLowerCase();
        if (!itemId) {
          callback?.({ success: false, message: "itemId is required" });
          return;
        }

        const result = await purchaseService.purchaseItem(userId, itemId, { postId: payload.postId });
        const response = {
          success: true,
          item: result.item,
          wallet: result.wallet,
          transaction: result.transaction,
          inventory: result.inventory,
          boost: result.boost,
          featured: result.featured,
        };
        ioInstance.to(userId).emit("store:purchase", response);
        ioInstance.to(userId).emit("inventory:update", { inventory: result.inventory });
        if (result.boost) ioInstance.to(userId).emit("creator:boost", { boost: result.boost });
        if (result.featured) ioInstance.to(userId).emit("featured:update", { featured: result.featured });
        if (result.item?.category === "themes") ioInstance.to(userId).emit("profile:theme", { inventory: result.inventory });
        callback?.(response);
      } catch (error) {
        callback?.({
          success: false,
          message: error.code === "INSUFFICIENT_BALANCE" ? "Not enough NEX Points for this purchase" : error.message || "Purchase failed",
          code: error.code,
          cooldownUntil: error.cooldownUntil,
        });
      }
    });

    socket.on("inventory:equip", async (payload = {}, callback) => {
      try {
        const inventory = await purchaseService.equipItem(userId, payload.itemId, payload.action || "equip");
        ioInstance.to(userId).emit("inventory:update", { inventory });
        ioInstance.to(userId).emit("profile:theme", { inventory });
        callback?.({ success: true, inventory });
      } catch (error) {
        callback?.({ success: false, message: error.message || "Inventory update failed", code: error.code });
      }
    });

    socket.on("disconnect", async (reason) => {
      removeOnlineUser(userId, socket.id);
      console.log(`Socket disconnected: ${userId} (${reason})`);
      await emitStats();
    });
  });

  // Initialize wallet socket events
  try {
    initializeWalletSockets(ioInstance, onlineUsers);
    console.log("[socket] wallet sockets initialized");
  } catch (error) {
    console.error("[socket] failed to initialize wallet sockets:", error.message);
  }

  return ioInstance;
};

const getIo = () => ioInstance;

module.exports = {
  getIo,
  getOnlineUserIds,
  getOnlineUsersCount,
  initSocket,
  isUserOnline,
};
