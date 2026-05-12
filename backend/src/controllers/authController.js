const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const User = require("../models/User");
const { buildAccessState, syncTrialState } = require("../utils/accessControl");
const { applyAdminIsolation, isConfiguredAdminEmail } = require("../utils/adminIsolation");
const generateToken = require("../utils/generateToken");
const { DEFAULT_PROFILE_IMAGE_PATH } = require("../utils/profileDefaults");
const { sendVerificationEmail } = require("../utils/emailService");
const { sendPhoneVerificationSms } = require("../utils/smsService");
const { createNotification } = require("../utils/notifications");
const { normalizeStoredUploadPath, normalizeStoredUploadPaths } = require("../utils/storagePaths");
const walletService = require("../modules/wallet/walletService");
const { getIo } = require("../socket");
const { formatWalletResponse, formatTransactionResponse } = require("../modules/wallet/walletUtils");
const {
  normalizeEmail,
  normalizeProfileFields,
} = require("../utils/profileValidation");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9_][a-z0-9_-]{2,29}$/;
const otpCooldownMs = 60 * 1000;
const otpExpiryMinutes = Math.min(Math.max(Number(process.env.OTP_EXPIRES_MINUTES) || 10, 1), 60);
const otpExpiryMs = otpExpiryMinutes * 60 * 1000;
const supportedPhoneCountries = [
  { country: "Rwanda", countryCode: "+250" },
  { country: "Uganda", countryCode: "+256" },
  { country: "Kenya", countryCode: "+254" },
  { country: "Tanzania", countryCode: "+255" },
  { country: "Burundi", countryCode: "+257" },
  { country: "DR Congo", countryCode: "+243" },
  { country: "International", countryCode: "+" },
];

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeUsername = (value = "") => String(value).trim().replace(/^@+/, "").replace(/\s+/g, "_").toLowerCase();

