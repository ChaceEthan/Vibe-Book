const bcrypt = require("bcryptjs");

const Booking = require("../models/Booking");
const User = require("../models/User");
const { sendContactNotification } = require("../utils/emailService");
const {
  PLATFORM_ACCESS_AMOUNT,
  PLATFORM_ACCESS_CURRENCY,
  buildAccessState,
  hasPlatformAccess,
} = require("../utils/accessControl");
const { removeFiles } = require("../utils/fileCleanup");
const { DEFAULT_PROFILE_IMAGE_PATH } = require("../utils/profileDefaults");
const { toUploadPath } = require("../utils/storagePaths");
const {
  normalizeAvailability,
  normalizeGender,
  normalizeProfileFields,
  normalizeRole,
  normalizeText,
  normalizeType,
} = require("../utils/profileValidation");
const { getMp4DurationSeconds } = require("../utils/videoDuration");

const CONTACT_UNLOCK_PRICE = PLATFORM_ACCESS_AMOUNT;
const CONTACT_UNLOCK_CURRENCY = PLATFORM_ACCESS_CURRENCY;
const MAX_IMAGES_PER_USER = 3;
const FREE_VIDEO_LIMIT = 1;
const MAX_VIDEO_SECONDS = 60;
const searchRoleAliases = {
  djs: "dj",
  dj: "dj",
  mcs: "mc",
  mc: "mc",
  dancers: "dancer",
  dancer: "dancer",
  artists: "artist",
  artist: "artist",
  crews: "crew",
  crew: "crew",
};

const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getReferralLink = (referralCode) => {
  if (!referralCode) {
    return "";
  }

  const frontendUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "").replace(/\/$/, "");
  return `${frontendUrl}/register?ref=${referralCode}`;
};

const hasPaidForProfile = (viewer, profileId) => {
  if (!viewer || !Array.isArray(viewer.paidProfileViews)) {
    return false;
  }

  return viewer.paidProfileViews.some((view) => {
    return view.profile?.toString() === profileId.toString();
  });
};

const canViewContact = (viewer, profile) => {
  if (!viewer || !profile) {
    return false;
  }

  return viewer._id.toString() === profile._id.toString() || hasPaidForProfile(viewer, profile._id);
};

const hasBookingOrPaymentAccess = async (viewer, profileId) => {
  if (!viewer || !profileId) {
    return false;
  }

  const booking = await Booking.findOne({
    $and: [
      {
        $or: [
          { requester: viewer._id, talent: profileId },
          { requester: profileId, talent: viewer._id },
        ],
      },
      {
        $or: [
          { paymentStatus: "paid" },
          { status: { $in: ["pending", "accepted", "completed"] } },
        ],
      },
    ],
  }).select("_id");

  return Boolean(booking);
};

