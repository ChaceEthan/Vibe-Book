// @ts-nocheck
const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const { createNotification: createNotificationRecord } = require("../utils/notifications");

const isValidObjectId = (value) => {
  const id = value?._id?.toString?.() || value?.toString?.() || "";
  return mongoose.isValidObjectId(id);
};

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const getNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const type = String(req.query.type || "").trim();
    const allowedTypes = new Set(Notification.schema.path("type").enumValues || []);

    if (type && !allowedTypes.has(type)) {
      return res.status(400).json({ message: "Unsupported notification type" });
    }

    const filter = {
      userId: req.user._id,
      ...(type ? { type } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate("actorId", "name username profilePicture profileImage")
        .populate("postId", "mediaUrl caption")
        .populate("messageId", "message")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user._id, read: false }),
    ]);

    return res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      unreadCount,
    });
  } catch (error) {
    console.error("[notifications:get]", error);
    return next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid notification id is required" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { read: true, readAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });

    return res.json({ notification, unreadCount, message: "Notification marked as read" });
  } catch (error) {
    console.error("[notification:mark-read]", error);
    return next(error);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    return res.json({
      updated: result.modifiedCount,
      unreadCount: 0,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("[notification:mark-all-read]", error);
    return next(error);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid notification id is required" });
    }

    const result = await Notification.deleteOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });

    return res.json({ unreadCount, message: "Notification deleted" });
  } catch (error) {
    console.error("[notification:delete]", error);
    return next(error);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });

    return res.json({ unreadCount });
  } catch (error) {
    console.error("[notification:unread-count]", error);
    return next(error);
  }
};

const createNotification = async (userIdOrPayload, type, title, message, actorId, postId, data = {}) => {
  if (
    userIdOrPayload &&
    typeof userIdOrPayload === "object" &&
    Object.prototype.hasOwnProperty.call(userIdOrPayload, "userId")
  ) {
    return createNotificationRecord(userIdOrPayload);
  }

  return createNotificationRecord({
    userId: userIdOrPayload,
    type,
    title,
    message,
    actorId,
    postId,
    data,
  });
};

module.exports = {
  createNotification,
  deleteNotification,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
};