const normalizeCountryCode = (value = "") => {
  const raw = String(value || "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "+";
};

const normalizePhoneDigits = (value = "") => String(value || "").replace(/[^\d]/g, "");

const normalizePhonePayload = (body = {}) => {
  const countryCode = normalizeCountryCode(body.countryCode || body.phoneCountryCode);
  const matchedCountry = supportedPhoneCountries.find((item) => item.countryCode === countryCode);
  const country = String(body.country || matchedCountry?.country || "International").trim() || "International";
  const rawPhone = body.phoneNumber || body.phone || "";
  const codeDigits = normalizePhoneDigits(countryCode);
  let phoneNumber = normalizePhoneDigits(rawPhone);

  if (codeDigits && phoneNumber.startsWith(codeDigits) && String(rawPhone).trim().startsWith("+")) {
    phoneNumber = phoneNumber.slice(codeDigits.length);
  }

  const fullPhone = phoneNumber ? `${countryCode}${phoneNumber}` : "";

  return {
    country,
    countryCode,
    phoneNumber,
    phone: fullPhone,
  };
};

const generatedEmailForPhone = (phone = "") => {
  const digits = normalizePhoneDigits(phone);
  return digits ? `${digits}@phone.vibebook.local` : "";
};

const generateOtpCode = (channel = "phone") => {
  const mockKey = channel === "email" ? "MOCK_EMAIL_CODE" : "MOCK_PHONE_CODE";
  if (process.env[mockKey]) {
    return String(process.env[mockKey]).replace(/[^\d]/g, "").slice(0, 6).padStart(6, "0");
  }

  return String(Math.floor(100000 + Math.random() * 900000));
};

const shouldExposeOtp = (channel = "phone") => {
  const mockKey = channel === "email" ? "MOCK_EMAIL_OTP" : "MOCK_PHONE_OTP";
  return process.env.NODE_ENV !== "production" || process.env[mockKey] === "true";
};

const usernameSuggestions = async (username) => {
  const base = username.replace(/[^a-z0-9_]/g, "").slice(0, 22) || "vibebook_user";
  const candidates = [base, `${base}1`, `${base}${Math.floor(10 + Math.random() * 90)}`, `${base}_${Date.now().toString(36).slice(-4)}`];
  const existing = await User.find({ username: { $in: candidates } }).select("username").lean();
  const taken = new Set(existing.map((item) => item.username));
  return candidates.filter((candidate) => !taken.has(candidate)).slice(0, 3);
};

const findUserByEmailInsensitive = (email) => {
  const normalized = normalizeEmail(email);

  if (!normalized) {
    return null;
  }

  return User.findOne({
    $or: [
      { email: normalized },
      { emailNormalized: normalized },
      { email: { $regex: `^${escapeRegex(normalized)}$`, $options: "i" } },
    ],
  });
};

const findUserByLoginIdentifier = async (identifier) => {
  const normalizedIdentifier = String(identifier || "").trim();
  const normalizedEmail = normalizeEmail(normalizedIdentifier);

  if (isValidEmail(normalizedEmail)) {
    return findUserByEmailInsensitive(normalizedEmail).select("+password");
  }

  const phoneDigits = normalizePhoneDigits(normalizedIdentifier);
  if (phoneDigits) {
    const phoneUser = await User.findOne({
      $or: [
        { phone: normalizedIdentifier },
        { phoneNumber: phoneDigits },
        { phone: { $regex: `${escapeRegex(phoneDigits)}$` } },
      ],
    }).select("+password");

    if (phoneUser) {
      return phoneUser;
    }
  }

  const username = normalizeUsername(normalizedIdentifier);
  if (username && usernamePattern.test(username)) {
    return User.findOne({ username }).select("+password");
  }

  return null;
};

const findUserByPhoneFields = (phoneFields = {}, excludeId) => {
  const phoneNumber = normalizePhoneDigits(phoneFields.phoneNumber || phoneFields.phone);
  const fullPhone = String(phoneFields.phone || (phoneNumber ? `${phoneFields.countryCode || ""}${phoneNumber}` : "")).trim();
  const conditions = [];

  if (fullPhone) {
    conditions.push({ phone: fullPhone });
    conditions.push({ phone: { $regex: `${escapeRegex(fullPhone)}$` } });
  }

  if (phoneNumber && phoneFields.countryCode) {
    conditions.push({ phoneNumber, countryCode: phoneFields.countryCode });
  } else if (phoneNumber) {
    conditions.push({ phoneNumber });
  }

  if (!conditions.length) {
    return null;
  }

  return User.findOne({
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: conditions,
  });
};

const createReferralCode = (name = "vibebook") => {
  const prefix = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 8) || "vibe";

  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

const getReferralLink = (referralCode) => {
  if (!referralCode) {
    return "";
  }

  return `https://vibe-book-kappa.vercel.app/register?ref=${encodeURIComponent(referralCode)}`;
};

const referralFingerprintFor = (req) => {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwardedFor || req.ip || req.socket?.remoteAddress || "";
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 240);
  return crypto.createHash("sha256").update(`${ip}|${userAgent}`).digest("hex");
};

const emitToUser = (userId, event, payload = {}) => {
  const io = getIo?.();
  if (io && userId) {
    io.to(userId.toString()).emit(event, payload);
  }
};

