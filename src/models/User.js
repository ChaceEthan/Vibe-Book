const mongoose = require("mongoose");

const allowedRoles = ["dancer", "dj", "mc", "artist", "admin"];
const allowedTypes = ["single", "crew"];

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
    trim: true,
  },
  price: {
    type: Number,
    default: 0,
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
  location: {
    type: String,
    trim: true,
  },
  images: {
    type: [String],
    default: [],
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

module.exports = User;
