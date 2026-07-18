// @ts-nocheck
/**
 * Livestream Controller
 * API endpoints for livestream operations
 */

const livestreamService = require("./livestreamService");
const { getIo } = require("../../socket");

const creatorImageFor = (creator = {}) => creator.avatar || creator.profilePicture || creator.profileImage || creator.images?.[0] || "";

const formatLiveStreamResponse = (stream) => ({
  id: stream._id?.toString?.() || stream.id,
  hostUserId: stream.creatorId?._id?.toString?.() || stream.creatorId,
  creatorId: stream.creatorId?._id?.toString?.() || stream.creatorId,
  creator: {
    id: stream.creatorId?._id?.toString?.() || stream.creatorId,
    username: stream.creatorId?.username,
    name: stream.creatorId?.name,
    avatar: creatorImageFor(stream.creatorId || {}),
    profilePicture: stream.creatorId?.profilePicture,
    profileImage: stream.creatorId?.profileImage,
    level: stream.creatorId?.level,
    levelName: stream.creatorId?.levelName,
    walletId: stream.creatorId?.walletId,
    premiumBadge: stream.creatorId?.premiumBadge,
    isPremium: stream.creatorId?.isPremium,
    isVerified: stream.creatorId?.isVerified,
    marketplace: stream.creatorId?.marketplace,
    creatorBadges: stream.creatorId?.creatorBadges || [],
  },
  title: stream.title,
  description: stream.description,
  category: stream.category,
  tags: stream.tags || [],
  status: stream.status,
  privacyLevel: stream.privacyLevel,
  thumbnail: stream.thumbnail,
  coverImage: stream.coverImage,
  viewerCount: stream.viewerCount || 0,
  maxViewers: stream.maxViewers || 0,
  duration: stream.duration || 0,
  isLive: stream.isLive,
  stats: stream.stats || {},
  settings: {
    commentsEnabled: stream.settings?.commentsEnabled !== false,
    giftsEnabled: stream.settings?.giftsEnabled !== false,
    allowReactions: stream.settings?.allowReactions !== false,
    selectedQuality: stream.settings?.selectedQuality || "720p",
    qualityOptions: stream.settings?.qualityOptions || ["720p"],
    followerOnlyChat: Boolean(stream.settings?.followerOnlyChat),
    moderationEnabled: stream.settings?.moderationEnabled !== false,
    liveNotifications: stream.settings?.liveNotifications !== false,
    beautyFilter: stream.settings?.beautyFilter || "natural",
    backgroundTheme: stream.settings?.backgroundTheme || "classic",
    effectsPreset: stream.settings?.effectsPreset || "none",
    pkBattleReady: Boolean(stream.settings?.pkBattleReady),
  },
  startedAt: stream.startedAt,
  endedAt: stream.endedAt,
  createdAt: stream.createdAt,
});

const handleError = (res, error, defaultMessage = "Operation failed") => {
  const lowerMessage = String(error.message || "").toLowerCase();
  const statusCode = error.statusCode || (lowerMessage.includes("not found") ? 404 : lowerMessage.includes("invalid") ? 400 : 500);
  const message = error.message || defaultMessage;
  return res.status(statusCode).json({
    ok: false,
    error: message,
    code: error.code || "LIVESTREAM_ERROR",
  });
};

/**
 * POST /api/livestream/start
 * Start a new livestream
 */
const startLiveStream = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const streamData = {
      title: req.body?.title,
      description: req.body?.description,
      category: req.body?.category,
      tags: req.body?.tags,
      privacyLevel: req.body?.privacyLevel,
      thumbnail: req.body?.thumbnail,
      coverImage: req.body?.coverImage,
      commentsEnabled: req.body?.commentsEnabled,
      giftsEnabled: req.body?.giftsEnabled,
      allowReactions: req.body?.allowReactions,
      selectedQuality: req.body?.selectedQuality,
      qualityOptions: req.body?.qualityOptions,
      followerOnlyChat: req.body?.followerOnlyChat,
      moderationEnabled: req.body?.moderationEnabled,
      liveNotifications: req.body?.liveNotifications,
      beautyFilter: req.body?.beautyFilter,
      backgroundTheme: req.body?.backgroundTheme,
      effectsPreset: req.body?.effectsPreset,
      pkBattleReady: req.body?.pkBattleReady,
      metadata: req.body?.metadata,
    };

    const stream = await livestreamService.startLiveStream(userId, streamData);
    const payload = formatLiveStreamResponse(stream);
    getIo()?.emit("livestream:started", { stream: payload });
    getIo()?.emit("live:started", { stream: payload });
    return res.status(201).json({
      ok: true,
      stream: payload,
      message: "Livestream started",
    });
  } catch (error) {
    return handleError(res, error, "Failed to start livestream");
  }
};

