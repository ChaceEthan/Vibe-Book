const ChatMessage = require("../models/ChatMessage");
const User = require("../models/User");
const VisitorStat = require("../models/VisitorStat");
const { validateChatMessage } = require("../utils/chatModeration");
const { getOnlineUsersCount } = require("../socket");

const getDateKey = () => new Date().toISOString().slice(0, 10);

const getGlobalMessages = async (req, res, next) => {
  try {
    const filters = {};

    if (req.user.chatClearedAt) {
      filters.createdAt = { $gt: req.user.chatClearedAt };
    }

    const messages = await ChatMessage.find(filters)
      .populate("user", "name role profileImage")
      .sort({ createdAt: 1 })
      .limit(200);

    return res.json({ messages });
  } catch (error) {
    return next(error);
  }
};

const sendGlobalMessage = async (req, res, next) => {
  try {
    const validation = validateChatMessage(req.body.message);

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const chatMessage = await ChatMessage.create({
      user: req.user._id,
      name: req.user.name,
      message: validation.message,
    });

    await chatMessage.populate("user", "name role profileImage");

    req.app.get("io")?.emit("global:message", chatMessage);

    return res.status(201).json({ message: "Message sent", chatMessage });
  } catch (error) {
    return next(error);
  }
};

const clearMyChatView = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { chatClearedAt: new Date() },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    return res.json({ message: "Chat view cleared", user });
  } catch (error) {
    return next(error);
  }
};

const getChatStats = async (req, res, next) => {
  try {
    const [totalUsers, dailyVisitors] = await Promise.all([
      User.countDocuments({ isBlocked: false }),
      VisitorStat.findOne({ dateKey: getDateKey() }),
    ]);

    return res.json({
      onlineUsers: getOnlineUsersCount(),
      totalRegisteredUsers: totalUsers,
      dailyVisitors: dailyVisitors?.visitors || 0,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  clearMyChatView,
  getChatStats,
  getGlobalMessages,
  sendGlobalMessage,
};
