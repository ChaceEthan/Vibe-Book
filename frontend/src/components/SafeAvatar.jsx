// @ts-nocheck
import { useEffect, useMemo, useState } from "react";

import { getSafeProfileImage, handleAvatarError } from "../utils/profileImage";

const SafeAvatar = ({
  user,
  src = "",
  alt = "",
  className = "",
  loading = "lazy",
  fallbackClassName = "",
  ...props
}) => {
  const nextSrc = useMemo(() => src || getSafeProfileImage(user), [src, user]);
  const [displaySrc, setDisplaySrc] = useState(nextSrc);

  useEffect(() => {
    if (!nextSrc || nextSrc === displaySrc) {
      return undefined;
    }

    let canceled = false;
    const image = new Image();

    image.onload = () => {
      if (!canceled) {
        setDisplaySrc(nextSrc);
      }
    };
    image.onerror = () => {
      if (!canceled) {
        setDisplaySrc(getSafeProfileImage({}));
      }
    };
    image.src = nextSrc;

    return () => {
      canceled = true;
    };
  }, [displaySrc, nextSrc]);

  return (
    <img
      src={displaySrc || nextSrc}
      alt={alt}
      className={`${className} ${fallbackClassName}`.trim()}
      loading={loading}
      decoding="async"
      onError={(event) => {
        handleAvatarError(event);
        setDisplaySrc(getSafeProfileImage({}));
      }}
      {...props}
    />
  );
};

export default SafeAvatar;
