const mongoose = require("mongoose");

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
const {
  idOf,
  normalizeTopic,
  rankingFieldsForPost,
  rankFeedItems,
  roundScore,
  scorePostForViewer,
  topicSignalsForPost,
} = require("../utils/feedRanking");

const userSelect = "name role category skills price location profileImage profilePicture images gallery imageDescriptions videos videoUrls videoDescriptions averageRating rating likes likedBy followers following viewsCount totalWatchTime interests likedTopics favoriteCreators earnings isPremium premiumBadge isVerified province district createdAt";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;

const isValidObjectId = (value) => mongoose.isValidObjectId(idOf(value));

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

const safeWatchTime = (value) => {
  const watchTime = Number(value || 0);
  return Number.isFinite(watchTime) && watchTime > 0 ? Math.min(watchTime, 86400) : 0;
};

const safeRate = (value) => {
  const rate = Number(value || 0);

  if (!Number.isFinite(rate) || rate <= 0) {
    return 0;
  }

  return Math.min(rate > 1 ? rate / 100 : rate, 1);
};

const safeCount = (value, max = 1000) => {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count > 0 ? Math.min(count, max) : 0;
};

const updateRankingFields = (item, options = {}) => {
  const fields = rankingFieldsForPost(item, options);

  item.engagementScore = fields.engagementScore;
  item.viralScore = fields.viralScore;
  item.trendScore = fields.trendScore;
  item.engagementVelocity = fields.engagementVelocity;
  item.distributionStage = fields.distributionStage;
  item.lastEngagementAt = new Date();

  return fields;
};

const buildInterestUpdate = (item, weight, options = {}) => {
  const topics = topicSignalsForPost(item).slice(0, 8);
  const inc = {};

  topics.forEach((topic) => {
    const normalizedTopic = normalizeTopic(topic);

    if (normalizedTopic) {
      inc[`interests.${normalizedTopic}`] = roundScore((inc[`interests.${normalizedTopic}`] || 0) + weight);
    }
  });

  const update = {};

  if (Object.keys(inc).length) {
    update.$inc = inc;
  }

  if (options.addLikedTopics && topics.length) {
    update.$addToSet = {
      ...(update.$addToSet || {}),
      likedTopics: { $each: topics },
    };
  }

  const creatorId = idOf(item.userId);
  if (options.addFavoriteCreator && creatorId) {
    update.$addToSet = {
      ...(update.$addToSet || {}),
      favoriteCreators: creatorId,
    };
  }

  if (options.watchEvent) {
    update.$push = {
      watchHistory: {
        $each: [
          {
            postId: item._id,
            topics,
            watchedSeconds: options.watchEvent.watchedSeconds,
            completionRate: options.watchEvent.completionRate,
            replays: options.watchEvent.replays,
            watchedAt: new Date(),
          },
        ],
        $slice: -200,
      },
    };
  }

  return update;
};

const updateViewerInterests = async (viewer, item, weight, options = {}) => {
  const viewerId = idOf(viewer?._id || viewer);

  if (!viewerId || idOf(item.userId) === viewerId) {
    return;
  }

  const update = buildInterestUpdate(item, weight, options);

  if (!Object.keys(update).length) {
    return;
  }

  await User.findByIdAndUpdate(viewerId, update, { runValidators: true }).catch(() => null);
};

const viewMetricsFromBody = (body = {}, item = {}) => {
  const watchedSeconds = safeWatchTime(body.watchTime ?? body.watchedSeconds);
  const payloadDuration = safeWatchTime(body.duration);
  const duration = payloadDuration || Number(item.duration || 0);
  const payloadRate = safeRate(body.completionRate);
  const completionRate = payloadRate || (duration ? Math.min(watchedSeconds / duration, 1) : 0);
  const replays = safeCount(body.replays || (body.replayed ? 1 : 0), 50);
  const skipped = Boolean(body.skipped) || (duration >= 3 && watchedSeconds > 0 && watchedSeconds < Math.min(3, duration * 0.25));

  return {
    watchedSeconds,
    duration,
    completionRate,
    replays,
    skipped,
  };
};

