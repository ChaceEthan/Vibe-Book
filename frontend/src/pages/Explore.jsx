// @ts-nocheck
import { Eye, Flame, Heart, Play, Sparkles, Star, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import PostMedia from "../components/PostMedia.jsx";
import ProfileCard from "../components/ProfileCard.jsx";
import { exploreApi } from "../services/api";

const numberLabel = (value) => Number(value || 0).toLocaleString();

const VideoCard = ({ post, featured = false }) => {
  const profile = post?.userId || {};

  return (
    <article className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft ${featured ? "md:col-span-2" : ""}`}>
      <div className="relative aspect-[9/14] bg-slate-950 sm:aspect-video">
        <PostMedia
          post={post}
          alt={post?.caption || profile?.name || "VibeBook media"}
          controls
          muted
          loop
          className="h-full w-full"
          imageClassName="h-full w-full object-contain"
          videoClassName="h-full w-full object-contain"
          placeholderClassName="h-full w-full"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent p-4 text-white">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-brand">
            <TrendingUp className="h-4 w-4" />
            Score {numberLabel(post?.trendingScore || post?.score)}
          </div>
          <h3 className="mt-2 line-clamp-2 text-lg font-black">{post?.caption || profile?.name || "Trending post"}</h3>
          <Link to={`/profile/${profile?._id || ""}`} className="mt-2 inline-flex text-sm font-bold text-white/80">
            @{profile?.name || "creator"}
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100 text-center text-xs font-bold text-slate-600">
        <span className="flex items-center justify-center gap-1 p-3">
          <Eye className="h-4 w-4" />
          {numberLabel(post?.views)}
        </span>
        <span className="flex items-center justify-center gap-1 p-3">
          <Heart className="h-4 w-4 text-red-500" />
          {numberLabel(post?.likes || post?.likeCount)}
        </span>
        <span className="flex items-center justify-center gap-1 p-3">
          <Play className="h-4 w-4" />
          {numberLabel(post?.commentCount || post?.commentsCount)}
        </span>
      </div>
    </article>
  );
};

const CreatorStrip = ({ creators = [] }) => {
  if (!creators.length) {
    return null;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {creators.slice(0, 6).map((creator) => (
        <Link
          key={creator._id}
          to={`/profile/${creator._id}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="min-w-0">
            <p className="truncate font-black text-navy">{creator.name}</p>
            <p className="truncate text-xs font-semibold text-slate-500">{creator.location || creator.district || creator.province || "Rwanda"}</p>
            <p className="mt-1 text-xs font-bold text-brand">{numberLabel(creator.totalViews)} views</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-navy">
            {Number(creator.rating || creator.averageRating || 0).toFixed(1)}
          </div>
        </Link>
      ))}
    </div>
  );
};

const Explore = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadExplore = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await exploreApi.get();
        if (active) {
          setData(response.data || {});
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.message || "Unable to load explore.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadExplore();
    return () => {
      active = false;
    };
  }, []);

  const trendingVideos = useMemo(() => data?.trendingVideos || [], [data]);
  const mostLikedVideos = useMemo(() => data?.mostLikedVideos || [], [data]);
  const mostViewedCreators = useMemo(() => data?.mostViewedCreators || [], [data]);
  const recommendedCreators = useMemo(() => data?.recommendedCreators || [], [data]);

  if (loading) {
    return (
      <section className="container-page py-10">
        <div className="h-[520px] animate-pulse rounded-lg bg-slate-200" />
      </section>
    );
  }

  return (
    <section className="container-page space-y-10 py-10">
      <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white shadow-soft">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-black uppercase text-navy">
            <Flame className="h-4 w-4" />
            Explore
          </p>
          <h1 className="mt-5 text-4xl font-black leading-tight md:text-6xl">Discover creators people are actually watching.</h1>
          <p className="mt-4 text-sm leading-6 text-white/70">
            Trending now weighs watch time, completion, replays, shares, saves, comments, freshness, and small-creator momentum.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/search" className="btn-primary">
              Discover creators
            </Link>
            <Link to="/" className="btn-secondary bg-white text-navy">
              Watch feed
            </Link>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase text-brand">Trending videos</p>
            <h2 className="text-2xl font-black text-navy">Highest engagement right now</h2>
          </div>
          <Sparkles className="h-7 w-7 text-brand" />
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {trendingVideos.slice(0, 7).map((post, index) => (
            <VideoCard key={post._id} post={post} featured={index === 0} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Heart className="h-5 w-5 text-red-500" />
          <h2 className="text-2xl font-black text-navy">Most liked videos</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {mostLikedVideos.slice(0, 4).map((post) => (
            <VideoCard key={post._id} post={post} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-brand" />
          <h2 className="text-2xl font-black text-navy">Most viewed creators</h2>
        </div>
        <CreatorStrip creators={mostViewedCreators} />
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
          <h2 className="text-2xl font-black text-navy">Recommended creators</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {recommendedCreators.slice(0, 9).map((creator) => (
            <ProfileCard key={creator._id} user={creator} />
          ))}
        </div>
      </section>
    </section>
  );
};

export default Explore;
