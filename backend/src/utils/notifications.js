// @ts-nocheck
const Notification = require("../models/Notification");

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const safeText = (value, fallback = "") => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
};

const emitNotification = async (notification) => {
  try {
    const { getIo } = require("../socket");
    const io = getIo?.();
    const userId = idOf(notification?.userId);

    if (io && userId) {
      const unreadCount = await Notification.countDocuments({ userId, read: false });
      io.to(userId).emit("notification:new", { notification, unreadCount });
    }
  } catch {
    // Realtime delivery is best-effort; persisted notifications remain the source of truth.
  }
};

const createNotification = async ({
  userId,
  type,
  title,
  message = "",
  actorId = null,
  postId = null,
  messageId = null,
  groupId = null,
  data = {},
  dedupeKey = "",
}) => {
  try {
    const targetUserId = idOf(userId);

    if (!targetUserId || (actorId && idOf(actorId) === targetUserId && type !== "creator_milestone")) {
      return null;
    }

    const normalizedDedupeKey = safeText(dedupeKey || data?.dedupeKey);

    if (normalizedDedupeKey) {
      const existing = await Notification.findOne({
        userId: targetUserId,
        type,
        dedupeKey: normalizedDedupeKey,
      });

      if (existing) {
        return existing;
      }
    }

    const notification = await Notification.create({
      userId: targetUserId,
      type,
      title: safeText(title, "VibeBook notification"),
      message: safeText(message),
      actorId: actorId || null,
      postId: postId || null,
      messageId: messageId || null,
      groupId: groupId || null,
      data: data || {},
      dedupeKey: normalizedDedupeKey || undefined,
      read: false,
    });

    await notification.populate([
      { path: "actorId", select: "name username profilePicture profileImage isVerified verified premiumBadge" },
      { path: "postId", select: "mediaUrl caption userId" },
      { path: "messageId", select: "message" },
    ]);
    await emitNotification(notification);
    return notification;
  } catch (error) {
    if (error?.code === 11000 && (dedupeKey || data?.dedupeKey)) {
      return Notification.findOne({
        userId,
        type,
        dedupeKey: dedupeKey || data?.dedupeKey,
      }).catch(() => null);
    }

    console.error("[notification:create]", error);
    return null;
  }
};

module.exports = {
  createNotification,
  emitNotification,
};