const averageCompletionRate = (currentRate, currentViews, nextRate) => {
  const views = Math.max(0, Number(currentViews || 0));
  const rate = safeRate(currentRate);
  const incomingRate = safeRate(nextRate);

  if (!incomingRate) {
    return rate;
  }

  return roundScore((rate * views + incomingRate) / (views + 1));
};

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
    viewsCount: Number(user?.viewsCount || 0),
    totalWatchTime: Number(user?.totalWatchTime || 0),
    earnings: Number(user?.earnings || 0),
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
  const savedBy = Array.isArray(item.savedBy) ? item.savedBy : [];
  const viewerId = viewer?._id?.toString?.() || "";
  const mediaPath = normalizeStoredUploadPath(item.mediaUrl);
  const url = toPublicUploadUrl(options.req, mediaPath);
  const ranking = options.ranking || scorePostForViewer(item, viewer);
  const saveCount = savedBy.length || Number(item.saves || 0);

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
    watchTime: Number(item.watchTime || 0),
    completionRate: Number(item.completionRate || 0),
    replays: Number(item.replays || 0),
    engagementScore: Number(item.engagementScore || 0),
    viralScore: Number(item.viralScore || ranking.viralScore || 0),
    trendScore: Number(item.trendScore || ranking.trendScore || 0),
    engagementVelocity: Number(item.engagementVelocity || ranking.velocityScore || 0),
    likes: virtual ? Number(item.likes || 0) : likedBy.length,
    likeCount: virtual ? Number(item.likes || 0) : likedBy.length,
    likedByViewer: Boolean(viewerId && likedBy.some((id) => id.toString() === viewerId)),
    saves: saveCount,
    saveCount,
    savedByViewer: Boolean(viewerId && savedBy.some((id) => id.toString() === viewerId)),
    comments: Array.isArray(item.comments) ? item.comments.slice(-20) : [],
    commentCount: Array.isArray(item.comments) ? item.comments.length : 0,
    commentsCount: Array.isArray(item.comments) ? item.comments.length : 0,
    shareCount: Number(item.shareCount || 0),
    skips: Number(item.skips || 0),
    reports: Number(item.reports || 0),
    notInterestedCount: Number(item.notInterestedCount || 0),
    emotion: item.emotion || item.aiMetadata?.emotion || "neutral",
    aiMetadata: item.aiMetadata || {},
    distributionStage: item.distributionStage || ranking.distributionStage || "test",
    boostedUntil: item.boostedUntil,
    boostScore: Number(item.boostScore || 0),
    score: ranking.finalScore,
    ranking,
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
              watchTime: 0,
              completionRate: 0,
              replays: 0,
              engagementScore: 0,
              viralScore: 0,
              trendScore: 0,
              engagementVelocity: 0,
              likes: 0,
              shareCount: 0,
              saves: 0,
              skips: 0,
              reports: 0,
              notInterestedCount: 0,
              emotion: "neutral",
              distributionStage: "test",
              comments: [],
              createdAt: user.createdAt || new Date(),
            },
          },
          { returnDocument: "after", upsert: true, runValidators: true }
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
      ...(req.user?._id
        ? {
            reportedBy: { $ne: req.user._id },
            notInterestedBy: { $ne: req.user._id },
          }
        : {}),
    };
    const feedDocs = await Feed.find(query)
      .populate("userId", userSelect)
      .sort({ viralScore: -1, engagementVelocity: -1, createdAt: -1 })
      .limit(1000);
    const rankedFeedEntries = rankFeedItems(
      feedDocs.filter((item) => item.userId && hasMediaUrl(item.mediaUrl)),
      req.user
    );
    const total = rankedFeedEntries.length;
    const start = (page - 1) * limit;
    const pagedEntries = rankedFeedEntries.slice(start, start + limit);
    const filteredFeedItems = pagedEntries
      .map((entry) =>
        serializeFeedItem(entry.post, req.user, false, {
          req,
          ranking: {
            ...entry.ranking,
            finalScore: entry.sortScore,
            diversityPenalty: roundScore(entry.ranking.finalScore - entry.sortScore),
          },
        })
      )
      .filter(Boolean);

    return res.json({
      feed: filteredFeedItems,
      posts: filteredFeedItems,
      page,
      limit,
      total,
      hasMore: start + filteredFeedItems.length < total,
      ranking: {
        formula: "viralScore + interestMatchScore + freshnessBoost + velocityScore + creatorBoost + trendScore + emotionBoost",
        smallCreatorBoost: 25,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getRecommendations = async (req, res, next) => {
  try {
    const requestedUserId = req.params.userId;

    if (!isValidObjectId(requestedUserId)) {
      return res.status(400).json({ message: "Valid user id is required" });
    }

    const isOwner = idOf(req.user?._id) === requestedUserId;
    const isAdmin = req.user?.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "You can only view your own recommendations" });
    }

    const limit = parsePositiveInt(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const viewer = isOwner ? req.user : await User.findById(requestedUserId).select("-password");
    const likedPosts = await Feed.find({
      likedBy: requestedUserId,
    })
      .select("tags aiMetadata caption")
      .limit(100);
    const likedTags = Array.from(
      new Set(
        likedPosts
          .flatMap((post) => topicSignalsForPost(post))
          .filter(Boolean)
      )
    );
    const query = {
      mediaUrl: cloudinaryMediaQuery,
      likedBy: { $ne: requestedUserId },
      reportedBy: { $ne: requestedUserId },
      notInterestedBy: { $ne: requestedUserId },
      ...(likedTags.length ? { tags: { $in: likedTags } } : {}),
    };
    const docs = await Feed.find(query)
      .populate("userId", userSelect)
      .sort({ viralScore: -1, engagementVelocity: -1, createdAt: -1 })
      .limit(300);
    const recommendations = rankFeedItems(docs.filter((item) => item.userId && hasMediaUrl(item.mediaUrl)), viewer)
      .slice(0, limit)
      .map((entry) =>
        serializeFeedItem(entry.post, viewer, false, {
          req,
          ranking: {
            ...entry.ranking,
            finalScore: entry.sortScore,
            diversityPenalty: roundScore(entry.ranking.finalScore - entry.sortScore),
          },
        })
      )
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
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid post id is required" });
    }

    const item = await Feed.findById(req.params.id);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    const userId = req.user._id.toString();
    item.likedBy = Array.isArray(item.likedBy) ? item.likedBy : [];
    const liked = item.likedBy.some((id) => id.toString() === userId);

    if (liked) {
      item.likedBy = item.likedBy.filter((id) => id.toString() !== userId);
    } else {
      item.likedBy.push(req.user._id);
    }

    item.likes = item.likedBy.length;
    updateRankingFields(item);
    await item.save();
    await item.populate("userId", userSelect);

    if (!liked && idOf(item.userId) !== userId) {
      await Promise.all([
        addMonetizationScore(item.userId, "like"),
        updateViewerInterests(req.user, item, 8, { addLikedTopics: true }),
      ]);
    }

    return res.json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: liked ? "Like removed" : "Liked" });
  } catch (error) {
    return next(error);
  }
};

