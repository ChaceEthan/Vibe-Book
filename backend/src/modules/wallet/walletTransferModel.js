// @ts-nocheck
const mongoose = require("mongoose");

const walletTransferSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    senderWalletId: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    receiverWalletId: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    receiverIdentifier: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    asset: {
      type: String,
      enum: ["NEX_POINTS", "NEX_TOKEN"],
      default: "NEX_POINTS",
      index: true,
    },
    chain: {
      type: String,
      enum: ["internal", "future_blockchain"],
      default: "internal",
    },
    tokenStatus: {
      type: String,
      enum: ["points_only", "token_disabled", "token_ready"],
      default: "points_only",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "pending",
      index: true,
    },
    method: {
      type: String,
      enum: ["wallet_id", "nex_handle", "username", "user_id", "qr", "unknown"],
      default: "unknown",
    },
    memo: {
      type: String,
      trim: true,
      maxlength: 180,
      default: "",
    },
    sendTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
    },
    receiveTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
    },
    ipHash: {
      type: String,
      trim: true,
      select: false,
    },
    userAgentHash: {
      type: String,
      trim: true,
      select: false,
    },
    riskFlags: {
      type: [String],
      default: [],
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    completedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

walletTransferSchema.index({ senderId: 1, createdAt: -1 });
walletTransferSchema.index({ receiverId: 1, createdAt: -1 });
walletTransferSchema.index({ senderId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("WalletTransfer", walletTransferSchema);
