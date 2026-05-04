const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    talent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      trim: true,
      default: "",
    },
    businessName: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    eventDate: {
      type: Date,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    numberOfDays: {
      type: Number,
      min: 1,
      default: 1,
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
    offerPrice: {
      type: Number,
      min: 0,
    },
    offeredPrice: {
      type: Number,
      min: 0,
    },
    whatsappLink: {
      type: String,
      trim: true,
      default: "",
    },
    notificationStatus: {
      email: {
        type: String,
        default: "pending",
      },
      inbox: {
        type: String,
        default: "pending",
      },
      whatsapp: {
        type: String,
        default: "prepared",
      },
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    amount: {
      type: Number,
      default: 1000,
      min: 0,
    },
    currency: {
      type: String,
      default: "RWF",
    },
    paymentReference: {
      type: String,
      trim: true,
      default: "",
    },
    paidAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled", "completed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Booking", bookingSchema);
