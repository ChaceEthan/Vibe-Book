// @ts-nocheck
import { CalendarCheck, Eye, Heart, MessageCircle, Search, Send, Share2, Star, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import PostMedia from "../components/PostMedia.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { feedApi, mediaUrl, userApi } from "../services/api";
import { isValidPost, usePostStore } from "../store/postStore";

const FEED_PAGE_SIZE = 10;

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
  const [viewedPosts, setViewedPosts] = useState(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const scrollerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const navigate = useNavigate();

  const loadFeed = useCallback(async (nextPage = 1, options = {}) => {
    const append = Boolean(options.append);

    if (append) {
      setLoadingMore(true);
    } else {
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
      const nextPosts = (Array.isArray(data?.posts) ? data.posts : Array.isArray(data?.feed) ? data.feed : []).filter(isValidPost);

      if (append) {
        mergePosts(nextPosts);
      } else {
        setPosts(nextPosts);
        scrollerRef.current?.scrollTo?.({ top: 0, behavior: "instant" });
      }

      setPage(nextPage);
      setHasMore(Boolean(data?.hasMore));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load feed.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [feedMode, mergePosts, setPosts]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    loadFeed(1);
  }, [loadFeed]);

  useEffect(() => {
    const handlePostCreated = (event) => {
      const post = event.detail?.post;

      if (!post?._id || !isValidPost(post)) {
        return;
      }

      prependPost(post);
    };

    window.addEventListener("vibebook:post-created", handlePostCreated);
    return () => window.removeEventListener("vibebook:post-created", handlePostCreated);
  }, []);

  const validPosts = useMemo(() => posts.filter(isValidPost), [posts]);

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
        rootMargin: "360px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadFeed, loading, loadingMore, page]);

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

  useEffect(() => {
    const preloaders = visibleFeed
      .filter((item) => item?.type === "video" && item.url)
      .slice(1, 3)
      .map((item) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.src = mediaUrl(item.url);
        video.load();
        return video;
      });

    return () => {
      preloaders.forEach((video) => {
        video.removeAttribute("src");
        video.load?.();
      });
    };
  }, [visibleFeed]);

  const replaceFeedItem = (nextItem) => {
    replacePost(nextItem);
  };

  const handleLike = async (item) => {
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
  };

  const handleFollow = async (item) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const profileId = item.userId?._id;

    if (!profileId || profileId === currentUser?._id) {
      return;
    }

    setError("");

    try {
      const isFollowing = Boolean(item.userId?.isFollowing);
      const { data } = isFollowing ? await userApi.unfollow(profileId) : await userApi.follow(profileId);
      const nextUser = data.user || {};

      updatePostsByUser(profileId, (profile) => ({
        ...profile,
        ...nextUser,
        isFollowing: !isFollowing,
        followerCount: Number(nextUser.followerCount ?? profile.followerCount ?? profile.followers?.length ?? 0),
      }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update follow.");
    }
  };

  const handleViewed = async (item) => {
    if (!item?._id || item.virtual || viewedPosts.has(item._id)) {
      return;
    }

    setViewedPosts((current) => {
      const next = new Set(current);
      next.add(item._id);
      return next;
    });

    try {
      const { data } = await feedApi.recordView(item._id);
      replaceFeedItem(data.feedItem);
    } catch {
      // View tracking should never interrupt playback.
    }
  };

  const handleShare = async (item) => {
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
  };

  const handleComment = async (event, item) => {
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
  };

  if (loading) {
    return (
      <section className="h-[calc(100dvh-9rem)] min-h-[560px] bg-slate-950 p-3">
        <div className="h-full animate-pulse rounded-lg bg-slate-800" />
      </section>
    );
  }

  if (error && !visibleFeed.length) {
    return (
      <section className="container-page flex min-h-[60vh] items-center justify-center py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">{error}</div>
      </section>
    );
  }

  return (
    <section className="relative bg-slate-950">
      <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 rounded-lg bg-slate-950/60 p-1 text-xs font-black text-white backdrop-blur">
        {[
          { value: "for-you", label: "For You" },
          { value: "following", label: "Following" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rounded-lg px-4 py-2 ${feedMode === option.value ? "bg-brand text-navy" : "text-white/75"}`}
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
      <div ref={scrollerRef} className="mx-auto h-[calc(100dvh-9rem)] min-h-[560px] max-w-xl snap-y snap-mandatory overflow-y-auto scroll-smooth">
        {visibleFeed.length ? (
          <>
          {visibleFeed.map((item) => {
            const profile = item.userId || {};
            const profileImage = profile.profilePicture || profile.profileImage || profile.images?.[0] || "/logo.png";
            const comments = Array.isArray(item.comments) ? item.comments : [];

            return (
              <article key={item._id} className="relative h-full snap-start overflow-hidden bg-slate-900">
                <PostMedia
                  post={item}
                  alt={profile.name || "VibeBook media"}
                  className="h-full w-full object-cover"
                  imageClassName="h-full w-full object-cover"
                  videoClassName="h-full w-full object-cover"
                  placeholderClassName="h-full w-full"
                  muted
                  loop
                  autoPlay
                  controls
                  onViewed={() => handleViewed(item)}
                  onInvalid={() => removePost(item._id)}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/10 to-transparent" />

                <div className="absolute bottom-5 left-4 right-24 text-white">
                  <div className="flex min-w-0 items-center gap-3">
                    <Link to={isAuthenticated ? `/profile/${profile._id}` : "/login"} className="shrink-0">
                      <img src={mediaUrl(profileImage)} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-white/30" />
                    </Link>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <h1 className="min-w-0 truncate text-2xl font-black">{profile.name}</h1>
                        {profile.premiumBadge || profile.isPremium ? (
                          <span className="shrink-0 rounded-full bg-brand px-2 py-1 text-[10px] font-black uppercase text-navy">Premium</span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-white/80">
                        {profile.category || "Entertainment professional"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3 text-xs font-bold text-white/80">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {Number(profile.rating || profile.averageRating || 0).toFixed(1)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      {Number(item.views || 0)}
                    </span>
                    <span className="max-w-full truncate">
                      {profile.province || "Rwanda"}{profile.district ? `, ${profile.district}` : ""}
                    </span>
                  </div>

                  {item.caption && <p className="mt-3 line-clamp-2 text-sm font-semibold text-white">{item.caption}</p>}
                  {Array.isArray(item.tags) && item.tags.length > 0 && (
                    <p className="mt-2 line-clamp-1 text-xs font-bold text-brand">
                      {item.tags.slice(0, 4).map((tag) => `#${tag}`).join(" ")}
                    </p>
                  )}

                  {commentOpen === item._id && (
                    <div className="mt-4 rounded-lg bg-slate-950/70 p-3 backdrop-blur">
                      {comments.length ? (
                        <div className="mb-3 max-h-28 space-y-2 overflow-y-auto text-xs">
                          {comments.slice(-3).map((comment) => (
                            <p key={comment._id || `${comment.name}-${comment.createdAt}`} className="truncate text-white/85">
                              <span className="font-black">{comment.name || "User"}:</span> {comment.message}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {!item.virtual && (
                        <form className="flex gap-2" onSubmit={(event) => handleComment(event, item)}>
                          <input
                            className="min-w-0 flex-1 rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                            value={commentText}
                            onChange={(event) => setCommentText(event.target.value)}
                            placeholder="Add comment"
                          />
                          <button type="submit" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-navy" aria-label="Send comment">
                            <Send className="h-4 w-4" />
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                <div className="absolute bottom-8 right-4 flex flex-col items-center gap-4">
                  <button
                    type="button"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
                    onClick={() => handleLike(item)}
                    aria-label="Like media"
                  >
                    <Heart className={`h-6 w-6 ${item.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
                  </button>
                  <span className="-mt-3 max-w-12 truncate text-xs font-bold text-white">{Number(item.likes || item.likeCount || 0)}</span>

                  <button
                    type="button"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
                    onClick={() => setCommentOpen((current) => (current === item._id ? "" : item._id))}
                    aria-label="Comment"
                  >
                    <MessageCircle className="h-6 w-6" />
                  </button>
                  <span className="-mt-3 max-w-12 truncate text-xs font-bold text-white">{Number(item.commentCount || 0)}</span>

                  <button
                    type="button"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
                    onClick={() => handleShare(item)}
                    aria-label="Share post"
                  >
                    <Share2 className="h-6 w-6" />
                  </button>
                  <span className="-mt-3 max-w-12 truncate text-xs font-bold text-white">{Number(item.shareCount || 0)}</span>

                  <button
                    type="button"
                    className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur ${
                      profile.isFollowing ? "bg-white text-navy" : "bg-brand text-navy"
                    }`}
                    onClick={() => handleFollow(item)}
                    aria-label={profile.isFollowing ? "Unfollow profile" : "Follow profile"}
                  >
                    {profile.isFollowing ? <UserMinus className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
                  </button>
                  <span className="-mt-3 max-w-16 truncate text-xs font-bold text-white">
                    {profile.isFollowing ? "Following" : Number(profile.followerCount || 0)}
                  </span>

                  <Link
                    to={isAuthenticated ? `/profile/${profile._id}` : "/login"}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-navy shadow-lg"
                    aria-label="Book profile"
                  >
                    <CalendarCheck className="h-6 w-6" />
                  </Link>
                </div>
              </article>
            );
          })}
          <div ref={loadMoreRef} className="flex h-24 snap-end items-center justify-center bg-slate-950 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
            {loadingMore ? "Loading more" : hasMore ? "More vibes incoming" : "Caught up"}
          </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-white">
            <Search className="h-10 w-10 text-brand" />
            <h1 className="mt-4 text-2xl font-black">No uploads yet</h1>
            <Link to="/search" className="btn-primary mt-5">
              Explore
            </Link>
          </div>
        )}
      </div>
    </section>
  );
};

export default Home;
