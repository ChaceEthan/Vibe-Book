// @ts-nocheck
const mongoose = require("mongoose");

const Rule = require("../models/Rule");
const User = require("../models/User");
const Booking = require("../models/Booking");
const ChatMessage = require("../models/ChatMessage");
const Feed = require("../models/Feed");
const Payment = require("../models/Payment");
const VisitorStat = require("../models/VisitorStat");
const { getOnlineUsersCount } = require("../socket");
const { isProtectedUser } = require("../utils/adminIsolation");

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
    const [totalUsers, totalDancers, totalArtists, totalBookings, totalChats, totalUploads, revenue, dailyVisitors] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "dancer" }),
      User.countDocuments({ role: "artist" }),
      Booking.countDocuments(),
      ChatMessage.countDocuments(),
      Feed.countDocuments(),
      Payment.aggregate([
        { $match: { status: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      VisitorStat.findOne({ dateKey: getDateKey() }),
    ]);

    return res.json({
      totalUsers,
      totalDancers,
      totalArtists,
      totalBookings,
      totalChats,
      totalUploads,
      revenue: revenue?.[0]?.total || 0,
      onlineUsers: getOnlineUsersCount(),
      dailyVisitors: dailyVisitors?.visitors || 0,
    });
  } catch (error) {
    return next(error);
  }
};

const getDashboardStats = async (req, res, next) => {
  try {
    const [totalUsers, totalBookings, totalChats, totalUploads, revenue, dailyVisitors, mostViewedVideos] = await Promise.all([
      User.countDocuments(),
      Booking.countDocuments(),
      ChatMessage.countDocuments(),
      Feed.countDocuments(),
      Payment.aggregate([
        { $match: { status: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      VisitorStat.findOne({ dateKey: getDateKey() }),
      Feed.find({ type: "video", mediaUrl: /^https:\/\/res\.cloudinary\.com\//i })
        .populate("userId", "name")
        .sort({ views: -1, createdAt: -1 })
        .limit(5),
    ]);
    const totalEngagement = await Feed.aggregate([
      { $match: { mediaUrl: /^https:\/\/res\.cloudinary\.com\//i } },
      {
        $group: {
          _id: null,
          views: { $sum: "$views" },
          shares: { $sum: "$shareCount" },
          likes: { $sum: { $size: { $ifNull: ["$likedBy", []] } } },
          comments: { $sum: { $size: { $ifNull: ["$comments", []] } } },
        },
      },
    ]);
    const engagement = totalEngagement[0] || { views: 0, likes: 0, comments: 0, shares: 0 };
    const engagementRate = engagement.views
      ? Number((((engagement.likes + engagement.comments + engagement.shares) / engagement.views) * 100).toFixed(2))
      : 0;

    return res.json({
      totalUsers,
      totalPosts: totalUploads,
      totalBookings,
      totalChats,
      totalUploads,
      revenue: revenue?.[0]?.total || 0,
      onlineUsers: getOnlineUsersCount(),
      dailyVisitors: dailyVisitors?.visitors || 0,
      engagement,
      engagementRate,
      mostViewedVideos: mostViewedVideos.map((post) => ({
        _id: post._id,
        url: post.mediaUrl,
        views: post.views || 0,
        likes: Array.isArray(post.likedBy) ? post.likedBy.length : 0,
        comments: Array.isArray(post.comments) ? post.comments.length : 0,
        shares: post.shareCount || 0,
        user: post.userId,
        createdAt: post.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

const deleteUser = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    let deletedPosts = 0;
    const user = await User.findById(req.params.id).session(session);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Admins cannot delete their own account" });
    }

    if (isProtectedUser(user)) {
      return res.status(403).json({ message: "Protected admin users cannot be deleted" });
    }

    await session.withTransaction(async () => {
      const feedResult = await Feed.deleteMany({ userId: user._id }).session(session);
      deletedPosts = feedResult.deletedCount || 0;
      await User.deleteOne({ _id: user._id }).session(session);
    });

    return res.json({ message: "User deleted", deletedPosts });
  } catch (error) {
    return next(error);
  } finally {
    await session.endSession();
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

const featureProfile = async (req, res, next) => {
  try {
    const featured = req.body.featured !== false;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isPremium: featured,
        premiumBadge: featured,
      },
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
  featureProfile,
  createRule,
};
