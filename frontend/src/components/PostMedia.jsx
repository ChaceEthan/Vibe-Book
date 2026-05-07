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
  const [failed, setFailed] = useState(false);
  const [isMuted, setIsMuted] = useState(Boolean(muted));
  const rawUrl = post?.url || "";
  const src = rawUrl ? mediaUrl(rawUrl) : "";

  const markViewed = () => {
    if (viewedRef.current) {
      return;
    }

    viewedRef.current = true;
    onViewed?.();
  };

  useEffect(() => {
    viewedRef.current = false;
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
          markViewed();
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
          defaultMuted={Boolean(muted)}
          loop={loop}
          playsInline
          controls={controls}
          autoPlay={autoPlay}
          preload="metadata"
          onError={handleMediaError}
          onLoadedMetadata={(event) => setIsMuted(event.currentTarget.muted)}
          onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
          onTimeUpdate={(event) => {
            if (event.currentTarget.currentTime >= 3) {
              markViewed();
            }
          }}
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
          markViewed();
        }
      }}
      loading="lazy"
    />
  );
};

export default memo(PostMedia);
