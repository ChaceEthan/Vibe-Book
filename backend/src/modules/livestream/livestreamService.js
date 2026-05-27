// @ts-nocheck
/**
 * Livestream Service
 * Core business logic for livestream operations
 */

const LiveStream = require("../../models/LiveStream");
const LiveSession = require("../../models/LiveSession");
const User = require("../../models/User");
const { rewardLiveStream, sendGift } = require("../wallet/walletService");
const { GIFT_DEFINITIONS } = require("../wallet/walletConstants");
const mongoose = require("mongoose");

const ACTIVE_SESSION_STALE_MS = 90 * 1000;
const VALID_CATEGORIES = new Set(["gaming", "music", "art", "talk", "performance", "education", "lifestyle", "other"]);
const VALID_PRIVACY = new Set(["public", "friends", "private"]);
const VALID_QUALITIES = new Set(["360p", "480p", "720p", "1080p"]);
const LIVE_GIFT_CATALOG = Object.values(GIFT_DEFINITIONS).reduce((catalog, gift) => {
  if (gift?.id) {
    catalog[gift.id] = gift;
  }
  return catalog;
}, {});

const validateUserId = (userId) => {
  const id = userId?._id?.toString?.() || userId?.toString?.() || "";
  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid user ID");
  }
  return id;
};

const validateStreamId = (streamId) => {
  const id = streamId?._id?.toString?.() || streamId?.toString?.() || "";
  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid stream ID");
  }
  return id;
};

