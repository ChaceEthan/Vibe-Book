// @ts-nocheck
import { CalendarCheck, Heart, MessageCircle, Search, Send, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { feedApi, mediaUrl, userApi } from "../services/api";

const FeedMedia = ({ item }) => {
  const src = mediaUrl(item.mediaUrl);

  if (item.type === "video") {
    return (
      <video
        src={src}
        className="h-full w-full object-cover"
        muted
        loop
        playsInline
        controls
        autoPlay
        preload="metadata"
        style={{ width: "100%", borderRadius: "12px" }}
      />
    );
  }

  return <img src={src} alt={item.userId?.name || "VibeBook media"} className="h-full w-full object-cover" />;
};

const Home = () => {
  const { isAuthenticated, user: currentUser } = useAuth();
  const [feed, setFeed] = useState([]);
  const [feedMode, setFeedMode] = useState("for-you");
  const [commentOpen, setCommentOpen] = useState("");
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await feedApi.get(feedMode === "following" ? { mode: "following" } : {});
      setFeed(Array.isArray(data?.feed) ? data.feed : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load feed.");
    } finally {
      setLoading(false);
    }
  }, [feedMode]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const visibleFeed = useMemo(
    () =>
      feed.filter((item) => {
        if (item?.userId?._id === currentUser?._id) {
          return false;
        }

        if (feedMode === "following") {
          return Boolean(item?.userId?.isFollowing);
        }

        return true;
      }),
    [feed, currentUser?._id, feedMode]
  );

  const replaceFeedItem = (nextItem) => {
    setFeed((current) => current.map((item) => (item._id === nextItem._id ? nextItem : item)));
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
        setFeed((current) =>
          current.map((feedItem) =>
            feedItem.userId?._id === item.userId._id
              ? {
                  ...feedItem,
                  likedByViewer: !item.likedByViewer,
                  likes: data.user?.likes || data.user?.likeCount || feedItem.likes,
                  likeCount: data.user?.likes || data.user?.likeCount || feedItem.likeCount,
                }
              : feedItem
          )
        );
        return;
      }

      const { data } = await feedApi.toggleLike(item._id);
      replaceFeedItem(data.feedItem);
    } catch {
      navigate(`/profile/${item.userId?._id}`);
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
      <div className="mx-auto h-[calc(100dvh-9rem)] min-h-[560px] max-w-xl snap-y snap-mandatory overflow-y-auto">
        {visibleFeed.length ? (
          visibleFeed.map((item) => {
            const profile = item.userId || {};
            const profileImage = profile.profilePicture || profile.profileImage || profile.images?.[0] || "/logo.png";
            const comments = Array.isArray(item.comments) ? item.comments : [];

            return (
              <article key={item._id} className="relative h-full snap-start overflow-hidden bg-slate-900">
                <FeedMedia item={item} />
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
                    <span className="max-w-full truncate">
                      {profile.province || "Rwanda"}{profile.district ? `, ${profile.district}` : ""}
                    </span>
                  </div>

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
          })
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
