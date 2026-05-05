const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
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
  if (!this.recipient && this.receiver) {
    this.recipient = this.receiver;
  }

  if (!this.receiver && this.recipient) {
    this.receiver = this.recipient;
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
