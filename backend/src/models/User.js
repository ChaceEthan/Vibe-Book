// @ts-nocheck
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
  "Entertainment",
  "Comedy",
  "Dance",
  "Music",
  "Gaming",
  "Sports",
  "Lifestyle",
  "Education",
  "Fashion",
  "Fitness",
  "Travel",
  "News",
  "Tech",
  "Art",
  "Food",
  "Cars",
  "Business",
  "Motivation",
  "Podcast",
  "Vlogs",
  "Streaming",
  "Photography",
  "Culture",
  "Memes",
  "Anime",
  "Film",
  "DIY",
  "Science",
];
const allowedAvailability = ["available", "busy", "unavailable"];
const allowedAccountTypes = ["user", "talent"];
const allowedAccountRoles = ["user", "admin"];

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
  },
  emailNormalized: {
    type: String,
    lowercase: true,
    trim: true,
  },
  emailGeneratedFromPhone: {
    type: Boolean,
    default: false,
  },
  emailVerified: {
    type: Boolean,
    default: false,
    index: true,
  },
  pendingEmail: {
    type: String,
    lowercase: true,
    trim: true,
  },
  pendingEmailNormalized: {
    type: String,
    lowercase: true,
    trim: true,
  },
  emailVerificationCode: {
    type: String,
    select: false,
  },
  emailVerificationExpires: {
    type: Date,
  },
  emailVerificationLastSentAt: {
    type: Date,
  },
  emailVerificationAttempts: {
    type: Number,
    default: 0,
    min: 0,
  },
  verificationCode: {
    type: String,
    select: false,
  },
  verificationExpires: {
    type: Date,
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
  protected: {
    type: Boolean,
    default: false,
    index: true,
  },
  type: {
    type: String,
    enum: allowedTypes,
    default: "single",
  },
  accountType: {
    type: String,
    enum: allowedAccountTypes,
    default: "talent",
  },
  accountRole: {
    type: String,
    enum: allowedAccountRoles,
    default: "user",
    index: true,
  },
  gender: {
    type: String,
    trim: true,
  },
  birthday: {
    type: Date,
  },
  category: {
    type: String,
    enum: {
      values: allowedCategories,
      message: `Category must be one of: ${allowedCategories.join(", ")}`,
    },
    trim: true,
  },
  skills: {
    type: [String],
    default: [],
    index: true,
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
  phoneNumber: {
    type: String,
    trim: true,
    default: "",
  },
  countryCode: {
    type: String,
    trim: true,
    default: "",
  },
  country: {
    type: String,
    trim: true,
    default: "",
  },
  phoneVerified: {
    type: Boolean,
    default: false,
    index: true,
  },
  phoneVerificationCode: {
    type: String,
    select: false,
  },
  phoneVerificationExpires: {
    type: Date,
  },
  phoneVerificationLastSentAt: {
    type: Date,
  },
  phoneVerificationAttempts: {
    type: Number,
    default: 0,
    min: 0,
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
  profilePicture: {
    type: String,
    trim: true,
    default: "",
  },
  images: {
    type: [String],
    default: [],
  },
  gallery: {
    type: [String],
    default: [],
  },
  imageDescriptions: {
    type: [
      {
        url: {
          type: String,
          trim: true,
          required: true,
        },
        description: {
          type: String,
          trim: true,
          default: "",
          maxlength: 500,
        },
      },
    ],
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
  videoDescriptions: {
    type: [
      {
        url: {
          type: String,
          trim: true,
          required: true,
        },
        description: {
          type: String,
          trim: true,
          default: "",
          maxlength: 500,
        },
      },
    ],
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
  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  following: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  followRequests: {
    type: [
      {
        from: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        type: {
          type: String,
          enum: ["follow"],
          default: "follow",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    default: [],
  },
  viewsCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalWatchTime: {
    type: Number,
    default: 0,
    min: 0,
  },
  interests: {
    type: Map,
    of: Number,
    default: {},
  },
  watchHistory: {
    type: [
      {
        postId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Feed",
          required: true,
        },
        creatorId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        topics: {
          type: [String],
          default: [],
        },
        watchedSeconds: {
          type: Number,
          default: 0,
          min: 0,
        },
        completionRate: {
          type: Number,
          default: 0,
          min: 0,
          max: 1,
        },
        replays: {
          type: Number,
          default: 0,
          min: 0,
        },
        watchedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    default: [],
  },
  likedTopics: {
    type: [String],
    default: [],
  },
  favoriteCreators: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  earnings: {
    type: Number,
    default: 0,
    min: 0,
  },
  balance: {
    type: Number,
    default: 0,
    min: 0,
  },
  isMonetized: {
    type: Boolean,
    default: false,
  },
  monetizationScore: {
    type: Number,
    default: 0,
    min: 0,
  },
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
  referralFingerprint: {
    type: String,
    trim: true,
    select: false,
  },
  walletId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true,
    index: true,
    maxlength: 32,
  },
  nexHandle: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    index: true,
    maxlength: 42,
  },
  walletVerified: {
    type: Boolean,
    default: false,
    index: true,
  },
  walletPinEnabled: {
    type: Boolean,
    default: false,
  },
  walletSecurityLevel: {
    type: String,
    enum: ["basic", "standard", "elevated", "locked"],
    default: "basic",
    index: true,
  },
  walletReceiveEnabled: {
    type: Boolean,
    default: true,
  },
  walletSettings: {
    transferConfirmation: {
      type: Boolean,
      default: true,
    },
    receiveQrEnabled: {
      type: Boolean,
      default: true,
    },
    transferNotifications: {
      type: Boolean,
      default: true,
    },
    privacyMode: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "public",
    },
    linkedAccounts: {
      mobileMoneyReady: { type: Boolean, default: false },
      cryptoWalletReady: { type: Boolean, default: false },
      bankAccountReady: { type: Boolean, default: false },
      stablecoinReady: { type: Boolean, default: false },
      nexCoinReady: { type: Boolean, default: true },
    },
    futureCashoutMethods: {
      mobileMoney: { type: Boolean, default: false },
      bank: { type: Boolean, default: false },
      crypto: { type: Boolean, default: false },
      stablecoin: { type: Boolean, default: false },
      nexCoin: { type: Boolean, default: true },
    },
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
    tiktok: {
      type: String,
      trim: true,
      default: "",
    },
    youtube: {
      type: String,
      trim: true,
      default: "",
    },
    x: {
      type: String,
      trim: true,
      default: "",
    },
    website: {
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
  language: {
    type: String,
    trim: true,
    default: "en",
  },
  notificationEnabled: {
    type: Boolean,
    default: true,
  },
  accountVisibility: {
    type: String,
    enum: ["public", "followers", "private"],
    default: "public",
  },
  allowProfileDiscovery: {
    type: Boolean,
    default: true,
  },
  allowMessagesFrom: {
    type: String,
    enum: ["everyone", "followers", "none"],
    default: "everyone",
  },
  blockedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
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
  verificationRequired: {
    type: Boolean,
    default: false,
    index: true,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  accountStatus: {
    type: String,
    enum: ["pending_verification", "active", "suspended"],
    default: "active",
    index: true,
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
  rating: {
    type: Number,
    default: 0,
  },
  likedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  likes: {
    type: Number,
    default: 0,
    min: 0,
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 30,
  },
  usernameHistory: {
    type: [String],
    default: [],
  },
  coverImage: {
    type: String,
    trim: true,
    default: "",
  },
  website: {
    type: String,
    trim: true,
    default: "",
  },
  profileTheme: {
    type: String,
    trim: true,
    default: "classic",
    maxlength: 40,
  },
  marketplace: {
    equippedFrame: {
      type: String,
      trim: true,
      default: "",
      maxlength: 60,
    },
    equippedTheme: {
      type: String,
      trim: true,
      default: "",
      maxlength: 60,
    },
    equippedBadges: {
      type: [String],
      default: [],
    },
    ownedReactions: {
      type: [String],
      default: [],
    },
    prestigeScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    creatorAura: {
      type: String,
      trim: true,
      default: "",
      maxlength: 40,
    },
  },
  creatorCategory: {
    type: String,
    trim: true,
    default: "",
    maxlength: 80,
  },
  creatorSkills: {
    type: [String],
    default: [],
  },
  publicEmail: {
    type: Boolean,
    default: false,
  },
  creatorTier: {
    type: String,
    enum: ["none", "emerging", "established", "verified"],
    default: "none",
    index: true,
  },
  creatorLevel: {
    type: Number,
    default: 0,
    min: 0,
  },
  creatorBadges: {
    type: [String],
    default: [],
  },
  monetizationEnabled: {
    type: Boolean,
    default: false,
    index: true,
  },
  totalRevenue: {
    type: Number,
    default: 0,
    min: 0,
  },
  estimatedRevenue: {
    type: Number,
    default: 0,
    min: 0,
  },
  payoutEligible: {
    type: Boolean,
    default: false,
  },
  payoutMethod: {
    type: String,
    enum: ["momo", "bank", "wallet"],
    default: "wallet",
  },
  payoutEmail: {
    type: String,
    trim: true,
    default: "",
  },
  lastPayoutAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.index(
  { emailNormalized: 1 },
  {
    unique: true,
    sparse: true,
    name: "uniq_user_email_normalized",
    partialFilterExpression: { emailNormalized: { $type: "string" } },
  }
);
userSchema.index(
  { walletId: 1 },
  {
    unique: true,
    sparse: true,
    name: "uniq_user_wallet_id",
    partialFilterExpression: { walletId: { $type: "string" } },
  }
);
userSchema.index(
  { nexHandle: 1 },
  {
    unique: true,
    sparse: true,
    name: "uniq_user_nex_handle",
    partialFilterExpression: { nexHandle: { $type: "string" } },
  }
);
const User = mongoose.model("User", userSchema);

User.allowedRoles = allowedRoles;
User.allowedTypes = allowedTypes;
User.allowedCategories = allowedCategories;
User.allowedAvailability = allowedAvailability;
User.allowedAccountTypes = allowedAccountTypes;
User.allowedAccountRoles = allowedAccountRoles;

module.exports = User;
