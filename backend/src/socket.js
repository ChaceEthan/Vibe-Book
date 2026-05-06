// @ts-nocheck
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const ChatMessage = require("./models/ChatMessage");
const ChatGroup = require("./models/ChatGroup");
const GroupMessage = require("./models/GroupMessage");
const Message = require("./models/Message");
const User = require("./models/User");
const VisitorStat = require("./models/VisitorStat");
const { validateChatMessage } = require("./utils/chatModeration");

let ioInstance = null;
const onlineUsers = new Map();

const getDateKey = () => new Date().toISOString().slice(0, 10);

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

const serializeDirectMessage = (message) => ({
  _id: message._id,
  chatId: message.chatId,
  senderId: message.senderId || message.sender?.toString?.() || "",
  receiverId: message.receiverId || message.recipient?.toString?.() || message.receiver?.toString?.() || "",
  message: message.message,
  text: message.text || message.message,
  createdAt: message.createdAt,
  sender: message.sender,
  recipient: message.recipient,
  receiver: message.receiver || message.recipient,
});

const serializeGroupMessage = (message) => ({
  _id: message._id,
  group: message.group,
  groupId: message.group?._id?.toString?.() || message.group?.toString?.() || "",
  sender: message.sender,
  senderId: message.sender?._id?.toString?.() || message.sender?.toString?.() || "",
  message: message.message,
  type: message.type || "message",
  createdAt: message.createdAt,
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
  ioInstance = new Server(server, {
    cors: {
      origin: corsOptions.origin || true,
      credentials: true,
    },
  });

  ioInstance.use(async (socket, next) => {
    try {
      const user = await getUserFromSocket(socket);

      if (!user || user.isBlocked) {
        return next(new Error("Unauthorized"));
      }

      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error("Unauthorized"));
    }
  });

  ioInstance.on("connection", async (socket) => {
    const userId = socket.user._id.toString();
    addOnlineUser(userId, socket.id);
    socket.join("global");
    socket.join(userId);
    await joinUserGroupRooms(socket, userId);
    console.log(`Socket connected: ${userId}`);
    await emitStats();

    socket.on("register_user", async (payload = {}, callback) => {
      const requestedUserId = payload.userId?.toString?.() || payload.senderId?.toString?.() || payload?.toString?.() || "";

      if (requestedUserId !== userId) {
        callback?.({ success: false, message: "Cannot register another user" });
        return;
      }

      addOnlineUser(userId, socket.id);
      socket.join(userId);
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

        const validation = validateChatMessage(payload.message);

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

        const directMessage = await Message.create({
          chatId: payload.chatId || chatIdFor(userId, receiverId),
          sender: userId,
          senderId: userId,
          recipient: receiver._id,
          receiver: receiver._id,
          receiverId: receiver._id.toString(),
          subject: "VibeBook chat",
          message: validation.message,
          text: validation.message,
          type: "reply",
        });
        const messagePayload = serializeDirectMessage(directMessage);

        ioInstance.to(receiver._id.toString()).emit("receive_message", messagePayload);
        ioInstance.to(userId).emit("receive_message", messagePayload);
        callback?.({ success: true, message: "Message sent", data: messagePayload });
      } catch (error) {
        console.error(`Socket send_message failed: ${error.message}`);
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

    socket.on("join_group", async (payload = {}, callback) => {
      try {
        const groupId = payload.groupId?.toString?.() || payload?.toString?.() || "";
        const group = await ChatGroup.findOne({ _id: groupId, isActive: true }).select("members");

        if (!group || !userIsGroupMember(group, userId)) {
          callback?.({ success: false, message: "You are not a member of this group" });
          return;
        }

        socket.join(groupRoomFor(group._id));
        callback?.({ success: true, groupId: group._id.toString() });
      } catch (error) {
        callback?.({ success: false, message: "Unable to join group room" });
      }
    });

    socket.on("send_group_message", async (payload = {}, callback) => {
      try {
        const groupId = payload.groupId?.toString?.() || "";
        const validation = validateChatMessage(payload.message);

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
          message: validation.message,
        });

        group.updatedAt = new Date();
        await group.save();
        await groupMessage.populate("sender", "name role profileImage profilePicture images gallery");

        const messagePayload = serializeGroupMessage(groupMessage);
        ioInstance.to(groupRoomFor(group._id)).emit("receive_group_message", messagePayload);
        ioInstance.to(groupRoomFor(group._id)).emit("group:message", {
          groupId: group._id,
          message: messagePayload,
        });
        callback?.({ success: true, message: "Message sent", data: messagePayload });
      } catch (error) {
        console.error(`Socket send_group_message failed: ${error.message}`);
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

    socket.on("disconnect", async () => {
      removeOnlineUser(userId, socket.id);
      console.log(`Socket disconnected: ${userId}`);
      await emitStats();
    });
  });

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
