const Feed = require("../models/Feed");
const User = require("../models/User");
const { serializeFeedItem, userSelect } = require("./feedController");
const { DEFAULT_PROFILE_IMAGE_PATH } = require("../utils/profileDefaults");
const { cloudinaryMediaRegex, isCloudinarySecureUrl, normalizeStoredUploadPath, normalizeStoredUploadPaths } = require("../utils/storagePaths");
const { scorePostForViewer, viralScoreFor } = require("../utils/feedRanking");

const mediaQuery = {
  mediaUrl: { $regex: cloudinaryMediaRegex },
};

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const engagementFor = (post) => {
  const comments = Array.isArray(post.comments) ? post.comments.length : 0;
  const likes = Array.isArray(post.likedBy) && post.likedBy.length ? post.likedBy.length : Number(post.likes || 0);

  return {
    views: Number(post.views || 0),
    likes,
    comments,
    score: viralScoreFor(post),
  };
};

const serializeCreator = (user, stats = {}) => {
  if (!user) {
    return null;
  }

  const images = normalizeStoredUploadPaths(Array.isArray(user.images) && user.images.length ? user.images : user.gallery || []);
  const profilePicture = normalizeStoredUploadPath(user.profilePicture || user.profileImage) || images[0] || DEFAULT_PROFILE_IMAGE_PATH;

  return {
    _id: user._id,
    name: user.name,
    role: user.role,
    category: user.category,
    skills: Array.isArray(user.skills) ? user.skills : [],
    price: Number(user.price || 0),
    location: user.location || user.district || user.province || "",
    province: user.province || "",
    district: user.district || "",
    profileImage: profilePicture,
    profilePicture,
    averageRating: user.averageRating || user.rating || 0,
    rating: user.averageRating || user.rating || 0,
    likes: Array.isArray(user.likedBy) ? user.likedBy.length : Number(user.likes || 0),
    followerCount: Array.isArray(user.followers) ? user.followers.length : 0,
    isVerified: Boolean(user.isVerified),
    verified: Boolean(user.isVerified),
    isPremium: Boolean(user.isPremium),
    premiumBadge: Boolean(user.premiumBadge || user.isPremium),
    totalViews: Number(stats.views || 0),
    postCount: Number(stats.posts || 0),
  };
};

const getExplore = async (req, res, next) => {
  try {
    const [posts, creators] = await Promise.all([
      Feed.find(mediaQuery).populate("userId", userSelect).sort({ createdAt: -1 }).limit(500),
      User.find({ isBlocked: false, role: { $ne: "admin" } })
        .select("-password")
        .sort({ isPremium: -1, premiumBadge: -1, isVerified: -1, averageRating: -1, likes: -1, createdAt: -1 })
        .limit(24),
    ]);

    const validPosts = posts.filter((post) => post.userId && isCloudinarySecureUrl(normalizeStoredUploadPath(post.mediaUrl)));
    const enrichedPosts = validPosts
      .map((post) => {
        const counts = engagementFor(post);
        const ranking = scorePostForViewer(post, req.user);
        const feedItem = serializeFeedItem(post, req.user, false, { req, ranking });
        return feedItem
          ? {
              ...feedItem,
              trendingScore: counts.score,
              score: counts.score,
            }
          : null;
      })
      .filter(Boolean);

    const trendingVideos = [...enrichedPosts].sort((left, right) => right.trendingScore - left.trendingScore).slice(0, 16);
    const mostLikedVideos = [...enrichedPosts]
      .sort((left, right) => Number(right.likeCount || right.likes || 0) - Number(left.likeCount || left.likes || 0))
      .slice(0, 12);

    const creatorStats = new Map();
    validPosts.forEach((post) => {
      const creatorId = idOf(post.userId);
      if (!creatorId) {
        return;
      }

      const current = creatorStats.get(creatorId) || { user: post.userId, views: 0, posts: 0 };
      current.views += Number(post.views || 0);
      current.posts += 1;
      creatorStats.set(creatorId, current);
    });

    const mostViewedCreators = [...creatorStats.values()]
      .sort((left, right) => right.views - left.views)
      .slice(0, 12)
      .map((stats) => serializeCreator(stats.user, stats))
      .filter(Boolean);

    const recommendedCreators = creators.map((creator) => serializeCreator(creator)).filter(Boolean);

    return res.json({
      trendingVideos,
      mostLikedVideos,
      mostViewedCreators,
      recommendedCreators,
      formula: "views * 1 + likes * 3 + comments * 4 + shares * 6 + saves * 5 + watchTime * 0.08 + completionRate * 50 + replays * 8",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getExplore,
};