/**
 * POST /api/livestream/:streamId/end
 * End a livestream
 */
const endLiveStream = async (req, res) => {
  try {
    const userId = req.user?._id;
    const streamId = req.params?.streamId;

    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    if (!streamId) {
      return res.status(400).json({ ok: false, error: "Stream ID required" });
    }

    const stream = await livestreamService.getStreamDetails(streamId);
    if (stream.stream.creatorId._id.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: "Not the stream creator" });
    }

    const updatedStream = await livestreamService.endLiveStream(streamId);
    const payload = formatLiveStreamResponse(updatedStream);
    getIo()?.to(`stream:${streamId}`).emit("livestream:ended", { stream: payload });
    getIo()?.to(`stream:${streamId}`).emit("live:ended", { stream: payload });
    getIo()?.emit("livestream:ended_global", { streamId, stream: payload });
    getIo()?.emit("live:ended_global", { streamId, stream: payload });
    return res.json({
      ok: true,
      stream: payload,
      message: "Livestream ended",
    });
  } catch (error) {
    return handleError(res, error, "Failed to end livestream");
  }
};

/**
 * POST /api/livestream/:streamId/join
 * Join a livestream
 */
const joinLiveStream = async (req, res) => {
  try {
    const streamId = req.params?.streamId;
    const viewerId = req.user?._id || null;
    const viewerName = req.body?.viewerName || req.user?.username || "Guest";

    if (!streamId) {
      return res.status(400).json({ ok: false, error: "Stream ID required" });
    }

    const { stream, session } = await livestreamService.joinLiveStream(streamId, viewerId, viewerName);
    const payload = formatLiveStreamResponse(stream);
    const viewerPayload = {
      streamId,
      viewerCount: payload.viewerCount,
      maxViewers: payload.maxViewers,
    };
    getIo()?.to(`stream:${streamId}`).emit("livestream:viewers_updated", viewerPayload);
    getIo()?.to(`stream:${streamId}`).emit("live:viewers_updated", viewerPayload);
    getIo()?.emit("livestream:viewers_updated_global", viewerPayload);
    getIo()?.emit("live:viewers_updated_global", viewerPayload);
    return res.status(201).json({
      ok: true,
      stream: payload,
      session: {
        id: session._id.toString(),
        viewerId: session.viewerId?.toString?.(),
        joinedAt: session.joinedAt,
      },
      message: "Joined livestream",
    });
  } catch (error) {
    return handleError(res, error, "Failed to join livestream");
  }
};

/**
 * POST /api/livestream/session/:sessionId/leave
 * Leave a livestream
 */
const leaveLiveStream = async (req, res) => {
  try {
    const sessionId = req.params?.sessionId;

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "Session ID required" });
    }

    const session = await livestreamService.leaveLiveStream(sessionId);
    const streamDetails = await livestreamService.getStreamDetails(session.streamId).catch(() => null);
    if (streamDetails?.stream) {
      const payload = formatLiveStreamResponse(streamDetails.stream);
      const viewerPayload = {
        streamId: session.streamId?.toString?.() || session.streamId,
        viewerCount: payload.viewerCount,
        maxViewers: payload.maxViewers,
      };
      getIo()?.to(`stream:${session.streamId}`).emit("livestream:viewers_updated", viewerPayload);
      getIo()?.to(`stream:${session.streamId}`).emit("live:viewers_updated", viewerPayload);
      getIo()?.emit("livestream:viewers_updated_global", viewerPayload);
      getIo()?.emit("live:viewers_updated_global", viewerPayload);
    }
    return res.json({
      ok: true,
      session: {
        id: session._id.toString(),
        duration: session.duration,
      },
      message: "Left livestream",
    });
  } catch (error) {
    return handleError(res, error, "Failed to leave livestream");
  }
};

