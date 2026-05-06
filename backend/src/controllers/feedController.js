const Feed = require("../models/Feed");
const User = require("../models/User");
const { DEFAULT_PROFILE_IMAGE_PATH } = require("../utils/profileDefaults");
const { addMonetizationScore } = require("../utils/monetization");
const {
  isCloudinarySecureUrl,
  normalizeStoredUploadPath,
  normalizeStoredUploadPaths,
  toPublicUploadUrl,
} = require("../utils/storagePaths");
const { validateChatMessage } = require("../utils/chatModeration");

const userSelect = "name role category skills price location profileImage profilePicture images gallery imageDescriptions videos videoUrls videoDescriptions averageRating rating likes likedBy followers following isPremium premiumBadge isVerified province district createdAt";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const hasId = (items, id) => {
  if (!Array.isArray(items) || !id) {
    return false;
  }

  const targetId = idOf(id);
  return items.some((item) => idOf(item) === targetId);
};

const normalizeDescriptionFor = (items = [], mediaUrl = "") => {
  const target = normalizeStoredUploadPath(mediaUrl);
  const item = (Array.isArray(items) ? items : []).find((entry) => normalizeStoredUploadPath(entry?.url) === target);
  return typeof item?.description === "string" ? item.description.trim().slice(0, 500) : "";
};

const inferOrientation = (value) => (value === "landscape" ? "landscape" : "portrait");
const hasMediaUrl = (value) => isCloudinarySecureUrl(normalizeStoredUploadPath(value));
const cloudinaryMediaQuery = { $regex: /^https:\/\/res\.cloudinary\.com\//i };

const parsePositiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
};

const engagementCounts = (item) => {
  const likedBy = Array.isArray(item.likedBy) ? item.likedBy : [];
  const comments = Array.isArray(item.comments) ? item.comments : [];

  return {
    views: Number(item.views || 0),
    likes: likedBy.length || Number(item.likes || 0),
    comments: comments.length,
    shares: Number(item.shareCount || 0),
  };
};

const recencyBoostFor = (createdAt) => {
  const created = new Date(createdAt || 0).getTime();

  if (!created) {
    return 0;
  }

  const ageHours = Math.max(0, (Date.now() - created) / 36e5);
  return Math.max(0, 100 - ageHours);
};

const scoreFeedItem = (item) => {
  const counts = engagementCounts(item);
  const boostActive = item.boostedUntil && new Date(item.boostedUntil).getTime() > Date.now();
  const boostScore = boostActive ? Number(item.boostScore || 0) : 0;
  const premiumBoost = item.userId?.isPremium || item.userId?.premiumBadge ? 15 : 0;
  return counts.views + counts.likes * 3 + counts.comments * 2 + recencyBoostFor(item.createdAt) + boostScore + premiumBoost;
};

const rankedPosts = (items = []) =>
  [...items].sort((left, right) => {
    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });

const buildProfile = (user, viewer = null) => {
  const images = normalizeStoredUploadPaths(Array.isArray(user?.images) && user.images.length ? user.images : user?.gallery || []);
  const videos = normalizeStoredUploadPaths(Array.isArray(user?.videos) && user.videos.length ? user.videos : user?.videoUrls || []);
  const profilePicture = normalizeStoredUploadPath(user?.profilePicture || user?.profileImage) || images?.[0] || DEFAULT_PROFILE_IMAGE_PATH;
  const isFollowing = Boolean(viewer && (hasId(viewer.following, user?._id) || hasId(user?.followers, viewer._id)));

  return {
    _id: user?._id,
    name: user?.name || "VibeBook user",
    role: user?.role || "",
    category: user?.category || "",
    skills: Array.isArray(user?.skills) ? user.skills : [],
    price: Number(user?.price || 0),
    location: user?.location || "",
    profileImage: profilePicture,
    profilePicture,
    images: Array.isArray(images) ? images : [],
    videos: Array.isArray(videos) ? videos : [],
    rating: user?.averageRating || user?.rating || 0,
    averageRating: user?.averageRating || user?.rating || 0,
    likes: Array.isArray(user?.likedBy) ? user.likedBy.length : Number(user?.likes || 0),
    likeCount: Array.isArray(user?.likedBy) ? user.likedBy.length : Number(user?.likes || 0),
    followerCount: Array.isArray(user?.followers) ? user.followers.length : 0,
    followingCount: Array.isArray(user?.following) ? user.following.length : 0,
    isFollowing,
    isPremium: user?.isPremium,
    premiumBadge: user?.premiumBadge || user?.isPremium,
    isVerified: user?.isVerified,
    verified: user?.isVerified,
    province: user?.province || "",
    district: user?.district || "",
  };
};

