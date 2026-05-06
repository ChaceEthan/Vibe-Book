const Message = require("../models/Message");
const Booking = require("../models/Booking");
const User = require("../models/User");
const { getIo, isUserOnline } = require("../socket");
const {
  PLATFORM_ACCESS_AMOUNT,
  PLATFORM_ACCESS_CURRENCY,
  buildAccessState,
  hasPlatformAccess,
} = require("../utils/accessControl");

const trimText = (value) => (typeof value === "string" ? value.trim() : "");
const getMessageText = (body = {}) => trimText(body.message || body.text);

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

const serializeRealtimeMessage = (message) => ({
  _id: message._id,
  chatId: message.chatId,
  senderId: message.senderId || idOf(message.sender),
  receiverId: message.receiverId || idOf(message.recipient || message.receiver),
  message: message.message,
  text: message.text || message.message,
  createdAt: message.createdAt,
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
    const unreadCount = await Message.countDocuments({
      $or: [{ recipient: req.user._id }, { receiver: req.user._id }],
      isDraft: false,
      readAt: { $exists: false },
      hiddenFor: { $ne: req.user._id },
    });

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

    await Message.updateMany(
      {
        sender: otherUser._id,
        $or: [{ recipient: req.user._id }, { receiver: req.user._id }],
        isDraft: false,
        readAt: { $exists: false },
      },
      { readAt: new Date() }
    );

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

    if (!text) {
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

    const message = await Message.create({
      sender: req.user._id,
      recipient: recipient._id,
      receiver: recipient._id,
      subject: "VibeBook chat",
      message: text,
      text,
      type: "reply",
    });

    const populatedMessage = await populateMessage(Message.findById(message._id));
    const realtimeMessage = serializeRealtimeMessage(populatedMessage);
    getIo()?.to(recipient._id.toString()).emit("direct:message", populatedMessage);
    getIo()?.to(recipient._id.toString()).emit("receive_message", realtimeMessage);
    getIo()?.to(req.user._id.toString()).emit("receive_message", realtimeMessage);

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
      message.readAt = new Date();
      await message.save();
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

    const reply = await Message.create({
      sender: req.user._id,
      recipient,
      receiver: recipient,
      booking: original.booking,
      subject: original.subject ? `Re: ${original.subject.replace(/^Re:\s*/i, "")}` : "VibeBook reply",
      message: text,
      text,
      type: "reply",
    });

    const populatedReply = await populateMessage(Message.findById(reply._id));

    return res.status(201).json({ inboxMessage: populatedReply });
  } catch (error) {
    return next(error);
  }
};

const markMessageRead = async (req, res, next) => {
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
      { readAt: new Date() },
      { returnDocument: "after" }
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

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
      { $unset: { readAt: "" } },
      { returnDocument: "after" }
    );

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

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