const profileResponse = (user, viewer = null, options = {}) => {
  const contactUnlocked = Boolean(options.includePrivate || options.contactUnlocked || canViewContact(viewer, user));
  const access = viewer ? buildAccessState(viewer) : null;
  const storedGallery = Array.isArray(user.gallery) ? user.gallery.filter(Boolean) : [];
  const storedImages = storedGallery.length
    ? storedGallery
    : Array.isArray(user.images)
      ? user.images.filter(Boolean)
      : [];
  const allImages = storedImages;
  const storedVideos = Array.isArray(user.videos) && user.videos.length ? user.videos : user.videoUrls || [];
  const profileImage = user.profilePicture || user.profileImage || allImages[0] || DEFAULT_PROFILE_IMAGE_PATH;
  const fullGalleryUnlocked = Boolean(options.includePrivate || user.isPremium || user.premiumBadge);
  const visibleImages = fullGalleryUnlocked ? allImages : allImages.slice(0, 3);
  const socialLinks = {
    instagram: user.socialLinks?.instagram || "",
    whatsapp: contactUnlocked ? user.whatsapp || user.whatsappNumber || user.socialLinks?.whatsapp || "" : "",
  };

  return {
    _id: user._id,
    name: user.name,
    email: contactUnlocked ? user.email || "" : "",
    role: user.role,
    type: user.type,
    gender: user.gender,
    category: user.category,
    price: user.price,
    phone: contactUnlocked ? user.phone || "" : "",
    whatsappNumber: contactUnlocked ? user.whatsappNumber || user.whatsapp || "" : "",
    whatsapp: contactUnlocked ? user.whatsapp || user.whatsappNumber || "" : "",
    location: user.location,
    province: user.province,
    district: user.district,
    profileImage,
    profilePicture: profileImage,
    images: visibleImages,
    gallery: visibleImages,
    galleryImageCount: storedImages.length,
    videoUrls: storedVideos,
    videos: storedVideos,
    bio: user.bio,
    socialLinks,
    availability: user.availability,
    rating: user.averageRating || user.rating || 0,
    averageRating: user.averageRating || user.rating || 0,
    ratings: user.ratings,
    likes: Array.isArray(user.likedBy) ? user.likedBy.length : Number(user.likes || 0),
    likeCount: Array.isArray(user.likedBy) ? user.likedBy.length : Number(user.likes || 0),
    likedByViewer: Boolean(
      viewer &&
        Array.isArray(user.likedBy) &&
        user.likedBy.some((likedUserId) => likedUserId.toString() === viewer._id.toString())
    ),
    isPremium: user.isPremium,
    premiumBadge: user.premiumBadge || user.isPremium,
    isVerified: user.isVerified,
    verified: user.isVerified,
    referralCode: options.includePrivate ? user.referralCode : undefined,
    referralLink: options.includePrivate ? getReferralLink(user.referralCode) : undefined,
    referredUsers: options.includePrivate ? user.referredUsers : undefined,
    trialStartDate: options.includePrivate ? user.trialStartDate : undefined,
    trialActive: options.includePrivate ? access?.trialActive : undefined,
    trialEndsAt: options.includePrivate ? access?.trialEndsAt : undefined,
    hasPaidAccess: options.includePrivate ? user.hasPaidAccess : undefined,
    lastPaymentDate: options.includePrivate ? user.lastPaymentDate : undefined,
    access: options.includePrivate ? access : undefined,
    contactUnlocked,
    contactLocked: !contactUnlocked,
    contactUnlockPrice: CONTACT_UNLOCK_PRICE,
    contactUnlockCurrency: CONTACT_UNLOCK_CURRENCY,
    createdAt: user.createdAt,
  };
};

const getProfile = async (req, res, next) => {
  try {
    return res.json({ user: profileResponse(req.user, req.user, { includePrivate: true }) });
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

    const contactUnlocked = await hasBookingOrPaymentAccess(req.user, user._id);

    return res.json({ user: profileResponse(user, req.user, { contactUnlocked }) });
  } catch (error) {
    return next(error);
  }
};

const searchUsers = async (req, res, next) => {
  try {
    const { role, gender, category, type, availability, location, province, district } = req.query;
    const filters = {
      isBlocked: false,
      role: { $ne: "admin" },
    };

    if (role) {
      const roleValue = searchRoleAliases[normalizeText(role).toLowerCase()] || role;
      const result = normalizeRole(roleValue);
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }

      filters.role = result.value;
    }

    if (type) {
      const result = normalizeType(type);
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }

      filters.type = result.value;
    }

    if (gender) {
      const result = normalizeGender(gender);
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }
      filters.gender = new RegExp(`^${escapeRegex(result.value)}$`, "i");
    }

    if (category) {
      const categoryText = normalizeText(category);
      const exactCategory = User.allowedCategories.find(
        (allowedCategory) =>
          allowedCategory.toLowerCase() === categoryText.toLowerCase() ||
          allowedCategory.toLowerCase().includes(categoryText.toLowerCase())
      );

      if (categoryText) {
        filters.category = new RegExp(escapeRegex(exactCategory || categoryText), "i");
      }
    }

    if (availability) {
      const result = normalizeAvailability(availability);
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }
      filters.availability = result.value;
    }

    if (location) {
      const locationRegex = new RegExp(escapeRegex(normalizeText(location)), "i");
      filters.$or = [
        { location: locationRegex },
        { province: locationRegex },
        { district: locationRegex },
      ];
    }

    if (province) {
      filters.province = new RegExp(escapeRegex(normalizeText(province)), "i");
    }

    if (district) {
      filters.district = new RegExp(escapeRegex(normalizeText(district)), "i");
    }

    const users = await User.find(filters)
      .select("-password")
      .sort({ isPremium: -1, premiumBadge: -1, createdAt: -1 });

    return res.json({ users: users.map((user) => profileResponse(user, req.user)) });
  } catch (error) {
    return next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { data: updates, errors } = normalizeProfileFields(req.body);

    if (!updates.name && !req.user.name) {
      errors.push("Name is required");
    }

    if (!updates.category && !req.user.category) {
      errors.push("Category is required");
    }

    if (errors.length) {
      return res.status(400).json({ message: errors[0], errors });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "password")) {
      const password = typeof req.body.password === "string" ? req.body.password : "";

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      updates.password = await bcrypt.hash(password, 10);
    }

    const isPremium = Boolean(req.user.isPremium || req.user.premiumBadge);
    if (!isPremium && Array.isArray(updates.images) && updates.images.length > MAX_IMAGES_PER_USER) {
      return res.status(400).json({ message: `Free profiles can have a maximum of ${MAX_IMAGES_PER_USER} images` });
    }

    if (!isPremium && Array.isArray(updates.videos) && updates.videos.length > FREE_VIDEO_LIMIT) {
      return res.status(400).json({ message: `Free profiles can upload ${FREE_VIDEO_LIMIT} video up to 60 seconds` });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    return res.json({ user: profileResponse(user, user, { includePrivate: true }) });
  } catch (error) {
    return next(error);
  }
};

