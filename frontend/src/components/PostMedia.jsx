// @ts-nocheck
import { Heart, Loader2, RefreshCw, Volume2, VolumeX } from "lucide-react";
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
  const retryTimerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(Boolean(muted));
  const [progress, setProgress] = useState(0);
  const [likePulse, setLikePulse] = useState(null);
  const rawUrl = post?.url || "";
  const baseSrc = rawUrl ? mediaUrl(rawUrl) : "";
  const src = retryCount && baseSrc && !/^(blob:|data:)/i.test(baseSrc)
    ? `${baseSrc}${baseSrc.includes("?") ? "&" : "?"}vb_retry=${retryCount}`
    : baseSrc;
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
    setRetryCount(0);
    setProcessing(false);
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

      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const handleMediaError = (event) => {
    if (import.meta.env?.DEV) {
      console.error("Media failed to render:", {
        url: src,
        rawUrl,
        postId: post?._id,
        event,
      });
    }

    if (retryCount < 4) {
      setProcessing(isVideo);
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
      }
      retryTimerRef.current = window.setTimeout(() => {
        setRetryCount((current) => current + 1);
        retryTimerRef.current = null;
      }, isVideo ? 1800 + retryCount * 1200 : 900);
      return;
    }

    setFailed(true);
  };

  const retryMedia = () => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setFailed(false);
    setProcessing(true);
    setRetryCount((current) => current + 1);
  };

  const handleMediaReady = () => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setFailed(false);
    setProcessing(false);
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
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = bounds.width ? ((event.clientX - bounds.left) / bounds.width) * 100 : 50;
      const y = bounds.height ? ((event.clientY - bounds.top) / bounds.height) * 100 : 50;
      setLikePulse({ id: now, x: Math.min(88, Math.max(12, x)), y: Math.min(82, Math.max(16, y)) });
      if (likeTimerRef.current) {
        window.clearTimeout(likeTimerRef.current);
      }
      likeTimerRef.current = window.setTimeout(() => {
        setLikePulse(null);
        likeTimerRef.current = null;
      }, 720);
      onDoubleTap?.({ x, y, clientX: event.clientX, clientY: event.clientY });
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
      <div className={`flex min-h-48 flex-col items-center justify-center gap-3 bg-slate-800 p-5 text-center text-sm font-bold text-white/70 ${placeholderClassName}`}>
        <span>{rawUrl ? "Media unavailable" : "Media is still preparing"}</span>
        {rawUrl && (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white transition hover:bg-white/20"
            onClick={retryMedia}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
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
          key={`${post?._id || rawUrl}-${retryCount}`}
          ref={mediaRef}
          src={src}
        className={`relative z-10 h-full w-full object-cover ${videoClassName}`}
          muted={isMuted}
          loop={loop}
          playsInline
          controls={controls}
          autoPlay={autoPlay}
          preload={minimal ? "metadata" : preload}
          onError={handleMediaError}
          onLoadedMetadata={(event) => {
            handleMediaReady();
            prepareVideo(event.currentTarget);
            setIsMuted(event.currentTarget.muted);
          }}
          onLoadedData={handleMediaReady}
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

        {processing && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 text-center text-sm font-black text-white">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/70 px-4 py-2 backdrop-blur">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing video...
            </span>
          </div>
        )}

        {interactive && !controls && likePulse && (
          <div
            key={likePulse.id}
            className="double-tap-heart pointer-events-none absolute z-30"
            style={{ left: `${likePulse.x}%`, top: `${likePulse.y}%` }}
          >
            <Heart className="h-24 w-24 fill-white text-red-500 drop-shadow-2xl sm:h-28 sm:w-28" />
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
        key={`${post?._id || rawUrl}-${retryCount}`}
        ref={mediaRef}
        src={src}
        alt={alt}
        className={`relative z-10 h-full w-full object-cover ${imageClassName}`}
        onError={handleMediaError}
        onLoad={() => {
          handleMediaReady();
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
