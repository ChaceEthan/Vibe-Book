const Message = require("../models/Message");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { getIo, isUserOnline } = require("../socket");
const { createNotification } = require("../utils/notifications");
const {
  PLATFORM_ACCESS_AMOUNT,
  PLATFORM_ACCESS_CURRENCY,
  buildAccessState,
  hasPlatformAccess,
} = require("../utils/accessControl");

const trimText = (value) => (typeof value === "string" ? value.trim() : "");
const getMessageText = (body = {}) => trimText(body.message || body.text);
const safeUrl = (value = "") => {
  const url = trimText(value).slice(0, 500);

  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
};

const attachmentFromFile = (file = {}) => ({
  url: file.secure_url || file.path || "",
  name: String(file.originalname || file.filename || "Attachment").slice(0, 180),
  size: Number(file.size || 0),
  mimeType: file.detected_mimetype || file.mimetype || "",
  kind: String(file.detected_mimetype || file.mimetype || "").startsWith("image/") ? "image" : "file",
});

const attachmentsFromRequest = (req) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const uploaded = files.map(attachmentFromFile).filter((attachment) => attachment.url);
  const link = safeUrl(req.body?.link || req.body?.url);

  if (link) {
    uploaded.push({
      url: link,
      name: link.replace(/^https?:\/\//i, "").slice(0, 180),
      size: 0,
      mimeType: "text/uri-list",
      kind: "link",
    });
  }

  return uploaded.slice(0, 4);
};

const queueNotification = (payload) => {
  createNotification(payload).catch((error) => {
    console.error(`[notification:message] ${error.message}`);
  });
};

const requireMessageAccess = (req, res) => {
  return true;
};

const hasBookingAccessBetweenUsers = async (currentUserId, otherUserId) => {
  if (!otherUserId) {
    return false;
  }

  const booking = await Booking.findOne({
    $or: [
      { requester: currentUserId, talent: otherUserId },
      { requester: otherUserId, talent: currentUserId },
    ],
    status: { $ne: "cancelled" },
  }).select("_id");

  return Boolean(booking);
};

const requireConversationAccess = async (req, res, otherUserId) => {
  return true;
};

const populateMessage = (query) => {
  return query
    .populate("sender", "name role profileImage profilePicture images gallery")
    .populate("recipient", "name role profileImage profilePicture images gallery")
    .populate("receiver", "name role profileImage profilePicture images gallery")
    .populate("booking", "businessName location offeredPrice offerPrice status createdAt");
};

const participantFilter = (userId) => ({
  $or: [{ sender: userId }, { recipient: userId }, { receiver: userId }],
  hiddenFor: { $ne: userId },
});

const idOf = (value) => {
  return value?._id?.toString?.() || value?.toString?.() || "";
};

const chatIdFor = (left, right) => [left?.toString(), right?.toString()].filter(Boolean).sort().join(":");

const unreadCountFor = (userId) =>
  Message.countDocuments({
    $or: [{ recipient: userId }, { receiver: userId }],
    isDraft: false,
    readAt: { $exists: false },
    hiddenFor: { $ne: userId },
  });

const emitUnreadCount = async (userId) => {
  const io = getIo();
  const targetId = idOf(userId);

  if (!io || !targetId) {
    return;
  }

  const unreadCount = await unreadCountFor(targetId);
  io.to(targetId).emit("unread:update", { unreadCount });
};

