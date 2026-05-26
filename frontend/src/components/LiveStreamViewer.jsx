// @ts-nocheck
import {
  Crown,
  Gift,
  Heart,
  Loader2,
  MessageCircle,
  Radio,
  Send,
  Share2,
  Smile,
  Sparkles,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SafeAvatar from "./SafeAvatar.jsx";
import { connectSocket } from "../services/socket";
import { useLiveStreamStore } from "../store/livestreamStore";
import { useAuth } from "../context/AuthContext.jsx";

const MAX_COMMENTS = 120;
const HEARTBEAT_MS = 25000;

const reactionMeta = {
  heart: { Icon: Heart, className: "bg-red-500 text-white" },
  fire: { Icon: Zap, className: "bg-orange-500 text-white" },
  clap: { Icon: Sparkles, className: "bg-blue-500 text-white" },
  wow: { Icon: Smile, className: "bg-violet-500 text-white" },
  laugh: { Icon: Smile, className: "bg-emerald-500 text-white" },
  cry: { Icon: Heart, className: "bg-sky-500 text-white" },
};

const giftOptions = [
  { id: "rose", name: "Rose", value: 10, Icon: Heart },
  { id: "fire", name: "Fire", value: 50, Icon: Zap },
  { id: "crown", name: "Crown", value: 100, Icon: Crown },
  { id: "diamond", name: "Diamond", value: 500, Icon: Sparkles },
];

const userIdFor = (user) => user?._id || user?.id || "";

const LiveStreamViewer = ({ streamId, onClose }) => {
  const navigate = useNavigate();
  const { user: currentUser, token } = useAuth();
  const socketRef = useRef(null);
  const sessionIdRef = useRef("");
  const heartbeatRef = useRef(null);
  const reactionTimersRef = useRef(new Set());
  const mountedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reactionQueue, setReactionQueue] = useState([]);
  const [showGiftMenu, setShowGiftMenu] = useState(false);
  const [localLoading, setLocalLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [ended, setEnded] = useState(false);

  const {
    currentStream,
    clearCurrentStream,
    endLiveStream,
    getStreamDetails,
    joinLiveStream,
    leaveLiveStream,
    removeLiveStream,
    updateViewerCount,
    upsertLiveStream,
  } = useLiveStreamStore();

  const creator = currentStream?.creator || {};
  const isCreator = userIdFor(currentUser) && userIdFor(currentUser) === (creator.id || currentStream?.creatorId);
  const commentsEnabled = currentStream?.settings?.commentsEnabled !== false;
  const reactionsEnabled = currentStream?.settings?.allowReactions !== false;
  const giftsEnabled = currentStream?.settings?.giftsEnabled !== false;

  const streamBackground = useMemo(() => {
    if (currentStream?.coverImage) {
      return { backgroundImage: `linear-gradient(to bottom, rgba(2,6,23,0.15), rgba(2,6,23,0.72)), url(${currentStream.coverImage})` };
    }
    return {};
  }, [currentStream?.coverImage]);

  const addReactionBubble = (data) => {
    const id = data.id || `${data.reaction || "heart"}:${Date.now()}:${Math.random()}`;
    setReactionQueue((current) => [
      ...current,
      {
        ...data,
        id,
        driftX: -60 - Math.random() * 120,
        driftY: -240 - Math.random() * 90,
        right: 72 + Math.random() * 24,
        bottom: 120 + Math.random() * 80,
      },
    ].slice(-24));

    const timer = window.setTimeout(() => {
      setReactionQueue((current) => current.filter((reaction) => reaction.id !== id));
      reactionTimersRef.current.delete(timer);
    }, 2100);
    reactionTimersRef.current.add(timer);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!streamId) return undefined;

    let canceled = false;
    const viewerName = currentUser?.username || currentUser?.name || "Guest";
    const activeSocket = connectSocket(token, { liveStreamId: streamId });
    socketRef.current = activeSocket;
    setLocalLoading(true);
    setEnded(false);
    setStatusMessage("");
    setComments([]);

    const cleanupSocketHandlers = () => {
      if (!activeSocket) return;
      activeSocket.off("livestream:comment", handleComment);
      activeSocket.off("livestream:reaction", handleReaction);
      activeSocket.off("livestream:gift", handleGift);
      activeSocket.off("livestream:viewers_updated", handleViewersUpdated);
      activeSocket.off("livestream:ended", handleEnded);
      activeSocket.off("livestream:metadata_updated", handleMetadataUpdated);
      activeSocket.off("livestream:error", handleSocketError);
      activeSocket.off("connect", emitSocketJoin);
    };

    const cleanupHeartbeat = () => {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    };

    function handleComment(data) {
      if (data.streamId && data.streamId !== streamId) return;
      setComments((current) => [...current.slice(-(MAX_COMMENTS - 1)), { ...data, id: data.id || `${Date.now()}:${Math.random()}` }]);
    }

    function handleReaction(data) {
      if (data.streamId && data.streamId !== streamId) return;
      addReactionBubble(data);
    }

    function handleGift(data) {
      if (data.streamId && data.streamId !== streamId) return;
      setStatusMessage(`${data.username || "Someone"} sent ${data.gift || "a gift"}`);
      window.setTimeout(() => mountedRef.current && setStatusMessage(""), 2400);
    }

    function handleViewersUpdated(data) {
      if (data.streamId && data.streamId !== streamId) return;
      updateViewerCount(Number(data.viewerCount || 0), data.maxViewers ?? null);
    }

    function handleEnded(data) {
      if (data.streamId && data.streamId !== streamId && data.stream?.id !== streamId) return;
      setEnded(true);
      setStatusMessage("Live has ended");
      removeLiveStream(streamId);
      window.setTimeout(() => {
        if (mountedRef.current) onCloseRef.current?.();
      }, 1200);
    }

    function handleMetadataUpdated(data) {
      if (data.stream?.id === streamId) {
        upsertLiveStream(data.stream);
      }
    }

    function handleSocketError(data) {
      setStatusMessage(data?.error || "Live connection needs a moment");
    }

    function emitSocketJoin() {
      if (!activeSocket || !streamId) return;
      activeSocket.emit("livestream:join", {
        streamId,
        sessionId: sessionIdRef.current,
        username: viewerName,
      });
    }

    const attachSocketHandlers = () => {
      if (!activeSocket) return;

      cleanupSocketHandlers();
      activeSocket.on("livestream:comment", handleComment);
      activeSocket.on("livestream:reaction", handleReaction);
      activeSocket.on("livestream:gift", handleGift);
      activeSocket.on("livestream:viewers_updated", handleViewersUpdated);
      activeSocket.on("livestream:ended", handleEnded);
      activeSocket.on("livestream:metadata_updated", handleMetadataUpdated);
      activeSocket.on("livestream:error", handleSocketError);
      activeSocket.on("connect", emitSocketJoin);

      if (activeSocket.connected) {
        emitSocketJoin();
      }

      cleanupHeartbeat();
      heartbeatRef.current = window.setInterval(() => {
        if (sessionIdRef.current && activeSocket.connected) {
          activeSocket.emit("livestream:heartbeat", { streamId, sessionId: sessionIdRef.current });
        }
      }, HEARTBEAT_MS);
    };

    const join = async () => {
      const detailsResult = await getStreamDetails(streamId);
      if (canceled) return;

      if (!detailsResult.ok) {
        setStatusMessage(detailsResult.error || "Unable to open live");
        setLocalLoading(false);
        return;
      }

      if (detailsResult.stream?.status === "ended" || detailsResult.stream?.isLive === false) {
        setEnded(true);
        setStatusMessage("Live has ended");
        setLocalLoading(false);
        return;
      }

      const joinResult = await joinLiveStream(streamId, viewerName);
      if (canceled) {
        if (joinResult.session?.id) {
          leaveLiveStream(joinResult.session.id);
        }
        return;
      }

      if (!joinResult.ok) {
        setStatusMessage(joinResult.error || "Unable to join live");
        setLocalLoading(false);
        return;
      }

      sessionIdRef.current = joinResult.session?.id || "";
      attachSocketHandlers();
      setLocalLoading(false);
    };

    join();

    return () => {
      canceled = true;
      cleanupHeartbeat();
      cleanupSocketHandlers();

      const sessionId = sessionIdRef.current;
      if (activeSocket?.connected && sessionId) {
        activeSocket.emit("livestream:leave", { streamId, sessionId });
      } else if (sessionId) {
        leaveLiveStream(sessionId);
      }

      sessionIdRef.current = "";
      reactionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      reactionTimersRef.current.clear();
      clearCurrentStream();
    };
  }, [
    clearCurrentStream,
    currentUser?.name,
    currentUser?.username,
    getStreamDetails,
    joinLiveStream,
    leaveLiveStream,
    removeLiveStream,
    streamId,
    token,
    updateViewerCount,
    upsertLiveStream,
  ]);

  const sendComment = () => {
    const text = commentText.trim();
    const activeSocket = socketRef.current;

    if (!text || !activeSocket || !streamId || !commentsEnabled) return;

    setSending(true);
    setCommentText("");

    const timeout = window.setTimeout(() => {
      setSending(false);
      setStatusMessage("Comment is taking longer than usual");
    }, 6000);

    activeSocket.emit(
      "livestream:comment",
      {
        streamId,
        text,
        username: currentUser?.username || currentUser?.name || "Guest",
      },
      (ack = {}) => {
        window.clearTimeout(timeout);
        setSending(false);
        if (!ack.ok) {
          setCommentText(text);
          setStatusMessage(ack.error || "Comment failed");
        }
      }
    );
  };

  const sendReaction = (reaction) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || !reactionsEnabled) return;

    activeSocket.emit("livestream:reaction", { streamId, reaction });
  };

  const sendGift = (giftId, giftValue) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !streamId || !giftsEnabled) return;

    activeSocket.emit("livestream:gift", { streamId, giftId, giftValue });
    setShowGiftMenu(false);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?live=${streamId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: currentStream?.title || "VibeBook Live", url: shareUrl });
      } else {
        await navigator.clipboard?.writeText(shareUrl);
        setStatusMessage("Live link copied");
        window.setTimeout(() => mountedRef.current && setStatusMessage(""), 1800);
      }
    } catch {
      // Share cancellation is not an error for the viewer.
    }
  };

  const handleEndLive = async () => {
    if (!streamId || !isCreator) return;
    const result = await endLiveStream(streamId);
    if (result.ok) {
      setEnded(true);
      onClose?.();
    } else {
      setStatusMessage(result.error || "Unable to end live");
    }
  };

  if (localLoading || !currentStream) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="rounded-2xl bg-white/10 px-5 py-4 text-center text-white backdrop-blur">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          <p className="mt-3 text-sm font-black">Opening live...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={streamBackground}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.28),transparent_34%),linear-gradient(to_top,rgba(0,0,0,0.82),rgba(0,0,0,0.08),rgba(0,0,0,0.54))]" />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur">
            <Radio className="h-14 w-14 text-red-500 drop-shadow-[0_0_26px_rgba(239,68,68,0.9)]" />
            <span className="absolute inset-0 animate-ping rounded-full border border-red-400/40" />
          </div>
        </div>

        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-black shadow-[0_0_24px_rgba(220,38,38,0.65)]">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold backdrop-blur">
              <Users className="h-4 w-4" />
              {currentStream.viewerCount || 0}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isCreator && (
              <button
                type="button"
                className="rounded-full bg-red-600 px-3 py-2 text-xs font-black text-white transition hover:bg-red-700"
                onClick={handleEndLive}
              >
                End
              </button>
            )}
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
              onClick={onClose}
              aria-label="Close livestream"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="absolute bottom-[34%] left-0 right-16 z-20 p-4 sm:bottom-5 sm:right-96 sm:p-5">
          <div className="flex max-w-xl items-center gap-3">
            <SafeAvatar
              user={creator}
              src={creator.avatar}
              className="h-12 w-12 shrink-0 rounded-full border-2 border-white object-cover shadow-lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-black">{creator.name || creator.username || "Creator"}</p>
                {!isCreator && (
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-white px-2.5 text-xs font-black text-slate-950"
                    onClick={() => navigate(`/profile/${creator.username || creator.id || currentStream.creatorId}`)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Follow
                  </button>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-white/85">{currentStream.title}</p>
              {!!currentStream.description && (
                <p className="mt-1 line-clamp-2 text-xs font-semibold text-white/60">{currentStream.description}</p>
              )}
            </div>
          </div>
        </div>

        <div className="absolute bottom-[34%] right-3 z-30 flex flex-col items-center gap-3 sm:bottom-5 sm:right-[21rem]">
          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-950 shadow-lg transition hover:scale-105 disabled:opacity-50"
            onClick={() => sendReaction("heart")}
            disabled={!reactionsEnabled || ended}
            aria-label="Send heart reaction"
          >
            <Heart className="h-5 w-5 fill-current text-red-500" />
          </button>
          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
            onClick={() => sendReaction("fire")}
            disabled={!reactionsEnabled || ended}
            aria-label="Send fire reaction"
          >
            <Zap className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
            onClick={() => setShowGiftMenu((current) => !current)}
            disabled={!giftsEnabled || ended}
            aria-label="Open gifts"
          >
            <Gift className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
            onClick={() => setMuted((current) => !current)}
            aria-label={muted ? "Unmute live audio" : "Mute live audio"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button
            type="button"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
            onClick={handleShare}
            aria-label="Share livestream"
          >
            <Share2 className="h-5 w-5" />
          </button>
        </div>

        <AnimatePresence>
          {showGiftMenu && (
            <motion.div
              className="absolute bottom-[34%] right-20 z-40 w-56 rounded-2xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl sm:bottom-24 sm:right-[25rem]"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
            >
              <div className="grid grid-cols-2 gap-2">
                {giftOptions.map((gift) => {
                  const Icon = gift.Icon;
                  return (
                    <button
                      key={gift.id}
                      type="button"
                      className="flex flex-col items-center gap-1 rounded-xl bg-white/10 p-3 text-xs font-black text-white transition hover:bg-white/20"
                      onClick={() => sendGift(gift.id, gift.value)}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{gift.name}</span>
                      <span className="text-[0.68rem] text-white/55">{gift.value} NEX</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
          {reactionQueue.map((reaction) => {
            const meta = reactionMeta[reaction.reaction] || reactionMeta.heart;
            const Icon = meta.Icon;
            return (
              <motion.div
                key={reaction.id}
                className={`absolute flex h-11 w-11 items-center justify-center rounded-full shadow-xl ${meta.className}`}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
                animate={{ x: reaction.driftX, y: reaction.driftY, opacity: [0, 1, 1, 0], scale: [0.6, 1, 1.1, 0.8] }}
                transition={{ duration: 2.1, ease: "easeOut" }}
                style={{ right: reaction.right, bottom: reaction.bottom }}
              >
                <Icon className="h-5 w-5" />
              </motion.div>
            );
          })}
        </div>
      </div>

      <aside className="z-30 flex h-[34dvh] shrink-0 flex-col border-t border-white/10 bg-slate-950/98 sm:absolute sm:right-0 sm:top-0 sm:h-full sm:w-80 sm:border-l sm:border-t-0">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-blue-300" />
            <p className="text-sm font-black">Live chat</p>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-1 text-[0.68rem] font-black text-white/65">
            {currentStream.category || "live"}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <AnimatePresence initial={false}>
            {comments.map((comment) => (
              <motion.div
                key={comment.id}
                className="mb-2 rounded-xl bg-white/10 p-2.5 text-xs"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <p className="font-black text-white">{comment.username || "Guest"}</p>
                <p className="mt-1 break-words font-semibold text-white/80">{comment.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>

          {!comments.length && (
            <div className="flex h-full items-center justify-center text-center text-xs font-bold text-white/45">
              Chat will appear here.
            </div>
          )}
        </div>

        <AnimatePresence>
          {statusMessage && (
            <motion.div
              className="mx-3 mb-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white/80"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {statusMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="border-t border-white/10 p-3">
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-blue-400 disabled:opacity-55"
              placeholder={commentsEnabled ? "Add comment..." : "Comments off"}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendComment();
              }}
              disabled={!commentsEnabled || ended}
              maxLength={500}
            />
            <button
              type="button"
              onClick={sendComment}
              disabled={!commentText.trim() || sending || !commentsEnabled || ended}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50"
              aria-label="Send live comment"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>
    </motion.div>
  );
};

export default LiveStreamViewer;
