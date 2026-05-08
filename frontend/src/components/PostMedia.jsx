// @ts-nocheck
import { Volume2, VolumeX } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { mediaUrl } from "../services/api";

const PostMedia = ({
  post,
  alt = "VibeBook media",
  autoPlay = false,
  controls = true,
  loop = false,
  muted = false,
  className = "",
  imageClassName = "",
  videoClassName = "",
  placeholderClassName = "",
  onViewed,
  onInvalid,
}) => {
  const mediaRef = useRef(null);
  const viewedRef = useRef(false);
  const maxWatchedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const replaysRef = useRef(0);
  const [failed, setFailed] = useState(false);
  const [isMuted, setIsMuted] = useState(Boolean(muted));
  const rawUrl = post?.url || "";
  const src = rawUrl ? mediaUrl(rawUrl) : "";

  const metricsFor = (video, extra = {}) => {
    const duration = Number.isFinite(video?.duration) ? video.duration : Number(post?.duration || 0);
    const watchTime = Math.max(maxWatchedRef.current, Number(video?.currentTime || 0), 0);
    const completionRate = duration > 0 ? Math.min(watchTime / duration, 1) : extra.completionRate || 0;

    return {
      watchTime: Number(watchTime.toFixed(2)),
      duration: Number((duration || 0).toFixed(2)),
      completionRate: Number(completionRate.toFixed(4)),
      replays: replaysRef.current,
      replayed: replaysRef.current > 0,
      ...extra,
    };
  };

  const markViewed = (metrics = {}) => {
    if (viewedRef.current) {
      return;
    }

    viewedRef.current = true;
    onViewed?.(metrics);
  };

  useEffect(() => {
    viewedRef.current = false;
    maxWatchedRef.current = 0;
    lastTimeRef.current = 0;
    replaysRef.current = 0;
    setFailed(false);
    setIsMuted(Boolean(muted));
  }, [muted, post?._id, rawUrl]);

  useEffect(() => {
    if (post?.type !== "video" || !mediaRef.current) {
      return;
    }

    mediaRef.current.muted = isMuted;
  }, [isMuted, post?.type, rawUrl]);

  const handleMediaError = (event) => {
    console.error("Media failed to render:", {
      url: src,
      rawUrl,
      postId: post?._id,
      event,
    });
    setFailed(true);
    onInvalid?.();
  };

  const handleMuteToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const video = mediaRef.current;
    const nextMuted = video ? !video.muted : !isMuted;

    if (video) {
      video.muted = nextMuted;

      if (!nextMuted) {
        video.play?.().catch(() => undefined);
      }
    }

    setIsMuted(nextMuted);
  };

  useEffect(() => {
    if (post?.type !== "video") {
      return undefined;
    }

    if (!autoPlay || !mediaRef.current || failed || !window.IntersectionObserver) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!mediaRef.current) {
          return;
        }

        if (entry.isIntersecting) {
          mediaRef.current.play?.().catch(() => undefined);
        } else {
          mediaRef.current.pause?.();
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(mediaRef.current);
    return () => observer.disconnect();
  }, [autoPlay, failed, post, post?.type, rawUrl, src]);

  useEffect(() => {
    if (post?.type === "video" || !mediaRef.current || failed) {
      return undefined;
    }

    if (!window.IntersectionObserver) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          markViewed({ watchTime: 1, duration: 1, completionRate: 1 });
          observer.disconnect();
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(mediaRef.current);
    return () => observer.disconnect();
  }, [failed, post?.type, post?._id]);

  if (failed || !rawUrl) {
    return (
      <div className={`flex min-h-48 items-center justify-center bg-slate-800 p-5 text-center text-sm font-bold text-white/70 ${placeholderClassName}`}>
        Media unavailable
      </div>
    );
  }

  if (post.type === "video") {
    return (
      <div className={`relative ${className}`}>
        <video
          ref={mediaRef}
          src={src}
          className={`h-full w-full max-h-[450px] object-cover ${videoClassName}`}
          muted={isMuted}
          loop={loop}
          playsInline
          controls={controls}
          autoPlay={autoPlay}
          preload="metadata"
          onError={handleMediaError}
          onLoadedMetadata={(event) => setIsMuted(event.currentTarget.muted)}
          onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            const currentTime = Number(video.currentTime || 0);
            const duration = Number.isFinite(video.duration) ? video.duration : Number(post?.duration || 0);

            if (lastTimeRef.current && currentTime + 1 < lastTimeRef.current) {
              replaysRef.current += 1;
            }

            lastTimeRef.current = currentTime;
            maxWatchedRef.current = Math.max(maxWatchedRef.current, currentTime);

            const threshold = duration && duration <= 8 ? duration * 0.85 : 3;

            if (currentTime >= Math.max(1, threshold)) {
              markViewed(metricsFor(video));
            }
          }}
          onEnded={(event) => markViewed(metricsFor(event.currentTarget, { completionRate: 1 }))}
          style={{ width: "100%", borderRadius: "12px" }}
        />
        <button
          type="button"
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/60 text-white shadow-lg backdrop-blur"
          onClick={handleMuteToggle}
          aria-label={isMuted ? "Unmute video" : "Mute video"}
        >
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>
    );
  }

  return (
    <img
      ref={mediaRef}
      src={src}
      alt={alt}
      className={`${className} ${imageClassName}`}
      onError={handleMediaError}
      onLoad={() => {
        if (!window.IntersectionObserver) {
          markViewed({ watchTime: 1, duration: 1, completionRate: 1 });
        }
      }}
      loading="lazy"
    />
  );
};

export default memo(PostMedia);