const addFeedComment = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid post id is required" });
    }

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
    updateRankingFields(item);
    await item.save();
    await item.populate("userId", userSelect);
    await updateViewerInterests(req.user, item, 6, { addLikedTopics: true });

    return res.status(201).json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: "Comment added" });
  } catch (error) {
    return next(error);
  }
};

const incrementPostView = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid post id is required" });
    }

    const item = await Feed.findById(req.params.id);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    const previousViews = Number(item.views || 0);
    const metrics = viewMetricsFromBody(req.body, item);

    item.views = previousViews + 1;

    if (item.type === "video") {
      item.watchTime = Number(item.watchTime || 0) + metrics.watchedSeconds;
      item.completionRate = averageCompletionRate(item.completionRate, previousViews, metrics.completionRate);
      item.replays = Number(item.replays || 0) + metrics.replays;

      if (metrics.skipped) {
        item.skips = Number(item.skips || 0) + 1;
      }
    }

    updateRankingFields(item);
    await item.save();
    await item.populate("userId", userSelect);

    if (item.type === "video") {
      await User.findByIdAndUpdate(idOf(item.userId), {
        $inc: {
          viewsCount: 1,
          totalWatchTime: metrics.watchedSeconds,
        },
      });
    }

    if (req.user?._id) {
      const interestWeight = metrics.skipped ? -2 : 2 + metrics.completionRate * 8 + metrics.replays * 4;
      await updateViewerInterests(req.user, item, interestWeight, {
        watchEvent: {
          watchedSeconds: metrics.watchedSeconds,
          completionRate: metrics.completionRate,
          replays: metrics.replays,
        },
      });
    }

    return res.json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: "View counted" });
  } catch (error) {
    return next(error);
  }
};

