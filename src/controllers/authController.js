const bcrypt = require("bcryptjs");

const User = require("../models/User");
const { buildAccessState, syncTrialState } = require("../utils/accessControl");
const generateToken = require("../utils/generateToken");
const { DEFAULT_PROFILE_IMAGE_PATH } = require("../utils/profileDefaults");
const {
  normalizeEmail,
  normalizeProfileFields,
} = require("../utils/profileValidation");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const frontendUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "").replace(/\/$/, "");
  return `${frontendUrl}/register?ref=${referralCode}`;
};

const userResponse = (user) => {
  const images = Array.isArray(user.images) && user.images.length ? user.images : [DEFAULT_PROFILE_IMAGE_PATH];
  const videos = Array.isArray(user.videos) && user.videos.length ? user.videos : user.videoUrls || [];
  const profileImage = user.profileImage || images[0] || DEFAULT_PROFILE_IMAGE_PATH;

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    type: user.type,
    gender: user.gender,
    category: user.category,
    price: user.price,
    phone: user.phone,
    whatsappNumber: user.whatsappNumber || user.whatsapp,
    whatsapp: user.whatsapp || user.whatsappNumber,
    location: user.location,
    province: user.province,
    district: user.district,
    profileImage,
    images,
    videoUrls: videos,
    videos,
    bio: user.bio,
    socialLinks: user.socialLinks,
    availability: user.availability,
    averageRating: user.averageRating,
    isPremium: user.isPremium,
    premiumBadge: user.premiumBadge || user.isPremium,
    isVerified: user.isVerified,
    isBlocked: user.isBlocked,
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
  };
};

const isValidEmail = (email) => emailPattern.test(email);

const hasAcceptedTerms = (acceptedTerms) => {
  return acceptedTerms === true || acceptedTerms === "true";
};

const register = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    if (!hasAcceptedTerms(req.body.acceptedTerms)) {
      return res.status(400).json({ message: "You must accept the terms to register" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: userData, errors } = normalizeProfileFields(req.body, { allowRole: true });

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    userData.email = email;
    userData.referralCode = createReferralCode(name);

    const refCode = typeof req.body.referralCode === "string" ? req.body.referralCode.trim() : "";
    const referrer = refCode ? await User.findOne({ referralCode: refCode }) : null;

    if (referrer) {
      userData.referredBy = referrer._id;
    }

    const user = await User.create({
      ...userData,
      acceptedTerms: true,
      acceptedTermsAt: new Date(),
      trialStartDate: new Date(),
      trialActive: true,
      password: hashedPassword,
    });

    if (referrer) {
      await User.findByIdAndUpdate(referrer._id, { $inc: { referredUsers: 1 } });
    }

    return res.status(201).json({
      user: userResponse(user),
      token: generateToken(user._id),
      message: "Registration successful",
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account is blocked" });
    }

    await syncTrialState(user);

    return res.json({
      user: userResponse(user),
      token: generateToken(user._id),
      message: "Login successful",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
};
