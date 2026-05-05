const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    purpose: {
      type: String,
      enum: ["platform_access", "booking_access", "contact_unlock"],
      default: "platform_access",
    },
    method: {
      type: String,
      enum: ["USDT", "USDC", "USD", "MTN_MOMO", "AIRTEL_MONEY"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      trim: true,
      default: "USD",
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed"],
      default: "pending",
    },
    sandbox: {
      type: Boolean,
      default: true,
    },
    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Payment", paymentSchema);

