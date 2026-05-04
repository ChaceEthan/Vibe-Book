const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const ChatMessage = require("./models/ChatMessage");
const User = require("./models/User");
const VisitorStat = require("./models/VisitorStat");
const { validateChatMessage } = require("./utils/chatModeration");

let ioInstance = null;
const onlineUsers = new Map();

const getDateKey = () => new Date().toISOString().slice(0, 10);

const getOnlineUsersCount = () => onlineUsers.size;

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
  return User.findById(decoded.id).select("-password");
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
    onlineUsers.set(socket.user._id.toString(), socket.id);
    socket.join("global");
    await emitStats();

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
      onlineUsers.delete(socket.user._id.toString());
      await emitStats();
    });
  });

  return ioInstance;
};

const getIo = () => ioInstance;

module.exports = {
  getIo,
  getOnlineUsersCount,
  initSocket,
};