const userResponse = (user) => {
  const gallery = Array.isArray(user.gallery) && user.gallery.length ? user.gallery : user.images || [];
  const images = normalizeStoredUploadPaths(gallery);
  const videos = normalizeStoredUploadPaths(Array.isArray(user.videos) && user.videos.length ? user.videos : user.videoUrls || []);
  const profileImage = normalizeStoredUploadPath(user.profilePicture || user.profileImage) || images[0] || DEFAULT_PROFILE_IMAGE_PATH;
  const imageDescriptions = (Array.isArray(user.imageDescriptions) ? user.imageDescriptions : [])
    .map((item) => ({
      url: normalizeStoredUploadPath(item?.url),
      description: typeof item?.description === "string" ? item.description : "",
    }))
    .filter((item) => item.url && images.includes(item.url));
  const videoDescriptions = (Array.isArray(user.videoDescriptions) ? user.videoDescriptions : [])
    .map((item) => ({
      url: normalizeStoredUploadPath(item?.url),
      description: typeof item?.description === "string" ? item.description : "",
    }))
    .filter((item) => item.url && videos.includes(item.url));
  const followerCount = Array.isArray(user.followers) ? user.followers.length : 0;
  const followingCount = Array.isArray(user.following) ? user.following.length : 0;

  return {
    _id: user._id,
    name: user.name,
    username: user.username || user.name,
    email: user.emailGeneratedFromPhone ? "" : user.email,
    emailVerified: Boolean(user.emailVerified),
    emailGeneratedFromPhone: Boolean(user.emailGeneratedFromPhone),
    role: user.role,
    accountRole: user.accountRole || (user.role === "admin" ? "admin" : "user"),
    protected: Boolean(user.protected || user.role === "admin"),
    type: user.type,
    accountType: user.accountType || "talent",
    gender: user.gender,
    birthday: user.birthday,
    category: user.category,
    price: user.price,
    phone: user.phone,
    phoneNumber: user.phoneNumber || user.phone || "",
    countryCode: user.countryCode || "",
    country: user.country || "",
    phoneVerified: Boolean(user.phoneVerified),
    whatsappNumber: user.whatsappNumber || user.whatsapp,
    whatsapp: user.whatsapp || user.whatsappNumber,
    location: user.location,
    province: user.province,
    district: user.district,
    profileImage,
    profilePicture: profileImage,
    coverImage: user.coverImage || "",
    images,
    gallery: images,
    imageDescriptions,
    videoUrls: videos,
    videos,
    videoDescriptions,
    descriptions: {
      images: imageDescriptions,
      videos: videoDescriptions,
    },
    bio: user.bio,
    website: user.website || user.socialLinks?.website || "",
    profileTheme: user.profileTheme || "classic",
    creatorCategory: user.creatorCategory || user.category || "",
    creatorSkills: Array.isArray(user.creatorSkills) ? user.creatorSkills : [],
    publicEmail: Boolean(user.publicEmail),
    socialLinks: user.socialLinks,
    availability: user.availability,
    rating: user.averageRating || user.rating || 0,
    averageRating: user.averageRating || user.rating || 0,
    isPremium: user.isPremium,
    premiumBadge: user.premiumBadge || user.isPremium,
    likes: Array.isArray(user.likedBy) ? user.likedBy.length : Number(user.likes || 0),
    likeCount: Array.isArray(user.likedBy) ? user.likedBy.length : Number(user.likes || 0),
    followers: user.followers || [],
    following: user.following || [],
    followerCount,
    followingCount,
    balance: user.balance || 0,
    isMonetized: Boolean(user.isMonetized),
    monetizationScore: user.monetizationScore || 0,
    isVerified: user.isVerified,
    isBlocked: user.isBlocked,
    language: user.language || "en",
    notificationEnabled: user.notificationEnabled !== false,
    accountVisibility: user.accountVisibility || "public",
    allowProfileDiscovery: user.allowProfileDiscovery !== false,
    allowMessagesFrom: user.allowMessagesFrom || "everyone",
    blockedUsers: user.blockedUsers || [],
    referralCode: user.referralCode,
    referralLink: getReferralLink(user.referralCode),
    referredUsers: user.referredUsers,
    trialStartDate: user.trialStartDate,
    trialActive: buildAccessState(user).trialActive,
    trialEndsAt: buildAccessState(user).trialEndsAt,
    hasPaidAccess: user.hasPaidAccess,
    lastPaymentDate: user.lastPaymentDate,
    access: buildAccessState(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const isValidEmail = (email) => emailPattern.test(email);

const hasAcceptedTerms = (acceptedTerms) => {
  return acceptedTerms === true || acceptedTerms === "true";
};

const isValidPhoneNumber = (phoneNumber = "") => {
  const digits = normalizePhoneDigits(phoneNumber);
  return digits.length >= 7 && digits.length <= 15;
};

const checkAvailability = async (req, res, next) => {
  try {
    const field = String(req.query.field || "").trim().toLowerCase();
    const rawValue = String(req.query.value || "").trim();

    if (field === "username") {
      const username = normalizeUsername(rawValue);

      if (!usernamePattern.test(username)) {
        return res.status(400).json({
          field,
          available: false,
          message: "Username must be 3-30 characters and use only lowercase letters, numbers, hyphens, or underscores",
        });
      }

      const existingUsername = await User.findOne({ username }).select("_id").lean();

      return res.json({
        field,
        value: username,
        available: !existingUsername,
        message: existingUsername ? "Username already taken" : "Username is available",
        ...(existingUsername ? { suggestions: await usernameSuggestions(username) } : {}),
      });
    }

    if (field === "email") {
      const email = normalizeEmail(rawValue);

      if (!isValidEmail(email)) {
        return res.status(400).json({ field, available: false, message: "Invalid email address" });
      }

      const existingEmail = await findUserByEmailInsensitive(email).select("_id").lean();

      return res.json({
        field,
        value: email,
        available: !existingEmail,
        message: existingEmail ? "Email already exists" : "Email is available",
      });
    }

    if (field === "phone") {
      const phoneFields = normalizePhonePayload({
        country: req.query.country,
        countryCode: req.query.countryCode,
        phoneNumber: rawValue || req.query.phoneNumber,
      });

      if (!isValidPhoneNumber(phoneFields.phoneNumber)) {
        return res.status(400).json({ field, available: false, message: "Invalid phone number" });
      }

      const existingPhone = await findUserByPhoneFields(phoneFields);

      return res.json({
        field,
        value: phoneFields.phone,
        available: !existingPhone,
        message: existingPhone ? "Phone already exists" : "Phone is available",
      });
    }

    return res.status(400).json({ message: "Unsupported availability field" });
  } catch (error) {
    return next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);
    const phoneFields = normalizePhonePayload(req.body);
    const username = normalizeUsername(req.body.username);
    const displayName = String(name || username || "").trim();

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    if (!email && !phoneFields.phoneNumber) {
      return res.status(400).json({ message: "Email or phone number is required" });
    }

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    if (!usernamePattern.test(username)) {
      return res.status(400).json({ message: "Username must be 3-30 characters and use only lowercase letters, numbers, hyphens, or underscores" });
    }

    if (!hasAcceptedTerms(req.body.acceptedTerms)) {
      return res.status(400).json({ message: "You must accept the terms to register" });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    if (phoneFields.phoneNumber && !isValidPhoneNumber(phoneFields.phoneNumber)) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    if (!req.body.birthday) {
      return res.status(400).json({ message: "Birthday is required" });
    }

    const existingUser = email ? await findUserByEmailInsensitive(email) : null;
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({
        message: "Username already taken",
        suggestions: await usernameSuggestions(username),
      });
    }

    const existingPhone = phoneFields.phoneNumber ? await findUserByPhoneFields(phoneFields) : null;
    if (existingPhone) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: userData, errors } = normalizeProfileFields(req.body, { allowRole: true });

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    const emailForStorage = email || generatedEmailForPhone(phoneFields.phone);

    userData.email = emailForStorage;
    userData.emailNormalized = email || undefined;
    userData.emailGeneratedFromPhone = !email;
    userData.emailVerified = false;
    userData.username = username;
    userData.accountType = userData.accountType || "user";
    userData.phone = phoneFields.phone || userData.phone || "";
    userData.phoneNumber = phoneFields.phoneNumber || userData.phoneNumber || "";
    userData.countryCode = phoneFields.countryCode || userData.countryCode || "";
    userData.country = phoneFields.country || userData.country || "";
    userData.phoneVerified = false;
    userData.name = displayName;
    userData.referralCode = createReferralCode(displayName);

    if (req.body.birthday) {
      const birthday = new Date(req.body.birthday);
      if (Number.isNaN(birthday.getTime())) {
        return res.status(400).json({ message: "Birthday must be a valid date" });
      }
      if (birthday.getTime() > Date.now()) {
        return res.status(400).json({ message: "Birthday cannot be in the future" });
      }
      userData.birthday = birthday;
    }

    if (email && isConfiguredAdminEmail(email)) {
      userData.role = "admin";
      userData.accountRole = "admin";
      userData.protected = true;
    }

    const refCode = typeof req.body.referralCode === "string" ? req.body.referralCode.trim() : "";
    const referralFingerprint = referralFingerprintFor(req);
    const referrer = refCode ? await User.findOne({ referralCode: refCode }) : null;
    const deviceReferralUsed = referrer
      ? await User.exists({
          referredBy: referrer._id,
          referralFingerprint,
        })
      : null;

    if (referrer && !deviceReferralUsed) {
      userData.referredBy = referrer._id;
      userData.referralFingerprint = referralFingerprint;
    }

    const user = await User.create({
      ...userData,
      acceptedTerms: true,
      acceptedTermsAt: new Date(),
      trialStartDate: new Date(),
      trialActive: true,
      password: hashedPassword,
    });

    if (referrer && !deviceReferralUsed && referrer._id.toString() !== user._id.toString()) {
      await User.findByIdAndUpdate(referrer._id, { $inc: { referredUsers: 1 } });
      walletService
        .rewardReferral(referrer._id, user._id)
        .then((result) => {
          const payload = {
            type: "referral",
            amount: Number(result.transaction?.amount || 0),
            wallet: formatWalletResponse(result.wallet),
            transaction: formatTransactionResponse(result.transaction),
            referredUserId: user._id,
            message: "Referral signup bonus earned",
          };
          emitToUser(referrer._id, "wallet:update", payload.wallet);
          emitToUser(referrer._id, "wallet:reward", payload);
          emitToUser(referrer._id, "referral:success", payload);
        })
        .catch((error) => {
          console.error("[wallet] referral reward failed:", error.message);
        });
    }

    walletService.createWallet(user._id).catch((error) => {
      console.error("[wallet] signup initialization failed:", error.message);
    });

    const isolatedUser = await applyAdminIsolation(user);

    return res.status(201).json({
      user: userResponse(isolatedUser),
      token: generateToken(user._id),
      message: "Registration successful",
    });
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.email || error.keyPattern?.emailNormalized) {
        return res.status(400).json({ message: "Email already exists" });
      }
      if (error.keyPattern?.username) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { password } = req.body;
    const identifier = req.body.email || req.body.identifier || req.body.phoneNumber || req.body.phone;

    if (!identifier || !password) {
      return res.status(400).json({ message: "Email or phone and password are required" });
    }

    const normalizedEmail = normalizeEmail(identifier);
    const looksLikeEmail = String(identifier || "").includes("@");
    if (looksLikeEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const user = await findUserByLoginIdentifier(identifier);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.password) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account is blocked" });
    }

    await applyAdminIsolation(user);
    await syncTrialState(user);
    walletService.createWallet(user._id).catch((error) => {
      console.error("[wallet] login initialization failed:", error.message);
    });

    return res.json({
      user: userResponse(user),
      token: generateToken(user._id),
      message: "Login successful",
    });
  } catch (error) {
    return next(error);
  }
};

