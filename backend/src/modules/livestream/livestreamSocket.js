// @ts-nocheck
/**
 * Livestream Socket Handler
 * Handles realtime livestream events and keeps viewer sessions in sync.
 */

const livestreamService = require("./livestreamService");
const { formatWalletResponse, formatTransactionResponse } = require("../wallet/walletUtils");
const { GIFT_DEFINITIONS } = require("../wallet/walletConstants");
const { createNotification } = require("../../utils/notifications");
const { filterComment, isSpamMessage } = require("../../utils/chatFilter");
const { getModerationSettings, isUserBlocked } = require("../../utils/liveModeration");

const VALID_REACTIONS = new Set(["heart", "fire", "clap", "wow", "laugh", "cry"]);
const VALID_GIFTS = new Set(Object.values(GIFT_DEFINITIONS).map((gift) => gift.id));
const COMMENT_RATE_LIMIT_MS = 900;
const GIFT_RATE_LIMIT_MS = 1200;
const PANEL_REQUEST_RATE_LIMIT_MS = 5000;
const PANEL_REQUEST_TIMEOUT_MS = 1000 * 60 * 2;
const MAX_DEDUPE_IDS = 80;
const LIVE_PANEL_LIMIT = 10;
const VALID_PANEL_LAYOUTS = new Set(["solo", "side-by-side", "grid", "extended-grid", "host-focus", "active-speaker"]);
const liveRoomState = new Map();

const roomFor = (streamId) => `stream:${streamId}`;
const idOf = (value) => value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";
const nowIso = () => new Date().toISOString();
const traceWebRtc = (event, details = {}) => console.info(`[webrtc] ${event}`, details);
const textFromLiveValue = (value, fallback = "") => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return fallback;

  const candidate = value.text ?? value.message ?? value.body ?? value.content ?? value.value ?? value.label ?? value.name ?? value.giftName;
  if (candidate === value) return fallback;
  return textFromLiveValue(candidate, fallback);
};

const emitLiveRoomEvent = (io, streamId, eventName, payload) => {
  const room = roomFor(streamId);
  // Emit only the primary event name to prevent double processing on frontend
  io.to(room).emit(eventName, payload);
};

const markDedupeId = (socket, scope, rawId = "") => {
  const id = String(rawId || "").trim();
  if (!id) return false;

  const key = `live:${scope}:ids`;
  const current = socket.data[key] || [];
  if (current.includes(id)) return true;

  current.push(id);
  if (current.length > MAX_DEDUPE_IDS) {
    current.splice(0, current.length - MAX_DEDUPE_IDS);
  }
  socket.data[key] = current;
  return false;
};

const isRateLimited = (socket, scope, windowMs) => {
  const key = `live:${scope}:lastAt`;
  const now = Date.now();
  const previous = Number(socket.data[key] || 0);
  if (now - previous < windowMs) return true;
  socket.data[key] = now;
  return false;
};

const viewerPayloadFor = (socket, fallbackName = "Guest") => ({
  userId: idOf(socket.user?._id),
  username: textFromLiveValue(socket.user?.username || socket.user?.name || fallbackName, "Guest"),
  avatar: socket.user?.avatar || socket.user?.profilePicture || socket.user?.profileImage || "",
});

const stateFor = (streamId) => {
  const id = idOf(streamId);
  if (!liveRoomState.has(id)) {
    liveRoomState.set(id, {
      viewers: new Map(),
      panel: new Map(),
      requests: new Map(),
      invites: new Map(),
      layout: "solo",
      panelLocked: false,
      updatedAt: Date.now(),
    });
  }
  return liveRoomState.get(id);
};

const serializeMember = (member = {}) => ({
  socketId: member.socketId || "",
  userId: member.userId || "",
  username: member.username || "Viewer",
  avatar: member.avatar || "",
  role: member.role || "viewer",
  isHost: Boolean(member.isHost),
  muted: Boolean(member.muted),
  activeSpeaker: Boolean(member.activeSpeaker),
  joinedAt: member.joinedAt || nowIso(),
  requestedAt: member.requestedAt || undefined,
  approvedAt: member.approvedAt || undefined,
  invitedAt: member.invitedAt || undefined,
  connectionStatus: member.connectionStatus || "connected",
  micEnabled: member.micEnabled !== false,
  cameraEnabled: member.cameraEnabled !== false,
});


const serializePanelRequest = (request = {}) => ({
  requestId: request.requestId || "",
  streamId: request.streamId || "",
  viewerUserId: request.viewerUserId || request.userId || "",
  viewerSocketId: request.viewerSocketId || request.socketId || "",
  userId: request.viewerUserId || request.userId || "",
  socketId: request.viewerSocketId || request.socketId || "",
  username: request.username || "Viewer",
  avatar: request.avatar || "",
  status: request.status || "pending",
  createdAt: request.createdAt || request.requestedAt || nowIso(),
  requestedAt: request.createdAt || request.requestedAt || nowIso(),
});

const serializePanelInvite = (invite = {}) => ({
  inviteId: invite.inviteId || "",
  streamId: invite.streamId || "",
  hostUserId: invite.hostUserId || "",
  viewerUserId: invite.viewerUserId || invite.userId || "",
  viewerSocketId: invite.viewerSocketId || invite.socketId || "",
  userId: invite.viewerUserId || invite.userId || "",
  socketId: invite.viewerSocketId || invite.socketId || "",
  username: invite.username || "Viewer",
  avatar: invite.avatar || "",
  status: invite.status || "pending",
  createdAt: invite.createdAt || nowIso(),
});

const pendingRequestKeyFor = (streamId, userId) => `${idOf(streamId)}:${idOf(userId)}`;
const pendingInviteKeyFor = (streamId, userId) => `${idOf(streamId)}:${idOf(userId)}`;

