// @ts-nocheck
import {
  BadgeCheck,
  Bookmark,
  Heart,
  MessageCircle,
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
import { useAuth } from "../context/AuthContext.jsx";
import { feedApi, getApiErrorMessage, isRetryableApiError, mediaUrl, userApi } from "../services/api";
import { isValidPost, usePostStore } from "../store/postStore";

const FEED_PAGE_SIZE = 10;
const FEED_AUDIO_PREFERENCE_KEY = "vibebook:feed-audio";

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

const initialsFor = (value = "VibeBook") =>
  String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "VB";

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
  <div className="flex min-w-0 flex-col items-center gap-1">
    <button
      type="button"
      className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg backdrop-blur transition duration-150 active:scale-90 sm:h-12 sm:w-12 ${
        active ? "scale-105 bg-white text-navy" : "bg-slate-950/28 hover:bg-slate-950/45"
      }`}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
    <span className="max-w-14 truncate text-[10px] font-black leading-none text-white drop-shadow sm:text-[11px]">{count}</span>
  </div>
));

const FeedItem = memo(
  ({
    currentUser,
    isAuthenticated,
    item,
    onFollow,
    onInvalid,
    onLike,
    onOpenComments,
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
    const isOwnProfile = currentUser?._id && profile._id && currentUser._id === profile._id;
    const verified = Boolean(profile.verified || profile.isVerified);
    const comments = Array.isArray(item.comments) ? item.comments : [];
    const commentsCount = item.commentCount ?? item.commentsCount ?? comments.length;
    const saveCount = item.saveCount ?? item.saves ?? 0;
    const caption = String(item.caption || "");
    const hasLongCaption = caption.length > 120;
    const currentUserImage = currentUser?.profilePicture || currentUser?.profileImage || currentUser?.images?.[0] || "";

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
      addActivityBurst("like");
      onLike(item);
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
          imageClassName="h-full w-full object-contain"
          videoClassName="h-full w-full object-contain"
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
          onDoubleTap={handleLikePress}
          onViewed={(metrics) => onViewed(item, metrics)}
          onInvalid={() => onInvalid(item._id)}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-slate-950/35 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[34%] bg-gradient-to-t from-slate-950/70 via-slate-950/18 to-transparent" />

        <div className="home-feed-caption absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 right-[5.1rem] z-20 text-white sm:bottom-[calc(5.4rem+env(safe-area-inset-bottom))] sm:left-5 sm:right-28">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={profilePath} className="shrink-0" aria-label="Open creator profile">
              <SafeAvatar user={profile} src={mediaUrl(profileImage)} className="h-12 w-12 rounded-full object-cover ring-2 ring-white/60 shadow-xl" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <Link to={profilePath} className="min-w-0 truncate text-base font-black leading-tight text-white sm:text-lg">
                  @{profile.username || profile.name || "creator"}
                </Link>
                {verified && <BadgeCheck className="h-4 w-4 shrink-0 fill-sky-400 text-white" aria-label="Verified" />}
                {profile.premiumBadge || profile.isPremium ? (
                  <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-black uppercase text-navy">Premium</span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-xs font-bold text-white/75">
                {profile.name || "VibeBook creator"}{profile.category ? ` - ${profile.category}` : ""}
              </p>
            </div>
            {!isOwnProfile && profile._id && (
              <button
                type="button"
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black shadow-lg transition active:scale-95 ${
                  profile.isFollowing ? "bg-white/20 text-white backdrop-blur" : "bg-brand text-navy"
                }`}
                onClick={() => onFollow(item)}
              >
                {profile.isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>

          {caption && (
            <div className="mt-2 max-w-[34rem] text-sm font-semibold leading-5 text-white drop-shadow">
              <p className={captionExpanded ? "" : "line-clamp-2"}>{caption}</p>
              {hasLongCaption && (
                <button
                  type="button"
                  className="mt-1 text-xs font-black text-white/75 hover:text-white"
                  onClick={() => setCaptionExpanded((value) => !value)}
                >
                  {captionExpanded ? "less" : "more"}
                </button>
              )}
            </div>
          )}
          {Array.isArray(item.tags) && item.tags.length > 0 && (
            <p className="mt-1 line-clamp-1 text-xs font-black leading-5 text-brand drop-shadow">
              {item.tags.slice(0, 6).map((tag) => `#${tag}`).join(" ")}
            </p>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-[calc(9rem+env(safe-area-inset-bottom))] right-16 z-30 flex flex-col items-end gap-2">
          {activityBursts.map((burst) => (
            <div key={burst.id} className="activity-bubble flex items-center gap-2 rounded-full bg-white/90 py-1 pl-1 pr-3 text-xs font-black text-navy shadow-xl">
              <span className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full ${burst.kind === "like" ? "bg-red-500 text-white" : "bg-brand text-navy"}`}>
                {burst.kind === "like" && currentUserImage ? (
                  <SafeAvatar user={currentUser} src={mediaUrl(currentUserImage)} className="h-full w-full object-cover" />
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

        <div className="home-feed-actions absolute bottom-[calc(4.9rem+env(safe-area-inset-bottom))] right-3 z-20 flex flex-col items-center gap-2.5 sm:bottom-[calc(5.3rem+env(safe-area-inset-bottom))] sm:right-5">
          <ActionButton active={item.likedByViewer} count={formatCount(item.likes || item.likeCount)} label="Like media" onClick={handleLikePress}>
            <Heart className={`h-6 w-6 ${item.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
          </ActionButton>

          <ActionButton count={formatCount(commentsCount)} label="Open comments" onClick={() => onOpenComments(item._id)}>
            <MessageCircle className="h-6 w-6" />
          </ActionButton>

          <ActionButton count={formatCount(item.shareCount)} label="Share post" onClick={() => onShare(item)}>
            <Share2 className="h-6 w-6" />
          </ActionButton>

          <ActionButton active={item.savedByViewer} count={formatCount(saveCount)} label="Save post" onClick={() => onSave(item)}>
            <Bookmark className={`h-6 w-6 ${item.savedByViewer ? "fill-brand text-brand" : ""}`} />
          </ActionButton>
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
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-xs font-black text-white">
                      <SafeAvatar user={comment.user || comment} src={avatar ? mediaUrl(avatar) : ""} className="h-full w-full object-cover" />
                    </div>
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
  const posts = usePostStore((state) => state.posts);
  const setPosts = usePostStore((state) => state.setPosts);
  const mergePosts = usePostStore((state) => state.mergePosts);
  const prependPost = usePostStore((state) => state.prependPost);
  const replacePost = usePostStore((state) => state.replacePost);
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
  const [activePostId, setActivePostId] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(readFeedAudioPreference);
  const [audioUnlockToken, setAudioUnlockToken] = useState(0);
  const scrollerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const feedRequestRef = useRef("");
  const activeRatiosRef = useRef(new Map());
  const lastAudioUnlockRef = useRef(0);
  const viewedPostsRef = useRef(new Set());
  const retryTimerRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const pullStartYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const isPullingRef = useRef(false);
  const navigate = useNavigate();

  const replaceFeedItem = useCallback((nextItem) => {
    replacePost(nextItem);
  }, [replacePost]);

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
      retryAttemptRef.current = 0;
      loadFeed(1, { reconnect: true, preserveScroll: true });
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [loadFeed]);

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

        return true;
      }),
    [validPosts, feedMode]
  );

  const activeCommentPost = useMemo(() => visibleFeed.find((item) => item._id === commentOpen), [commentOpen, visibleFeed]);
  const nextVideoPreloadUrl = useMemo(() => {
    const nextVideo = visibleFeed.find((item) => item?.type === "video" && item.url && (item._id || item.url) !== activePostId);
    return nextVideo?.url ? mediaUrl(nextVideo.url) : "";
  }, [activePostId, visibleFeed]);

  useEffect(() => {
    const firstId = visibleFeed[0]?._id || visibleFeed[0]?.url || "";

    setActivePostId((current) => {
      if (current && visibleFeed.some((item) => (item._id || item.url) === current)) {
        return current;
      }

      return firstId;
    });
  }, [visibleFeed]);

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
  }, [visibleFeed]);

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

  const handleLike = useCallback(async (item) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    try {
      if (item.virtual) {
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

      const { data } = await feedApi.toggleLike(item._id);
      replaceFeedItem(data.feedItem);
    } catch {
      navigate(`/profile/${item.userId?._id}`);
    }
  }, [isAuthenticated, navigate, replaceFeedItem, updatePostsByUser]);

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
      replaceFeedItem(data.feedItem);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save this post.");
    }
  }, [isAuthenticated, navigate, replaceFeedItem]);

  const handleFollow = useCallback(async (item) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const profileId = item.userId?._id;

    if (!profileId || profileId === currentUser?._id) {
      return;
    }

    setError("");

    const isFollowing = Boolean(item.userId?.isFollowing);
    const delta = isFollowing ? -1 : 1;

    updatePostsByUser(profileId, (profile) => ({
      ...profile,
      isFollowing: !isFollowing,
      followerCount: Math.max(0, Number(profile.followerCount ?? profile.followers?.length ?? 0) + delta),
    }));

    try {
      const { data } = isFollowing ? await userApi.unfollow(profileId) : await userApi.follow(profileId);
      const nextUser = data.user || {};

      updatePostsByUser(profileId, (profile) => ({
        ...profile,
        ...nextUser,
        isFollowing: !isFollowing,
        followerCount: Number(nextUser.followerCount ?? profile.followerCount ?? profile.followers?.length ?? 0),
      }));
    } catch (requestError) {
      updatePostsByUser(profileId, (profile) => ({
        ...profile,
        isFollowing,
        followerCount: Math.max(0, Number(profile.followerCount ?? profile.followers?.length ?? 0) - delta),
      }));
      setError(requestError.response?.data?.message || "Unable to update follow.");
    }
  }, [currentUser?._id, isAuthenticated, navigate, updatePostsByUser]);

  const handleViewed = useCallback(async (item, metrics = {}) => {
    if (!item?._id || item.virtual || viewedPostsRef.current.has(item._id)) {
      return;
    }

    viewedPostsRef.current.add(item._id);

    try {
      const { data } = await feedApi.recordView(item._id, metrics);
      replaceFeedItem(data.feedItem);
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
        replaceFeedItem(data.feedItem);
      }
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError("Unable to share this post.");
      }
    }
  }, [replaceFeedItem]);

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
      replaceFeedItem(data.feedItem);
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
        <div className="flex flex-col items-center gap-3">
          <div className="h-24 w-24 animate-pulse rounded-full bg-slate-800" />
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Loading fresh videos</p>
        </div>
      </section>
    );
  }

  if (error && !visibleFeed.length) {
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
    <section className="home-feed-viewport relative overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-3">
        <div className="pointer-events-auto flex rounded-full bg-slate-950/55 p-1 text-xs font-black text-white shadow-xl backdrop-blur">
          {[
            { value: "for-you", label: "For You" },
            { value: "following", label: "Following" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-full px-4 py-2 transition ${feedMode === option.value ? "bg-white text-navy" : "text-white/75 hover:text-white"}`}
              onClick={() => {
                if (option.value === "following" && !isAuthenticated) {
                  navigate("/login");
                  return;
                }

                setFeedMode(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {(refreshing || pullDistance > 4) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-12 z-40 flex justify-center transition duration-200"
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
        className="home-feed-scroll home-feed-viewport w-full snap-y snap-mandatory overflow-y-auto bg-slate-950"
        style={{ overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch", touchAction: pullDistance > 0 ? "none" : "pan-y" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
      >
        {visibleFeed.length ? (
          <>
            {visibleFeed.map((item, index) => (
              <FeedItem
                key={item._id || `${item.url}-${index}`}
                audioUnlockToken={audioUnlockToken}
                currentUser={currentUser}
                isAuthenticated={isAuthenticated}
                isActive={(activePostId || visibleFeed[0]?._id || visibleFeed[0]?.url) === (item._id || item.url)}
                item={item}
                soundEnabled={soundEnabled}
                onAudioPreferenceChange={updateAudioPreference}
                onAutoplayBlocked={handleAutoplayBlocked}
                onFollow={handleFollow}
                onInvalid={removePost}
                onLike={handleLike}
                onOpenComments={(postId) => {
                  setCommentOpen(postId);
                  setCommentText("");
                }}
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
            <p className="mt-2 max-w-xs text-sm font-semibold text-white/60">Refresh for new videos or explore creators while the feed warms up.</p>
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

      {error && visibleFeed.length ? (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
          <div className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 shadow-xl">{error}</div>
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