const sendEmailCode = async (req, res, next) => {
  try {
    const requestedEmail = normalizeEmail(req.body.email || req.user.email);
    const currentEmail = req.user.emailGeneratedFromPhone ? "" : normalizeEmail(req.user.email);
    const targetEmail = requestedEmail || currentEmail;

    if (!targetEmail || !isValidEmail(targetEmail)) {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    const emailChanged = currentEmail && targetEmail !== currentEmail;
    if (emailChanged || !currentEmail) {
      const existingEmail = await findUserByEmailInsensitive(targetEmail).select("_id").lean();
      if (existingEmail && existingEmail._id.toString() !== req.user._id.toString()) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    const lastSent = req.user.emailVerificationLastSentAt ? new Date(req.user.emailVerificationLastSentAt).getTime() : 0;
    const remainingMs = otpCooldownMs - (Date.now() - lastSent);
    if (remainingMs > 0) {
      return res.status(429).json({
        message: "Please wait before requesting another email code",
        retryAfterSeconds: Math.ceil(remainingMs / 1000),
      });
    }

    const code = generateOtpCode("email");
    const hashedCode = await bcrypt.hash(code, 10);
    const delivery = await sendVerificationEmail({
      to: targetEmail,
      code,
      name: req.user.name || req.user.username || "creator",
      expiresMinutes: otpExpiryMinutes,
    });

    if (!delivery.sent && !shouldExposeOtp("email")) {
      return res.status(503).json({
        message: delivery.message || "Email verification is temporarily unavailable. Please try again later.",
        reason: delivery.reason || "SMTP_NOT_CONFIGURED",
      });
    }

    const updates = {
      emailVerificationCode: hashedCode,
      emailVerificationExpires: new Date(Date.now() + otpExpiryMs),
      emailVerificationLastSentAt: new Date(),
      emailVerificationAttempts: 0,
      verificationCode: hashedCode,
      verificationExpires: new Date(Date.now() + otpExpiryMs),
      updatedAt: new Date(),
      ...(targetEmail !== currentEmail
        ? {
            pendingEmail: targetEmail,
            pendingEmailNormalized: targetEmail,
            emailVerified: false,
          }
        : {}),
    };

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    return res.json({
      user: userResponse(user),
      message: delivery.sent ? "Verification code sent to your email" : "Verification code prepared",
      expiresAt: updates.emailVerificationExpires,
      cooldownSeconds: Math.ceil(otpCooldownMs / 1000),
      delivery: delivery.sent ? "email_sent" : "local_code",
      ...(shouldExposeOtp("email") ? { code } : {}),
    });
  } catch (error) {
    return next(error);
  }
};

const verifyEmailCode = async (req, res, next) => {
  try {
    const code = String(req.body.code || "").replace(/[^\d]/g, "");
    if (code.length !== 6) {
      return res.status(400).json({ message: "Enter the 6-digit verification code" });
    }

    const user = await User.findById(req.user._id).select("+emailVerificationCode +verificationCode");
    if (!user || (!user.emailVerificationCode && !user.verificationCode) || !user.emailVerificationExpires) {
      return res.status(400).json({ message: "Request an email verification code first" });
    }

    if (new Date(user.emailVerificationExpires).getTime() < Date.now()) {
      return res.status(400).json({ message: "Verification code expired" });
    }

    if (Number(user.emailVerificationAttempts || 0) >= 5) {
      return res.status(429).json({ message: "Too many verification attempts. Request a new code." });
    }

    const storedCode = user.emailVerificationCode || user.verificationCode;
    const matches = await bcrypt.compare(code, storedCode);
    if (!matches) {
      user.emailVerificationAttempts = Number(user.emailVerificationAttempts || 0) + 1;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ message: "Invalid verification code" });
    }

    const targetEmail = normalizeEmail(user.pendingEmail || user.email);
    if (!targetEmail || !isValidEmail(targetEmail)) {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    const existingEmail = await findUserByEmailInsensitive(targetEmail).select("_id").lean();
    if (existingEmail && existingEmail._id.toString() !== user._id.toString()) {
      return res.status(400).json({ message: "Email already exists" });
    }

    user.email = targetEmail;
    user.emailNormalized = targetEmail;
    user.emailGeneratedFromPhone = false;
    user.pendingEmail = undefined;
    user.pendingEmailNormalized = undefined;
    user.emailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    user.emailVerificationAttempts = 0;
    user.verificationCode = undefined;
    user.verificationExpires = undefined;
    user.updatedAt = new Date();
    await user.save({ validateBeforeSave: false });

    createNotification({
      userId: user._id,
      type: "account_verification",
      title: "Email verified",
      message: "Your VibeBook email has been verified successfully.",
      data: { channel: "email" },
      dedupeKey: `email-verified:${user._id}:${targetEmail}`,
    }).catch(() => null);

    return res.json({
      user: userResponse(user),
      message: "Email verified",
    });
  } catch (error) {
    return next(error);
  }
};

const sendPhoneCode = async (req, res, next) => {
  try {
    const phoneFields = normalizePhonePayload({
      country: req.body.country || req.user.country,
      countryCode: req.body.countryCode || req.user.countryCode,
      phoneNumber: req.body.phoneNumber || req.user.phoneNumber || req.user.phone,
    });
    const currentPhone = req.user.phone || "";
    const nextPhone = phoneFields.phone || currentPhone;

    if (!nextPhone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const existingPhone = await findUserByPhoneFields(phoneFields, req.user._id);
    if (existingPhone) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    const lastSent = req.user.phoneVerificationLastSentAt ? new Date(req.user.phoneVerificationLastSentAt).getTime() : 0;
    const remainingMs = otpCooldownMs - (Date.now() - lastSent);
    if (remainingMs > 0) {
      return res.status(429).json({
        message: "Please wait before requesting another code",
        retryAfterSeconds: Math.ceil(remainingMs / 1000),
      });
    }

    const code = generateOtpCode("phone");
    const hashedCode = await bcrypt.hash(code, 10);
    const delivery = await sendPhoneVerificationSms({ to: nextPhone, code, expiresMinutes: otpExpiryMinutes });

    if (!delivery.sent && !shouldExposeOtp("phone")) {
      return res.status(503).json({
        message: "Phone verification coming soon.",
        reason: delivery.reason || "SMS_PROVIDER_NOT_CONFIGURED",
      });
    }

    const phoneChanged = currentPhone && currentPhone !== nextPhone;
    const updates = {
      phone: nextPhone,
      phoneNumber: phoneFields.phoneNumber || req.user.phoneNumber || "",
      countryCode: phoneFields.countryCode || req.user.countryCode || "",
      country: phoneFields.country || req.user.country || "",
      phoneVerificationCode: hashedCode,
      phoneVerificationExpires: new Date(Date.now() + otpExpiryMs),
      phoneVerificationLastSentAt: new Date(),
      phoneVerificationAttempts: 0,
      updatedAt: new Date(),
      ...(phoneChanged ? { phoneVerified: false } : {}),
    };

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    return res.json({
      user: userResponse(user),
      message: "Phone verification code sent",
      expiresAt: updates.phoneVerificationExpires,
      cooldownSeconds: Math.ceil(otpCooldownMs / 1000),
      delivery: delivery.sent ? `${delivery.provider || "sms"}_sent` : "local_code",
      ...(shouldExposeOtp("phone") ? { code } : {}),
    });
  } catch (error) {
    return next(error);
  }
};

const verifyPhoneCode = async (req, res, next) => {
  try {
    const code = String(req.body.code || "").replace(/[^\d]/g, "");
    if (code.length !== 6) {
      return res.status(400).json({ message: "Enter the 6-digit verification code" });
    }

    const user = await User.findById(req.user._id).select("+phoneVerificationCode");
    if (!user || !user.phoneVerificationCode || !user.phoneVerificationExpires) {
      return res.status(400).json({ message: "Request a verification code first" });
    }

    if (new Date(user.phoneVerificationExpires).getTime() < Date.now()) {
      return res.status(400).json({ message: "Verification code expired" });
    }

    if (Number(user.phoneVerificationAttempts || 0) >= 5) {
      return res.status(429).json({ message: "Too many verification attempts. Request a new code." });
    }

    const matches = await bcrypt.compare(code, user.phoneVerificationCode);
    if (!matches) {
      user.phoneVerificationAttempts = Number(user.phoneVerificationAttempts || 0) + 1;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ message: "Invalid verification code" });
    }

    user.phoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpires = undefined;
    user.phoneVerificationAttempts = 0;
    user.updatedAt = new Date();
    await user.save({ validateBeforeSave: false });

    createNotification({
      userId: user._id,
      type: "account_verification",
      title: "Phone verified",
      message: "Your VibeBook phone number has been verified successfully.",
      data: { channel: "phone" },
      dedupeKey: `phone-verified:${user._id}:${user.phone || user.phoneNumber}`,
    }).catch(() => null);

    return res.json({
      user: userResponse(user),
      message: "Phone verified",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  checkAvailability,
  register,
  login,
  sendEmailCode,
  verifyEmailCode,
  sendPhoneCode,
  verifyPhoneCode,
};
