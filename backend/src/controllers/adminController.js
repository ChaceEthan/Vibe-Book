// @ts-nocheck
const Rule = require("../models/Rule");
const User = require("../models/User");
const Booking = require("../models/Booking");
const ChatMessage = require("../models/ChatMessage");
const VisitorStat = require("../models/VisitorStat");
const { getOnlineUsersCount } = require("../socket");

const getDateKey = () => new Date().toISOString().slice(0, 10);

const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    return res.json({ users });
  } catch (error) {
    return next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    const [totalUsers, totalDancers, totalArtists, totalBookings, totalChats, dailyVisitors] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "dancer" }),
      User.countDocuments({ role: "artist" }),
      Booking.countDocuments(),
      ChatMessage.countDocuments(),
      VisitorStat.findOne({ dateKey: getDateKey() }),
    ]);

    return res.json({
      totalUsers,
      totalDancers,
      totalArtists,
      totalBookings,
      totalChats,
      onlineUsers: getOnlineUsersCount(),
      dailyVisitors: dailyVisitors?.visitors || 0,
    });
  } catch (error) {
    return next(error);
  }
};

const getDashboardStats = async (req, res, next) => {
  try {
    const [totalUsers, totalBookings, totalChats, dailyVisitors] = await Promise.all([
      User.countDocuments(),
      Booking.countDocuments(),
      ChatMessage.countDocuments(),
      VisitorStat.findOne({ dateKey: getDateKey() }),
    ]);

    return res.json({
      totalUsers,
      totalBookings,
      totalChats,
      onlineUsers: getOnlineUsersCount(),
      dailyVisitors: dailyVisitors?.visitors || 0,
    });
  } catch (error) {
    return next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ message: "User deleted" });
  } catch (error) {
    return next(error);
  }
};

const blockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
};

const unblockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
};

const verifyUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified: true },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
};

const createRule = async (req, res, next) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "Title and description are required" });
    }

    const rule = await Rule.create({ title, description });
    return res.status(201).json({ rule });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAllUsers,
  getDashboardStats,
  getStats,
  deleteUser,
  blockUser,
  unblockUser,
  verifyUser,
  createRule,
};
