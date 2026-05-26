// @ts-nocheck
/**
 * Livestream Socket Handler
 * Handles realtime livestream events and keeps viewer sessions in sync.
 */

const livestreamService = require("./livestreamService");
const { formatWalletResponse, formatTransactionResponse } = require("../wallet/walletUtils");
const { GIFT_DEFINITIONS } = require("../wallet/walletConstants");
const { createNotification } = require("../../utils/notifications");

const VALID_REACTIONS = new Set(["heart", "fire", "clap", "wow", "laugh", "cry"]);
const VALID_GIFTS = new Set(Object.values(GIFT_DEFINITIONS).map((gift) => gift.id));

const roomFor = (streamId) => `stream:${streamId}`;
const idOf = (value) => value?._id?.toString?.() || value?.id?.toString?.() || value?.toString?.() || "";
const nowIso = () => new Date().toISOString();

const viewerPayloadFor = (socket, fallbackName = "Guest") => ({
  userId: idOf(socket.user?._id),
  username: socket.user?.username || socket.user?.name || fallbackName || "Guest",
  avatar: socket.user?.avatar || socket.user?.profilePicture || socket.user?.profileImage || "",
});

const emitViewerCount = async (io, streamId) => {
  const details = await livestreamService.getStreamDetails(streamId);
  const viewerCount = details.stats?.currentViewers ?? details.stream.viewerCount ?? 0;
  const maxViewers = details.stream.maxViewers || viewerCount;

  const payload = {
    streamId,
    viewerCount,
    maxViewers,
  };

  io.to(roomFor(streamId)).emit("livestream:viewers_updated", payload);
  io.emit("livestream:viewers_updated_global", payload);

  return { viewerCount, maxViewers };
};

const leaveTrackedLiveSession = async (io, socket, reason = "leave") => {
  const live = socket.data.livestream;

  if (!live?.streamId) {
    return null;
  }

  socket.leave(roomFor(live.streamId));
  socket.data.livestream = null;

  if (live.sessionId) {
    await livestreamService.leaveLiveStream(live.sessionId).catch(() => null);
  }

  io.to(roomFor(live.streamId)).emit("livestream:viewer_left", {
    streamId: live.streamId,
    viewer: viewerPayloadFor(socket),
    reason,
    timestamp: nowIso(),
  });

  return emitViewerCount(io, live.streamId).catch(() => null);
};

const setupLiveStreamSockets = (io) => {
  io.on("connection", (socket) => {
    socket.on("livestream:join", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          socket.emit("livestream:error", { error: "Stream ID required" });
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

        const viewers = await emitViewerCount(io, streamId);
        io.to(roomFor(streamId)).emit("livestream:viewer_joined", {
          streamId,
          viewer: viewerPayloadFor(socket, data.username),
          timestamp: nowIso(),
        });

        const response = {
          ok: true,
          streamId,
          sessionId,
          viewerCount: viewers?.viewerCount ?? streamPayload?.viewerCount ?? 0,
        };
        socket.emit("livestream:joined", response);
        callback?.(response);
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to join livestream" });
        socket.emit("livestream:error", { error: error.message || "Unable to join livestream" });
      }
    });

    socket.on("livestream:leave", async (data = {}, callback) => {
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
        socket.emit("livestream:left", { ok: true, streamId });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to leave livestream" });
        socket.emit("livestream:error", { error: error.message || "Unable to leave livestream" });
      }
    });

    socket.on("livestream:heartbeat", async (data = {}, callback) => {
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

    socket.on("livestream:comment", (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        const text = String(data.text || "").trim().slice(0, 500);

        if (!streamId || !text) {
          callback?.({ ok: false, error: "Comment text required" });
          return;
        }

        const payload = {
          id: `${socket.id}:${Date.now()}`,
          streamId,
          ...viewerPayloadFor(socket, data.username),
          text,
          timestamp: nowIso(),
        };

        io.to(roomFor(streamId)).emit("livestream:comment", payload);
        callback?.({ ok: true, comment: payload });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to send comment" });
        socket.emit("livestream:error", { error: error.message || "Unable to send comment" });
      }
    });

    socket.on("livestream:reaction", (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId) {
          callback?.({ ok: false, error: "Stream ID required" });
          return;
        }

        const reaction = VALID_REACTIONS.has(data.reaction) ? data.reaction : "heart";
        const payload = {
          id: `${socket.id}:${Date.now()}`,
          streamId,
          userId: idOf(socket.user?._id),
          reaction,
          timestamp: nowIso(),
        };

        io.to(roomFor(streamId)).emit("livestream:reaction", payload);
        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to send reaction" });
      }
    });

    socket.on("livestream:gift", async (data = {}, callback) => {
      try {
        const streamId = idOf(data.streamId || socket.data.livestream?.streamId);
        if (!streamId || !data.giftId) {
          callback?.({ ok: false, error: "Gift payload required" });
          return;
        }

        const gift = VALID_GIFTS.has(data.giftId) ? data.giftId : "rose";
        const result = await livestreamService.sendLiveGift(streamId, socket.user?._id, gift, {
          senderSocketId: socket.id,
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
          value: result.gift.pointsCost,
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

        io.to(roomFor(streamId)).emit("livestream:gift", payload);
        callback?.({ ok: true, gift: payload, wallet: senderWallet, transaction: sendTransaction });
      } catch (error) {
        callback?.({ ok: false, error: error.message || "Unable to send gift" });
      }
    });

    socket.on("livestream:update_viewers", async (data = {}, callback) => {
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
