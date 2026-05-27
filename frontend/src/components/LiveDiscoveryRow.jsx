// @ts-nocheck
import { ChevronLeft, ChevronRight, Radio, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { connectSocket } from "../services/socket";
import { useLiveStreamStore } from "../store/livestreamStore";
import SafeCoverImage from "./SafeCoverImage.jsx";

const thumbnailFor = (stream = {}) => stream.thumbnail || stream.coverImage || stream.creator?.coverImage || stream.creator?.avatar || stream.creator?.profilePicture || "";

const LiveDiscoveryRow = ({ onStreamClick }) => {
  const { token } = useAuth();
  const {
    activeLiveStreams,
    applyViewerCount,
    getActiveLiveStreams,
    loading,
    removeLiveStream,
    upsertLiveStream,
  } = useLiveStreamStore();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const containerRef = useRef(null);

  const updateScrollState = () => {
    const element = containerRef.current;
    if (!element) return;

    setCanScrollLeft(element.scrollLeft > 8);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 8);
  };

  useEffect(() => {
    getActiveLiveStreams(50, 0);
    const interval = window.setInterval(() => {
      getActiveLiveStreams(50, 0, { silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [getActiveLiveStreams]);

  useEffect(() => {
    updateScrollState();
  }, [activeLiveStreams.length]);

  useEffect(() => {
    const socket = connectSocket(token);
    if (!socket) return undefined;

    const handleStarted = (payload = {}) => {
      if (payload.stream) {
        upsertLiveStream(payload.stream);
      } else {
        getActiveLiveStreams(50, 0, { silent: true });
      }
    };

    const handleEnded = (payload = {}) => {
      removeLiveStream(payload.streamId || payload.stream?.id);
    };

    const handleViewers = (payload = {}) => {
      if (payload.streamId) {
        applyViewerCount(payload.streamId, Number(payload.viewerCount || 0), payload.maxViewers ?? null);
      }
    };

    socket.on("livestream:started", handleStarted);
    socket.on("live:started", handleStarted);
    socket.on("livestream:ended_global", handleEnded);
    socket.on("live:ended_global", handleEnded);
    socket.on("livestream:viewers_updated_global", handleViewers);
    socket.on("live:viewers_updated_global", handleViewers);

    return () => {
      socket.off("livestream:started", handleStarted);
      socket.off("live:started", handleStarted);
      socket.off("livestream:ended_global", handleEnded);
      socket.off("live:ended_global", handleEnded);
      socket.off("livestream:viewers_updated_global", handleViewers);
      socket.off("live:viewers_updated_global", handleViewers);
    };
  }, [applyViewerCount, getActiveLiveStreams, removeLiveStream, token, upsertLiveStream]);

  const scroll = (direction) => {
    const element = containerRef.current;
    if (!element) return;

    element.scrollBy({
      left: direction === "left" ? -260 : 260,
      behavior: "smooth",
    });
  };

  if (loading && activeLiveStreams.length === 0) {
    return (
      <div className="flex gap-3 overflow-x-hidden px-4 pb-3 pt-16">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="h-40 w-28 shrink-0 animate-pulse rounded-lg bg-white/10" />
        ))}
      </div>
    );
  }

  if (!activeLiveStreams.length) {
    return null;
  }

  return (
    <motion.section
      className="relative z-50 border-b border-white/10 bg-slate-950/96 pb-3 pt-16 shadow-[0_18px_36px_rgba(2,6,23,0.28)] backdrop-blur"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mb-2 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_0_24px_rgba(220,38,38,0.45)]">
            <Radio className="h-3.5 w-3.5" />
          </span>
          <p className="text-xs font-black uppercase tracking-wide text-white/80">Live now</p>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.68rem] font-black text-white/55">
          {activeLiveStreams.length}
        </span>
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll("left")}
          className="absolute left-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur transition hover:bg-black/85 sm:flex"
          aria-label="Scroll live streams left"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll("right")}
          className="absolute right-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur transition hover:bg-black/85 sm:flex"
          aria-label="Scroll live streams right"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <div
        ref={containerRef}
        className="scroll-smooth flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        <AnimatePresence initial={false}>
          {activeLiveStreams.map((stream) => (
            <motion.button
              key={stream.id}
              type="button"
              onClick={() => onStreamClick?.(stream)}
              className="group relative h-40 w-28 shrink-0 overflow-hidden rounded-lg text-left shadow-xl outline-none ring-1 ring-white/10 transition focus-visible:ring-2 focus-visible:ring-white"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              whileTap={{ scale: 0.96 }}
            >
              <motion.span
                className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-tr from-red-500 via-blue-500 to-emerald-400 p-[2px]"
                animate={{ opacity: [0.75, 1, 0.75] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className="absolute inset-[2px] overflow-hidden rounded-[0.42rem] bg-slate-950">
                <SafeCoverImage
                  user={stream.creator}
                  src={thumbnailFor(stream)}
                  alt={stream.title || "Live preview"}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/82" />
              </span>
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[0.58rem] font-black text-white shadow-lg">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
              <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/68 px-2 py-1 text-[0.58rem] font-black text-white backdrop-blur">
                <Users className="h-3 w-3" />
                {stream.viewerCount || 0}
              </span>
              <span className="absolute inset-x-2 bottom-2 min-w-0">
                <span className="block truncate text-xs font-black text-white">
                  {stream.creator?.name || stream.creator?.username || "Live"}
                </span>
                <span className="mt-0.5 block truncate text-[0.66rem] font-semibold text-white/66">
                  {stream.title || stream.category || "Live now"}
                </span>
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
};

export default LiveDiscoveryRow;