const sharePost = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid post id is required" });
    }

    const item = await Feed.findById(req.params.id);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    item.shareCount = Number(item.shareCount || 0) + 1;
    updateRankingFields(item);
    await item.save();
    await item.populate("userId", userSelect);

    if (req.user?._id) {
      await updateViewerInterests(req.user, item, 12, { addLikedTopics: true, addFavoriteCreator: true });
    }

    return res.json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: "Share counted" });
  } catch (error) {
    return next(error);
  }
};

const togglePostSave = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid post id is required" });
    }

    const item = await Feed.findById(req.params.id);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    const userId = idOf(req.user._id);
    item.savedBy = Array.isArray(item.savedBy) ? item.savedBy : [];
    const saved = item.savedBy.some((id) => idOf(id) === userId);

    if (saved) {
      item.savedBy = item.savedBy.filter((id) => idOf(id) !== userId);
    } else {
      item.savedBy.push(req.user._id);
    }

    item.saves = item.savedBy.length;
    updateRankingFields(item);
    await item.save();
    await item.populate("userId", userSelect);

    if (!saved) {
      await updateViewerInterests(req.user, item, 10, { addLikedTopics: true, addFavoriteCreator: true });
    }

    return res.json({ feedItem: serializeFeedItem(item, req.user, false, { req }), message: saved ? "Save removed" : "Saved" });
  } catch (error) {
    return next(error);
  }
};

const recordPostFeedback = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid post id is required" });
    }

    const feedbackType = String(req.body?.type || req.body?.action || "").trim().toLowerCase();
    const allowedTypes = new Set(["skip", "report", "not_interested"]);

    if (!allowedTypes.has(feedbackType)) {
      return res.status(400).json({ message: "Feedback type must be skip, report, or not_interested" });
    }

    const item = await Feed.findById(req.params.id);

    if (!item || !hasMediaUrl(item.mediaUrl)) {
      return res.status(404).json({ message: "Feed item not found" });
    }

    const userId = idOf(req.user._id);

    if (feedbackType === "skip") {
      item.skips = Number(item.skips || 0) + 1;
    }

    item.reportedBy = Array.isArray(item.reportedBy) ? item.reportedBy : [];
    item.notInterestedBy = Array.isArray(item.notInterestedBy) ? item.notInterestedBy : [];

    if (feedbackType === "report" && !item.reportedBy.some((id) => idOf(id) === userId)) {
      item.reportedBy.push(req.user._id);
      item.reports = item.reportedBy.length;
    }

    if (feedbackType === "not_interested" && !item.notInterestedBy.some((id) => idOf(id) === userId)) {
      item.notInterestedBy.push(req.user._id);
      item.notInterestedCount = item.notInterestedBy.length;
    }

    updateRankingFields(item);
    await item.save();
    await item.populate("userId", userSelect);
    await updateViewerInterests(req.user, item, feedbackType === "skip" ? -3 : -8);

    return res.json({
      feedItem: serializeFeedItem(item, req.user, false, { req }),
      message: feedbackType === "not_interested" ? "We will show less like this" : "Feedback recorded",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  addFeedComment,
  getFeed,
  getRecommendations,
  incrementPostView,
  recordPostFeedback,
  serializeFeedItem,
  sharePost,
  toggleFeedLike,
  togglePostSave,
  userSelect,
};
