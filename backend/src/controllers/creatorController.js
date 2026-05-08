// @ts-nocheck
const mongoose = require("mongoose");

const Feed = require("../models/Feed");
const User = require("../models/User");
const { profileResponse } = require("./userController");
const { rankingFieldsForPost } = require("../utils/feedRanking");
const { createNotification } = require("../utils/notifications");

const creatorSelect = "-password";
const topVideoSelect = "mediaUrl type caption tags visibility category commentsEnabled views watchTime completionRate replays likes likedBy comments shareCount saves savedBy engagementScore viralScore trendScore engagementVelocity createdAt updatedAt";

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const isValidObjectId = (value) => mongoose.isValidObjectId(idOf(value));

const safeWatchTime = (value) => {
  const watchTime = Number(value || 0);
  return Number.isFinite(watchTime) && watchTime > 0 ? Math.min(watchTime, 86400) : 0;
};

const hasId = (items, id) => {
  const targetId = idOf(id);
  return Boolean(targetId && Array.isArray(items) && items.some((item) => idOf(item) === targetId));
};

const queueNotification = (payload) => {
  createNotification(payload).catch((error) => {
    console.error(`[notification:creator] ${error.message}`);
  });
};

const engagementScoreFor = (video) => {
  const views = Number(video?.views || 0);
  const watchTime = Number(video?.watchTime || 0);
  const likedBy = Array.isArray(video?.likedBy) ? video.likedBy : [];
  const comments = Array.isArray(video?.comments) ? video.comments : [];
  const likes = likedBy.length || Number(video?.likes || 0);

  return views + watchTime * 2 + likes * 3 + comments.length * 4;
};

const serializeVideo = (video) => ({
  _id: video._id,
  mediaUrl: video.mediaUrl,
  type: video.type,
  caption: video.caption || "",
  views: Number(video.views || 0),
  watchTime: Number(video.watchTime || 0),
  completionRate: Number(video.completionRate || 0),
  replays: Number(video.replays || 0),
  likes: Array.isArray(video.likedBy) ? video.likedBy.length : Number(video.likes || 0),
  comments: Array.isArray(video.comments) ? video.comments.length : 0,
  shares: Number(video.shareCount || 0),
  saves: Array.isArray(video.savedBy) ? video.savedBy.length : Number(video.saves || 0),
  tags: Array.isArray(video.tags) ? video.tags : [],
  visibility: video.visibility || "public",
  category: video.category || "",
  commentsEnabled: video.commentsEnabled !== false,
  engagementScore: Number(video.engagementScore || 0),
  viralScore: Number(video.viralScore || 0),
  trendScore: Number(video.trendScore || 0),
  createdAt: video.createdAt,
  updatedAt: video.updatedAt,
});

const buildDailySeries = (videos = [], days = 14) => {
  const now = new Date();
  const buckets = new Map();

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      views: 0,
      watchTime: 0,
      engagement: 0,
      followers: 0,
    });
  }

  videos.forEach((video) => {
    const key = new Date(video.createdAt || now).toISOString().slice(0, 10);
    const bucket = buckets.get(key);

    if (!bucket) {
      return;
    }

    const likes = Array.isArray(video.likedBy) ? video.likedBy.length : Number(video.likes || 0);
    const comments = Array.isArray(video.comments) ? video.comments.length : 0;
    const saves = Array.isArray(video.savedBy) ? video.savedBy.length : Number(video.saves || 0);

    bucket.views += Number(video.views || 0);
    bucket.watchTime += Number(video.watchTime || 0);
    bucket.engagement += likes + comments + saves + Number(video.shareCount || 0);
  });

  return Array.from(buckets.values());
};

const aggregateCreatorVideoStats = async (creatorId) => {
  const [stats = {}] = await Feed.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(creatorId),
        type: "video",
      },
    },
    {
      $group: {
        _id: "$userId",
        totalViews: { $sum: { $ifNull: ["$views", 0] } },
        totalWatchTime: { $sum: { $ifNull: ["$watchTime", 0] } },
      },
    },
  ]);

  return {
    totalViews: Number(stats.totalViews || 0),
    totalWatchTime: Number(stats.totalWatchTime || 0),
  };
};

