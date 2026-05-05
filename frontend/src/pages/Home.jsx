// @ts-nocheck
import { CalendarCheck, Heart, MessageCircle, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl, userApi } from "../services/api";

const toEmbedUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = parsed.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    }

    if (host === "youtu.be") {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    }

    return url;
  } catch {
    return url;
  }
};

const FeedMedia = ({ user }) => {
  const video = (user?.videos || user?.videoUrls || []).filter(Boolean)[0];
  const image = user?.profilePicture || user?.profileImage || user?.images?.[0] || user?.gallery?.[0] || "/logo.png";

  if (video) {
    const src = mediaUrl(video);

    if (video.startsWith("/uploads") || /\.(mp4|mov)(\?|$)/i.test(video)) {
      return <video src={src} className="h-full w-full object-cover" muted loop playsInline controls preload="metadata" />;
    }

    return (
      <iframe
        src={toEmbedUrl(src)}
        title={`${user.name} video`}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return <img src={mediaUrl(image)} alt={user.name} className="h-full w-full object-cover" />;
};

const Home = () => {
  const { isAuthenticated, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await userApi.search({});
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const visibleUsers = useMemo(() => users.filter((item) => item?._id !== currentUser?._id), [users, currentUser?._id]);

  const handleLike = async (profile) => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    try {
      const { data } = profile.likedByViewer ? await userApi.unlikeProfile(profile._id) : await userApi.likeProfile(profile._id);
      setUsers((current) => current.map((item) => (item._id === profile._id ? data.user : item)));
    } catch {
      navigate(`/profile/${profile._id}`);
    }
  };

  if (loading) {
    return (
      <section className="h-[calc(100dvh-9rem)] min-h-[560px] bg-slate-950 p-3">
        <div className="h-full animate-pulse rounded-lg bg-slate-800" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="container-page flex min-h-[60vh] items-center justify-center py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">{error}</div>
      </section>
    );
  }

  return (
    <section className="bg-slate-950">
      <div className="mx-auto h-[calc(100dvh-9rem)] min-h-[560px] max-w-xl snap-y snap-mandatory overflow-y-auto">
        {visibleUsers.length ? (
          visibleUsers.map((profile) => (
            <article key={profile._id} className="relative h-full snap-start overflow-hidden bg-slate-900">
              <FeedMedia user={profile} />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/10 to-transparent" />

              <div className="absolute bottom-5 left-4 right-24 text-white">
                <div className="flex items-center gap-2">
                  <h1 className="min-w-0 truncate text-2xl font-black">{profile.name}</h1>
                  {profile.premiumBadge || profile.isPremium ? (
                    <span className="rounded-full bg-brand px-2 py-1 text-[10px] font-black uppercase text-navy">Premium</span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-semibold text-white/80">{profile.category || "Entertainment professional"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-white/80">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {Number(profile.rating || profile.averageRating || 0).toFixed(1)}
                  </span>
                  <span>{profile.province || "Rwanda"}{profile.district ? `, ${profile.district}` : ""}</span>
                </div>
              </div>

              <div className="absolute bottom-8 right-4 flex flex-col items-center gap-4">
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
                  onClick={() => handleLike(profile)}
                  aria-label="Like profile"
                >
                  <Heart className={`h-6 w-6 ${profile.likedByViewer ? "fill-red-500 text-red-500" : ""}`} />
                </button>
                <span className="-mt-3 text-xs font-bold text-white">{Number(profile.likes || profile.likeCount || 0)}</span>

                <Link
                  to={isAuthenticated ? `/chat/${profile._id}` : "/login"}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
                  aria-label="Message profile"
                >
                  <MessageCircle className="h-6 w-6" />
                </Link>

                <Link
                  to={isAuthenticated ? `/profile/${profile._id}` : "/login"}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-navy shadow-lg"
                  aria-label="Book profile"
                >
                  <CalendarCheck className="h-6 w-6" />
                </Link>
              </div>
            </article>
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-white">
            <Search className="h-10 w-10 text-brand" />
            <h1 className="mt-4 text-2xl font-black">No profiles yet</h1>
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
