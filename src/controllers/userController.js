const bcrypt = require("bcryptjs");

const User = require("../models/User");
const { sendContactNotification } = require("../utils/emailService");

const allowedUpdates = [
  "name",
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
  "password",
];

const publicRoles = User.allowedRoles.filter((role) => role !== "admin");

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getProfile = async (req, res, next) => {
  try {
    return res.json({ user: req.user });
  } catch (error) {
    return next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
    })
      .select("-password")
      .populate("ratings.user", "name role images");

    if (!user || user.role === "admin") {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      user: {
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
        rating: user.averageRating,
        averageRating: user.averageRating,
        ratings: user.ratings,
        isPremium: user.isPremium,
        isVerified: user.isVerified,
        verified: user.isVerified,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const searchUsers = async (req, res, next) => {
  try {
    const { role, gender, category, type, availability, minPrice, maxPrice } = req.query;
    const filters = {
      isBlocked: false,
      role: { $ne: "admin" },
    };

    if (role) {
      if (!publicRoles.includes(role)) {
        return res.status(400).json({ message: `Role must be one of: ${publicRoles.join(", ")}` });
      }

      filters.role = role;
    }

    if (type) {
      if (!User.allowedTypes.includes(type)) {
        return res.status(400).json({ message: `Type must be one of: ${User.allowedTypes.join(", ")}` });
      }

      filters.type = type;
    }

    if (gender) {
      filters.gender = new RegExp(`^${escapeRegex(gender.trim())}$`, "i");
    }

    if (category) {
      filters.category = new RegExp(`^${escapeRegex(category.trim())}$`, "i");
    }

    if (availability) {
      filters.availability = new RegExp(`^${escapeRegex(availability.trim())}$`, "i");
    }

    const hasMinPrice = minPrice !== undefined && minPrice !== "";
    const hasMaxPrice = maxPrice !== undefined && maxPrice !== "";

    if (hasMinPrice || hasMaxPrice) {
      filters.price = {};

      if (hasMinPrice) {
        const min = Number(minPrice);
        if (!Number.isFinite(min) || min < 0) {
          return res.status(400).json({ message: "minPrice must be a valid positive number" });
        }
        filters.price.$gte = min;
      }

      if (hasMaxPrice) {
        const max = Number(maxPrice);
        if (!Number.isFinite(max) || max < 0) {
          return res.status(400).json({ message: "maxPrice must be a valid positive number" });
        }
        filters.price.$lte = max;
      }
    }

    const users = await User.find(filters).select("-password").sort({ createdAt: -1 });

    return res.json({ users });
  } catch (error) {
    return next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const updates = {};

    allowedUpdates.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

    if (updates.password) {
      if (updates.password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
};

const contactUser = async (req, res, next) => {
  try {
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: "You cannot contact yourself" });
    }

    const userToContact = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
    }).select("-password");

    if (!userToContact) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log(
      `User contact request: ${req.user.name} (${req.user._id}) contacted ${userToContact.name} (${userToContact._id})`
    );
    console.log(`Contact message: ${message}`);

    let notification = { sent: false, reason: "NOT_ATTEMPTED" };

    try {
      notification = await sendContactNotification({
        to: userToContact.email,
        contactedUser: userToContact,
        fromUser: req.user,
        message,
      });
    } catch (error) {
      console.error(`Contact email failed: ${error.message}`);
      notification = { sent: false, reason: "EMAIL_FAILED" };
    }

    return res.status(202).json({
      message: "Contact request logged",
      notification: notification.sent ? "email_sent" : "email_prepared",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getProfile,
  getUserById,
  searchUsers,
  updateProfile,
  contactUser,
};