const getCreatorProfile = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid creator id is required" });
    }

    const user = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select(creatorSelect);

    if (!user) {
      return res.status(404).json({ message: "Creator not found" });
    }

    if (req.user?._id && idOf(req.user._id) !== idOf(user._id)) {
      User.findByIdAndUpdate(req.user._id, {
        $push: {
          favoriteCreators: { $each: [user._id], $slice: -100 },
        },
      }).catch(() => null);
    }

    return res.json({
      user: profileResponse(user, req.user),
      followersCount: Array.isArray(user.followers) ? user.followers.length : 0,
      followingCount: Array.isArray(user.following) ? user.following.length : 0,
      viewsCount: Number(user.viewsCount || 0),
      totalWatchTime: Number(user.totalWatchTime || 0),
    });
  } catch (error) {
    console.error("[creator:get]", error);
    return res.status(500).json({ message: "Unable to load creator profile" });
  }
};

const followCreator = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid creator id is required" });
    }

    if (idOf(req.user._id) === idOf(req.params.id)) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const target = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select(creatorSelect);

    if (!target) {
      return res.status(404).json({ message: "Creator not found" });
    }

    const alreadyFollowing = hasId(req.user.following, target._id) || hasId(target.followers, req.user._id);

    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $addToSet: { following: target._id } }, { runValidators: true }),
      User.findByIdAndUpdate(target._id, { $addToSet: { followers: req.user._id } }, { runValidators: true }),
    ]);

    if (!alreadyFollowing) {
      User.findByIdAndUpdate(req.user._id, {
        $push: {
          favoriteCreators: { $each: [target._id], $slice: -100 },
        },
      }).catch(() => null);
      queueNotification({
        userId: target._id,
        type: "follow",
        title: "New follower",
        message: `${req.user.name || "Someone"} followed you`,
        actorId: req.user._id,
        dedupeKey: `follow:${target._id}:${req.user._id}`,
      });
    }

    const [viewer, creator] = await Promise.all([
      User.findById(req.user._id).select(creatorSelect),
      User.findById(target._id).select(creatorSelect),
    ]);

    return res.json({
      user: profileResponse(creator, viewer),
      currentUser: profileResponse(viewer, viewer, { includePrivate: true }),
      followersCount: Array.isArray(creator.followers) ? creator.followers.length : 0,
      followingCount: Array.isArray(creator.following) ? creator.following.length : 0,
      message: alreadyFollowing ? "Already following" : "Creator followed",
    });
  } catch (error) {
    console.error("[creator:follow]", error);
    return res.status(500).json({ message: "Unable to follow creator" });
  }
};

const unfollowCreator = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid creator id is required" });
    }

    if (idOf(req.user._id) === idOf(req.params.id)) {
      return res.status(400).json({ message: "You cannot unfollow yourself" });
    }

    const target = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select("_id");

    if (!target) {
      return res.status(404).json({ message: "Creator not found" });
    }

    await Promise.all([
      User.findByIdAndUpdate(req.user._id, { $pull: { following: target._id } }, { runValidators: true }),
      User.findByIdAndUpdate(target._id, { $pull: { followers: req.user._id } }, { runValidators: true }),
    ]);

    const [viewer, creator] = await Promise.all([
      User.findById(req.user._id).select(creatorSelect),
      User.findById(target._id).select(creatorSelect),
    ]);

    return res.json({
      user: profileResponse(creator, viewer),
      currentUser: profileResponse(viewer, viewer, { includePrivate: true }),
      followersCount: Array.isArray(creator.followers) ? creator.followers.length : 0,
      followingCount: Array.isArray(creator.following) ? creator.following.length : 0,
      message: "Creator unfollowed",
    });
  } catch (error) {
    console.error("[creator:unfollow]", error);
    return res.status(500).json({ message: "Unable to unfollow creator" });
  }
};

