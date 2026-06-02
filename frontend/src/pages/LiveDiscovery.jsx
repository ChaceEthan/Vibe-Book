// @ts-nocheck
import { Loader2, Radio, RefreshCw, Search, Users, Video } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import SafeAvatar from "../components/SafeAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl } from "../services/api";
import { connectSocket } from "../services/socket";
import { useLiveStreamStore } from "../store/livestreamStore";

const formatCount = (value = 0) => {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return number.toLocaleString();
};

const streamImageFor = (stream = {}) => {
  const creator = stream.creator || {};
  return stream.thumbnail || stream.coverImage || creator.coverImage || creator.profilePicture || creator.profileImage || creator.avatar || "/logo.png";
};

const creatorNameFor = (stream = {}) => {
  const creator = stream.creator || {};
  return creator.username || creator.name || stream.creatorUsername || "VibeBook creator";
};

const LiveDiscoveryCard = memo(({ stream, onJoin }) => {
  const creator = stream.creator || {};
  const image = streamImageFor(stream);
  const username = creatorNameFor(stream);

  return (
    <button
      type="button"
      className="group relative min-h-[11.5rem] overflow-hidden rounded-lg border border-white/10 bg-white/8 text-left text-white shadow-[0_18px_42px_rgba(0,0,0,0.38)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/55 hover:bg-white/12 active:scale-[0.99]"
      onClick={() => onJoin(stream)}
    >
      <img src={mediaUrl(image)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-300 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/22 via-black/28 to-black/92" />
      <div className="relative z-10 flex min-h-[11.5rem] flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black uppercase text-white shadow-[0_0_20px_rgba(220,38,38,0.62)]">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            LIVE
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/62 px-2 py-1 text-[10px] font-black text-white backdrop-blur">
            <Users className="h-3.5 w-3.5" />
            {formatCount(stream.viewerCount || stream.stats?.viewerCount || 0)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="live-avatar-ring relative inline-flex rounded-full p-[2px]">
            <SafeAvatar user={creator} src={creator.profilePicture || creator.profileImage || creator.avatar || image} className="h-12 w-12 rounded-full border-2 border-black/45 object-cover" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-black drop-shadow">@{String(username).replace(/^@+/, "")}</span>
            <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-white/76">
              <Radio className="h-3.5 w-3.5 text-red-300" />
              Join live now
            </span>
          </span>
        </div>
      </div>
    </button>
  );
});

const LiveDiscovery = () => {
  const navigate = useNavigate();
  const { isAuthenticated, token } = useAuth();
  const activeLiveStreams = useLiveStreamStore((state) => state.activeLiveStreams);
  const loading = useLiveStreamStore((state) => state.loading);
  const error = useLiveStreamStore((state) => state.error);
  const getActiveLiveStreams = useLiveStreamStore((state) => state.getActiveLiveStreams);
  const upsertLiveStream = useLiveStreamStore((state) => state.upsertLiveStream);
  const removeLiveStream = useLiveStreamStore((state) => state.removeLiveStream);
  const applyViewerCount = useLiveStreamStore((state) => state.applyViewerCount);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const loadStreams = useCallback(async (silent = false) => {
    setRefreshing(!silent);
    try {
      await getActiveLiveStreams(60, 0, { silent });
    } finally {
      setRefreshing(false);
    }
  }, [getActiveLiveStreams]);

  useEffect(() => {
    loadStreams(true);
    const timer = window.setInterval(() => loadStreams(true), 30000);
    return () => window.clearInterval(timer);
  }, [loadStreams]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = connectSocket(token);
    if (!socket) return undefined;

    const handleLiveStarted = (payload = {}) => {
      if (payload.stream) upsertLiveStream(payload.stream);
      else loadStreams(true);
    };
    const handleLiveEnded = (payload = {}) => removeLiveStream(payload.streamId || payload.stream?.id);
    const handleViewerUpdate = (payload = {}) => {
      if (payload.streamId) applyViewerCount(payload.streamId, Number(payload.viewerCount || 0), payload.maxViewers ?? null);
    };

    socket.on("livestream:started", handleLiveStarted);
    socket.on("livestream:ended_global", handleLiveEnded);
    socket.on("livestream:viewers_updated_global", handleViewerUpdate);

    return () => {
      socket.off("livestream:started", handleLiveStarted);
      socket.off("livestream:ended_global", handleLiveEnded);
      socket.off("livestream:viewers_updated_global", handleViewerUpdate);
    };
  }, [applyViewerCount, loadStreams, removeLiveStream, token, upsertLiveStream]);

  const streams = useMemo(() => {
    const search = query.trim().toLowerCase();
    const liveStreams = activeLiveStreams.filter((stream) => stream?.id && stream.isLive !== false && stream.status !== "ended");
    if (!search) return liveStreams;

    return liveStreams.filter((stream) => {
      const creator = stream.creator || {};
      return [creator.username, creator.name, stream.title, stream.category].filter(Boolean).join(" ").toLowerCase().includes(search);
    });
  }, [activeLiveStreams, query]);

  const handleJoin = useCallback((stream) => {
    if (!stream?.id) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    navigate(`/live/${stream.id}`);
  }, [isAuthenticated, navigate]);

  return (
    <section className="min-h-screen bg-black pb-[calc(5rem+env(safe-area-inset-bottom))] text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/90 px-4 pb-3 pt-[calc(0.9rem+env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition hover:bg-white/14" onClick={() => navigate("/")}>
            <Video className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-lg font-black text-brand drop-shadow-[0_0_14px_rgba(34,197,94,0.45)]">Vibebook</p>
            <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              LIVE
            </div>
          </div>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition hover:bg-white/14 disabled:opacity-55" onClick={() => loadStreams(false)} disabled={refreshing || loading}>
            <RefreshCw className={`h-5 w-5 ${refreshing || loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="mx-auto mt-3 flex max-w-5xl items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-white/72" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/45"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search live creators"
          />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-5xl gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {streams.map((stream) => (
          <LiveDiscoveryCard key={stream.id} stream={stream} onJoin={handleJoin} />
        ))}
      </div>

      {!streams.length && (
        <div className="mx-auto flex min-h-[56vh] max-w-sm flex-col items-center justify-center px-6 text-center">
          {loading || refreshing ? <Loader2 className="h-10 w-10 animate-spin text-brand" /> : <Radio className="h-10 w-10 text-red-400" />}
          <h1 className="mt-4 text-2xl font-black">{loading || refreshing ? "Loading live streams" : "No one is live right now"}</h1>
          <p className="mt-2 text-sm font-semibold text-white/58">{error || "Creators will appear here the moment they go live."}</p>
          <button type="button" className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-black text-black shadow-[0_0_22px_rgba(34,197,94,0.42)] transition hover:bg-emerald-300" onClick={() => loadStreams(false)}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      )}
    </section>
  );
};

export default LiveDiscovery;
