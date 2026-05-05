// @ts-nocheck
import { useEffect, useRef, useState } from "react";

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
}) => {
  const mediaRef = useRef(null);
  const viewedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const rawUrl = post?.url || post?.mediaUrl || post?.path || "";
  const src = mediaUrl(rawUrl);

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
  }, [post?._id, rawUrl]);

  useEffect(() => {
    if (post?.type !== "video") {
      return undefined;
    }

    console.log("[VibeBook media] video render url", {
      rawUrl,
      src,
      post,
    });

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
      <video
        ref={mediaRef}
        src={src}
        className={`w-full max-h-[450px] object-cover ${className} ${videoClassName}`}
        muted={muted}
        loop={loop}
        playsInline
        controls={controls}
        autoPlay={autoPlay}
        preload="metadata"
        onLoadedData={() => console.log("video loaded", rawUrl)}
        onError={(event) => {
          console.error("video error", event, rawUrl);
          setFailed(true);
        }}
        onTimeUpdate={(event) => {
          if (event.currentTarget.currentTime >= 3) {
            markViewed();
          }
        }}
        style={{ width: "100%", borderRadius: "12px" }}
      />
    );
  }

  return (
    <img
      ref={mediaRef}
      src={src}
      alt={alt}
      className={`${className} ${imageClassName}`}
      onError={() => setFailed(true)}
      onLoad={() => {
        if (!window.IntersectionObserver) {
          markViewed();
        }
      }}
    />
  );
};

export default PostMedia;