const normalizeTags = (tags) => {
  const source = Array.isArray(tags) ? tags : String(tags || "").split(/[,\s]+/);
  return Array.from(new Set(source.map((tag) => String(tag || "").trim().replace(/^#+/, "").toLowerCase()).filter(Boolean))).slice(0, 5);
};

const normalizeSettings = (streamData = {}) => {
  const selectedQuality = VALID_QUALITIES.has(streamData.selectedQuality) ? streamData.selectedQuality : "720p";
  const qualityOptions = Array.isArray(streamData.qualityOptions)
    ? streamData.qualityOptions.filter((item) => VALID_QUALITIES.has(item)).slice(0, 4)
    : [selectedQuality];

  return {
    commentsEnabled: streamData.commentsEnabled !== false,
    giftsEnabled: streamData.giftsEnabled !== false,
    allowReactions: streamData.allowReactions !== false,
    moderatorIds: Array.isArray(streamData.moderatorIds) ? streamData.moderatorIds.filter((id) => mongoose.isValidObjectId(id)).slice(0, 20) : [],
    qualityOptions: qualityOptions.length ? qualityOptions : [selectedQuality],
    selectedQuality,
    followerOnlyChat: Boolean(streamData.followerOnlyChat),
    moderationEnabled: streamData.moderationEnabled !== false,
    liveNotifications: streamData.liveNotifications !== false,
    beautyFilter: String(streamData.beautyFilter || "natural").trim().slice(0, 40),
    backgroundTheme: String(streamData.backgroundTheme || "classic").trim().slice(0, 40),
    effectsPreset: String(streamData.effectsPreset || "none").trim().slice(0, 40),
    pkBattleReady: Boolean(streamData.pkBattleReady),
    mutedUsers: Array.isArray(streamData.mutedUsers) ? streamData.mutedUsers.filter((id) => mongoose.isValidObjectId(id)).slice(0, 250) : [],
    blockedUsers: Array.isArray(streamData.blockedUsers) ? streamData.blockedUsers.filter((id) => mongoose.isValidObjectId(id)).slice(0, 250) : [],
    slowModeEnabled: Boolean(streamData.slowModeEnabled),
    slowModeSeconds: Math.max(0, Math.min(120, Number(streamData.slowModeSeconds || 10))),
  };
};

const creatorSelect = "username name avatar profileImage profilePicture images walletId level levelName followers following isPremium premiumBadge isVerified marketplace creatorBadges";

const giftForId = (giftId = "") => {
  const key = String(giftId || "").trim().toLowerCase();
  return LIVE_GIFT_CATALOG[key] || LIVE_GIFT_CATALOG.rose;
};

const reconcileViewerCount = async (streamId) => {
  const activeCount = await LiveSession.countDocuments({ streamId, isActive: true });
  const stream = await LiveStream.findById(streamId);

  if (!stream) return null;

  stream.viewerCount = activeCount;
  stream.maxViewers = Math.max(Number(stream.maxViewers || 0), activeCount);
  await stream.save();
  return stream;
};

const cleanupStaleSessions = async () => {
  const staleBefore = new Date(Date.now() - ACTIVE_SESSION_STALE_MS);
  const staleSessions = await LiveSession.find({
    isActive: true,
    updatedAt: { $lt: staleBefore },
  }).select("_id streamId joinedAt");

  if (!staleSessions.length) return;

  const now = new Date();
  const streamIds = new Set();
  await Promise.all(staleSessions.map((session) => {
    streamIds.add(session.streamId.toString());
    session.leftAt = now;
    session.isActive = false;
    return session.save();
  }));

  await Promise.all(Array.from(streamIds).map((streamId) => reconcileViewerCount(streamId)));
};

/**
 * Start a new livestream
 */
const startLiveStream = async (creatorId, streamData = {}) => {
  const safeCreatorId = validateUserId(creatorId);

  const creator = await User.findById(safeCreatorId).select("_id username name avatar walletId");
  if (!creator) {
    throw new Error("Creator not found");
  }

  const now = new Date();
  const previousStreams = await LiveStream.find({ creatorId: safeCreatorId, status: "live", isLive: true }).select("_id");
  const previousStreamIds = previousStreams.map((stream) => stream._id);

  if (previousStreamIds.length) {
    const previousSessions = await LiveSession.find({ streamId: { $in: previousStreamIds }, isActive: true });
    await Promise.all(previousSessions.map((session) => {
      session.leftAt = now;
      session.isActive = false;
      return session.save();
    }));
  }

  await LiveStream.updateMany(
    { creatorId: safeCreatorId, status: "live", isLive: true },
    { $set: { status: "ended", isLive: false, endedAt: now, viewerCount: 0 } }
  );

  const stream = new LiveStream({
    creatorId: safeCreatorId,
    title: String(streamData.title || "Untitled Stream").trim().slice(0, 120),
    description: String(streamData.description || "").trim().slice(0, 500),
    category: VALID_CATEGORIES.has(String(streamData.category || "")) ? String(streamData.category) : "other",
    tags: normalizeTags(streamData.tags),
    privacyLevel: VALID_PRIVACY.has(streamData.privacyLevel) ? streamData.privacyLevel : "public",
    thumbnail: streamData.thumbnail || null,
    coverImage: streamData.coverImage || null,
    settings: normalizeSettings(streamData),
    status: "live",
    isLive: true,
    startedAt: now,
    metadata: streamData.metadata || {},
  });

  await stream.save();

  // Award points for starting a livestream
  try {
    await rewardLiveStream(safeCreatorId, stream._id);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Failed to award livestream reward:", error.message);
    }
  }

  return stream.populate("creatorId", creatorSelect);
};

/**
 * End a livestream
 */
const endLiveStream = async (streamId) => {
  validateStreamId(streamId);

  const stream = await LiveStream.findById(streamId);
  if (!stream) {
    throw new Error("Stream not found");
  }

  if (stream.status === "ended") {
    throw new Error("Stream already ended");
  }

  stream.status = "ended";
  stream.isLive = false;
  stream.endedAt = new Date();
  stream.viewerCount = 0;

  // Calculate final stats
  const activeSessions = await LiveSession.find({ streamId, isActive: true });
  for (const session of activeSessions) {
    session.leftAt = new Date();
    session.isActive = false;
    await session.save();
  }

  stream.stats.totalViews = await LiveSession.countDocuments({ streamId });

  await stream.save();

  return stream.populate("creatorId", creatorSelect);
};

/**
 * Join a livestream (create viewer session)
 */
const joinLiveStream = async (streamId, viewerId = null, viewerName = "Guest") => {
  const safeStreamId = validateStreamId(streamId);
  const safeViewerId = viewerId && mongoose.isValidObjectId(viewerId) ? viewerId : null;

  const stream = await LiveStream.findById(safeStreamId).populate("creatorId", creatorSelect);
  if (!stream) {
    throw new Error("Stream not found");
  }

  if (stream.status !== "live" || stream.isLive === false) {
    throw new Error("Stream is not live");
  }

  let session = safeViewerId
    ? await LiveSession.findOne({ streamId: safeStreamId, viewerId: safeViewerId, isActive: true })
    : null;

  if (!session) {
    session = new LiveSession({
      streamId: safeStreamId,
      viewerId: safeViewerId,
      viewerName: String(viewerName || "Guest").slice(0, 50),
      joinedAt: new Date(),
      isActive: true,
    });
  } else {
    session.viewerName = String(viewerName || session.viewerName || "Guest").slice(0, 50);
  }

  session.leftAt = null;
  await session.save();

  const activeCount = await LiveSession.countDocuments({ streamId: safeStreamId, isActive: true });
  stream.viewerCount = activeCount;
  stream.maxViewers = Math.max(Number(stream.maxViewers || 0), activeCount);
  stream.stats.totalViews = Math.max(Number(stream.stats.totalViews || 0), await LiveSession.countDocuments({ streamId: safeStreamId }));
  await stream.save();

  return { stream, session };
};

/**
 * Leave a livestream (end viewer session)
 */
const leaveLiveStream = async (sessionId) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new Error("Invalid session ID");
  }

  const session = await LiveSession.findById(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  if (!session.isActive) {
    return session;
  }

  session.leftAt = new Date();
  session.isActive = false;
  await session.save();

  // Decrement viewer count
  const stream = await reconcileViewerCount(session.streamId);
  if (stream && stream.isLive) {
    return session;
  }

  return session;
};

const touchLiveSession = async (sessionId) => {
  if (!mongoose.isValidObjectId(sessionId)) return null;
  return LiveSession.findByIdAndUpdate(sessionId, { $set: { updatedAt: new Date() } }, { returnDocument: "after" });
};

const sendLiveGift = async (streamId, senderId, giftId, metadata = {}) => {
  const safeStreamId = validateStreamId(streamId);
  const safeSenderId = validateUserId(senderId);
  const gift = giftForId(giftId);
  const senderName = String(metadata.senderName || "Viewer").trim().slice(0, 80) || "Viewer";
  const senderAvatar = String(metadata.senderAvatar || "").trim().slice(0, 500);

  const stream = await LiveStream.findById(safeStreamId).populate("creatorId", creatorSelect);
  if (!stream || stream.status === "ended" || stream.isLive === false) {
    const error = new Error("Live stream is not available");
    error.code = "STREAM_NOT_LIVE";
    throw error;
  }

  if (stream.settings?.giftsEnabled === false) {
    const error = new Error("Gifts are turned off for this live");
    error.code = "LIVE_GIFTS_DISABLED";
    throw error;
  }

  const creatorId = stream.creatorId?._id || stream.creatorId;
  if (!creatorId) {
    const error = new Error("Stream creator was not found");
    error.code = "CREATOR_NOT_FOUND";
    throw error;
  }

  const result = await sendGift(safeSenderId, creatorId, gift.id, gift.pointsCost, {
    streamId: safeStreamId,
    streamTitle: stream.title,
    giftId: gift.id,
    giftName: gift.name,
    giftAnimation: gift.animation,
    giftAnimationDuration: gift.animationDuration,
    giftTier: gift.tier,
    giftEmoji: gift.emoji,
    giftColor: gift.color,
    giftColors: gift.colors || [],
    giftRarity: gift.rarity,
    giftSoundHook: gift.sound || gift.soundHook || `gift-${gift.id.replace(/_/g, "-")}`,
    liveGift: true,
    futureTokenReady: true,
    ...(metadata || {}),
  });

  stream.stats = stream.stats || {};
  stream.stats.giftsReceived = Number(stream.stats.giftsReceived || 0) + 1;
  stream.stats.giftValue = Number(stream.stats.giftValue || 0) + gift.pointsCost;
  const giftedAt = new Date();
  const existingSupporters = Array.isArray(stream.stats.topSupporters) ? stream.stats.topSupporters.map((supporter) => ({
    userId: supporter.userId,
    username: supporter.username || "Viewer",
    avatar: supporter.avatar || "",
    total: Number(supporter.total || 0),
    count: Number(supporter.count || 0),
    lastGiftAt: supporter.lastGiftAt || null,
  })) : [];
  const supporterIndex = existingSupporters.findIndex((supporter) => supporter.userId?.toString?.() === safeSenderId);

  if (supporterIndex >= 0) {
    existingSupporters[supporterIndex] = {
      ...existingSupporters[supporterIndex],
      username: senderName,
      avatar: senderAvatar || existingSupporters[supporterIndex].avatar,
      total: Number(existingSupporters[supporterIndex].total || 0) + gift.pointsCost,
      count: Number(existingSupporters[supporterIndex].count || 0) + 1,
      lastGiftAt: giftedAt,
    };
  } else {
    existingSupporters.push({
      userId: safeSenderId,
      username: senderName,
      avatar: senderAvatar,
      total: gift.pointsCost,
      count: 1,
      lastGiftAt: giftedAt,
    });
  }

  stream.stats.topSupporters = existingSupporters
    .sort((left, right) => Number(right.total || 0) - Number(left.total || 0))
    .slice(0, 20);
  const giftLogEntry = {
    transactionId: result.sendTransaction?._id,
    senderId: safeSenderId,
    senderName,
    giftId: gift.id,
    giftName: gift.name,
    value: gift.pointsCost,
    tier: gift.tier,
    createdAt: giftedAt,
  };
  stream.stats.giftLog = [giftLogEntry, ...(Array.isArray(stream.stats.giftLog) ? stream.stats.giftLog : [])].slice(0, 100);
  await stream.save();

  return {
    stream,
    gift,
    giftLogEntry,
    topSupporters: stream.stats.topSupporters,
    senderWallet: result.sender,
    receiverWallet: result.receiver,
    sendTransaction: result.sendTransaction,
    receiveTransaction: result.receiveTransaction,
  };
};

/**
 * Get active livestreams (currently live)
 */
const getActiveLiveStreams = async (limit = 20, skip = 0) => {
  await cleanupStaleSessions().catch(() => null);
  const streams = await LiveStream.find({ isLive: true, status: "live" })
    .populate("creatorId", creatorSelect)
    .sort({ viewerCount: -1, startedAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();

  const total = await LiveStream.countDocuments({ isLive: true, status: "live" });

  return {
    streams,
    pagination: {
      total,
      limit,
      skip,
      hasMore: skip + limit < total,
    },
  };
};

/**
 * Get livestreams by category
 */
const getLiveStreamsByCategory = async (category, limit = 20, skip = 0) => {
  const safeCategory = VALID_CATEGORIES.has(String(category || "")) ? String(category) : "other";
  const streams = await LiveStream.find({ isLive: true, status: "live", category: safeCategory })
    .populate("creatorId", creatorSelect)
    .sort({ viewerCount: -1, startedAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();

  const total = await LiveStream.countDocuments({ isLive: true, status: "live", category: safeCategory });

  return {
    streams,
    pagination: {
      total,
      limit,
      skip,
      hasMore: skip + limit < total,
    },
  };
};

/**
 * Get livestreams by creator
 */
const getCreatorLiveStreams = async (creatorId, statusFilter = null, limit = 20, skip = 0) => {
  const safeCreatorId = validateUserId(creatorId);

  const query = { creatorId: safeCreatorId };
  if (statusFilter && ["live", "ended", "archived", "scheduled"].includes(statusFilter)) {
    query.status = statusFilter;
  }

  const streams = await LiveStream.find(query)
    .sort({ startedAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();

  const total = await LiveStream.countDocuments(query);

  return {
    streams,
    pagination: {
      total,
      limit,
      skip,
      hasMore: skip + limit < total,
    },
  };
};

/**
 * Get stream details
 */
const getStreamDetails = async (streamId) => {
  const safeStreamId = validateStreamId(streamId);

  const stream = await LiveStream.findById(safeStreamId).populate("creatorId", creatorSelect);

  if (!stream) {
    throw new Error("Stream not found");
  }

  const activeSessions = await LiveSession.find({ streamId: safeStreamId, isActive: true }).lean();
  const totalSessions = await LiveSession.countDocuments({ streamId: safeStreamId });

  return {
    stream,
    stats: {
      ...stream.stats,
      currentViewers: activeSessions.length,
      totalSessions,
    },
  };
};

/**
 * Update stream metadata
 */
const updateStreamMetadata = async (streamId, updates = {}) => {
  const safeStreamId = validateStreamId(streamId);

  const stream = await LiveStream.findById(safeStreamId);
  if (!stream) {
    throw new Error("Stream not found");
  }

  // Only allow updates to certain fields
  const allowedUpdates = ["title", "description", "category", "tags", "privacyLevel", "coverImage", "thumbnail"];
  for (const key of allowedUpdates) {
    if (key in updates) {
      if (key === "title") {
        stream.title = String(updates[key]).trim().slice(0, 120);
      } else if (key === "description") {
        stream.description = String(updates[key]).trim().slice(0, 500);
      } else if (key === "tags") {
        stream.tags = normalizeTags(updates[key]);
      } else if (key === "category") {
        stream.category = VALID_CATEGORIES.has(String(updates[key])) ? String(updates[key]) : stream.category;
      } else if (key === "privacyLevel") {
        stream.privacyLevel = VALID_PRIVACY.has(updates[key]) ? updates[key] : stream.privacyLevel;
      } else {
        stream[key] = updates[key];
      }
    }
  }

  if (updates.settings && typeof updates.settings === "object") {
    stream.settings = { ...(stream.settings || {}), ...normalizeSettings({ ...(stream.settings || {}), ...updates.settings }) };
  }

  await stream.save();
  return stream.populate("creatorId", creatorSelect);
};

module.exports = {
  cleanupStaleSessions,
  startLiveStream,
  endLiveStream,
  joinLiveStream,
  leaveLiveStream,
  touchLiveSession,
  sendLiveGift,
  getActiveLiveStreams,
  getLiveStreamsByCategory,
  getCreatorLiveStreams,
  getStreamDetails,
  updateStreamMetadata,
};
