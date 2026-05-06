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
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
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
    eventType: {
      type: String,
      trim: true,
      default: "",
    },
    durationValue: {
      type: Number,
      min: 0,
    },
    durationUnit: {
      type: String,
      enum: ["hours", "days"],
      default: "days",
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
    description: {
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
    price: {
      type: Number,
      min: 0,
      default: 0,
    },
    platformFeeRate: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.1,
    },
    platformFee: {
      type: Number,
      min: 0,
      default: 0,
    },
    finalAgreedPrice: {
      type: Number,
      min: 0,
    },
    finalPriceStatus: {
      type: String,
      enum: ["pending_negotiation", "agreed"],
      default: "pending_negotiation",
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

bookingSchema.pre("validate", function syncMarketplaceAliases(next) {
  if (!this.clientId && this.requester) {
    this.clientId = this.requester;
  }

  if (!this.requester && this.clientId) {
    this.requester = this.clientId;
  }

  if (!this.creatorId && this.talent) {
    this.creatorId = this.talent;
  }

  if (!this.talent && this.creatorId) {
    this.talent = this.creatorId;
  }

  if (!this.description && this.message) {
    this.description = this.message;
  }

  if (!this.message && this.description) {
    this.message = this.description;
  }

  const resolvedPrice = Number(this.price || this.finalAgreedPrice || this.offeredPrice || this.offerPrice || 0);
  this.price = Number.isFinite(resolvedPrice) && resolvedPrice > 0 ? resolvedPrice : 0;
  this.platformFee = Number((this.price * Number(this.platformFeeRate || 0.1)).toFixed(2));
  next();
});

module.exports = mongoose.model("Booking", bookingSchema);
