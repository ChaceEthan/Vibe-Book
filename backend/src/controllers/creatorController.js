const mongoose = require("mongoose");

const Feed = require("../models/Feed");
const User = require("../models/User");
const { profileResponse } = require("./userController");
const { rankingFieldsForPost } = require("../utils/feedRanking");

const creatorSelect = "-password";
const topVideoSelect = "mediaUrl type caption views watchTime completionRate replays likes likedBy comments shareCount saves savedBy engagementScore viralScore trendScore engagementVelocity createdAt updatedAt";

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
  engagementScore: Number(video.engagementScore || 0),
  viralScore: Number(video.viralScore || 0),
  createdAt: video.createdAt,
  updatedAt: video.updatedAt,
});

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
    const video = await Feed.findOneAndUpdate(
      {
        _id: req.params.id,
        type: "video",
      },
      {
        $inc: {
          views: 1,
          watchTime,
        },
      },
      { returnDocument: "after", runValidators: true }
    ).populate("userId", creatorSelect);

    if (!video || !video.userId) {
      return res.status(404).json({ message: "Video not found" });
    }

    const creator = video.userId;

    const fields = rankingFieldsForPost(video);
    video.engagementScore = fields.engagementScore;
    video.viralScore = fields.viralScore;
    video.trendScore = fields.trendScore;
    video.engagementVelocity = fields.engagementVelocity;
    video.distributionStage = fields.distributionStage;
    await video.save();

    await User.findByIdAndUpdate(creator._id, {
      $inc: {
        viewsCount: 1,
        totalWatchTime: watchTime,
      },
    });

    const serializedVideo = serializeVideo(video);

    return res.json({
      video: serializedVideo,
      feedItem: {
        ...serializedVideo,
        userId: profileResponse(creator, req.user),
      },
      message: "View counted",
    });
  } catch (error) {
    console.error("[video:view]", error);
    return res.status(500).json({ message: "Unable to record video view" });
  }
};

module.exports = {
  engagementScoreFor,
  followCreator,
  getCreatorAnalytics,
  getCreatorProfile,
  recordVideoView,
  unfollowCreator,
};
