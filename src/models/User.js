const mongoose = require("mongoose");

const allowedRoles = ["dancer", "dj", "mc", "artist", "crew", "admin"];
const allowedTypes = ["single", "crew"];
const allowedCategories = [
  "Modern Dance",
  "Traditional Dance",
  "DJs",
  "MCs",
  "Artists",
  "Crew groups",
];
const allowedAvailability = ["available", "busy", "unavailable"];

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: allowedRoles,
    default: "dancer",
  },
  type: {
    type: String,
    enum: allowedTypes,
    default: "single",
  },
  gender: {
    type: String,
    trim: true,
  },
  category: {
    type: String,
    enum: allowedCategories,
    trim: true,
  },
  price: {
    type: Number,
    default: 0,
    min: 0,
  },
  phone: {
    type: String,
    trim: true,
  },
  whatsappNumber: {
    type: String,
    trim: true,
    default: "",
  },
  whatsapp: {
    type: String,
    trim: true,
    default: "",
  },
  location: {
    type: String,
    trim: true,
  },
  province: {
    type: String,
    trim: true,
    default: "",
  },
  district: {
    type: String,
    trim: true,
    default: "",
  },
  profileImage: {
    type: String,
    trim: true,
    default: "",
  },
  images: {
    type: [String],
    default: [],
  },
  videoUrls: {
    type: [String],
    default: [],
  },
  videos: {
    type: [String],
    default: [],
  },
  paidProfileViews: [
    {
      profile: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      amount: {
        type: Number,
        required: true,
        min: 1000,
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
        default: Date.now,
      },
    },
  ],
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  referredUsers: {
    type: Number,
    default: 0,
    min: 0,
  },
  trialStartDate: {
    type: Date,
    default: Date.now,
  },
  trialActive: {
    type: Boolean,
    default: true,
  },
  hasPaidAccess: {
    type: Boolean,
    default: false,
  },
  lastPaymentDate: {
    type: Date,
  },
  chatClearedAt: {
    type: Date,
  },
  bio: {
    type: String,
    trim: true,
  },
  socialLinks: {
    whatsapp: {
      type: String,
      trim: true,
      default: "",
    },
    instagram: {
      type: String,
      trim: true,
      default: "",
    },
  },
  availability: {
    type: String,
    enum: allowedAvailability,
    trim: true,
    default: "available",
  },
  acceptedTerms: {
    type: Boolean,
    default: false,
  },
  acceptedTermsAt: {
    type: Date,
  },
  isPremium: {
    type: Boolean,
    default: false,
  },
  premiumBadge: {
    type: Boolean,
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  ratings: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      value: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },
      comment: {
        type: String,
        trim: true,
        default: "",
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  averageRating: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model("User", userSchema);

User.allowedRoles = allowedRoles;
User.allowedTypes = allowedTypes;
User.allowedCategories = allowedCategories;
User.allowedAvailability = allowedAvailability;

module.exports = User;