const getCreatorAnalytics = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid creator id is required" });
    }

    const user = await User.findOne({
      _id: req.params.id,
      isBlocked: false,
      role: { $ne: "admin" },
    }).select(creatorSelect);

    if (!user) {
      return res.status(404).json({ message: "Creator not found" });
    }

    const [videoStats, topVideos] = await Promise.all([
      aggregateCreatorVideoStats(user._id),
      Feed.find({ userId: user._id, type: "video" })
        .select(topVideoSelect)
        .sort({ engagementScore: -1, views: -1, createdAt: -1 })
        .limit(5),
    ]);

    return res.json({
      followers: Array.isArray(user.followers) ? user.followers.length : 0,
      following: Array.isArray(user.following) ? user.following.length : 0,
      totalViews: videoStats.totalViews,
      totalWatchTime: videoStats.totalWatchTime,
      topVideos: topVideos.map(serializeVideo),
      earnings: Number(user.earnings || 0),
    });
  } catch (error) {
    console.error("[creator:analytics]", error);
    return res.status(500).json({ message: "Unable to load creator analytics" });
  }
};

const recordVideoView = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Valid video id is required" });
    }

    const watchTime = safeWatchTime(req.body?.watchTime);
    const completionRate = Math.min(1, Math.max(0, Number(req.body?.completionRate || 0)));
    const viewerId = req.user?._id?.toString?.() || null;

    const MINIMUM_WATCH_SECONDS = 3;
    const COMPLETION_THRESHOLD = 0.25;
    const VIEW_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

    // Check if view meets minimum threshold
    const isQualifiedView = watchTime >= MINIMUM_WATCH_SECONDS || completionRate >= COMPLETION_THRESHOLD;
    if (!isQualifiedView) {
      return res.status(400).json({ message: "Watch time or completion rate too low to count view" });
    }

    const video = await Feed.findById(req.params.id);
    if (!video || video.type !== "video") {
      return res.status(404).json({ message: "Video not found" });
    }

    const isOwnerView = viewerId && idOf(video.userId) === viewerId;
    let shouldCountView = true;

    // Anti-fake-view logic for owner
    if (isOwnerView) {
      if (video.ownerViewTracked) {
        // Owner already has a tracked view, don't count additional views
        shouldCountView = false;
      }
    } else if (viewerId) {
      // Check cooldown for non-owner viewers
      const recentView = Array.isArray(video.viewedBy)
        ? video.viewedBy.find((v) => idOf(v.userId) === viewerId)
        : null;

      if (recentView) {
        const lastViewTime = new Date(recentView.viewedAt).getTime();
        const timeSinceLastView = Date.now() - lastViewTime;
        if (timeSinceLastView < VIEW_COOLDOWN_MS) {
          shouldCountView = false;
        }
      }
    }

    if (!shouldCountView) {
      // Still record the view in viewedBy tracking without incrementing views
      if (viewerId) {
        const existingViewIndex = (video.viewedBy || []).findIndex((v) => idOf(v.userId) === viewerId);
        if (existingViewIndex >= 0) {
          video.viewedBy[existingViewIndex].viewedAt = new Date();
          video.viewedBy[existingViewIndex].watchedSeconds = watchTime;
          video.viewedBy[existingViewIndex].completionRate = completionRate;
        } else {
          if (!Array.isArray(video.viewedBy)) {
            video.viewedBy = [];
          }
          video.viewedBy.push({
            userId: viewerId,
            viewedAt: new Date(),
            watchedSeconds: watchTime,
            completionRate: completionRate,
          });
          video.viewedBy = video.viewedBy.slice(-500);
        }
        await video.save();
      }
      return res.json({
        message: "View tracked but not counted (cooldown or owner limit)",
        viewCounted: false,
      });
    }

    // View counts - perform atomic update
    const updateObject = {
      $inc: {
        views: 1,
        watchTime,
      },
      lastViewedAt: new Date(),
    };

    // Track owner view
    if (isOwnerView) {
      updateObject.ownerViewTracked = true;
    }

    // Update viewedBy array
    if (viewerId) {
      const existingViewIndex = (video.viewedBy || []).findIndex((v) => idOf(v.userId) === viewerId);
      if (existingViewIndex >= 0) {
        // Update existing view
        updateObject.$set = updateObject.$set || {};
        updateObject.$set[`viewedBy.${existingViewIndex}.viewedAt`] = new Date();
        updateObject.$set[`viewedBy.${existingViewIndex}.watchedSeconds`] = watchTime;
        updateObject.$set[`viewedBy.${existingViewIndex}.completionRate`] = completionRate;
      } else {
        // Add new view
        if (!Array.isArray(video.viewedBy)) {
          video.viewedBy = [];
        }
        updateObject.$push = updateObject.$push || {};
        updateObject.$push.viewedBy = {
          $each: [
            {
              userId: viewerId,
              viewedAt: new Date(),
              watchedSeconds: watchTime,
              completionRate: completionRate,
            },
          ],
          $slice: -500,
        };
      }
    }

    const updatedVideo = await Feed.findOneAndUpdate(
      { _id: req.params.id, type: "video" },
      updateObject,
      { returnDocument: "after", runValidators: true }
    ).populate("userId", creatorSelect);

    if (!updatedVideo || !updatedVideo.userId) {
      return res.status(404).json({ message: "Video not found" });
    }

    const creator = updatedVideo.userId;
    const fields = rankingFieldsForPost(updatedVideo);
    updatedVideo.engagementScore = fields.engagementScore;
    updatedVideo.viralScore = fields.viralScore;
    updatedVideo.trendScore = fields.trendScore;
    updatedVideo.engagementVelocity = fields.engagementVelocity;
    updatedVideo.distributionStage = fields.distributionStage;
    await updatedVideo.save();

    await User.findByIdAndUpdate(creator._id, {
      $inc: {
        viewsCount: 1,
        totalWatchTime: watchTime,
      },
    });

    const serializedVideo = serializeVideo(updatedVideo);

    return res.json({
      video: serializedVideo,
      feedItem: {
        ...serializedVideo,
        userId: profileResponse(creator, req.user),
      },
      message: "View counted",
      viewCounted: true,
    });
  } catch (error) {
    console.error("[video:view]", error);
    return res.status(500).json({ message: "Unable to record video view" });
  }
};

