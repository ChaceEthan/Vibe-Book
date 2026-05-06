const bcrypt = require("bcryptjs");

const Booking = require("../models/Booking");
const Feed = require("../models/Feed");
const User = require("../models/User");
const { sendContactNotification } = require("../utils/emailService");
const {
  PLATFORM_ACCESS_AMOUNT,
  PLATFORM_ACCESS_CURRENCY,
  buildAccessState,
} = require("../utils/accessControl");
const { removeFiles } = require("../utils/fileCleanup");
const { addMonetizationScore } = require("../utils/monetization");
const { DEFAULT_PROFILE_IMAGE_PATH } = require("../utils/profileDefaults");
const {
  normalizeStoredUploadPath,
  normalizeStoredUploadPaths,
  toPublicUploadUrl,
  toUploadPath,
} = require("../utils/storagePaths");
const {
  normalizeAvailability,
  normalizeGender,
  normalizeProfileFields,
  normalizeRole,
  normalizeText,
  normalizeType,
} = require("../utils/profileValidation");
const { getUploadedVideoDurationSeconds } = require("../utils/videoDuration");

const CONTACT_UNLOCK_PRICE = PLATFORM_ACCESS_AMOUNT;
const CONTACT_UNLOCK_CURRENCY = PLATFORM_ACCESS_CURRENCY;
const MAX_IMAGES_PER_USER = 3;
const FREE_VIDEO_LIMIT = 1;
const MAX_VIDEO_SECONDS = 120;
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

const sameId = (left, right) => {
  return Boolean(left && right && left.toString() === right.toString());
};

const hasId = (items, id) => {
  if (!Array.isArray(items) || !id) {
    return false;
  }

  return items.some((item) => sameId(item?._id || item, id));
};

const viewerFollowsProfile = (viewer, profile) => {
  if (!viewer || !profile) {
    return false;
  }

  return hasId(viewer.following, profile._id) || hasId(profile.followers, viewer._id);
};

const canViewContact = (viewer, profile) => {
  if (!viewer || !profile) {
    return false;
  }

  return sameId(viewer._id, profile._id) || viewerFollowsProfile(viewer, profile) || hasPaidForProfile(viewer, profile._id);
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

const normalizeDescriptions = (items = [], allowedUrls = []) => {
  const allowed = new Set(allowedUrls);

  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      url: normalizeStoredUploadPath(item?.url),
      description: normalizeText(item?.description).slice(0, 500),
    }))
    .filter((item) => item.url && (!allowed.size || allowed.has(item.url)));
};

const descriptionFor = (items = [], mediaUrl = "") => {
  const normalizedUrl = normalizeStoredUploadPath(mediaUrl);
  const match = (Array.isArray(items) ? items : []).find((item) => normalizeStoredUploadPath(item?.url) === normalizedUrl);
  return normalizeText(match?.description).slice(0, 500);
};

const profileMediaItems = (user) => {
  const videos = normalizeStoredUploadPaths(Array.isArray(user?.videos) && user.videos.length ? user.videos : user?.videoUrls || []);
  const images = normalizeStoredUploadPaths(Array.isArray(user?.images) && user.images.length ? user.images : user?.gallery || []);

  return [
    ...videos.filter(Boolean).map((mediaUrl) => ({
      mediaUrl,
      type: "video",
      caption: descriptionFor(user.videoDescriptions, mediaUrl),
    })),
    ...images.filter(Boolean).map((mediaUrl) => ({
      mediaUrl,
      type: "image",
      caption: descriptionFor(user.imageDescriptions, mediaUrl),
    })),
  ].filter((media) => normalizeStoredUploadPath(media.mediaUrl));
};

const ensureProfilePosts = async (user) => {
  const writes = profileMediaItems(user).map((media) =>
    Feed.findOneAndUpdate(
      { userId: user._id, mediaUrl: media.mediaUrl },
      {
        $setOnInsert: {
          userId: user._id,
          mediaUrl: media.mediaUrl,
          type: media.type,
          orientation: "portrait",
          duration: 0,
          caption: media.caption || "",
          tags: [],
          views: 0,
          likes: 0,
          shareCount: 0,
          comments: [],
          createdAt: user.createdAt || new Date(),
        },
      },
      { new: true, upsert: true, runValidators: true }
    )
  );

  if (!writes.length) {
    return;
  }

  await Promise.all(writes.map((write) => write.catch(() => null)));
};

