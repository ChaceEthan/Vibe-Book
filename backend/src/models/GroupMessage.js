const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      required: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 180,
      default: "",
    },
    size: {
      type: Number,
      min: 0,
      default: 0,
    },
    mimeType: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    kind: {
      type: String,
      enum: ["image", "file", "link"],
      default: "file",
    },
  },
  { _id: false }
);

const groupMessageSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatGroup",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupMessage",
    },
    replyPreview: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GroupMessage",
      },
      senderName: {
        type: String,
        trim: true,
        maxlength: 120,
        default: "",
      },
      snippet: {
        type: String,
        trim: true,
        maxlength: 180,
        default: "",
      },
      deleted: {
        type: Boolean,
        default: false,
      },
    },
    type: {
      type: String,
      enum: ["message", "system"],
      default: "message",
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    deletedReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("GroupMessage", groupMessageSchema);