const getCreatorDashboard = async (req, res) => {
  try {
    const creator = await User.findById(req.user._id).select("-password");

    if (!creator) {
      return res.status(404).json({ message: "Creator not found" });
    }

    const [allVideos, stats] = await Promise.all([
      Feed.find({ userId: req.user._id, type: "video" })
        .select(topVideoSelect)
        .sort({ createdAt: -1 }),
      aggregateCreatorVideoStats(req.user._id),
    ]);

    // Calculate engagement metrics
    const totalEngagement = allVideos.reduce((sum, video) => {
      const likes = Array.isArray(video.likedBy) ? video.likedBy.length : Number(video.likes || 0);
      const comments = Array.isArray(video.comments) ? video.comments.length : 0;
      const saves = Array.isArray(video.savedBy) ? video.savedBy.length : Number(video.saves || 0);
      return sum + likes + comments + saves;
    }, 0);

    const avgCompletionRate = allVideos.length > 0
      ? allVideos.reduce((sum, v) => sum + (Number(v.completionRate || 0)), 0) / allVideos.length
      : 0;

    const topVideos = [...allVideos]
      .sort((a, b) => Number(b.engagementScore || 0) - Number(a.engagementScore || 0))
      .slice(0, 5)
      .map(serializeVideo);
    const trendingVideos = [...allVideos]
      .sort((a, b) => Number(b.trendScore || b.viralScore || 0) - Number(a.trendScore || a.viralScore || 0))
      .slice(0, 5)
      .map(serializeVideo);

    const avgEngagementRate = stats.totalViews > 0
      ? (totalEngagement / (stats.totalViews || 1)) * 100
      : 0;
    const totalReplays = allVideos.reduce((sum, video) => sum + Number(video.replays || 0), 0);
    const averageReplayRate = stats.totalViews > 0 ? (totalReplays / stats.totalViews) * 100 : 0;
    const followers = Array.isArray(creator.followers) ? creator.followers.length : 0;
    const following = Array.isArray(creator.following) ? creator.following.length : 0;
    const dailySeries = buildDailySeries(allVideos);
    const estimatedEarnings = Number(creator.estimatedRevenue || creator.earnings || 0);
    const monetizationProgress = Math.min(100, Math.round(((stats.totalViews / 10000) * 50) + ((followers / 1000) * 50)));

    // Estimate earnings based on views and engagement
    const estimatedEarningsPerMille = stats.totalViews > 0 ? (estimatedEarnings * 1000) / stats.totalViews : 0;

    return res.json({
      creator: profileResponse(creator, creator, { includePrivate: true }),
      stats: {
        totalViews: stats.totalViews,
        totalWatchHours: Math.round(stats.totalWatchTime / 3600),
        totalWatchTime: stats.totalWatchTime,
        followers,
        following,
        videos: allVideos.length,
        totalEngagement,
        averageEngagementRate: Number(avgEngagementRate.toFixed(2)),
        averageCompletionRate: Number((avgCompletionRate * 100).toFixed(2)),
        averageReplayRate: Number(averageReplayRate.toFixed(2)),
        replayRate: Number(averageReplayRate.toFixed(2)),
        estimatedEarnings,
        estimatedRevenue: Number(creator.estimatedRevenue || 0),
        epm: Number(estimatedEarningsPerMille.toFixed(2)), // Earnings per thousand
        monetizationEnabled: Boolean(creator.monetizationEnabled),
        monetizationEligibility: Boolean(creator.payoutEligible || creator.monetizationEnabled),
        monetizationProgress,
        creatorTier: creator.creatorTier || "none",
        creatorLevel: Number(creator.creatorLevel || 0),
        isVerified: Boolean(creator.isVerified),
        isPremium: Boolean(creator.isPremium),
      },
      charts: {
        viewsOverTime: dailySeries.map((item) => ({ date: item.date, value: item.views })),
        watchTimeOverTime: dailySeries.map((item) => ({ date: item.date, value: item.watchTime })),
        engagementTrend: dailySeries.map((item) => ({ date: item.date, value: item.engagement })),
        followersGrowth: dailySeries.map((item, index) => ({ date: item.date, value: Math.max(0, followers - (dailySeries.length - index - 1)) })),
      },
      monetization: {
        label: "Beta Creator Monetization",
        walletBalance: Number(creator.balance || 0),
        estimatedEarnings,
        eligibilityStatus: creator.payoutEligible || creator.monetizationEnabled ? "eligible" : "building",
        creatorTier: creator.creatorTier || "none",
        creatorLevel: Number(creator.creatorLevel || 0),
        progress: monetizationProgress,
        payoutHistory: [],
        revenueAnalytics: {
          viewsRevenue: estimatedEarnings,
          brandDealsRevenue: 0,
          tipsRevenue: 0,
        },
      },
      topVideos,
      trendingVideos,
      recentVideos: allVideos.slice(0, 10).map(serializeVideo),
      recentUploads: allVideos.slice(0, 10).map(serializeVideo),
      notifications: [],
    });
  } catch (error) {
    console.error("[creator:dashboard]", error);
    return res.status(500).json({ message: "Unable to load creator dashboard" });
  }
};

module.exports = {
  engagementScoreFor,
  followCreator,
  getCreatorAnalytics,
  getCreatorDashboard,
  getCreatorProfile,
  recordVideoView,
  unfollowCreator,
};
