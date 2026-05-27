/**
 * Livestream Moderation Utilities
 * Handles user muting, blocking, and chat mode settings
 */

/**
 * Check if user is blocked from sending comments
 */
const isUserBlocked = (socket, blockedUsers = []) => {
  const userId = socket.user?._id?.toString?.() || "";
  if (!userId) return false;
  return blockedUsers.some((id) => id.toString?.() === userId || id === userId);
};

/**
 * Check if user can send comments (followers only check)
 */
const canUserComment = (socket, isFollower = false, followersOnlyMode = false) => {
  if (!followersOnlyMode) return true;
  return isFollower || socket.user?.level >= 2; // Verified users bypass followers-only
};

/**
 * Track slow mode for users
 */
const isInSlowMode = (socket, scope = "slow_mode", delaySeconds = 10) => {
  const key = `live:${scope}:user:${socket.user?._id?.toString?.() || socket.id}`;
  const now = Date.now();
  const lastAt = Number(socket.data[key] || 0);
  const delayMs = delaySeconds * 1000;

  if (now - lastAt < delayMs) {
    return {
      limited: true,
      remainingSeconds: Math.ceil((delayMs - (now - lastAt)) / 1000),
    };
  }

  socket.data[key] = now;
  return { limited: false, remainingSeconds: 0 };
};

/**
 * Get live stream moderation settings
 */
const getModerationSettings = (stream = {}) => {
  const settings = stream.settings || {};
  return {
    commentsEnabled: settings.commentsEnabled !== false,
    giftsEnabled: settings.giftsEnabled !== false,
    allowReactions: settings.allowReactions !== false,
    moderationEnabled: settings.moderationEnabled !== false,
    followersOnlyChat: settings.followersOnlyChat === true,
    slowModeEnabled: settings.slowModeEnabled === true,
    slowModeSeconds: settings.slowModeSeconds || 10,
    mutedUsers: settings.mutedUsers || [],
    blockedUsers: settings.blockedUsers || [],
  };
};

/**
 * Format blocked user info for storage
 */
const formatBlockedUser = (userId, reason = "", moderatorId = null) => ({
  userId: userId.toString?.() || userId,
  reason: String(reason || "").slice(0, 200),
  blockedAt: new Date(),
  moderatorId: moderatorId?.toString?.() || null,
});

module.exports = {
  isUserBlocked,
  canUserComment,
  isInSlowMode,
  getModerationSettings,
  formatBlockedUser,
};
