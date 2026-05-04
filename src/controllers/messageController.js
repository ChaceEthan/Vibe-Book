const Message = require("../models/Message");
const {
  PLATFORM_ACCESS_AMOUNT,
  PLATFORM_ACCESS_CURRENCY,
  buildAccessState,
  hasPlatformAccess,
} = require("../utils/accessControl");

const trimText = (value) => (typeof value === "string" ? value.trim() : "");

const requireMessageAccess = (req, res) => {
  if (hasPlatformAccess(req.user)) {
    return true;
  }

  res.status(402).json({
    message: `Pay ${PLATFORM_ACCESS_AMOUNT} ${PLATFORM_ACCESS_CURRENCY} to open messages after your trial`,
    data: { access: buildAccessState(req.user) },
  });
  return false;
};

const populateMessage = (query) => {
  return query
    .populate("sender", "name role profileImage images")
    .populate("recipient", "name role profileImage images")
    .populate("booking", "businessName location offeredPrice offerPrice status createdAt");
};

const participantFilter = (userId) => ({
  $or: [{ sender: userId }, { recipient: userId }],
  hiddenFor: { $ne: userId },
});

const getInbox = async (req, res, next) => {
  try {
    if (!requireMessageAccess(req, res)) {
      return null;
    }

    const messages = await populateMessage(
      Message.find({
        recipient: req.user._id,
        isDraft: false,
        hiddenFor: { $ne: req.user._id },
      }).sort({ createdAt: -1 })
    );

    return res.json({ messages });
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

    if (message.recipient?._id?.toString() === req.user._id.toString() && !message.readAt) {
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

    const text = trimText(req.body.message);

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
      booking: original.booking,
      subject: original.subject ? `Re: ${original.subject.replace(/^Re:\s*/i, "")}` : "VibeBook reply",
      message: text,
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
        recipient: req.user._id,
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
        recipient: req.user._id,
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
    const message = trimText(req.body.message);
    const subject = trimText(req.body.subject);

    if (!recipient || !message) {
      return res.status(400).json({ message: "Recipient and draft message are required" });
    }

    const draft = await Message.create({
      sender: req.user._id,
      recipient,
      subject,
      message,
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
  getMessageById,
  markMessageRead,
  markMessageUnread,
  replyToMessage,
  saveDraft,
  updateDraft,
};
