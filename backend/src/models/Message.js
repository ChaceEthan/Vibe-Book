// @ts-nocheck
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

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: String,
      trim: true,
      index: true,
    },
    senderId: {
      type: String,
      trim: true,
      index: true,
    },
    receiverId: {
      type: String,
      trim: true,
      index: true,
    },
    clientId: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    subject: {
      type: String,
      trim: true,
      default: "",
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
    text: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: ["booking", "reply", "draft", "system"],
      default: "reply",
    },
    isDraft: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    seenAt: {
      type: Date,
    },
    deliveryStatus: {
      type: String,
      enum: ["sending", "sent", "delivered", "seen", "failed"],
      default: "sent",
      index: true,
    },
    hiddenFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    replyPreview: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
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

messageSchema.methods.syncMessageAliases = function () {
  if (!this.sender && this.senderId) {
    this.sender = this.senderId;
  }

  if (!this.recipient && this.receiver) {
    this.recipient = this.receiver;
  }

  if (!this.recipient && this.receiverId) {
    this.recipient = this.receiverId;
  }

  if (!this.receiver && this.recipient) {
    this.receiver = this.recipient;
  }

  if (!this.receiver && this.receiverId) {
    this.receiver = this.receiverId;
  }

  if (!this.senderId && this.sender) {
    this.senderId = this.sender.toString();
  }

  if (!this.receiverId && (this.recipient || this.receiver)) {
    this.receiverId = (this.recipient || this.receiver).toString();
  }

  if (!this.chatId && this.senderId && this.receiverId) {
    this.chatId = [this.senderId, this.receiverId].sort().join(":");
  }

  if (!this.message && this.text) {
    this.message = this.text;
  }

  if (!this.text && this.message) {
    this.text = this.message;
  }
};

messageSchema.pre("validate", function () {
  this.syncMessageAliases();
});

module.exports = mongoose.model("Message", messageSchema);
