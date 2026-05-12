// @ts-nocheck
/**
 * Wallet Transaction Model
 * Immutable transaction history for audit trail
 * Never delete - only create new transactions
 */

const mongoose = require("mongoose");
const { TRANSACTION_TYPES, TRANSACTION_STATUS } = require("./walletConstants");

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(TRANSACTION_TYPES),
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: Object.values(TRANSACTION_STATUS),
      default: "completed",
    },
    relatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound indexes for common queries
walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ userId: 1, type: 1 });
walletTransactionSchema.index({ userId: 1, source: 1 });
walletTransactionSchema.index({ source: 1 }); // For analytics
walletTransactionSchema.index({ status: 1 }); // For filtering by status
walletTransactionSchema.index({ createdAt: -1 }); // For pagination

// Prevent updates to transactions (immutability)
walletTransactionSchema.pre("findByIdAndUpdate", function (next) {
  const error = new Error("Transactions are immutable and cannot be updated");
  error.code = "IMMUTABLE_TRANSACTION";
  next(error);
});

// Prevent any save after creation
walletTransactionSchema.pre("save", function (next) {
  if (!this.isNew) {
    const error = new Error("Transactions are immutable and cannot be updated");
    error.code = "IMMUTABLE_TRANSACTION";
    next(error);
  }
  next();
});

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
