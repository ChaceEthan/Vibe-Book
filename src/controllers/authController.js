const bcrypt = require("bcryptjs");

const User = require("../models/User");
const generateToken = require("../utils/generateToken");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicRoles = User.allowedRoles.filter((role) => role !== "admin");

const registerableFields = [
  "name",
  "email",
  "role",
  "type",
  "gender",
  "category",
  "price",
  "phone",
  "whatsappNumber",
  "location",
  "images",
  "bio",
  "socialLinks",
  "availability",
];

const userResponse = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  type: user.type,
  gender: user.gender,
  category: user.category,
  price: user.price,
  phone: user.phone,
  whatsappNumber: user.whatsappNumber,
  location: user.location,
  images: user.images,
  bio: user.bio,
  socialLinks: user.socialLinks,
  availability: user.availability,
  averageRating: user.averageRating,
  isPremium: user.isPremium,
  isVerified: user.isVerified,
  isBlocked: user.isBlocked,
  createdAt: user.createdAt,
});

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.toLowerCase().trim() : "";
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

    if (Object.prototype.hasOwnProperty.call(req.body, "role")) {
      if (!User.allowedRoles.includes(req.body.role)) {
        return res.status(400).json({ message: `Role must be one of: ${publicRoles.join(", ")}` });
      }

      if (req.body.role === "admin") {
        return res.status(400).json({ message: "Admin role cannot be selected during registration" });
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, "type") &&
      !User.allowedTypes.includes(req.body.type)
    ) {
      return res.status(400).json({ message: `Type must be one of: ${User.allowedTypes.join(", ")}` });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userData = {};

    registerableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        userData[field] = req.body[field];
      }
    });

    userData.email = email;

    const user = await User.create({
      ...userData,
      acceptedTerms: true,
      acceptedTermsAt: new Date(),
      password: hashedPassword,
    });

    return res.status(201).json({
      user: userResponse(user),
      token: generateToken(user._id),
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

    return res.json({
      user: userResponse(user),
      token: generateToken(user._id),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
};