const serializeFeedItem = (item, viewer = null, virtual = false, options = {}) => {
  const user = item.userId;
  const likedBy = Array.isArray(item.likedBy) ? item.likedBy : [];
  const viewerId = viewer?._id?.toString?.() || "";
  const mediaPath = normalizeStoredUploadPath(item.mediaUrl);
  const url = toPublicUploadUrl(options.req, mediaPath);

  if (!url) {
    return null;
  }

  return {
    _id: item._id,
    userId: buildProfile(user, viewer),
    mediaUrl: mediaPath,
    url,
    type: item.type,
    orientation: inferOrientation(item.orientation),
    duration: Number(item.duration || 0),
    caption: item.caption || "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    views: Number(item.views || 0),
    likes: virtual ? Number(item.likes || 0) : likedBy.length,
    likeCount: virtual ? Number(item.likes || 0) : likedBy.length,
    likedByViewer: Boolean(viewerId && likedBy.some((id) => id.toString() === viewerId)),
    comments: Array.isArray(item.comments) ? item.comments.slice(-20) : [],
    commentCount: Array.isArray(item.comments) ? item.comments.length : 0,
    commentsCount: Array.isArray(item.comments) ? item.comments.length : 0,
    shareCount: Number(item.shareCount || 0),
    boostedUntil: item.boostedUntil,
    boostScore: Number(item.boostScore || 0),
    score: scoreFeedItem(item),
    createdAt: item.createdAt,
    virtual,
  };
};

const getUserMedia = (user) => {
  const videos = normalizeStoredUploadPaths(Array.isArray(user.videos) && user.videos.length ? user.videos : user.videoUrls || []);
  const images = normalizeStoredUploadPaths(Array.isArray(user.images) && user.images.length ? user.images : user.gallery || []);

  return [
    ...videos.filter(Boolean).map((mediaUrl) => ({
      mediaUrl,
      type: "video",
      caption: normalizeDescriptionFor(user.videoDescriptions, mediaUrl),
    })),
    ...images.filter(Boolean).map((mediaUrl) => ({
      mediaUrl,
      type: "image",
      caption: normalizeDescriptionFor(user.imageDescriptions, mediaUrl),
    })),
  ].filter((media) => hasMediaUrl(media.mediaUrl));
};

const ensureMediaPosts = async (users = []) => {
  const writes = [];

  users.forEach((user) => {
    getUserMedia(user).forEach((media) => {
      writes.push(
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
    });
  });

  if (!writes.length) {
    return;
  }

  await Promise.all(writes.map((write) => write.catch(() => null)));
};

const getFeed = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const followedIds = new Set((req.user?.following || []).map((id) => idOf(id)));
    const followingOnly = req.query.mode === "following" || req.query.filter === "following";

    const users = await User.find({
      isBlocked: false,
      role: { $ne: "admin" },
      $or: [
        { images: { $exists: true, $ne: [] } },
        { gallery: { $exists: true, $ne: [] } },
        { videos: { $exists: true, $ne: [] } },
        { videoUrls: { $exists: true, $ne: [] } },
      ],
    })
      .select(userSelect)
      .sort({ createdAt: -1 })
      .limit(200);

    await ensureMediaPosts(users);

    const query = {
      mediaUrl: cloudinaryMediaQuery,
      ...(followingOnly ? { userId: { $in: Array.from(followedIds) } } : {}),
    };
    const feedDocs = await Feed.find(query).populate("userId", userSelect).sort({ createdAt: -1 }).limit(1000);
    const rankedFeedDocs = rankedPosts(feedDocs.filter((item) => item.userId && hasMediaUrl(item.mediaUrl)));
    const total = rankedFeedDocs.length;
    const start = (page - 1) * limit;
    const pagedDocs = rankedFeedDocs.slice(start, start + limit);
    const filteredFeedItems = pagedDocs
      .filter((item) => item.userId && hasMediaUrl(item.mediaUrl))
      .map((item) => serializeFeedItem(item, req.user, false, { req }))
      .filter(Boolean);
    console.log("POST COUNT:", filteredFeedItems.length);

    return res.json({
      feed: filteredFeedItems,
      posts: filteredFeedItems,
      page,
      limit,
      total,
      hasMore: start + filteredFeedItems.length < total,
    });
  } catch (error) {
    return next(error);
  }
};