const serializeProfilePost = (post, viewer = null, req = null) => {
  const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
  const viewerId = viewer?._id?.toString?.() || "";
  const mediaPath = normalizeStoredUploadPath(post.mediaUrl);

  if (!mediaPath) {
    return null;
  }

  return {
    _id: post._id,
    userId: post.userId,
    mediaUrl: mediaPath,
    url: toPublicUploadUrl(req, mediaPath),
    type: post.type,
    orientation: post.orientation === "landscape" ? "landscape" : "portrait",
    duration: Number(post.duration || 0),
    caption: post.caption || "",
    tags: Array.isArray(post.tags) ? post.tags : [],
    views: Number(post.views || 0),
    likes: likedBy.length,
    likeCount: likedBy.length,
    likedByViewer: Boolean(viewerId && likedBy.some((id) => id.toString() === viewerId)),
    comments: Array.isArray(post.comments) ? post.comments.slice(-10) : [],
    commentCount: Array.isArray(post.comments) ? post.comments.length : 0,
    commentsCount: Array.isArray(post.comments) ? post.comments.length : 0,
    shareCount: Number(post.shareCount || 0),
    createdAt: post.createdAt,
  };
};

const getProfilePosts = async (user, viewer = null, req = null) => {
  await ensureProfilePosts(user);
  const posts = await Feed.find({
    userId: user._id,
    mediaUrl: { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .limit(100);
  return posts.map((post) => serializeProfilePost(post, viewer, req)).filter(Boolean);
};

const profileResponse = (user, viewer = null, options = {}) => {
  const isOwnProfile = Boolean(viewer && sameId(viewer._id, user?._id));
  const isFollowing = viewerFollowsProfile(viewer, user);
  const paidUnlocked = hasPaidForProfile(viewer, user?._id);
  const bookingUnlocked = Boolean(options.bookingStarted || options.contactUnlocked);
  const isUnlocked = Boolean(options.includePrivate || isOwnProfile || isFollowing || paidUnlocked || bookingUnlocked);
  const contactUnlocked = Boolean(isUnlocked || canViewContact(viewer, user));
  const access = viewer ? buildAccessState(viewer) : null;
  const storedGallery = normalizeStoredUploadPaths(user.gallery);
  const storedImages = storedGallery.length
    ? storedGallery
    : normalizeStoredUploadPaths(user.images);
  const allImages = storedImages;
  const storedVideos = normalizeStoredUploadPaths(
    Array.isArray(user.videos) && user.videos.length ? user.videos : user.videoUrls || []
  );
  const profileImage =
    normalizeStoredUploadPath(user.profilePicture || user.profileImage) || allImages[0] || DEFAULT_PROFILE_IMAGE_PATH;
  const visibleImages = isUnlocked ? allImages : [profileImage].filter(Boolean);
  const visibleVideos = isUnlocked ? storedVideos : [];
  const imageDescriptions = normalizeDescriptions(user.imageDescriptions, visibleImages);
  const videoDescriptions = normalizeDescriptions(user.videoDescriptions, visibleVideos);
  const posts = Array.isArray(options.posts) && isUnlocked ? options.posts : [];
  const socialLinks = {
    instagram: user.socialLinks?.instagram || "",
    whatsapp: contactUnlocked ? user.whatsapp || user.whatsappNumber || user.socialLinks?.whatsapp || "" : "",
  };
  const followerCount = Array.isArray(user.followers) ? user.followers.length : 0;
  const followingCount = Array.isArray(user.following) ? user.following.length : 0;

  return {
    _id: user._id,
    name: user.name,
    email: contactUnlocked ? user.email || "" : "",
    role: user.role,
    accountRole: options.includePrivate ? user.accountRole || (user.role === "admin" ? "admin" : "user") : undefined,
    protected: options.includePrivate ? Boolean(user.protected || user.role === "admin") : undefined,
    type: user.type,
    accountType: user.accountType || "talent",
    gender: user.gender,
    category: user.category,
    skills: Array.isArray(user.skills) ? user.skills : [],
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
    imageDescriptions,
    videoUrls: visibleVideos,
    videos: visibleVideos,
    videoDescriptions,
    descriptions: {
      images: imageDescriptions,
      videos: videoDescriptions,
    },
    videoCount: storedVideos.length,
    posts,
    postCount: Number(options.postCount ?? options.posts?.length ?? posts.length),
    bio: isUnlocked ? user.bio : "",
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
    followers: options.includePrivate ? user.followers || [] : undefined,
    following: options.includePrivate ? user.following || [] : undefined,
    followerCount,
    followingCount,
    isFollowing,
    isUnlocked,
    contentUnlocked: isUnlocked,
    contentLocked: !isUnlocked,
    balance: options.includePrivate ? user.balance || 0 : undefined,
    isMonetized: Boolean(user.isMonetized),
    monetizationScore: options.includePrivate ? user.monetizationScore || 0 : undefined,
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
    language: options.includePrivate ? user.language || "en" : undefined,
    notificationEnabled: options.includePrivate ? user.notificationEnabled !== false : undefined,
    createdAt: user.createdAt,
  };
};

const getProfile = async (req, res, next) => {
  try {
    const posts = await getProfilePosts(req.user, req.user, req);
    return res.json({ user: profileResponse(req.user, req.user, { includePrivate: true, posts, postCount: posts.length }) });
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

    const bookingStarted = await hasBookingOrPaymentAccess(req.user, user._id);

    const posts = await getProfilePosts(user, req.user, req);

    return res.json({ user: profileResponse(user, req.user, { bookingStarted, posts, postCount: posts.length }) });
  } catch (error) {
    return next(error);
  }
};

const searchUsers = async (req, res, next) => {
  try {
    const { role, gender, category, type, availability, location, province, district, skill, minPrice, maxPrice } = req.query;
    const filters = {
      isBlocked: false,
      role: { $ne: "admin" },
    };
    const andConditions = [];

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
        (allowedCategory) => allowedCategory.toLowerCase() === categoryText.toLowerCase()
      );

      if (categoryText) {
        if (!exactCategory) {
          return res.status(400).json({
            message: `Please choose a valid category: ${User.allowedCategories.join(", ")}`,
          });
        }

        filters.category = exactCategory;
      }
    }

    if (availability) {
      const result = normalizeAvailability(availability);
      if (result.error) {
        return res.status(400).json({ message: result.error });
      }
      filters.availability = result.value;
    }

    if (skill) {
      const skillText = normalizeText(skill).replace(/^#/, "");
      if (skillText) {
        const skillRegex = new RegExp(escapeRegex(skillText), "i");
        andConditions.push({
          $or: [
            { skills: skillRegex },
            { role: skillRegex },
            { category: skillRegex },
            { bio: skillRegex },
          ],
        });
      }
    }

    if (location) {
      const locationRegex = new RegExp(escapeRegex(normalizeText(location)), "i");
      andConditions.push({
        $or: [
          { location: locationRegex },
          { province: locationRegex },
          { district: locationRegex },
        ],
      });
    }

    if (province) {
      filters.province = new RegExp(escapeRegex(normalizeText(province)), "i");
    }

    if (district) {
      filters.district = new RegExp(escapeRegex(normalizeText(district)), "i");
    }

    const price = {};
    if (minPrice !== undefined && minPrice !== "") {
      const min = Number(minPrice);
      if (!Number.isFinite(min) || min < 0) {
        return res.status(400).json({ message: "Minimum price must be a valid positive number" });
      }
      price.$gte = min;
    }

    if (maxPrice !== undefined && maxPrice !== "") {
      const max = Number(maxPrice);
      if (!Number.isFinite(max) || max < 0) {
        return res.status(400).json({ message: "Maximum price must be a valid positive number" });
      }
      price.$lte = max;
    }

    if (price.$gte !== undefined && price.$lte !== undefined && price.$gte > price.$lte) {
      return res.status(400).json({ message: "Minimum price cannot be greater than maximum price" });
    }

    if (Object.keys(price).length) {
      filters.price = price;
    }

    if (andConditions.length) {
      filters.$and = andConditions;
    }

    const users = await User.find(filters)
      .select("-password")
      .sort({ isPremium: -1, premiumBadge: -1, isVerified: -1, averageRating: -1, createdAt: -1 });

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
      return res.status(400).json({ message: `Free profiles can upload ${FREE_VIDEO_LIMIT} video up to 2 minutes` });
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
    const descriptions = imagePaths.map((imagePath) => ({
      url: imagePath,
      description: normalizeText(req.body.description).slice(0, 500),
    }));
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        images: isPremium ? [...currentImages, ...imagePaths] : [...currentImages, ...imagePaths].slice(0, MAX_IMAGES_PER_USER),
        gallery: isPremium ? [...currentImages, ...imagePaths] : [...currentImages, ...imagePaths].slice(0, MAX_IMAGES_PER_USER),
        imageDescriptions: [...(req.user.imageDescriptions || []), ...descriptions],
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
      const duration = await getUploadedVideoDurationSeconds(file);

      if (!duration || duration > MAX_VIDEO_SECONDS) {
        await removeFiles(files);
        return res.status(400).json({ message: "Videos must be 2 minutes or shorter" });
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
      return res.status(400).json({ message: `Free profiles can upload ${FREE_VIDEO_LIMIT} video up to 2 minutes` });
    }

    const videoPaths = files.map((file) => toUploadPath(file, "videos"));
    const nextVideos = [...currentVideos, ...videoPaths];
    const descriptions = videoPaths.map((videoPath) => ({
      url: videoPath,
      description: normalizeText(req.body.description).slice(0, 500),
    }));
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        videoUrls: nextVideos,
        videos: nextVideos,
        videoDescriptions: [...(req.user.videoDescriptions || []), ...descriptions],
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

    const existingUser = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select("-password");

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const alreadyLiked = hasId(existingUser.likedBy, req.user._id);
    const user = await User.findByIdAndUpdate(
      existingUser._id,
      { $addToSet: { likedBy: req.user._id } },
      { returnDocument: "after", runValidators: true }
    ).select("-password");

    user.likes = Array.isArray(user.likedBy) ? user.likedBy.length : 0;
    await user.save({ validateBeforeSave: false });

    if (!alreadyLiked) {
      await addMonetizationScore(user._id, "like");
    }

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
    await user.save({ validateBeforeSave: false });

    return res.json({ user: profileResponse(user, req.user), message: "Profile unliked" });
  } catch (error) {
    return next(error);
  }
};

const followProfile = async (req, res, next) => {
  try {
    if (sameId(req.user._id, req.params.id)) {
      return res.status(400).json({ message: "You cannot follow your own profile" });
    }

    const target = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select("-password");

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const alreadyFollowing = hasId(req.user.following, target._id) || hasId(target.followers, req.user._id);

    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $addToSet: { following: target._id } }, { runValidators: true }),
      User.findByIdAndUpdate(target._id, { $addToSet: { followers: req.user._id } }, { runValidators: true }),
    ]);

    if (!alreadyFollowing) {
      await addMonetizationScore(target._id, "follower");
    }

    const [viewer, user] = await Promise.all([
      User.findById(req.user._id).select("-password"),
      User.findById(target._id).select("-password"),
    ]);

    return res.json({
      user: profileResponse(user, viewer),
      currentUser: profileResponse(viewer, viewer, { includePrivate: true }),
      message: alreadyFollowing ? "Already following" : "Profile followed",
    });
  } catch (error) {
    return next(error);
  }
};

