// @ts-nocheck
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
  const rawUrl = post?.url || post?.mediaUrl || post?.path || "";
  const isLegacy = [post?.url, rawUrl].some((value) => String(value || "").includes("/uploads"));
  const isCloudinary = String(post?.url || "").startsWith("https://res.cloudinary.com/");
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
    console.log("Media URL:", post?.url || rawUrl);
    console.log("Legacy:", isLegacy);
  }, [isLegacy, post?.url, rawUrl]);

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

  if (isLegacy || !isCloudinary || failed || !rawUrl) {
    return null;
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
        onError={handleMediaError}
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