/**
 * GET /api/livestream/active
 * Get active livestreams
 */
const getActiveLiveStreams = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query?.limit) || 20, 100);
    const skip = Number(req.query?.skip) || 0;

    const { streams, pagination } = await livestreamService.getActiveLiveStreams(limit, skip);
    return res.json({
      ok: true,
      streams: streams.map(formatLiveStreamResponse),
      pagination,
    });
  } catch (error) {
    return handleError(res, error, "Failed to get active livestreams");
  }
};

/**
 * GET /api/livestream/category/:category
 * Get livestreams by category
 */
const getLiveStreamsByCategory = async (req, res) => {
  try {
    const category = req.params?.category;
    const limit = Math.min(Number(req.query?.limit) || 20, 100);
    const skip = Number(req.query?.skip) || 0;

    if (!category) {
      return res.status(400).json({ ok: false, error: "Category required" });
    }

    const { streams, pagination } = await livestreamService.getLiveStreamsByCategory(category, limit, skip);
    return res.json({
      ok: true,
      streams: streams.map(formatLiveStreamResponse),
      pagination,
    });
  } catch (error) {
    return handleError(res, error, "Failed to get livestreams by category");
  }
};

/**
 * GET /api/livestream/creator/:creatorId
 * Get creator's livestreams
 */
const getCreatorLiveStreams = async (req, res) => {
  try {
    const creatorId = req.params?.creatorId;
    const statusFilter = req.query?.status;
    const limit = Math.min(Number(req.query?.limit) || 20, 100);
    const skip = Number(req.query?.skip) || 0;

    if (!creatorId) {
      return res.status(400).json({ ok: false, error: "Creator ID required" });
    }

    const { streams, pagination } = await livestreamService.getCreatorLiveStreams(creatorId, statusFilter, limit, skip);
    return res.json({
      ok: true,
      streams: streams.map(formatLiveStreamResponse),
      pagination,
    });
  } catch (error) {
    return handleError(res, error, "Failed to get creator livestreams");
  }
};

/**
 * GET /api/livestream/:streamId
 * Get stream details
 */
const getStreamDetails = async (req, res) => {
  try {
    const streamId = req.params?.streamId;

    if (!streamId) {
      return res.status(400).json({ ok: false, error: "Stream ID required" });
    }

    const { stream, stats } = await livestreamService.getStreamDetails(streamId);
    return res.json({
      ok: true,
      stream: formatLiveStreamResponse(stream),
      stats,
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ ok: false, error: error.message });
    }
    return handleError(res, error, "Failed to get stream details");
  }
};

/**
 * PATCH /api/livestream/:streamId
 * Update stream metadata
 */
const updateStreamMetadata = async (req, res) => {
  try {
    const userId = req.user?._id;
    const streamId = req.params?.streamId;

    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    if (!streamId) {
      return res.status(400).json({ ok: false, error: "Stream ID required" });
    }

    const stream = await livestreamService.getStreamDetails(streamId);
    if (stream.stream.creatorId._id.toString() !== userId.toString()) {
      return res.status(403).json({ ok: false, error: "Not the stream creator" });
    }

    const updatedStream = await livestreamService.updateStreamMetadata(streamId, req.body);
    const payload = formatLiveStreamResponse(updatedStream);
    getIo()?.to(`stream:${streamId}`).emit("livestream:metadata_updated", { stream: payload });
    getIo()?.to(`stream:${streamId}`).emit("live:metadata_updated", { stream: payload });
    return res.json({
      ok: true,
      stream: payload,
      message: "Stream updated",
    });
  } catch (error) {
    return handleError(res, error, "Failed to update stream");
  }
};

module.exports = {
  startLiveStream,
  endLiveStream,
  joinLiveStream,
  leaveLiveStream,
  getActiveLiveStreams,
  getLiveStreamsByCategory,
  getCreatorLiveStreams,
  getStreamDetails,
  updateStreamMetadata,
};