const unfollowProfile = async (req, res, next) => {
  try {
    if (sameId(req.user._id, req.params.id)) {
      return res.status(400).json({ message: "You cannot unfollow your own profile" });
    }

    const target = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select("-password");

    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $pull: { following: target._id } }, { runValidators: true }),
      User.findByIdAndUpdate(target._id, { $pull: { followers: req.user._id } }, { runValidators: true }),
    ]);

    const [viewer, user] = await Promise.all([
      User.findById(req.user._id).select("-password"),
      User.findById(target._id).select("-password"),
    ]);

    return res.json({
      user: profileResponse(user, viewer),
      currentUser: profileResponse(viewer, viewer, { includePrivate: true }),
      message: "Profile unfollowed",
    });
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

const deleteMyAccount = async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    return res.json({ message: "Account deleted" });
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

    const profileUnlocked = canViewContact(req.user, userToContact) || (await hasBookingOrPaymentAccess(req.user, userToContact._id));

    if (!profileUnlocked) {
      return res.status(403).json({ message: "Follow, pay, or start a booking to contact this profile" });
    }

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
  profileResponse,
  getProfile,
  getUserById,
  searchUsers,
  updateProfile,
  uploadProfileImage,
  uploadProfileImages,
  uploadProfileVideos,
  payPlatformAccess,
  followProfile,
  unfollowProfile,
  likeProfile,
  unlikeProfile,
  unlockProfileContact,
  contactUser,
  deleteMyAccount,
};
