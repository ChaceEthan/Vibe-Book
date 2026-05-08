const mongoose = require("mongoose");

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
      required: true,
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: ["message", "system"],
      default: "message",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("GroupMessage", groupMessageSchema);
