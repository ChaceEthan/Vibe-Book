// @ts-nocheck
import {
  Bookmark,
  Download,
  Heart,
  MessageCircle,
  Music2,
  RefreshCw,
  Search,
  Send,
  Share2,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import PostMedia from "../components/PostMedia.jsx";
import SafeAvatar from "../components/SafeAvatar.jsx";
import LiveAvatar from "../components/LiveAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { feedApi, getApiErrorMessage, isRetryableApiError, mediaUrl, userApi } from "../services/api";
import { useLiveStreamStore } from "../store/livestreamStore";
import { isValidPost, usePostStore } from "../store/postStore";

const FEED_PAGE_SIZE = 10;
const FEED_AUDIO_PREFERENCE_KEY = "vibebook:feed-audio";
const STEM_TERMS = ["stem", "science", "technology", "engineering", "math", "education", "coding", "robotics", "ai"];

const readFeedAudioPreference = () => {
  try {
    return localStorage.getItem(FEED_AUDIO_PREFERENCE_KEY) !== "muted";
  } catch {
    return true;
  }
};

const saveFeedAudioPreference = (enabled) => {
  try {
    localStorage.setItem(FEED_AUDIO_PREFERENCE_KEY, enabled ? "sound" : "muted");
  } catch {
    // Audio preference is best-effort.
  }
};

const formatCount = (value) => {
  const number = Number(value || 0);

  if (number >= 1000000) {
    return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  }

  if (number >= 1000) {
    return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  }

  return number.toLocaleString();
};

const numericCount = (value) => {
  const count = Number(value || 0);
  return Number.isFinite(count) ? count : 0;
};

const initialsFor = (value = "VibeBook") =>
  String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "VB";

const frameGradientFor = (frame = "") => ({
  frame_starter_neon: "from-cyan-300 via-lime-300 to-emerald-500",
  frame_gold_aura: "from-yellow-200 via-amber-400 to-orange-600",
  frame_anime_energy: "from-pink-400 via-violet-500 to-sky-400",
  frame_cyber_matrix: "from-slate-950 via-blue-600 to-teal-300",
  frame_kigali_night: "from-indigo-950 via-fuchsia-600 to-yellow-300",
  frame_diamond_elite: "from-cyan-200 via-white to-violet-500",
  frame_flame_aura: "from-orange-300 via-red-500 to-rose-700",
  frame_vip_prestige: "from-zinc-950 via-amber-500 to-white",
  frame_minimal_luxury: "from-slate-100 via-zinc-300 to-slate-800",
  frame_nex_genesis_founder: "from-black via-lime-300 to-cyan-200",
  frame_neon_glow: "from-emerald-300 via-cyan-300 to-lime-300",
  frame_gold_elite: "from-yellow-200 via-amber-400 to-orange-500",
  frame_fire_aura: "from-orange-400 via-red-500 to-rose-600",
  frame_diamond_ring: "from-cyan-200 via-sky-400 to-violet-500",
  frame_rwanda_pride: "from-sky-500 via-yellow-300 to-emerald-500",
  frame_creator_legend: "from-fuchsia-400 via-amber-300 to-cyan-300",
  frame_cyber_pulse: "from-blue-500 via-indigo-500 to-teal-300",
}[frame] || "");

const FramedSafeAvatar = ({ user, src = "", alt = "", className = "" }) => {
  const frame = user?.equippedFrame || user?.marketplace?.equippedFrame || "";
  const gradient = frameGradientFor(frame);

  if (!gradient) {
    return <LiveAvatar user={user} src={src} alt={alt} className={className} />;
  }

  return (
    <span className={`relative inline-flex shrink-0 rounded-full bg-gradient-to-br ${gradient} p-[2px] shadow-xl`}>
      <span className="absolute inset-[-3px] rounded-full bg-inherit opacity-45 blur-sm" />
      <LiveAvatar user={user} src={src} alt={alt} className={`${className} relative ring-2 ring-white/75`} />
    </span>
  );
};

const relativeTimeFor = (value) => {
  const timestamp = value ? new Date(value).getTime() : 0;

  if (!timestamp || Number.isNaN(timestamp)) {
    return "now";
  }

  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;

  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const commentKeyFor = (comment, index) => comment?._id || `${comment?.userId || comment?.name || "comment"}-${comment?.createdAt || index}`;

const ActionButton = memo(({ active = false, count, label, onClick, children }) => (
  <div className="flex flex-col items-center gap-1.5">
    <button
      type="button"
      className={`flex h-12 w-12 items-center justify-center rounded-full border border-white/10 text-white shadow-[0_12px_30px_rgba(0,0,0,0.38)] backdrop-blur-md transition duration-150 hover:scale-105 active:scale-95 sm:h-[3.25rem] sm:w-[3.25rem] ${
        active
          ? "scale-105 bg-white text-slate-950 shadow-2xl"
          : "bg-black/58 hover:bg-black/78 hover:border-white/22"
      }`}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
    {count !== undefined && count !== "" ? (
      <span className="max-w-14 truncate text-[10px] font-black leading-none text-white drop-shadow-md">{count}</span>
    ) : null}
  </div>
));

const audioLabelFor = (item = {}, profile = {}) => {
  const explicit =
    item.audioTitle ||
    item.musicTitle ||
    item.soundTitle ||
    item.trackName ||
    item.audio?.title ||
    item.music?.title ||
    item.sound?.title;

  if (explicit) {
    return String(explicit).trim().slice(0, 90);
  }

  const handle = profile.username || profile.name || "creator";
  return `Original sound - @${String(handle).replace(/^@+/, "")}`;
};

const FeedItem = memo(
  ({
    currentUser,
    isAuthenticated,
    item,
    onInvalid,
    onLike,
    onDoubleTapLike,
    onOpenComments,
    onDownload,
    onSave,
    onShare,
    onViewed,
    isActive = false,
    soundEnabled = true,
    audioUnlockToken = 0,
    onAudioPreferenceChange,
    onAutoplayBlocked,
  }) => {
    const [captionExpanded, setCaptionExpanded] = useState(false);
    const [activityBursts, setActivityBursts] = useState([]);
    const lastViewsRef = useRef(Number(item.views || 0));
    const burstTimersRef = useRef([]);
    const profile = item.userId || {};
    const profileImage = profile.profilePicture || profile.profileImage || profile.images?.[0] || "/logo.png";
    const profilePath = isAuthenticated ? `/profile/${profile._id}` : "/login";
    const liveStreamId = useLiveStreamStore((state) => state.liveCreatorIds[String(profile._id || profile.id || "")] || "");
    const comments = Array.isArray(item.comments) ? item.comments : [];
    const commentsCount = item.commentCount ?? item.commentsCount ?? comments.length;
    const saveCount = item.saveCount ?? item.saves ?? 0;
    const caption = String(item.caption || "");
    const hasLongCaption = caption.length > 120;
    const currentUserImage = currentUser?.profilePicture || currentUser?.profileImage || currentUser?.images?.[0] || "";
    const audioLabel = audioLabelFor(item, profile);

    const addActivityBurst = (kind) => {
      const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setActivityBursts((current) => [...current.slice(-2), { id, kind }]);
      const timer = window.setTimeout(() => {
        setActivityBursts((current) => current.filter((burst) => burst.id !== id));
        burstTimersRef.current = burstTimersRef.current.filter((item) => item !== timer);
      }, 1500);
      burstTimersRef.current.push(timer);
    };

    const handleLikePress = () => {
      if (!item.likedByViewer) {
        addActivityBurst("like");
      }
      onLike(item);
    };

    const handleDoubleTapLike = () => {
      addActivityBurst("like");
      onDoubleTapLike(item);
    };

    useEffect(() => {
      const nextViews = Number(item.views || 0);
      if (nextViews > lastViewsRef.current) {
        addActivityBurst("view");
      }
      lastViewsRef.current = nextViews;
    }, [item.views]);

    useEffect(() => {
      return () => {
        burstTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        burstTimersRef.current = [];
      };
    }, []);

    return (
      <article
        data-feed-post-id={item._id || item.url}
        className="home-feed-viewport relative flex snap-start snap-always justify-center overflow-hidden bg-slate-950"
      >
        <PostMedia
          post={item}
          alt={profile.name || "VibeBook media"}
          className="home-feed-media group h-full w-full"
          imageClassName="h-full w-full object-cover"
          videoClassName="h-full w-full object-cover"
          placeholderClassName="h-full w-full"
          active={isActive}
          audioUnlockToken={audioUnlockToken}
          loop
          autoPlay={isActive}
          controls={false}
          preload={isActive ? "auto" : "metadata"}
          interactive
          managedPlayback
          muted={!soundEnabled}
          soundEnabled={soundEnabled}
          onAudioPreferenceChange={onAudioPreferenceChange}
          onAutoplayBlocked={onAutoplayBlocked}
          onDoubleTap={handleDoubleTapLike}
          onViewed={(metrics) => onViewed(item, metrics)}
          onInvalid={() => onInvalid(item._id)}
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[32%] bg-gradient-to-t from-black/64 via-black/10 to-transparent" />

        <div className="home-feed-caption absolute bottom-[calc(5.45rem+env(safe-area-inset-bottom))] left-3 right-[5.6rem] z-20 text-white sm:bottom-[calc(5.85rem+env(safe-area-inset-bottom))] sm:left-5 sm:right-28">
          <div className="flex min-w-0 items-end gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <Link to={profilePath} className="min-w-0 truncate text-base font-black leading-tight text-white hover:text-white/90 transition sm:text-lg">
                  @{profile.username || profile.name || "creator"}
                </Link>
              </div>

              {caption && (
                <div className="mt-2 max-w-[34rem] text-sm font-semibold leading-5 text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.68)]">
                  <p className={`feed-caption-text ${captionExpanded ? "" : "line-clamp-2 feed-caption-text-collapsed"}`}>{caption}</p>
                  {hasLongCaption && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-black text-white/75 hover:text-white transition"
                      onClick={() => setCaptionExpanded((value) => !value)}
                    >
                      {captionExpanded ? "less" : "more"}
                    </button>
                  )}
                </div>
              )}

              <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs font-bold text-white/82 drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
                <Music2 className="h-3.5 w-3.5 shrink-0 text-brand" />
                <span className="min-w-0 truncate">{audioLabel}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-[calc(9rem+env(safe-area-inset-bottom))] right-16 z-30 flex flex-col items-end gap-2">
          {activityBursts.map((burst) => (
            <div key={burst.id} className="activity-bubble flex items-center gap-2 rounded-full bg-white/90 py-1 pl-1 pr-3 text-xs font-black text-navy shadow-xl">
              <span className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ${burst.kind === "like" ? "bg-red-500 text-white" : "bg-brand text-navy"}`}>
                {burst.kind === "like" && currentUserImage ? (
                  <SafeAvatar user={currentUser} src={currentUserImage} className="h-full w-full object-cover" />
                ) : burst.kind === "like" ? (
                  <Heart className="h-4 w-4 fill-white text-white" />
                ) : (
                  initialsFor(currentUser?.name || "view")
                )}
              </span>
              {burst.kind === "like" ? "liked" : "viewed"}
            </div>
          ))}
        </div>

        <div className="home-feed-actions absolute right-2 top-1/2 z-20 flex w-16 -translate-y-1/2 flex-col items-center justify-center overflow-visible sm:right-4 lg:right-5">
          <div className="flex flex-col items-center gap-3.5">
            <Link to={liveStreamId ? `/live/${liveStreamId}` : profilePath} className="relative mb-0.5 shrink-0 transition hover:scale-105 active:scale-95" aria-label={liveStreamId ? "Join creator live" : "Creator profile"}>
              <span className={`relative inline-flex rounded-full p-[2px] ${liveStreamId ? "live-avatar-ring" : "bg-white/35"}`}>
                <LiveAvatar user={profile} src={profileImage} className="h-[3.25rem] w-[3.25rem] rounded-full border border-black/35 object-cover shadow-[0_10px_28px_rgba(0,0,0,0.45)]" />
              </span>
              {liveStreamId && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-1.5 py-0.5 text-[0.52rem] font-black leading-none text-white shadow-[0_0_18px_rgba(220,38,38,0.75)]">
                  LIVE
                </span>
              )}
            </Link>

            <ActionButton active={item.likedByViewer} count={formatCount(item.likes || item.likeCount)} label="Like media" onClick={handleLikePress}>
              <Heart className={`h-6 w-6 ${item.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
            </ActionButton>

            <ActionButton count={formatCount(commentsCount)} label="Open comments" onClick={() => onOpenComments(item._id)}>
              <MessageCircle className="h-6 w-6" />
            </ActionButton>

            <ActionButton active={item.savedByViewer} count={formatCount(saveCount)} label="Save post" onClick={() => onSave(item)}>
              <Bookmark className={`h-6 w-6 ${item.savedByViewer ? "fill-brand text-brand" : ""}`} />
            </ActionButton>

            <ActionButton label="Download post" onClick={() => onDownload(item)}>
              <Download className="h-6 w-6" />
            </ActionButton>

            <ActionButton count={formatCount(item.shareCount)} label="Share post" onClick={() => onShare(item)}>
              <Share2 className="h-6 w-6" />
            </ActionButton>
          </div>
        </div>
      </article>
    );
  }
);

const CommentsSheet = ({
  commentText,
  isAuthenticated,
  likedComments,
  onClose,
  onCommentTextChange,
  onSubmit,
  onToggleCommentLike,
  post,
}) => {
  const comments = Array.isArray(post?.comments) ? post.comments : [];
  const profile = post?.userId || {};
  const inputRef = useRef(null);

  useEffect(() => {
    if (!post) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const focusTimer = window.setTimeout(() => inputRef.current?.focus?.(), 120);

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, post]);

  if (!post) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/45 px-0 backdrop-blur-sm sm:items-center sm:px-4" onClick={onClose}>
      <section
        className="comment-sheet-in flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white text-slate-900 shadow-2xl sm:max-h-[82dvh] sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-black text-navy">Comments</h2>
            <p className="truncate text-xs font-semibold text-slate-500">@{profile.username || profile.name || "creator"}</p>
          </div>
          <button type="button" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close comments">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {comments.length ? (
            <div className="space-y-4">
              {comments.map((comment, index) => {
                const key = commentKeyFor(comment, index);
                const avatar = comment.profilePicture || comment.profileImage || comment.user?.profilePicture || comment.user?.profileImage || "";
                const name = comment.name || comment.user?.name || "VibeBook user";
                const liked = likedComments.has(key);

                return (
                  <article key={key} className="flex gap-3">
                    <FramedSafeAvatar user={comment.user || comment} src={avatar} className="h-10 w-10 rounded-full bg-slate-900 object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-black text-navy">{name}</p>
                        <span className="shrink-0 text-xs font-semibold text-slate-400">{relativeTimeFor(comment.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-700">{comment.message}</p>
                    </div>
                    <button
                      type="button"
                      className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                      onClick={() => onToggleCommentLike(key)}
                      aria-label={liked ? "Unlike comment" : "Like comment"}
                    >
                      <Heart className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`} />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center text-center">
              <MessageCircle className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-black text-navy">No comments yet</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Start the conversation.</p>
            </div>
          )}
        </div>

        <form className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" onSubmit={(event) => onSubmit(event, post)}>
          <input
            ref={inputRef}
            className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={commentText}
            onChange={(event) => onCommentTextChange(event.target.value)}
            placeholder={isAuthenticated ? "Add a comment..." : "Log in to comment"}
            disabled={!isAuthenticated || post.virtual || post.commentsEnabled === false}
          />
          <button
            type="submit"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-navy shadow-sm disabled:opacity-50"
            disabled={!isAuthenticated || !commentText.trim() || post.virtual || post.commentsEnabled === false}
            aria-label="Send comment"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </section>
    </div>
  );
};

const Home = () => {
  const { isAuthenticated, user: currentUser } = useAuth();
  const activeLiveStreams = useLiveStreamStore((state) => state.activeLiveStreams);
  const getActiveLiveStreams = useLiveStreamStore((state) => state.getActiveLiveStreams);
  const posts = usePostStore((state) => state.posts);
  const setPosts = usePostStore((state) => state.setPosts);
  const mergePosts = usePostStore((state) => state.mergePosts);
  const prependPost = usePostStore((state) => state.prependPost);
  const replacePost = usePostStore((state) => state.replacePost);
  const applyPostLike = usePostStore((state) => state.applyPostLike);
  const removePost = usePostStore((state) => state.removePost);
  const updatePostsByUser = usePostStore((state) => state.updatePostsByUser);
  const [feedMode, setFeedMode] = useState("for-you");
  const [commentOpen, setCommentOpen] = useState("");
  const [commentText, setCommentText] = useState("");
  const [likedComments, setLikedComments] = useState(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [error, setError] = useState("");
  const [networkStatus, setNetworkStatus] = useState("");
  const [activePostId, setActivePostId] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(readFeedAudioPreference);
  const [audioUnlockToken, setAudioUnlockToken] = useState(0);
  const scrollerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const feedRequestRef = useRef("");
  const activeRatiosRef = useRef(new Map());
  const lastAudioUnlockRef = useRef(0);
  const viewedPostsRef = useRef(new Set());
  const likeRequestsRef = useRef(new Map());
  const retryTimerRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const pullStartYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const isPullingRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleLiveStarted = (event) => {
      const stream = event.detail?.stream;
      if (stream?.id) {
        navigate(`/live/${stream.id}`);
      }
    };

    window.addEventListener("vibebook:live-started", handleLiveStarted);
    return () => window.removeEventListener("vibebook:live-started", handleLiveStarted);
  }, [navigate]);

  useEffect(() => {
    getActiveLiveStreams(20, 0, { silent: true });
    const timer = window.setInterval(() => {
      getActiveLiveStreams(20, 0, { silent: true });
    }, 30000);

    return () => window.clearInterval(timer);
  }, [getActiveLiveStreams]);

  const replaceFeedItem = useCallback((nextItem, options = {}) => {
    replacePost(nextItem, options);
  }, [replacePost]);

  const broadcastPostLike = useCallback((postId, likedByViewer, likeCount, feedItem = null) => {
    window.dispatchEvent(
      new CustomEvent("vibebook:post-like-updated", {
        detail: { postId, likedByViewer, likes: likeCount, likeCount, feedItem },
      })
    );
  }, []);

  const setPullProgress = useCallback((nextDistance) => {
    const clamped = Math.max(0, Math.min(104, Number(nextDistance || 0)));
    pullDistanceRef.current = clamped;
    setPullDistance(clamped);
  }, []);

  const loadFeed = useCallback(async (nextPage = 1, options = {}) => {
    const append = Boolean(options.append);
    const quietReplace = Boolean(options.refresh || options.reconnect || options.silent);
    const requestKey = `${feedMode}:${nextPage}:${append ? "append" : "replace"}`;

    if (feedRequestRef.current === requestKey) {
      return;
    }

    feedRequestRef.current = requestKey;

    if (append) {
      setLoadingMore(true);
    } else if (!quietReplace) {
      setLoading(true);
    }

    setError("");

    try {
      const params = {
        page: nextPage,
        limit: FEED_PAGE_SIZE,
        ...(feedMode === "following" ? { mode: "following" } : {}),
      };
      const { data } = await feedApi.get(params);
      const payload = data && typeof data === "object" ? data : {};
      const rawPosts = Array.isArray(payload.posts) ? payload.posts : Array.isArray(payload.feed) ? payload.feed : [];
      const nextPosts = rawPosts.filter(isValidPost);

      if (append) {
        mergePosts(nextPosts);
      } else {
        setPosts(nextPosts);
        if (!options.preserveScroll) {
          scrollerRef.current?.scrollTo?.({ top: 0, behavior: options.refresh ? "smooth" : "auto" });
        }
      }

      setPage(nextPage);
      setHasMore(Boolean(typeof payload.hasMore === "boolean" ? payload.hasMore : nextPosts.length >= FEED_PAGE_SIZE) && nextPosts.length > 0);
      retryAttemptRef.current = 0;
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, "Unable to load feed.");
      const canRetry = !append && isRetryableApiError(requestError) && retryAttemptRef.current < 2;

      if (import.meta.env?.DEV) {
        console.warn("[feed] load failed", {
          page: nextPage,
          append,
          status: requestError?.response?.status,
          code: requestError?.code || "REQUEST_FAILED",
          message: requestError?.message,
        });
      }

      if (canRetry) {
        retryAttemptRef.current += 1;
        const delay = Math.min(1000 * 2 ** (retryAttemptRef.current - 1), 4000);
        setError(`${message} Retrying in ${Math.round(delay / 1000)}s...`);

        if (retryTimerRef.current) {
          window.clearTimeout(retryTimerRef.current);
        }

        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          loadFeed(nextPage, { ...options, retrying: true });
        }, delay);
      } else {
        setError(message);
      }
    } finally {
      if (feedRequestRef.current === requestKey) {
        feedRequestRef.current = "";
      }
      setLoading(false);
      setLoadingMore(false);
    }
  }, [feedMode, mergePosts, setPosts]);

  const refreshFeed = useCallback(async (source = "manual") => {
    if (refreshing) {
      return;
    }

    retryAttemptRef.current = 0;
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setRefreshing(true);
    setError("");

    try {
      await loadFeed(1, { refresh: true, source });
    } finally {
      setRefreshing(false);
      setPullProgress(0);
    }
  }, [loadFeed, refreshing, setPullProgress]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    loadFeed(1);
  }, [loadFeed]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      likeRequestsRef.current.clear();
      feedRequestRef.current = "";
    };
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehaviorY;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehaviorY = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehaviorY = previousHtmlOverscroll;
    };
  }, []);

  useEffect(() => {
    const handlePostCreated = (event) => {
      const post = event.detail?.post;

      if (!post?._id || !isValidPost(post)) {
        return;
      }

      prependPost(post);
      scrollerRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
    };
    const handlePostDeleted = (event) => {
      if (event.detail?.postId) {
        removePost(event.detail.postId);
      }
    };

    window.addEventListener("vibebook:post-created", handlePostCreated);
    window.addEventListener("vibebook:post-deleted", handlePostDeleted);
    return () => {
      window.removeEventListener("vibebook:post-created", handlePostCreated);
      window.removeEventListener("vibebook:post-deleted", handlePostDeleted);
    };
  }, [prependPost, removePost]);

  useEffect(() => {
    const syncCurrentUserInFeed = (nextUser = currentUser) => {
      if (!nextUser?._id) {
        return;
      }

      updatePostsByUser(nextUser._id, (profile) => ({
        ...profile,
        profilePicture: nextUser.profilePicture || nextUser.profileImage || profile.profilePicture,
        profileImage: nextUser.profileImage || nextUser.profilePicture || profile.profileImage,
        equippedFrame: nextUser.equippedFrame || profile.equippedFrame,
        equippedBadges: nextUser.equippedBadges || profile.equippedBadges,
        premiumBadge: nextUser.premiumBadge ?? profile.premiumBadge,
        isPremium: nextUser.isPremium ?? profile.isPremium,
      }));
    };

    syncCurrentUserInFeed();

    const handleUserUpdated = (event) => syncCurrentUserInFeed(event.detail?.user);
    window.addEventListener("vibebook:user-updated", handleUserUpdated);
    return () => window.removeEventListener("vibebook:user-updated", handleUserUpdated);
  }, [currentUser, updatePostsByUser]);

  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus("");
      retryAttemptRef.current = 0;
      loadFeed(1, { reconnect: true, preserveScroll: true });
    };

    const handleOffline = () => {
      setNetworkStatus("Reconnecting...");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadFeed]);

  useEffect(() => {
    const handleSocketStatus = (event) => {
      const status = event.detail?.status || "";
      if (status === "reconnecting" || status === "offline") {
        setNetworkStatus("Reconnecting...");
      } else if (status === "connected") {
        setNetworkStatus("");
      }
    };

    window.addEventListener("vibebook:socket-status", handleSocketStatus);
    return () => window.removeEventListener("vibebook:socket-status", handleSocketStatus);
  }, []);

  useEffect(() => {
    const handleHomeRefresh = () => {
      refreshFeed("home-tab");
    };

    window.addEventListener("vibebook:home-refresh", handleHomeRefresh);
    return () => window.removeEventListener("vibebook:home-refresh", handleHomeRefresh);
  }, [refreshFeed]);

  const validPosts = useMemo(() => posts.filter(isValidPost), [posts]);

  const visibleFeed = useMemo(
    () =>
      validPosts.filter((item) => {
        if (feedMode === "following") {
          return Boolean(item?.userId?.isFollowing);
        }

        if (feedMode === "stem") {
          const haystack = [
            item.caption,
            item.category,
            item.userId?.category,
            ...(Array.isArray(item.tags) ? item.tags : []),
          ].join(" ").toLowerCase();

          return STEM_TERMS.some((term) => haystack.includes(term));
        }

        return true;
      }),
    [validPosts, feedMode]
  );

  const handleFeedTab = useCallback((value) => {
    if (value === "explore") {
      navigate("/explore");
      return;
    }

    if (value === "live") {
      navigate("/live");
      return;
    }

    if (value === "following" && !isAuthenticated) {
      navigate("/login");
      return;
    }

    setFeedMode(value);
  }, [isAuthenticated, navigate]);

  const feedEntries = useMemo(
    () =>
      visibleFeed.map((item, index) => ({
        id: item._id || item.url || `post:${index}`,
        kind: "post",
        item,
      })),
    [visibleFeed]
  );

  const activeCommentPost = useMemo(() => visibleFeed.find((item) => item._id === commentOpen), [commentOpen, visibleFeed]);
  const nextVideoPreloadUrl = useMemo(() => {
    const nextVideo = visibleFeed.find((item) => item?.type === "video" && item.url && (item._id || item.url) !== activePostId);
    return nextVideo?.url ? mediaUrl(nextVideo.url) : "";
  }, [activePostId, visibleFeed]);

  useEffect(() => {
    const firstId = feedEntries[0]?.id || "";

    setActivePostId((current) => {
      if (current && feedEntries.some((item) => item.id === current)) {
        return current;
      }

      return firstId;
    });
  }, [feedEntries]);

  useEffect(() => {
    const scroller = scrollerRef.current;

    if (!scroller || !window.IntersectionObserver) {
      return undefined;
    }

    const ratios = new Map();
    activeRatiosRef.current = ratios;
    const nodes = Array.from(scroller.querySelectorAll("[data-feed-post-id]"));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute("data-feed-post-id") || "";
          if (id) {
            ratios.set(id, entry.intersectionRatio);
          }
        });

        let nextId = "";
        let nextRatio = 0;
        ratios.forEach((ratio, id) => {
          if (ratio > nextRatio) {
            nextRatio = ratio;
            nextId = id;
          }
        });

        if (nextId && nextRatio >= 0.55) {
          setActivePostId((current) => (current === nextId ? current : nextId));
        }
      },
      {
        root: scroller,
        threshold: [0, 0.35, 0.55, 0.72, 0.9, 1],
      }
    );

    nodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      activeRatiosRef.current = new Map();
    };
  }, [feedEntries]);

  const updateAudioPreference = useCallback((enabled) => {
    setSoundEnabled(Boolean(enabled));
    saveFeedAudioPreference(Boolean(enabled));

    if (enabled) {
      setAudioUnlockToken((current) => current + 1);
    }
  }, []);

  const handleAutoplayBlocked = useCallback(() => {
    // Keep the desired sound preference. A later user gesture will retry the active video.
  }, []);

  useEffect(() => {
    const retryAudioAfterInteraction = () => {
      if (!soundEnabled) {
        return;
      }

      const now = Date.now();
      if (now - lastAudioUnlockRef.current < 700) {
        return;
      }

      lastAudioUnlockRef.current = now;
      setAudioUnlockToken((current) => current + 1);
    };

    window.addEventListener("pointerdown", retryAudioAfterInteraction, { passive: true });
    window.addEventListener("keydown", retryAudioAfterInteraction);
    window.addEventListener("touchstart", retryAudioAfterInteraction, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", retryAudioAfterInteraction);
      window.removeEventListener("keydown", retryAudioAfterInteraction);
      window.removeEventListener("touchstart", retryAudioAfterInteraction);
    };
  }, [soundEnabled]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore || !loadMoreRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadFeed(page + 1, { append: true });
        }
      },
      {
        root: scrollerRef.current,
        rootMargin: "420px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadFeed, loading, loadingMore, page]);

  useEffect(() => {
    if (!nextVideoPreloadUrl) {
      return undefined;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = nextVideoPreloadUrl;
    video.load();

    return () => {
      video.pause?.();
      video.removeAttribute("src");
    };
  }, [nextVideoPreloadUrl]);

  const handleLike = useCallback(async (item, options = {}) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const forceLike = Boolean(options.forceLike);

    try {
      if (item.virtual) {
        if (forceLike && item.likedByViewer) {
          return;
        }

        const { data } = item.likedByViewer
          ? await userApi.unlikeProfile(item.userId._id)
          : await userApi.likeProfile(item.userId._id);
        updatePostsByUser(item.userId._id, (profile) => ({
          ...profile,
          likes: data.user?.likes || data.user?.likeCount || profile.likes,
          likeCount: data.user?.likes || data.user?.likeCount || profile.likeCount,
        }));
        usePostStore.setState((state) => ({
          posts: state.posts.map((feedItem) =>
            feedItem.userId?._id === item.userId._id
              ? { ...feedItem, likedByViewer: !item.likedByViewer }
              : feedItem
          ),
        }));
        return;
      }

      if (!item?._id || likeRequestsRef.current.has(item._id)) {
        return;
      }

      const wasLiked = Boolean(item.likedByViewer);

      if (forceLike && wasLiked) {
        return;
      }

      const previousCount = numericCount(item.likes ?? item.likeCount);
      const nextLiked = forceLike ? true : !wasLiked;
      const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));

      likeRequestsRef.current.set(item._id, { likedByViewer: wasLiked, likes: previousCount });
      applyPostLike(item._id, nextLiked, nextCount);
      broadcastPostLike(item._id, nextLiked, nextCount);

      try {
        const { data } = await feedApi.toggleLike(item._id, { action: nextLiked ? "like" : "unlike" });
        if (data.feedItem) {
          replaceFeedItem(data.feedItem);
          broadcastPostLike(data.feedItem._id, Boolean(data.feedItem.likedByViewer), numericCount(data.feedItem.likes ?? data.feedItem.likeCount), data.feedItem);
        }
      } catch (requestError) {
        applyPostLike(item._id, wasLiked, previousCount);
        broadcastPostLike(item._id, wasLiked, previousCount);
        setError(requestError.response?.data?.message || "Unable to update like.");
      } finally {
        likeRequestsRef.current.delete(item._id);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update like.");
    }
  }, [applyPostLike, broadcastPostLike, isAuthenticated, navigate, replaceFeedItem, updatePostsByUser]);

  const handleSave = useCallback(async (item) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    if (item.virtual || !item._id) {
      return;
    }

    try {
      const { data } = await feedApi.save(item._id);
      replaceFeedItem(data.feedItem, { preserveLikeState: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save this post.");
    }
  }, [isAuthenticated, navigate, replaceFeedItem]);

  const handleViewed = useCallback(async (item, metrics = {}) => {
    if (!item?._id || item.virtual || viewedPostsRef.current.has(item._id)) {
      return;
    }

    viewedPostsRef.current.add(item._id);

    try {
      const { data } = await feedApi.recordView(item._id, metrics);
      replaceFeedItem(data.feedItem, { preserveLikeState: true, preserveSaveState: true });
    } catch {
      // View tracking should never interrupt playback.
    }
  }, [replaceFeedItem]);

  const handleShare = useCallback(async (item) => {
    const shareUrl = `${window.location.origin}/profile/${item.userId?._id || ""}`;
    const shareData = {
      title: item.userId?.name || "VibeBook post",
      text: item.caption || "Check out this VibeBook post",
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }

      if (!item.virtual && item._id) {
        const { data } = await feedApi.share(item._id);
        replaceFeedItem(data.feedItem, { preserveLikeState: true, preserveSaveState: true });
      }
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError("Unable to share this post.");
      }
    }
  }, [replaceFeedItem]);

  const handleDownload = useCallback(async (item) => {
    if (!item?.url) {
      return;
    }

    const fallbackUrl = mediaUrl(item.url);
    const extension = item.type === "video" ? "mp4" : "jpg";
    const fileName = `vibebook-${item._id || Date.now()}.${extension}`;

    const downloadFromUrl = (url, name) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    };

    try {
      if (item._id && item.type === "video") {
        const { data } = await feedApi.downloadVideo(item._id);
        const blobUrl = URL.createObjectURL(data);
        downloadFromUrl(blobUrl, fileName);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1200);
        return;
      }

      const response = await fetch(fallbackUrl, { mode: "cors" });
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blobUrl = URL.createObjectURL(await response.blob());
      downloadFromUrl(blobUrl, fileName);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1200);
    } catch {
      window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleComment = useCallback(async (event, item) => {
    event.preventDefault();

    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    if (!commentText.trim() || item.virtual) {
      return;
    }

    try {
      const { data } = await feedApi.addComment(item._id, { message: commentText.trim() });
      replaceFeedItem(data.feedItem, { preserveLikeState: true, preserveSaveState: true });
      setCommentText("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to add comment.");
    }
  }, [commentText, isAuthenticated, navigate, replaceFeedItem]);

  const toggleCommentLike = useCallback((key) => {
    setLikedComments((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleRetryFeed = useCallback(() => {
    retryAttemptRef.current = 0;
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    loadFeed(1, { manual: true });
  }, [loadFeed]);

  const handlePointerDown = useCallback((event) => {
    if (event.pointerType === "mouse" || loading || refreshing) {
      return;
    }

    const scroller = scrollerRef.current;

    if (!scroller || scroller.scrollTop > 2) {
      return;
    }

    isPullingRef.current = true;
    pullStartYRef.current = event.clientY;
    setPullProgress(0);
  }, [loading, refreshing, setPullProgress]);

  const handlePointerMove = useCallback((event) => {
    if (!isPullingRef.current) {
      return;
    }

    const scroller = scrollerRef.current;
    const delta = event.clientY - pullStartYRef.current;

    if (!scroller || scroller.scrollTop > 2 || delta <= 0) {
      setPullProgress(0);
      return;
    }

    const nextDistance = Math.min(104, delta * 0.48);
    setPullProgress(nextDistance);

    if (delta > 12 && event.cancelable) {
      event.preventDefault();
    }
  }, [setPullProgress]);

  const handlePointerEnd = useCallback(() => {
    if (!isPullingRef.current) {
      return;
    }

    isPullingRef.current = false;

    if (pullDistanceRef.current >= 72) {
      refreshFeed("pull");
      return;
    }

    setPullProgress(0);
  }, [refreshFeed, setPullProgress]);

  if (loading) {
    return (
      <section className="home-feed-viewport flex items-center justify-center bg-slate-950 text-white">
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(34,197,94,0.2),transparent_34%)]" />
          <div className="relative flex flex-col items-center gap-4">
            <span className="vibebook-premium-spinner" />
            <div className="h-3 w-44 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full w-1/2 animate-pulse rounded-full bg-brand/80 blur-[1px]" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Loading fresh videos</p>
          </div>
        </div>
      </section>
    );
  }

  if (error && !feedEntries.length) {
    return (
      <section className="container-page flex min-h-[60vh] items-center justify-center py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <p className="font-bold">{error}</p>
          <button type="button" className="btn-primary mt-4" onClick={handleRetryFeed}>
            Retry feed
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="home-feed-viewport relative overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 h-28 bg-gradient-to-b from-black/68 via-black/24 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-center px-4 pt-[calc(0.7rem+env(safe-area-inset-top))]">
        <h1
          className="pointer-events-auto absolute left-1/2 -translate-x-1/2 text-xl font-black text-white drop-shadow-[0_0_18px_rgba(34,197,94,0.22)] sm:text-2xl"
          style={{
            backgroundImage: "linear-gradient(135deg, #ffffff 15%, #dfffe9 58%, #22c55e 115%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Vibebook
        </h1>

        <button
          type="button"
          className="pointer-events-auto ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/28 text-white shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:bg-white/14 active:scale-90"
          onClick={() => navigate("/search")}
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[calc(3.35rem+env(safe-area-inset-top))] z-50 flex justify-center px-3">
        <div className="pointer-events-auto grid w-[18rem] grid-cols-3 items-end gap-1 rounded-full border border-white/18 bg-black/72 px-2 py-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          {[
            { value: "live", label: "LIVE" },
            { value: "following", label: "Following" },
            { value: "for-you", label: "For You" },
          ].map((option) => {
            const active = option.value !== "live" && option.value === feedMode;
            return (
              <button
                key={option.value}
                type="button"
                className={`relative z-10 flex shrink-0 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs font-black drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)] transition ${
                  active ? "text-white" : "text-white/82 hover:text-white"
                }`}
                onClick={() => handleFeedTab(option.value)}
              >
                {option.value === "live" && activeLiveStreams.length ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.9)]" />
                ) : null}
                {option.label}
                {active ? <span className="absolute -bottom-1 h-0.5 w-7 rounded-full bg-brand shadow-[0_0_12px_rgba(34,197,94,0.9)]" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {(refreshing || pullDistance > 4) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-[calc(5.5rem+env(safe-area-inset-top))] z-40 flex justify-center transition duration-200"
          style={{ transform: `translateY(${Math.min(pullDistance, 72)}px)`, opacity: refreshing ? 1 : Math.min(1, pullDistance / 72) }}
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-white/92 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-navy shadow-xl backdrop-blur">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing" : pullDistance >= 72 ? "Release" : "Pull"}
          </span>
        </div>
      )}

      <div
        ref={scrollerRef}
        className="home-feed-scroll home-feed-viewport w-full snap-y snap-mandatory overflow-y-auto bg-black"
        style={{ overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch", touchAction: pullDistance > 0 ? "none" : "pan-y" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
      >
        {feedEntries.length ? (
          <>
            {feedEntries.map((entry, index) => (
              <FeedItem
                key={entry.item._id || `${entry.item.url}-${index}`}
                audioUnlockToken={audioUnlockToken}
                currentUser={currentUser}
                isAuthenticated={isAuthenticated}
                isActive={(activePostId || feedEntries[0]?.id) === entry.id}
                item={entry.item}
                soundEnabled={soundEnabled}
                onAudioPreferenceChange={updateAudioPreference}
                onAutoplayBlocked={handleAutoplayBlocked}
                onInvalid={removePost}
                onLike={handleLike}
                onDoubleTapLike={(post) => handleLike(post, { forceLike: true })}
                onOpenComments={(postId) => {
                  setCommentOpen(postId);
                  setCommentText("");
                }}
                onDownload={handleDownload}
                onSave={handleSave}
                onShare={handleShare}
                onViewed={handleViewed}
              />
            ))}
            <div ref={loadMoreRef} className="h-1 bg-slate-950" />
            {loadingMore && (
              <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center">
                <span className="rounded-full bg-slate-950/65 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white/75 backdrop-blur">
                  Loading more
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-white">
            <Search className="h-10 w-10 text-brand" />
            <h1 className="mt-4 text-2xl font-black">No fresh uploads yet</h1>
            <p className="mt-2 max-w-xs text-sm font-semibold text-white/60">
              Refresh for new videos or explore creators while the feed warms up.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" onClick={() => refreshFeed("empty-state")} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <Link to="/search" className="btn-secondary bg-white/10 text-white hover:bg-white/20">
                Explore
              </Link>
            </div>
          </div>
        )}
      </div>

      {error && feedEntries.length ? (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
          <div className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 shadow-xl">{error}</div>
        </div>
      ) : null}

      {networkStatus ? (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center px-4">
          <div className="rounded-full border border-white/10 bg-black/72 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white shadow-xl backdrop-blur">
            {networkStatus}
          </div>
        </div>
      ) : null}

      <CommentsSheet
        commentText={commentText}
        isAuthenticated={isAuthenticated}
        likedComments={likedComments}
        onClose={() => setCommentOpen("")}
        onCommentTextChange={setCommentText}
        onSubmit={handleComment}
        onToggleCommentLike={toggleCommentLike}
        post={activeCommentPost}
      />

    </section>
  );
};

export default Home;
