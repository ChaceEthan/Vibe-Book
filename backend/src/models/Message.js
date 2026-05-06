const mongoose = require("mongoose");

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
      required: true,
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
    hiddenFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

messageSchema.pre("validate", function syncMessageAliases(next) {
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

  next();
});

module.exports = mongoose.model("Message", messageSchema);