const cleanupExpiredPanelState = (io, streamId) => {
  const state = stateFor(streamId);
  const now = Date.now();
  let changed = false;

  Array.from(state.requests.entries()).forEach(([key, request]) => {
    const age = now - new Date(request.createdAt || request.requestedAt || 0).getTime();
    const disconnected = request.viewerSocketId && !state.viewers.has(request.viewerSocketId);
    if (request.status === "pending" && (age > PANEL_REQUEST_TIMEOUT_MS || disconnected)) {
      state.requests.set(key, { ...request, status: disconnected ? "cancelled" : "expired" });
      changed = true;
    }
  });

  Array.from(state.invites.entries()).forEach(([key, invite]) => {
    const age = now - new Date(invite.createdAt || 0).getTime();
    const disconnected = invite.viewerSocketId && !state.viewers.has(invite.viewerSocketId);
    if (invite.status === "pending" && (age > PANEL_REQUEST_TIMEOUT_MS || disconnected)) {
      state.invites.set(key, { ...invite, status: disconnected ? "cancelled" : "expired" });
      changed = true;
    }
  });

  if (changed) emitLiveRoomState(io, streamId);
};
const uniqueViewersForSnapshot = (state) => {
  const viewersByIdentity = new Map();
  Array.from(state.viewers.values()).forEach((member) => {
    if (member.isHost) return;
    const identity = member.userId ? `user:${member.userId}` : `socket:${member.socketId}`;
    const existing = viewersByIdentity.get(identity);
    if (!existing || String(existing.lastSeenAt || "") <= String(member.lastSeenAt || "")) {
      viewersByIdentity.set(identity, member);
    }
  });
  return Array.from(viewersByIdentity.values());
};
const roomSnapshotFor = (streamId) => {
  const state = stateFor(streamId);
  const byHostThenJoin = (left, right) => {
    if (left.isHost !== right.isHost) return left.isHost ? -1 : 1;
    return String(left.joinedAt || "").localeCompare(String(right.joinedAt || ""));
  };

  return {
    streamId: idOf(streamId),
    viewers: uniqueViewersForSnapshot(state).map(serializeMember).sort(byHostThenJoin),
    panelUsers: Array.from(state.panel.values()).map(serializeMember).sort(byHostThenJoin).slice(0, LIVE_PANEL_LIMIT),
    requests: Array.from(state.requests.values()).filter((request) => request.status === "pending").map(serializePanelRequest).sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || ""))),
    invites: Array.from(state.invites.values()).filter((invite) => invite.status === "pending").map(serializePanelInvite).sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || ""))),
    panelLimit: LIVE_PANEL_LIMIT,
    panelLayout: state.layout || "solo",
    panelLocked: Boolean(state.panelLocked),
    updatedAt: nowIso(),
  };
};

const emitLiveRoomState = (io, streamId) => {
  const snapshot = roomSnapshotFor(streamId);
  emitLiveRoomEvent(io, streamId, "live:room-state", snapshot);
  return snapshot;
};

const ensureSocketInLiveRoom = (socket, streamId) => {
  const id = idOf(streamId);
  if (!id) return;

  const room = roomFor(id);
  if (!socket.rooms.has(room)) {
    socket.join(room);
  }

  socket.data.livestream = {
    ...(socket.data.livestream || {}),
    streamId: id,
  };
};

const upsertLiveRoomMember = (streamId, socket, options = {}) => {
  const state = stateFor(streamId);
  const existing = state.viewers.get(socket.id) || {};
  const member = {
    ...existing,
    ...viewerPayloadFor(socket, options.username),
    socketId: socket.id,
    role: options.role || existing.role || "viewer",
    isHost: Boolean(options.isHost || existing.isHost),
    muted: Boolean(existing.muted),
    activeSpeaker: Boolean(options.activeSpeaker || existing.activeSpeaker),
    joinedAt: existing.joinedAt || nowIso(),
    lastSeenAt: nowIso(),
  };

  state.viewers.set(socket.id, member);
  if (member.isHost) {
    state.panel.set(socket.id, { ...member, role: "host" });
  }
  state.updatedAt = Date.now();
  return member;
};

const removeLiveRoomMember = (streamId, socketId) => {
  const id = idOf(streamId);
  const state = liveRoomState.get(id);
  if (!state) return null;

  const leavingMember = state.viewers.get(socketId);
  state.viewers.delete(socketId);
  state.panel.delete(socketId);
  state.requests.delete(socketId);
  if (leavingMember?.userId) {
    state.requests.delete(pendingRequestKeyFor(id, leavingMember.userId));
    state.invites.delete(pendingInviteKeyFor(id, leavingMember.userId));
  }
  Array.from(state.requests.entries()).forEach(([key, request]) => {
    if (request.viewerSocketId === socketId) state.requests.set(key, { ...request, status: "cancelled" });
  });
  Array.from(state.invites.entries()).forEach(([key, invite]) => {
    if (invite.viewerSocketId === socketId) state.invites.set(key, { ...invite, status: "cancelled" });
  });
  state.updatedAt = Date.now();

  if (!state.viewers.size && !state.panel.size && !state.requests.size && !state.invites.size) {
    liveRoomState.delete(id);
    return null;
  }

  return state;
};

const findLiveRoomMember = (streamId, value = "") => {
  const state = stateFor(streamId);
  const id = idOf(value);
  return Array.from(state.viewers.values()).find((member) => member.socketId === id || member.userId === id);
};

const hostMembersFor = (streamId) => {
  const state = stateFor(streamId);
  return Array.from(state.viewers.values()).filter((member) => member.isHost && member.socketId);
};

const socketIsHost = async (streamId, socket) => {
  const state = stateFor(streamId);
  const member = state.viewers.get(socket.id);
  if (member?.isHost) return true;

  const details = await livestreamService.getStreamDetails(streamId).catch(() => null);
  return Boolean(details?.stream && idOf(details.stream.creatorId) === idOf(socket.user?._id));
};

const emitViewerCount = async (io, streamId) => {
  const details = await livestreamService.getStreamDetails(streamId);
  const viewerCount = details.stats?.currentViewers ?? details.stream.viewerCount ?? 0;
  const maxViewers = details.stream.maxViewers || viewerCount;

  const payload = {
    streamId,
    viewerCount,
    maxViewers,
  };

  emitLiveRoomEvent(io, streamId, "live:viewers_updated", payload);
  io.emit("live:viewers_updated_global", payload);

  return { viewerCount, maxViewers };
};