const uploadProfileImages = async (req, res, next) => {
  try {
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ message: "At least one image file is required" });
    }

    const currentImages = Array.isArray(req.user.gallery) && req.user.gallery.length
      ? req.user.gallery
      : Array.isArray(req.user.images)
        ? req.user.images
        : [];

    const isPremium = Boolean(req.user.isPremium || req.user.premiumBadge);
    if (!isPremium && currentImages.length + files.length > MAX_IMAGES_PER_USER) {
      await removeFiles(files);
      return res.status(400).json({ message: `Free profiles can have a maximum of ${MAX_IMAGES_PER_USER} images` });
    }

    const imagePaths = files.map((file) => toUploadPath(file, "images"));
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        images: isPremium ? [...currentImages, ...imagePaths] : [...currentImages, ...imagePaths].slice(0, MAX_IMAGES_PER_USER),
        gallery: isPremium ? [...currentImages, ...imagePaths] : [...currentImages, ...imagePaths].slice(0, MAX_IMAGES_PER_USER),
        profileImage: req.user.profileImage || req.user.profilePicture || imagePaths[0],
        profilePicture: req.user.profilePicture || req.user.profileImage || imagePaths[0],
      },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    return res.status(201).json({ user: profileResponse(user, user, { includePrivate: true }) });
  } catch (error) {
    await removeFiles(req.files || []);
    return next(error);
  }
};

const uploadProfileImage = async (req, res, next) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Profile image file is required" });
    }

    const imagePath = toUploadPath(file, "images");
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        profileImage: imagePath,
        profilePicture: imagePath,
      },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    return res.status(201).json({ user: profileResponse(user, user, { includePrivate: true }) });
  } catch (error) {
    await removeFiles(req.file ? [req.file] : []);
    return next(error);
  }
};

const uploadProfileVideos = async (req, res, next) => {
  try {
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({ message: "At least one video file is required" });
    }

    for (const file of files) {
      const duration = await getMp4DurationSeconds(file.path);

      if (!duration || duration > MAX_VIDEO_SECONDS) {
        await removeFiles(files);
        return res.status(400).json({ message: "Videos must be 60 seconds or shorter" });
      }
    }

    const currentVideos = Array.isArray(req.user.videos) && req.user.videos.length
      ? req.user.videos
      : Array.isArray(req.user.videoUrls)
        ? req.user.videoUrls
        : [];

    const isPremium = Boolean(req.user.isPremium || req.user.premiumBadge);
    if (!isPremium && currentVideos.length + files.length > FREE_VIDEO_LIMIT) {
      await removeFiles(files);
      return res.status(400).json({ message: `Free profiles can upload ${FREE_VIDEO_LIMIT} video up to 60 seconds` });
    }

    const videoPaths = files.map((file) => toUploadPath(file, "videos"));
    const nextVideos = [...currentVideos, ...videoPaths];
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        videoUrls: nextVideos,
        videos: nextVideos,
      },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    return res.status(201).json({ user: profileResponse(user, user, { includePrivate: true }) });
  } catch (error) {
    await removeFiles(req.files || []);
    return next(error);
  }
};