const markMessagesSeen = async (messages = [], viewerId) => {
  const viewer = idOf(viewerId);
  const unseenMessages = messages.filter((message) => {
    const recipientId = idOf(message.recipient || message.receiver);
    return recipientId === viewer && !message.readAt;
  });

  if (!unseenMessages.length) {
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

  const io = getIo();
  unseenMessages.forEach((message) => {
    io?.to(idOf(message.sender)).emit("message:delivery", {
      messageId: message._id,
      chatId: message.chatId || chatIdFor(message.sender, viewer),
      status: "seen",
      seenAt,
      readAt: seenAt,
    });

    message.readAt = seenAt;
    message.seenAt = seenAt;
    message.deliveryStatus = "seen";
  });

  await emitUnreadCount(viewer);
};

const serializeRealtimeMessage = (message) => ({
  _id: message._id,
  chatId: message.chatId,
  clientId: message.clientId,
  senderId: message.senderId || idOf(message.sender),
  receiverId: message.receiverId || idOf(message.recipient || message.receiver),
  message: message.deletedAt ? "This message was deleted" : message.message,
  text: message.deletedAt ? "This message was deleted" : message.text || message.message,
  attachments: message.deletedAt ? [] : Array.isArray(message.attachments) ? message.attachments : [],
  deletedAt: message.deletedAt,
  deletedBy: message.deletedBy,
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

const getInbox = async (req, res, next) => {
  try {
    if (!requireMessageAccess(req, res)) {
      return null;
    }

    const messages = await populateMessage(
      Message.find({
        ...participantFilter(req.user._id),
        isDraft: false,
      }).sort({ createdAt: -1 })
    );

    const conversationsByUser = new Map();
    const currentUserId = req.user._id.toString();

    messages.forEach((message) => {
      const senderId = idOf(message.sender);
      const recipientId = idOf(message.recipient || message.receiver);
      const otherUser = senderId === currentUserId ? message.recipient || message.receiver : message.sender;
      const otherUserId = idOf(otherUser);

      if (!otherUserId) {
        return;
      }

      const existing = conversationsByUser.get(otherUserId);
      const isUnread = recipientId === currentUserId && !message.readAt;

      if (existing) {
        existing.unreadCount += isUnread ? 1 : 0;
        return;
      }

      conversationsByUser.set(otherUserId, {
        user: otherUser,
        lastMessage: message,
        unreadCount: isUnread ? 1 : 0,
        online: isUserOnline(otherUserId),
      });
    });

    return res.json({ messages, conversations: Array.from(conversationsByUser.values()) });
  } catch (error) {
    return next(error);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await unreadCountFor(req.user._id);

    return res.json({ unreadCount });
  } catch (error) {
    return next(error);
  }
};

const getConversation = async (req, res, next) => {
  try {
    const otherUser = await User.findOne({
      _id: req.params.userId,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select("name role profileImage profilePicture images gallery");

    if (!otherUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!(await requireConversationAccess(req, res, otherUser._id))) {
      return null;
    }

    const messages = await populateMessage(
      Message.find({
        isDraft: false,
        hiddenFor: { $ne: req.user._id },
        $or: [
          { sender: req.user._id, recipient: otherUser._id },
          { sender: req.user._id, receiver: otherUser._id },
          { sender: otherUser._id, recipient: req.user._id },
          { sender: otherUser._id, receiver: req.user._id },
        ],
      }).sort({ createdAt: 1 })
    );

    await markMessagesSeen(messages, req.user._id);

    return res.json({
      messages,
      otherUser,
      online: isUserOnline(otherUser._id),
    });
  } catch (error) {
    return next(error);
  }
};

const sendDirectMessage = async (req, res, next) => {
  try {
    const text = getMessageText(req.body);
    const attachments = attachmentsFromRequest(req);

    if (!text && !attachments.length) {
      return res.status(400).json({ message: "Message is required" });
    }

    const recipientId = req.params.userId || req.body.recipientId || req.body.recipient || req.body.userId;

    if (!recipientId) {
      return res.status(400).json({ message: "Recipient user id is required" });
    }

    if (req.user._id.toString() === recipientId) {
      return res.status(400).json({ message: "You cannot message yourself" });
    }

    const recipient = await User.findOne({
      _id: recipientId,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select("name role profileImage profilePicture images gallery");

    if (!recipient) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!(await requireConversationAccess(req, res, recipient._id))) {
      return null;
    }

    const recipientOnline = isUserOnline(recipient._id);
    const message = await Message.create({
      chatId: req.body.chatId || chatIdFor(req.user._id, recipient._id),
      clientId: trimText(req.body.clientId),
      sender: req.user._id,
      recipient: recipient._id,
      receiver: recipient._id,
      subject: "VibeBook chat",
      message: text,
      text,
      attachments,
      type: "reply",
      deliveryStatus: recipientOnline ? "delivered" : "sent",
      deliveredAt: recipientOnline ? new Date() : undefined,
    });

    const populatedMessage = await populateMessage(Message.findById(message._id));
    const realtimeMessage = serializeRealtimeMessage(populatedMessage);
    const io = getIo();

    io?.to(recipient._id.toString()).emit("direct:message", populatedMessage);
    io?.to(recipient._id.toString()).emit("receive_message", realtimeMessage);
    io?.to(req.user._id.toString()).emit("receive_message", realtimeMessage);
    io?.to(req.user._id.toString()).emit("message:delivery", {
      messageId: populatedMessage._id,
      clientId: populatedMessage.clientId,
      chatId: populatedMessage.chatId,
      status: populatedMessage.deliveryStatus,
      deliveredAt: populatedMessage.deliveredAt,
    });
    await emitUnreadCount(recipient._id);
    queueNotification({
      userId: recipient._id,
      type: "message",
      title: "New message",
      message: `${req.user.name || "Someone"} sent you a message`,
      actorId: req.user._id,
      messageId: populatedMessage._id,
      dedupeKey: `message:${populatedMessage._id}`,
    });

    return res.status(201).json({
      message: "Message sent",
      inboxMessage: populatedMessage,
      chatMessage: populatedMessage,
    });
  } catch (error) {
    return next(error);
  }
};

const getDrafts = async (req, res, next) => {
  try {
    const drafts = await populateMessage(
      Message.find({
        sender: req.user._id,
        isDraft: true,
        hiddenFor: { $ne: req.user._id },
      }).sort({ updatedAt: -1 })
    );

    return res.json({ drafts });
  } catch (error) {
    return next(error);
  }
};

const getMessageById = async (req, res, next) => {
  try {
    if (!requireMessageAccess(req, res)) {
      return null;
    }

    const message = await populateMessage(
      Message.findOne({
        _id: req.params.id,
        ...participantFilter(req.user._id),
      })
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const recipientId = idOf(message.recipient || message.receiver);

    if (recipientId === req.user._id.toString() && !message.readAt) {
      const seenAt = new Date();
      message.readAt = seenAt;
      message.seenAt = seenAt;
      message.deliveryStatus = "seen";
      await message.save();
      getIo()?.to(idOf(message.sender)).emit("message:delivery", {
        messageId: message._id,
        chatId: message.chatId,
        status: "seen",
        seenAt,
        readAt: seenAt,
      });
      await emitUnreadCount(req.user._id);
    }

    return res.json({ inboxMessage: message });
  } catch (error) {
    return next(error);
  }
};

const replyToMessage = async (req, res, next) => {
  try {
    if (!requireMessageAccess(req, res)) {
      return null;
    }

    const text = getMessageText(req.body);

    if (!text) {
      return res.status(400).json({ message: "Reply message is required" });
    }

    const original = await Message.findOne({
      _id: req.params.id,
      ...participantFilter(req.user._id),
    });

    if (!original) {
      return res.status(404).json({ message: "Message not found" });
    }

    const recipient =
      original.sender.toString() === req.user._id.toString()
        ? original.recipient
        : original.sender;
    const recipientOnline = isUserOnline(recipient);

    const reply = await Message.create({
      chatId: chatIdFor(req.user._id, recipient),
      clientId: trimText(req.body.clientId),
      sender: req.user._id,
      recipient,
      receiver: recipient,
      booking: original.booking,
      subject: original.subject ? `Re: ${original.subject.replace(/^Re:\s*/i, "")}` : "VibeBook reply",
      message: text,
      text,
      type: "reply",
      deliveryStatus: recipientOnline ? "delivered" : "sent",
      deliveredAt: recipientOnline ? new Date() : undefined,
    });

    const populatedReply = await populateMessage(Message.findById(reply._id));
    const realtimeMessage = serializeRealtimeMessage(populatedReply);
    const io = getIo();

    io?.to(idOf(recipient)).emit("receive_message", realtimeMessage);
    io?.to(req.user._id.toString()).emit("receive_message", realtimeMessage);
    await emitUnreadCount(recipient);
    queueNotification({
      userId: recipient,
      type: "message",
      title: "New message",
      message: `${req.user.name || "Someone"} replied to you`,
      actorId: req.user._id,
      messageId: populatedReply._id,
      dedupeKey: `message:${populatedReply._id}`,
    });

    return res.status(201).json({ inboxMessage: populatedReply });
  } catch (error) {
    return next(error);
  }
};

const deleteMessage = async (req, res, next) => {
  try {
    if (!requireMessageAccess(req, res)) {
      return null;
    }

    const message = await populateMessage(
      Message.findOne({
        _id: req.params.id,
        ...participantFilter(req.user._id),
        isDraft: false,
      })
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (idOf(message.sender) !== idOf(req.user._id)) {
      return res.status(403).json({ message: "You can only delete messages you sent" });
    }

    message.deletedAt = message.deletedAt || new Date();
    message.deletedBy = req.user._id;
    message.deletedReason = "sender";
    message.message = "This message was deleted";
    message.text = "This message was deleted";
    message.attachments = [];
    await message.save();

    const realtimeMessage = serializeRealtimeMessage(message);
    const io = getIo();

    io?.to(idOf(message.sender)).emit("message:deleted", realtimeMessage);
    io?.to(idOf(message.recipient || message.receiver)).emit("message:deleted", realtimeMessage);
    await emitUnreadCount(idOf(message.recipient || message.receiver));

    return res.json({ chatMessage: message, inboxMessage: message, message: "Message deleted" });
  } catch (error) {
    return next(error);
  }
};

const markMessageRead = async (req, res, next) => {
  try {
    if (!requireMessageAccess(req, res)) {
      return null;
    }

    const seenAt = new Date();
    const message = await Message.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ recipient: req.user._id }, { receiver: req.user._id }],
        hiddenFor: { $ne: req.user._id },
      },
      {
        readAt: seenAt,
        seenAt,
        deliveryStatus: "seen",
      },
      { returnDocument: "after" }
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    getIo()?.to(idOf(message.sender)).emit("message:delivery", {
      messageId: message._id,
      chatId: message.chatId,
      status: "seen",
      seenAt,
      readAt: seenAt,
    });
    await emitUnreadCount(req.user._id);

    return res.json({ inboxMessage: message });
  } catch (error) {
    return next(error);
  }
};

const markMessageUnread = async (req, res, next) => {
  try {
    if (!requireMessageAccess(req, res)) {
      return null;
    }

    const message = await Message.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ recipient: req.user._id }, { receiver: req.user._id }],
        hiddenFor: { $ne: req.user._id },
      },
      { $unset: { readAt: "", seenAt: "" }, $set: { deliveryStatus: "delivered" } },
      { returnDocument: "after" }
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    await emitUnreadCount(req.user._id);

    return res.json({ inboxMessage: message });
  } catch (error) {
    return next(error);
  }
};

const saveDraft = async (req, res, next) => {
  try {
    const recipient = trimText(req.body.recipient || req.body.recipientId);
    const message = getMessageText(req.body);
    const subject = trimText(req.body.subject);

    if (!recipient || !message) {
      return res.status(400).json({ message: "Recipient and draft message are required" });
    }

    const draft = await Message.create({
      sender: req.user._id,
      recipient,
      receiver: recipient,
      subject,
      message,
      text: message,
      type: "draft",
      isDraft: true,
    });

    const populatedDraft = await populateMessage(Message.findById(draft._id));
    return res.status(201).json({ draft: populatedDraft });
  } catch (error) {
    return next(error);
  }
};

const updateDraft = async (req, res, next) => {
  try {
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body, "message")) {
      updates.message = trimText(req.body.message);
      updates.text = updates.message;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "text") && !Object.prototype.hasOwnProperty.call(req.body, "message")) {
      updates.text = trimText(req.body.text);
      updates.message = updates.text;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "subject")) {
      updates.subject = trimText(req.body.subject);
    }

    if (!updates.message && !updates.subject) {
      return res.status(400).json({ message: "Draft update cannot be empty" });
    }

    const draft = await populateMessage(
      Message.findOneAndUpdate(
        {
          _id: req.params.id,
          sender: req.user._id,
          isDraft: true,
          hiddenFor: { $ne: req.user._id },
        },
        updates,
        { returnDocument: "after", runValidators: true }
      )
    );

    if (!draft) {
      return res.status(404).json({ message: "Draft not found" });
    }

    return res.json({ draft });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  deleteMessage,
  getDrafts,
  getInbox,
  getConversation,
  getMessageById,
  getUnreadCount,
  markMessageRead,
  markMessageUnread,
  replyToMessage,
  saveDraft,
  sendDirectMessage,
  updateDraft,
};