const leaveTrackedLiveSession = async (io, socket, reason = "leave") => {
  const live = socket.data.livestream;

  if (!live?.streamId) {
    return null;
  }

  socket.leave(roomFor(live.streamId));
  socket.data.livestream = null;
  const remainingRoomState = removeLiveRoomMember(live.streamId, socket.id);
  socket.to(roomFor(live.streamId)).emit("live:peer-left", {
    streamId: live.streamId,
    socketId: socket.id,
    reason,
    timestamp: nowIso(),
  });

  if (live.sessionId) {
    await livestreamService.leaveLiveStream(live.sessionId).catch(() => null);
  }

  emitLiveRoomEvent(io, live.streamId, "live:viewer_left", {
    streamId: live.streamId,
    viewer: viewerPayloadFor(socket),
    reason,
    timestamp: nowIso(),
  });
  if (remainingRoomState) {
    emitLiveRoomState(io, live.streamId);
  }

  return emitViewerCount(io, live.streamId).catch(() => null);
};

const setupLiveStreamSockets = (io) => {
  io.on("connection", (socket) => {
    socket.on("live:join", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          socket.emit("live:error", { error: "Stream ID required" });
          return;
        }

        const currentLive = socket.data.livestream;
        if (currentLive?.streamId && currentLive.streamId !== streamId) {
          await leaveTrackedLiveSession(io, socket, "switch");
        }

        let sessionId = idOf(data.sessionId);
        let streamPayload = null;

        if (sessionId) {
          const touched = await livestreamService.touchLiveSession(sessionId);
          if (!touched || touched.streamId?.toString?.() !== streamId) {
            sessionId = "";
          }
        }

        if (!sessionId) {
          const result = await livestreamService.joinLiveStream(
            streamId,
            socket.user?._id,
            data.username || socket.user?.username || socket.user?.name || "Guest"
          );
          sessionId = result.session?._id?.toString?.() || "";
          streamPayload = result.stream;
        }

        socket.join(roomFor(streamId));
        socket.data.livestream = { streamId, sessionId };
        const streamDetails = streamPayload ? { stream: streamPayload } : await livestreamService.getStreamDetails(streamId).catch(() => null);
        const creatorId = idOf(streamDetails?.stream?.creatorId);
        const isHost = Boolean(creatorId && creatorId === idOf(socket.user?._id));
        upsertLiveRoomMember(streamId, socket, {
          username: data.username,
          isHost,
          role: isHost ? "host" : "viewer",
        });

        const viewers = await emitViewerCount(io, streamId);
        const roomState = emitLiveRoomState(io, streamId);
        emitLiveRoomEvent(io, streamId, "live:viewer_joined", {
          streamId,
          viewer: viewerPayloadFor(socket, data.username),
          timestamp: nowIso(),
        });

        const response = {
          ok: true,
          streamId,
          sessionId,
          viewerCount: viewers?.viewerCount ?? streamPayload?.viewerCount ?? 0,
          roomState,
        };
        socket.emit("live:joined", response);
        callback?.(response);
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to join livestream" });
        socket.emit("live:error", { error: error.message || "Unable to join livestream" });
      }
    });

    socket.on("live:leave", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId);
        const sessionId = idOf(data.sessionId);
        const currentLive = socket.data.livestream;

        if (currentLive?.streamId) {
          await leaveTrackedLiveSession(io, socket, "leave");
        } else if (sessionId) {
          await livestreamService.leaveLiveStream(sessionId).catch(() => null);
          if (streamId) {
            await emitViewerCount(io, streamId).catch(() => null);
          }
        }

        callback?.({ ok: true, streamId });
        socket.emit("live:left", { ok: true, streamId });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to leave livestream" });
        socket.emit("live:error", { error: error.message || "Unable to leave livestream" });
      }
    });

    socket.on("live:heartbeat", async (data = {}, callback) => {
      try {
        const sessionId = idOf(data.sessionId || socket.data.livestream?.sessionId);
        if (!sessionId) {
          callback?.({ ok: false, error: "Session ID required" });
          return;
        }

        await livestreamService.touchLiveSession(sessionId);
        callback?.({ ok: true, timestamp: nowIso() });
      } catch {
        callback?.({ ok: false, error: "Unable to update live session" });
      }
    });

    const handleLiveComment = async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const text = textFromLiveValue(data.text ?? data.message ?? data.body ?? data.comment, "").slice(0, 500);
        const clientId = String(data.clientId || data.id || "").slice(0, 120);

        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }

        if (!text) {
          callback?.({ ok: false, error: "Comment text required" });
          return;
        }

        ensureSocketInLiveRoom(socket, streamId);

        // Check for duplicate client ID
        if (markDedupeId(socket, "comment", clientId)) {
          callback?.({ ok: true, duplicate: true });
          return;
        }

        // Check rate limiting
        if (isRateLimited(socket, "comment", COMMENT_RATE_LIMIT_MS)) {
          callback?.({ ok: false, error: "Slow down before sending another comment" });
          return;
        }

        // Check for spam messages (repeated comments)
        if (isSpamMessage(socket, text, 5000, 2)) {
          callback?.({ ok: false, error: "Please avoid repeating messages" });
          return;
        }

        // Get stream and check moderation settings
        const stream = await livestreamService.getStreamDetails(streamId).catch(() => null);
        if (!stream?.stream) {
          callback?.({ ok: false, error: "Stream not found" });
          return;
        }

        const moderationSettings = getModerationSettings(stream.stream);

        // Check if user is blocked
        if (isUserBlocked(socket, moderationSettings.blockedUsers)) {
          callback?.({ ok: false, error: "You are not allowed to comment in this live" });
          return;
        }

        // Check if comments are disabled
        if (!moderationSettings.commentsEnabled) {
          callback?.({ ok: false, error: "Comments are disabled for this live" });
          return;
        }

        // Validate comment content
        const filterResult = filterComment(text, {
          slowModeEnabled: false,
          followersOnlyMode: false,
          allowLinks: false,
          checkSpam: true,
          checkScams: true,
        });

        if (!filterResult.valid) {
          callback?.({ ok: false, error: filterResult.error });
          return;
        }

        const payload = {
          id: clientId || `${socket.id}:${Date.now()}`,
          streamId,
          ...viewerPayloadFor(socket, data.username),
          text: filterResult.text,
          timestamp: nowIso(),
        };

        emitLiveRoomEvent(io, streamId, "live:message", payload);
        callback?.({ ok: true, comment: payload });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to send comment" });
        socket.emit("live:error", { error: error.message || "Unable to send comment" });
      }
    };

    const handleLiveReaction = (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }

        ensureSocketInLiveRoom(socket, streamId);

        const reaction = VALID_REACTIONS.has(data.reaction) ? data.reaction : "heart";
        const payload = {
          id: `${socket.id}:${Date.now()}`,
          streamId,
          userId: idOf(socket.user?._id),
          reaction,
          timestamp: nowIso(),
        };

        emitLiveRoomEvent(io, streamId, "live:reaction", payload);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to send reaction" });
      }
    };

    const handleLiveGift = async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const clientId = String(data.clientId || data.id || "").slice(0, 120);
        if (!streamId || !data.giftId) {
          callback?.({ ok: false, error: "Gift payload required" });
          return;
        }

        ensureSocketInLiveRoom(socket, streamId);

        if (markDedupeId(socket, "gift", clientId)) {
          callback?.({ ok: true, duplicate: true });
          return;
        }

        if (isRateLimited(socket, "gift", GIFT_RATE_LIMIT_MS)) {
          callback?.({ ok: false, error: "Please wait before sending another gift" });
          return;
        }

        const gift = String(data.giftId || "").trim().toLowerCase();
        if (!VALID_GIFTS.has(gift)) {
          callback?.({ ok: false, error: "Gift is not available" });
          return;
        }

        const result = await livestreamService.sendLiveGift(streamId, socket.user?._id, gift, {
          clientId,
          senderSocketId: socket.id,
          senderName: socket.user?.username || socket.user?.name || "Viewer",
          senderAvatar: socket.user?.avatar || socket.user?.profilePicture || socket.user?.profileImage || "",
        });
        const senderWallet = formatWalletResponse(result.senderWallet);
        const receiverWallet = formatWalletResponse(result.receiverWallet);
        const sendTransaction = formatTransactionResponse(result.sendTransaction);
        const receiveTransaction = formatTransactionResponse(result.receiveTransaction);
        const creatorId = idOf(result.stream?.creatorId);
        const payload = {
          id: result.sendTransaction?._id?.toString?.() || `${socket.id}:${Date.now()}`,
          streamId,
          ...viewerPayloadFor(socket),
          gift,
          giftId: result.gift.id,
          giftName: result.gift.name,
          animation: result.gift.animation,
          animationStyle: result.gift.animationStyle,
          animationDuration: result.gift.animationDuration,
          tier: result.gift.tier,
          rarity: result.gift.rarity,
          emoji: result.gift.emoji,
          color: result.gift.color,
          colors: result.gift.colors || [],
          comboMultiplier: result.gift.comboMultiplier || 1,
          fullscreen: Boolean(result.gift.fullscreen || result.gift.special),
          special: Boolean(result.gift.special),
          soundReady: Boolean(result.gift.soundReady),
          soundHook: result.gift.sound || result.gift.soundHook || `gift-${result.gift.id.replace(/_/g, "-")}`,
          value: result.gift.pointsCost,
          topSupporters: result.topSupporters || [],
          clientId,
          transactionId: result.sendTransaction?._id?.toString?.() || "",
          timestamp: nowIso(),
        };

        socket.emit("wallet:update", senderWallet);
        socket.emit("wallet:gift", {
          type: "live_gift_sent",
          giftId: result.gift.id,
          giftName: result.gift.name,
          amount: result.gift.pointsCost,
          wallet: senderWallet,
          transaction: sendTransaction,
          message: `${result.gift.name} sent`,
        });

        if (creatorId) {
          io.to(creatorId).emit("wallet:update", receiverWallet);
          io.to(creatorId).emit("wallet:reward", {
            type: "live_gift_received",
            giftId: result.gift.id,
            giftName: result.gift.name,
            amount: result.gift.pointsCost,
            wallet: receiverWallet,
            transaction: receiveTransaction,
            fromUserId: idOf(socket.user?._id),
            fromUserName: socket.user?.username || socket.user?.name || "Viewer",
            message: `${socket.user?.username || socket.user?.name || "Viewer"} sent ${result.gift.name}`,
          });
          createNotification({
            userId: creatorId,
            actorId: socket.user?._id,
            type: "monetization",
            title: "Live gift received",
            message: `${socket.user?.username || socket.user?.name || "A viewer"} sent ${result.gift.name}`,
            data: { streamId, giftId: result.gift.id, amount: result.gift.pointsCost },
            dedupeKey: `live-gift:${payload.id}`,
          }).catch(() => null);
        }

        emitLiveRoomEvent(io, streamId, "live:gift", payload);
        callback?.({ ok: true, gift: payload, wallet: senderWallet, transaction: sendTransaction });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to send gift" });
      }
    };

    socket.on("live:message", handleLiveComment);
    socket.on("live:reaction", handleLiveReaction);
    socket.on("live:double-tap", (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }

        ensureSocketInLiveRoom(socket, streamId);

        const payload = {
          id: `${socket.id}:${Date.now()}`,
          streamId,
          userId: idOf(socket.user?._id),
          x: Number(data.x) || 0,
          y: Number(data.y) || 0,
          reaction: "heart",
          timestamp: nowIso(),
        };

        emitLiveRoomEvent(io, streamId, "live:double-tap", payload);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: error.message });
      }
    });
    socket.on("live:gift", handleLiveGift);

    socket.on("live:viewers:list", (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }

        ensureSocketInLiveRoom(socket, streamId);
        upsertLiveRoomMember(streamId, socket, { username: data.username });
        callback?.({ ok: true, ...roomSnapshotFor(streamId) });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to load viewers" });
      }
    });

    socket.on("live:panel-request", (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const viewerUserId = idOf(socket.user?._id);
        if (!streamId || !viewerUserId) {
          callback?.({ ok: false, error: "Sign in to request panel access" });
          return;
        }

        cleanupExpiredPanelState(io, streamId);
        ensureSocketInLiveRoom(socket, streamId);
        const state = stateFor(streamId);
        const member = upsertLiveRoomMember(streamId, socket, { username: data.username });
        const requestKey = pendingRequestKeyFor(streamId, viewerUserId);

        if (member.isHost) {
          callback?.({ ok: false, error: "Host is already on panel" });
          return;
        }
        if (state.panelLocked) {
          callback?.({ ok: false, error: "Panel requests are locked" });
          return;
        }
        if (state.panel.size >= LIVE_PANEL_LIMIT) {
          callback?.({ ok: false, error: "Panel is full" });
          return;
        }
        if (Array.from(state.panel.values()).some((guest) => guest.userId === viewerUserId)) {
          callback?.({ ok: false, error: "You are already on panel" });
          return;
        }
        const existing = state.requests.get(requestKey);
        if (existing?.status === "pending") {
          callback?.({ ok: true, request: serializePanelRequest(existing), roomState: roomSnapshotFor(streamId), duplicate: true });
          return;
        }
        if (isRateLimited(socket, "panel-request", PANEL_REQUEST_RATE_LIMIT_MS)) {
          callback?.({ ok: false, error: "Please wait before requesting again" });
          return;
        }

        const request = {
          requestId: `panel-request:${streamId}:${viewerUserId}:${Date.now()}`,
          streamId,
          viewerUserId,
          viewerSocketId: socket.id,
          username: member.username,
          avatar: member.avatar,
          status: "pending",
          createdAt: nowIso(),
        };
        state.requests.set(requestKey, request);
        const roomState = emitLiveRoomState(io, streamId);
        hostMembersFor(streamId).forEach((host) => io.to(host.socketId).emit("live:panel-request", {
          streamId,
          request: serializePanelRequest(request),
          roomState,
          timestamp: nowIso(),
        }));
        callback?.({ ok: true, request: serializePanelRequest(request), roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to request panel" });
      }
    });

    socket.on("live:panel-request-cancel", (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const viewerUserId = idOf(socket.user?._id);
        if (!streamId || !viewerUserId) {
          callback?.({ ok: false, error: "Stream and viewer required" });
          return;
        }
        const state = stateFor(streamId);
        const requestKey = pendingRequestKeyFor(streamId, viewerUserId);
        const existing = state.requests.get(requestKey);
        if (existing?.status === "pending") {
          state.requests.set(requestKey, { ...existing, status: "cancelled" });
        }
        const roomState = emitLiveRoomState(io, streamId);
        emitLiveRoomEvent(io, streamId, "live:panel-request-cancelled", { streamId, viewerUserId, roomState, timestamp: nowIso() });
        callback?.({ ok: true, roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to cancel panel request" });
      }
    });

    const handlePanelRequestDecision = async (approved, data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const targetUserId = idOf(data.viewerUserId || data.userId);
        if (!streamId || !targetUserId) {
          callback?.({ ok: false, error: "Stream and viewer required" });
          return;
        }
        if (!(await socketIsHost(streamId, socket))) {
          callback?.({ ok: false, error: "Only host can manage panel requests" });
          return;
        }

        cleanupExpiredPanelState(io, streamId);
        const state = stateFor(streamId);
        if (approved && state.panel.size >= LIVE_PANEL_LIMIT) {
          callback?.({ ok: false, error: "Panel is full" });
          return;
        }
        const requestKey = pendingRequestKeyFor(streamId, targetUserId);
        const request = state.requests.get(requestKey);
        if (!request || request.status !== "pending") {
          callback?.({ ok: false, error: "Panel request is no longer pending" });
          return;
        }

        const nextRequest = { ...request, status: approved ? "approved" : "rejected", approvedAt: approved ? nowIso() : undefined };
        state.requests.set(requestKey, nextRequest);
        if (approved && request.viewerSocketId) {
          io.to(request.viewerSocketId).emit("live:panel-request-approved", {
            streamId,
            request: serializePanelRequest(nextRequest),
            panelLimit: LIVE_PANEL_LIMIT,
            timestamp: nowIso(),
          });
        } else if (request.viewerSocketId) {
          io.to(request.viewerSocketId).emit("live:panel-request-rejected", {
            streamId,
            request: serializePanelRequest(nextRequest),
            timestamp: nowIso(),
          });
        }
        const roomState = emitLiveRoomState(io, streamId);
        callback?.({ ok: true, request: serializePanelRequest(nextRequest), roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to update panel request" });
      }
    };

    socket.on("live:panel-request-approved", (data = {}, callback) => handlePanelRequestDecision(true, data, callback));
    socket.on("live:panel-request-rejected", (data = {}, callback) => handlePanelRequestDecision(false, data, callback));
    socket.on("live:panel-accept", (data = {}, callback) => handlePanelRequestDecision(true, data, callback));
    socket.on("live:panel-reject", (data = {}, callback) => handlePanelRequestDecision(false, data, callback));

    socket.on("live:panel-invite", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const targetId = idOf(data.userId || data.socketId);
        if (!streamId || !targetId) {
          callback?.({ ok: false, error: "Stream and viewer required" });
          return;
        }
        if (!(await socketIsHost(streamId, socket))) {
          callback?.({ ok: false, error: "Only host can invite viewers" });
          return;
        }

        cleanupExpiredPanelState(io, streamId);
        const state = stateFor(streamId);
        if (state.panel.size >= LIVE_PANEL_LIMIT) {
          callback?.({ ok: false, error: "Panel is full" });
          return;
        }
        const member = findLiveRoomMember(streamId, targetId);
        if (!member || member.isHost) {
          callback?.({ ok: false, error: "Viewer is not in this live" });
          return;
        }
        const inviteKey = pendingInviteKeyFor(streamId, member.userId);
        const existing = state.invites.get(inviteKey);
        if (existing?.status === "pending") {
          callback?.({ ok: true, invite: serializePanelInvite(existing), roomState: roomSnapshotFor(streamId), duplicate: true });
          return;
        }

        const invite = {
          inviteId: `panel-invite:${streamId}:${member.userId}:${Date.now()}`,
          streamId,
          hostUserId: idOf(socket.user?._id),
          viewerUserId: member.userId,
          viewerSocketId: member.socketId,
          username: member.username,
          avatar: member.avatar,
          status: "pending",
          createdAt: nowIso(),
        };
        state.invites.set(inviteKey, invite);
        io.to(member.socketId).emit("live:panel-invite", {
          streamId,
          invite: serializePanelInvite(invite),
          timestamp: nowIso(),
        });
        const roomState = emitLiveRoomState(io, streamId);
        callback?.({ ok: true, invite: serializePanelInvite(invite), roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to invite viewer" });
      }
    });

    const handleInviteDecision = async (accepted, data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const viewerUserId = idOf(socket.user?._id);
        if (!streamId || !viewerUserId) {
          callback?.({ ok: false, error: "Stream and viewer required" });
          return;
        }
        const state = stateFor(streamId);
        const inviteKey = pendingInviteKeyFor(streamId, viewerUserId);
        const invite = state.invites.get(inviteKey);
        if (!invite || invite.status !== "pending") {
          callback?.({ ok: false, error: "Panel invite is no longer pending" });
          return;
        }
        state.invites.set(inviteKey, { ...invite, status: accepted ? "approved" : "rejected" });
        if (!accepted) {
          const roomState = emitLiveRoomState(io, streamId);
          hostMembersFor(streamId).forEach((host) => io.to(host.socketId).emit("live:panel-invite-declined", { streamId, invite: serializePanelInvite(invite), roomState, timestamp: nowIso() }));
          callback?.({ ok: true, roomState });
          return;
        }
        callback?.({ ok: true, invite: serializePanelInvite({ ...invite, status: "approved" }), roomState: roomSnapshotFor(streamId) });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to update panel invite" });
      }
    };

    socket.on("live:panel-invite-accepted", (data = {}, callback) => handleInviteDecision(true, data, callback));
    socket.on("live:panel-invite-declined", (data = {}, callback) => handleInviteDecision(false, data, callback));

    socket.on("live:panel-guest-joined", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const viewerUserId = idOf(socket.user?._id);
        if (!streamId || !viewerUserId) {
          callback?.({ ok: false, error: "Stream and viewer required" });
          return;
        }
        const state = stateFor(streamId);
        if (state.panel.size >= LIVE_PANEL_LIMIT) {
          callback?.({ ok: false, error: "Panel is full" });
          return;
        }
        const request = state.requests.get(pendingRequestKeyFor(streamId, viewerUserId));
        const invite = state.invites.get(pendingInviteKeyFor(streamId, viewerUserId));
        const allowed = request?.status === "approved" || invite?.status === "approved";
        if (!allowed) {
          callback?.({ ok: false, error: "Host approval is required before joining panel" });
          return;
        }
        const member = upsertLiveRoomMember(streamId, socket, { username: data.username, role: "guest" });
        const panelMember = {
          ...member,
          role: "guest",
          muted: Boolean(data.muted),
          micEnabled: data.micEnabled !== false,
          cameraEnabled: data.cameraEnabled !== false,
          connectionStatus: "connecting",
          joinedAt: nowIso(),
        };
        state.panel.set(socket.id, panelMember);
        const roomState = emitLiveRoomState(io, streamId);
        emitLiveRoomEvent(io, streamId, "live:panel-guest-joined", { streamId, panelUser: serializeMember(panelMember), roomState, timestamp: nowIso() });
        hostMembersFor(streamId).forEach((host) => io.to(host.socketId).emit("live:panel-guest-ready", { streamId, guestSocketId: socket.id, guest: serializeMember(panelMember), timestamp: nowIso() }));
        callback?.({ ok: true, panelUser: serializeMember(panelMember), roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to join panel" });
      }
    });

    socket.on("live:panel-guest-left", (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }
        const state = stateFor(streamId);
        state.panel.delete(socket.id);
        const roomState = emitLiveRoomState(io, streamId);
        emitLiveRoomEvent(io, streamId, "live:panel-guest-left", { streamId, socketId: socket.id, userId: idOf(socket.user?._id), roomState, timestamp: nowIso() });
        callback?.({ ok: true, roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to leave panel" });
      }
    });

    socket.on("live:panel-remove", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const targetId = idOf(data.userId || data.socketId);
        if (!streamId || !targetId) {
          callback?.({ ok: false, error: "Stream and panel user required" });
          return;
        }
        if (!(await socketIsHost(streamId, socket))) {
          callback?.({ ok: false, error: "Only host can remove panel guests" });
          return;
        }
        const state = stateFor(streamId);
        const member = findLiveRoomMember(streamId, targetId);
        if (!member || member.isHost || !state.panel.has(member.socketId)) {
          callback?.({ ok: false, error: "Panel guest not found" });
          return;
        }
        state.panel.delete(member.socketId);
        io.to(member.socketId).emit("live:panel-guest-removed", { streamId, reason: data.reason || "removed", timestamp: nowIso() });
        io.to(member.socketId).emit("live:panel-removed", { streamId, reason: data.reason || "removed", timestamp: nowIso() });
        const roomState = emitLiveRoomState(io, streamId);
        emitLiveRoomEvent(io, streamId, "live:panel-guest-removed", { streamId, panelUser: serializeMember(member), roomState, timestamp: nowIso() });
        callback?.({ ok: true, roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to remove panel user" });
      }
    });

    socket.on("live:panel-mute", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const targetId = idOf(data.userId || data.socketId);
        if (!streamId || !targetId) {
          callback?.({ ok: false, error: "Stream and panel user required" });
          return;
        }
        if (!(await socketIsHost(streamId, socket))) {
          callback?.({ ok: false, error: "Only host can mute panel guests" });
          return;
        }
        const state = stateFor(streamId);
        const member = findLiveRoomMember(streamId, targetId);
        if (!member || !state.panel.has(member.socketId) || member.isHost) {
          callback?.({ ok: false, error: "Panel guest not found" });
          return;
        }
        const panelMember = { ...state.panel.get(member.socketId), muted: data.muted !== false, micEnabled: data.muted === false };
        state.panel.set(member.socketId, panelMember);
        io.to(member.socketId).emit("live:panel-muted", { streamId, muted: panelMember.muted, timestamp: nowIso() });
        const roomState = emitLiveRoomState(io, streamId);
        callback?.({ ok: true, panelUser: serializeMember(panelMember), roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to mute panel guest" });
      }
    });

    socket.on("live:panel-hide-video", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const targetId = idOf(data.userId || data.socketId);
        if (!streamId || !targetId) {
          callback?.({ ok: false, error: "Stream and panel user required" });
          return;
        }
        if (!(await socketIsHost(streamId, socket))) {
          callback?.({ ok: false, error: "Only host can hide guest video" });
          return;
        }
        const state = stateFor(streamId);
        const member = findLiveRoomMember(streamId, targetId);
        if (!member || !state.panel.has(member.socketId) || member.isHost) {
          callback?.({ ok: false, error: "Panel guest not found" });
          return;
        }
        const panelMember = { ...state.panel.get(member.socketId), cameraEnabled: data.hidden === true ? false : data.cameraEnabled !== false };
        state.panel.set(member.socketId, panelMember);
        io.to(member.socketId).emit("live:panel-video-hidden", { streamId, hidden: !panelMember.cameraEnabled, timestamp: nowIso() });
        const roomState = emitLiveRoomState(io, streamId);
        callback?.({ ok: true, panelUser: serializeMember(panelMember), roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to hide panel guest video" });
      }
    });

    socket.on("live:panel-layout-changed", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const layout = String(data.layout || "").trim();
        if (!streamId || !VALID_PANEL_LAYOUTS.has(layout)) {
          callback?.({ ok: false, error: "Valid panel layout required" });
          return;
        }
        if (!(await socketIsHost(streamId, socket))) {
          callback?.({ ok: false, error: "Only host can change panel layout" });
          return;
        }
        const state = stateFor(streamId);
        state.layout = layout;
        const roomState = emitLiveRoomState(io, streamId);
        emitLiveRoomEvent(io, streamId, "live:panel-layout-changed", { streamId, layout, roomState, timestamp: nowIso() });
        callback?.({ ok: true, layout, roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to change panel layout" });
      }
    });

    socket.on("live:panel-locked", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }
        if (!(await socketIsHost(streamId, socket))) {
          callback?.({ ok: false, error: "Only host can lock panel requests" });
          return;
        }
        const state = stateFor(streamId);
        state.panelLocked = data.locked !== false;
        const roomState = emitLiveRoomState(io, streamId);
        emitLiveRoomEvent(io, streamId, "live:panel-locked", { streamId, locked: state.panelLocked, roomState, timestamp: nowIso() });
        callback?.({ ok: true, locked: state.panelLocked, roomState });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to update panel lock" });
      }
    });
    socket.on("live:report", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }

        if (isRateLimited(socket, "report", 5000)) {
          callback?.({ ok: false, error: "Report already sent" });
          return;
        }

        const details = await livestreamService.getStreamDetails(streamId);
        const report = {
          reporterId: idOf(socket.user?._id),
          reporterName: socket.user?.username || socket.user?.name || "Viewer",
          reason: String(data.reason || data.type || "live_report").slice(0, 120),
          message: String(data.message || "").slice(0, 500),
          createdAt: nowIso(),
        };

        details.stream.metadata = details.stream.metadata || {};
        details.stream.metadata.liveReports = [report, ...((details.stream.metadata.liveReports || []).slice(0, 99))];
        details.stream.markModified("metadata");
        await details.stream.save();

        const creatorId = idOf(details.stream.creatorId);
        if (creatorId) {
          io.to(creatorId).emit("live:report-received", {
            streamId,
            report,
            timestamp: nowIso(),
          });
        }

        callback?.({ ok: true, report });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to report live" });
      }
    });

    // ========== MODERATION HANDLERS ==========
    socket.on("live:mute-user", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const userIdToMute = idOf(data.userId);

        if (!streamId || !userIdToMute) {
          callback?.({ ok: false, error: "Stream ID and User ID required" });
          return;
        }

        // Get stream and verify ownership
        const stream = await livestreamService.getStreamDetails(streamId).catch(() => null);
        if (!stream?.stream || idOf(stream.stream.creatorId) !== idOf(socket.user?._id)) {
          callback?.({ ok: false, error: "Only stream creator can mute users" });
          return;
        }

        // Add user to muted list
        if (!stream.stream.settings) stream.stream.settings = {};
        if (!stream.stream.settings.mutedUsers) stream.stream.settings.mutedUsers = [];

        if (!stream.stream.settings.mutedUsers.some((id) => id.toString?.() === userIdToMute || id === userIdToMute)) {
          stream.stream.settings.mutedUsers.push(userIdToMute);
          await stream.stream.save();
        }

        emitLiveRoomEvent(io, streamId, "live:user-muted", {
          streamId,
          userId: userIdToMute,
          timestamp: nowIso(),
        });

        callback?.({ ok: true, message: "User muted" });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to mute user" });
      }
    });

    socket.on("live:unmute-user", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const userIdToUnmute = idOf(data.userId);

        if (!streamId || !userIdToUnmute) {
          callback?.({ ok: false, error: "Stream ID and User ID required" });
          return;
        }

        // Get stream and verify ownership
        const stream = await livestreamService.getStreamDetails(streamId).catch(() => null);
        if (!stream?.stream || idOf(stream.stream.creatorId) !== idOf(socket.user?._id)) {
          callback?.({ ok: false, error: "Only stream creator can unmute users" });
          return;
        }

        // Remove user from muted list
        if (stream.stream.settings?.mutedUsers) {
          stream.stream.settings.mutedUsers = stream.stream.settings.mutedUsers.filter(
            (id) => id.toString?.() !== userIdToUnmute && id !== userIdToUnmute
          );
          await stream.stream.save();
        }

        emitLiveRoomEvent(io, streamId, "live:user-unmuted", {
          streamId,
          userId: userIdToUnmute,
          timestamp: nowIso(),
        });

        callback?.({ ok: true, message: "User unmuted" });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to unmute user" });
      }
    });

    socket.on("live:block-user", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const userIdToBlock = idOf(data.userId);

        if (!streamId || !userIdToBlock) {
          callback?.({ ok: false, error: "Stream ID and User ID required" });
          return;
        }

        // Get stream and verify ownership
        const stream = await livestreamService.getStreamDetails(streamId).catch(() => null);
        if (!stream?.stream || idOf(stream.stream.creatorId) !== idOf(socket.user?._id)) {
          callback?.({ ok: false, error: "Only stream creator can block users" });
          return;
        }

        // Add user to blocked list
        if (!stream.stream.settings) stream.stream.settings = {};
        if (!stream.stream.settings.blockedUsers) stream.stream.settings.blockedUsers = [];

        if (!stream.stream.settings.blockedUsers.some((id) => id.toString?.() === userIdToBlock || id === userIdToBlock)) {
          stream.stream.settings.blockedUsers.push(userIdToBlock);
          await stream.stream.save();
        }

        // Emit event to kick user from live
        io.to(userIdToBlock).emit("live:blocked-from-stream", {
          streamId,
          reason: data.reason || "Blocked by creator",
          timestamp: nowIso(),
        });

        emitLiveRoomEvent(io, streamId, "live:user-blocked", {
          streamId,
          userId: userIdToBlock,
          timestamp: nowIso(),
        });

        callback?.({ ok: true, message: "User blocked" });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to block user" });
      }
    });

    const relayWebRtcPayload = async (eventName, data = {}, callback) => {
      const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
      const targetSocketId = String(data.targetSocketId || data.to || "").trim();

      if (!streamId || !targetSocketId) {
        callback?.({ ok: false, error: "Realtime video target required" });
        return;
      }

      ensureSocketInLiveRoom(socket, streamId);

      if (eventName === "live:webrtc-offer" && !(await socketIsHost(streamId, socket))) {
        traceWebRtc("signal-rejected", { eventName, streamId, fromSocketId: socket.id, targetSocketId, reason: "sender-not-host" });
        callback?.({ ok: false, error: "Only the authenticated host can send live video offers" });
        return;
      }

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      const liveRoom = roomFor(streamId);
      if (!targetSocket?.rooms?.has(liveRoom)) {
        traceWebRtc("signal-rejected", { eventName, streamId, fromSocketId: socket.id, targetSocketId, reason: "target-not-in-room" });
        callback?.({ ok: false, error: "Realtime video peer is not in this livestream room" });
        return;
      }

      traceWebRtc(eventName === "live:webrtc-ice" ? "ice-received" : `${eventName.replace("live:webrtc-", "")}-received`, { streamId, fromSocketId: socket.id, targetSocketId });
      io.to(targetSocketId).emit(eventName, {
        ...data,
        streamId,
        targetSocketId,
        fromSocketId: socket.id,
        timestamp: nowIso(),
      });
      callback?.({ ok: true });
    };

    socket.on("live:creator-ready", async (data = {}, callback) => {
      const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
      if (!streamId) {
        callback?.({ ok: false, error: "Stream ID required" });
        return;
      }

      ensureSocketInLiveRoom(socket, streamId);
      if (!(await socketIsHost(streamId, socket))) {
        callback?.({ ok: false, error: "Only the host can publish live video" });
        return;
      }
      upsertLiveRoomMember(streamId, socket, { isHost: true, role: "host" });

      traceWebRtc("creator-ready", { streamId, creatorSocketId: socket.id });
      socket.to(roomFor(streamId)).emit("live:creator-ready", {
        streamId,
        creatorSocketId: socket.id,
        timestamp: nowIso(),
      });
      callback?.({ ok: true });
    });

    socket.on("live:request-video", (data = {}, callback) => {
      const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
      if (!streamId) {
        callback?.({ ok: false, error: "Stream ID required" });
        return;
      }

      ensureSocketInLiveRoom(socket, streamId);
      upsertLiveRoomMember(streamId, socket, { username: data.username });

      const payload = {
        streamId,
        viewerSocketId: socket.id,
        viewer: viewerPayloadFor(socket, data.username),
        timestamp: nowIso(),
      };
      const hosts = hostMembersFor(streamId).filter((member) => member.socketId !== socket.id);

      traceWebRtc("viewer-ready", { streamId, viewerSocketId: socket.id, hostSocketIds: hosts.map((host) => host.socketId) });
      if (hosts.length) {
        hosts.forEach((host) => io.to(host.socketId).emit("live:viewer-ready", payload));
      } else {
        socket.to(roomFor(streamId)).emit("live:viewer-ready", payload);
      }

      callback?.({ ok: true, hosts: hosts.length });
    });

    socket.on("live:webrtc-offer", (data = {}, callback) => relayWebRtcPayload("live:webrtc-offer", data, callback));
    socket.on("live:webrtc-answer", (data = {}, callback) => relayWebRtcPayload("live:webrtc-answer", data, callback));
    socket.on("live:webrtc-ice", (data = {}, callback) => relayWebRtcPayload("live:webrtc-ice", data, callback));

    socket.on("live:update_viewers", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }

        const viewers = await emitViewerCount(io, streamId);
        callback?.({ ok: true, ...viewers });
      } catch {
        callback?.({ ok: false, error: "Unable to update viewers" });
      }
    });

    socket.on("disconnect", () => {
      leaveTrackedLiveSession(io, socket, "disconnect").catch(() => null);
    });
  });
};

module.exports = { setupLiveStreamSockets };