const likeProfile = async (req, res, next) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: "You cannot like your own profile" });
    }

    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        isBlocked: false,
        role: { $ne: "admin" },
      },
      { $addToSet: { likedBy: req.user._id } },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.likes = Array.isArray(user.likedBy) ? user.likedBy.length : 0;
    await user.save();

    return res.json({ user: profileResponse(user, req.user), message: "Profile liked" });
  } catch (error) {
    return next(error);
  }
};

const unlikeProfile = async (req, res, next) => {
  try {
    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        isBlocked: false,
        role: { $ne: "admin" },
      },
      { $pull: { likedBy: req.user._id } },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.likes = Array.isArray(user.likedBy) ? user.likedBy.length : 0;
    await user.save();

    return res.json({ user: profileResponse(user, req.user), message: "Profile unliked" });
  } catch (error) {
    return next(error);
  }
};

const unlockProfileContact = async (req, res, next) => {
  try {
    const profileId = req.params.id;

    if (req.user._id.toString() === profileId) {
      return res.status(400).json({ message: "You already own this profile" });
    }

    const amount = Number(req.body.amount);
    const paymentReference = typeof req.body.paymentReference === "string" ? req.body.paymentReference.trim() : "";

    if (amount !== CONTACT_UNLOCK_PRICE || req.body.currency !== CONTACT_UNLOCK_CURRENCY) {
      return res.status(400).json({ message: `Unlock contact requires ${CONTACT_UNLOCK_PRICE} ${CONTACT_UNLOCK_CURRENCY}` });
    }

    if (!paymentReference) {
      return res.status(400).json({ message: "Payment reference is required" });
    }

    const profile = await User.findOne({ _id: profileId, isBlocked: false, role: { $ne: "admin" } }).select("-password");

    if (!profile) {
      return res.status(404).json({ message: "User not found" });
    }

    const alreadyPaid = hasPaidForProfile(req.user, profileId);

    if (!alreadyPaid) {
      await User.findByIdAndUpdate(req.user._id, {
        hasPaidAccess: true,
        lastPaymentDate: new Date(),
        trialActive: false,
        $push: {
          paidProfileViews: {
            profile: profileId,
            amount: CONTACT_UNLOCK_PRICE,
            currency: CONTACT_UNLOCK_CURRENCY,
            paymentReference,
            paidAt: new Date(),
          },
        },
      });
    }

    return res.json({ user: profileResponse(profile, { ...req.user.toObject(), paidProfileViews: [{ profile: profileId }] }) });
  } catch (error) {
    return next(error);
  }
};

const payPlatformAccess = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount || PLATFORM_ACCESS_AMOUNT);
    const currency = req.body.currency || PLATFORM_ACCESS_CURRENCY;

    if (amount !== PLATFORM_ACCESS_AMOUNT || currency !== PLATFORM_ACCESS_CURRENCY) {
      return res
        .status(400)
        .json({ message: `Access payment requires ${PLATFORM_ACCESS_AMOUNT} ${PLATFORM_ACCESS_CURRENCY}` });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        hasPaidAccess: true,
        lastPaymentDate: new Date(),
        trialActive: false,
      },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    return res.json({
      user: profileResponse(user, user, { includePrivate: true }),
      message: "Access unlocked",
    });
  } catch (error) {
    return next(error);
  }
};

const contactUser = async (req, res, next) => {
  try {
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

    if (!hasPlatformAccess(req.user)) {
      return res.status(402).json({
        message: `Pay ${PLATFORM_ACCESS_AMOUNT} ${PLATFORM_ACCESS_CURRENCY} to unlock contact after your trial`,
        data: { access: buildAccessState(req.user) },
      });
    }

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
  uploadProfileImage,
  uploadProfileImages,
  uploadProfileVideos,
  payPlatformAccess,
  likeProfile,
  unlikeProfile,
  unlockProfileContact,
  contactUser,
};
