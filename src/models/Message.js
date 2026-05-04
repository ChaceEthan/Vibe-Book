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

module.exports = mongoose.model("Message", messageSchema);