const getRecommendations = async (req, res, next) => {
  try {
    const requestedUserId = req.params.userId;
    const isOwner = idOf(req.user?._id) === requestedUserId;
    const isAdmin = req.user?.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "You can only view your own recommendations" });
    }

    const limit = parsePositiveInt(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const likedPosts = await Feed.find({
      likedBy: requestedUserId,
    })
      .select("tags")
      .limit(100);
    const likedTags = Array.from(
      new Set(
        likedPosts
          .flatMap((post) => (Array.isArray(post.tags) ? post.tags : []))
          .map((tag) => String(tag || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const query = {
      mediaUrl: cloudinaryMediaQuery,
      likedBy: { $ne: requestedUserId },
      ...(likedTags.length ? { tags: { $in: likedTags } } : {}),
    };
    const docs = await Feed.find(query).populate("userId", userSelect).sort({ createdAt: -1 }).limit(300);
    const recommendations = rankedPosts(docs.filter((item) => item.userId && hasMediaUrl(item.mediaUrl)))
      .slice(0, limit)
      .map((item) => serializeFeedItem(item, req.user, false, { req }))
      .filter(Boolean);

    return res.json({
      recommendations,
      posts: recommendations,
      tags: likedTags,
    });
  } catch (error) {
    return next(error);
  }
};

const toggleFeedLike = async (req, res, next) => {
  try {
    const item = await Feed.findById(req.params.id);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    const userId = req.user._id.toString();
    const liked = item.likedBy.some((id) => id.toString() === userId);

    if (liked) {
      item.likedBy = item.likedBy.filter((id) => id.toString() !== userId);
    } else {
      item.likedBy.addToSet(req.user._id);
    }

    item.likes = item.likedBy.length;
    await item.save();
    await item.populate("userId", userSelect);

    if (!liked && idOf(item.userId) !== userId) {
      await addMonetizationScore(item.userId, "like");
    }

    return res.json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: liked ? "Like removed" : "Liked" });
  } catch (error) {
    return next(error);
  }
};

const addFeedComment = async (req, res, next) => {
  try {
    const validation = validateChatMessage(req.body.message || req.body.comment);

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const item = await Feed.findById(req.params.id);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    item.comments.push({
      userId: req.user._id,
      name: req.user.name,
      message: validation.message,
    });
    await item.save();
    await item.populate("userId", userSelect);

    return res.status(201).json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: "Comment added" });
  } catch (error) {
    return next(error);
  }
};

const incrementPostView = async (req, res, next) => {
  try {
    const item = await Feed.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { returnDocument: "after", runValidators: true }
    ).populate("userId", userSelect);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    return res.json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: "View counted" });
  } catch (error) {
    return next(error);
  }
};

const sharePost = async (req, res, next) => {
  try {
    const item = await Feed.findByIdAndUpdate(
      req.params.id,
      { $inc: { shareCount: 1 } },
      { returnDocument: "after", runValidators: true }
    ).populate("userId", userSelect);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    return res.json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: "Share counted" });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  addFeedComment,
  getFeed,
  getRecommendations,
  incrementPostView,
  serializeFeedItem,
  sharePost,
  toggleFeedLike,
  userSelect,
};
