// @ts-nocheck
import { ChevronLeft, ChevronRight, Radio, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { connectSocket } from "../services/socket";
import { useLiveStreamStore } from "../store/livestreamStore";
import LiveAvatar from "./LiveAvatar.jsx";

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
    socket.on("livestream:ended_global", handleEnded);
    socket.on("livestream:viewers_updated_global", handleViewers);

    return () => {
      socket.off("livestream:started", handleStarted);
      socket.off("livestream:ended_global", handleEnded);
      socket.off("livestream:viewers_updated_global", handleViewers);
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
      <div className="flex gap-3 overflow-x-hidden px-4 py-3">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="flex w-20 shrink-0 flex-col items-center gap-2">
            <div className="h-16 w-16 animate-pulse rounded-full bg-white/10" />
            <div className="h-2 w-12 animate-pulse rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  if (!activeLiveStreams.length) {
    return null;
  }

  return (
    <motion.section
      className="relative py-3"
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
        className="flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateScrollState}
      >
        <AnimatePresence initial={false}>
          {activeLiveStreams.map((stream) => (
            <motion.button
              key={stream.id}
              type="button"
              onClick={() => onStreamClick?.(stream)}
              className="group w-20 shrink-0 text-left"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              whileTap={{ scale: 0.96 }}
            >
              <div className="relative mx-auto h-[4.25rem] w-[4.25rem] rounded-full bg-gradient-to-tr from-red-500 via-blue-500 to-emerald-400 p-[3px] shadow-[0_0_28px_rgba(59,130,246,0.25)]">
                <div className="h-full w-full rounded-full bg-slate-950 p-[2px]">
                  <LiveAvatar
                    user={stream.creator}
                    src={stream.creator?.avatar}
                    className="h-full w-full rounded-full object-cover"
                    forceLive
                  />
                </div>
                <span className="absolute -right-1 -top-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[0.58rem] font-black text-white shadow-lg">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
                <span className="absolute inset-x-1 -bottom-1 mx-auto flex max-w-[3.7rem] items-center justify-center gap-1 rounded-full bg-black/78 px-1.5 py-0.5 text-[0.62rem] font-black text-white backdrop-blur">
                  <Users className="h-3 w-3" />
                  {stream.viewerCount || 0}
                </span>
              </div>
              <p className="mt-2 truncate text-center text-xs font-black text-white">
                {stream.creator?.name || stream.creator?.username || "Live"}
              </p>
              <p className="truncate text-center text-[0.68rem] font-semibold text-white/45">
                {stream.title}
              </p>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
};

export default LiveDiscoveryRow;
