// @ts-nocheck
import { Heart, Volume2, VolumeX } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { mediaUrl } from "../services/api";

const PostMedia = ({
  post,
  alt = "VibeBook media",
  autoPlay = false,
  controls = true,
  loop = false,
  muted = false,
  preload = "auto",
  managedPlayback = false,
  active = true,
  soundEnabled = !muted,
  showAudioControl = false,
  audioUnlockToken = 0,
  className = "",
  imageClassName = "",
  videoClassName = "",
  placeholderClassName = "",
  interactive = false,
  minimal = false,
  onDoubleTap,
  onViewed,
  onInvalid,
  onAudioPreferenceChange,
  onAutoplayBlocked,
}) => {
  const mediaRef = useRef(null);
  const viewedRef = useRef(false);
  const maxWatchedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const replaysRef = useRef(0);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);
  const likeTimerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [isMuted, setIsMuted] = useState(Boolean(muted));
  const [progress, setProgress] = useState(0);
  const [likePulse, setLikePulse] = useState(false);
  const rawUrl = post?.url || "";
  const src = rawUrl ? mediaUrl(rawUrl) : "";
  const looksLikeVideoUrl = /\.(mp4|mov|m4v|webm|avi|3gp|3g2|mpeg|mpg)(?:$|[?#])/i.test(rawUrl) || src.includes("/video/upload/");
  const isVideo = post?.type === "video" || looksLikeVideoUrl;

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
    setProgress(0);
  }, [autoPlay, muted, post?._id, rawUrl]);

  useEffect(() => {
    if (!isVideo || !mediaRef.current) {
      return;
    }

    mediaRef.current.muted = isMuted;
    mediaRef.current.defaultMuted = isMuted;
  }, [isMuted, isVideo, rawUrl]);

  useEffect(() => {
    if (!managedPlayback || !isVideo || !mediaRef.current) {
      return;
    }

    const video = mediaRef.current;
    prepareVideo(video);

    if (!active || !autoPlay) {
      video.muted = true;
      video.defaultMuted = true;
      setIsMuted(true);
      video.pause?.();
      return;
    }

    let canceled = false;
    const preferSound = Boolean(soundEnabled && !muted);

    const play = async () => {
      video.muted = !preferSound;
      video.defaultMuted = !preferSound;
      setIsMuted(video.muted);

      try {
        await video.play?.();
      } catch {
        if (!preferSound || canceled) {
          return;
        }

        video.muted = true;
        video.defaultMuted = true;
        setIsMuted(true);
        onAutoplayBlocked?.();

        try {
          await video.play?.();
        } catch {
          return;
        }
      }
    };

    play();

    return () => {
      canceled = true;
    };
  }, [active, audioUnlockToken, autoPlay, isVideo, managedPlayback, muted, onAutoplayBlocked, post?._id, rawUrl, soundEnabled]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
      }

      if (likeTimerRef.current) {
        window.clearTimeout(likeTimerRef.current);
      }
    };
  }, []);

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
      video.defaultMuted = nextMuted;

      if (!nextMuted) {
        video.play?.().catch(() => {
          video.muted = true;
          video.defaultMuted = true;
          setIsMuted(true);
          onAutoplayBlocked?.();
        });
      }
    }

    setIsMuted(nextMuted);
    onAudioPreferenceChange?.(!nextMuted);
  };

  const prepareVideo = (video) => {
    if (!video) {
      return;
    }

    video.playbackRate = 1;
    video.defaultPlaybackRate = 1;
  };

  const handleInteractiveTap = (event) => {
    if (!interactive || !isVideo || controls) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const now = Date.now();

    if (now - lastTapRef.current < 280) {
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
      }

      lastTapRef.current = 0;
      setLikePulse(true);
      if (likeTimerRef.current) {
        window.clearTimeout(likeTimerRef.current);
      }
      likeTimerRef.current = window.setTimeout(() => {
        setLikePulse(false);
        likeTimerRef.current = null;
      }, 520);
      onDoubleTap?.();
      return;
    }

    lastTapRef.current = now;
    tapTimerRef.current = window.setTimeout(() => {
      lastTapRef.current = 0;
    }, 220);
  };

  useEffect(() => {
    if (!isVideo) {
      return undefined;
    }

    if (managedPlayback || !autoPlay || !mediaRef.current || failed || !window.IntersectionObserver) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = mediaRef.current;

        if (!video) {
          return;
        }

        prepareVideo(video);

        if (entry.intersectionRatio >= 0.68) {
          if (video.paused) {
            video.play?.().catch(() => undefined);
          }
        } else if (entry.intersectionRatio <= 0.28 && !video.paused) {
          video.muted = true;
          video.defaultMuted = true;
          setIsMuted(true);
          video.pause?.();
        }
      },
      { threshold: [0, 0.28, 0.68, 1] }
    );

    observer.observe(mediaRef.current);
    return () => observer.disconnect();
  }, [autoPlay, failed, isVideo, managedPlayback, post?._id, rawUrl, src]);

  useEffect(() => {
    if (isVideo || !mediaRef.current || failed) {
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
  }, [failed, isVideo, post?._id]);

  if (failed || !rawUrl) {
    return (
      <div className={`flex min-h-48 items-center justify-center bg-slate-800 p-5 text-center text-sm font-bold text-white/70 ${placeholderClassName}`}>
        Media unavailable
      </div>
    );
  }

  if (isVideo) {
    return (
      <div
        className={`relative overflow-hidden bg-slate-950 ${className}`}
        onClick={handleInteractiveTap}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.18),rgba(15,23,42,0.92)_58%,#020617_100%)]" />
        {!minimal && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.16),rgba(15,23,42,0.82)_52%,#020617_100%)]" aria-hidden="true" />
        )}
        <video
          ref={mediaRef}
          src={src}
          className={`relative z-10 h-full w-full object-contain ${videoClassName}`}
          muted={isMuted}
          loop={loop}
          playsInline
          controls={controls}
          autoPlay={autoPlay}
          preload={minimal ? "metadata" : preload}
          onError={handleMediaError}
          onLoadedMetadata={(event) => {
            prepareVideo(event.currentTarget);
            setIsMuted(event.currentTarget.muted);
          }}
          onPlay={(event) => {
            prepareVideo(event.currentTarget);
          }}
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
            setProgress(duration ? Math.min(100, (currentTime / duration) * 100) : 0);

            const threshold = duration && duration <= 8 ? duration * 0.85 : 3;

            if (currentTime >= Math.max(1, threshold)) {
              markViewed(metricsFor(video));
            }
          }}
          onEnded={(event) => markViewed(metricsFor(event.currentTarget, { completionRate: 1 }))}
        />

        {interactive && !controls && likePulse && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <Heart className="h-24 w-24 animate-ping fill-red-500 text-red-500 drop-shadow-2xl" />
          </div>
        )}

        {!minimal && showAudioControl && (
          <button
            type="button"
            className="absolute right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/60 text-white shadow-lg backdrop-blur"
            onClick={handleMuteToggle}
            aria-label={isMuted ? "Unmute video" : "Mute video"}
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        )}

        {!minimal && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[3px] bg-white/15">
            <div className="h-full bg-brand" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-950 ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.14),rgba(15,23,42,0.88)_58%,#020617_100%)]" aria-hidden="true" />
      <img
        ref={mediaRef}
        src={src}
        alt={alt}
        className={`relative z-10 h-full w-full object-contain ${imageClassName}`}
        onError={handleMediaError}
        onLoad={() => {
          if (!window.IntersectionObserver) {
            markViewed({ watchTime: 1, duration: 1, completionRate: 1 });
          }
        }}
        loading="lazy"
      />
    </div>
  );
};

export default memo(PostMedia);
