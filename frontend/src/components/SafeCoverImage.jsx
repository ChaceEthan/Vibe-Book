// @ts-nocheck
import { useEffect, useMemo, useState } from "react";

import { getDefaultCover, getSafeCoverImage, handleCoverError, resolveCoverImage } from "../utils/profileImage";

const SafeCoverImage = ({
  user,
  src = "",
  alt = "",
  className = "",
  loading = "lazy",
  fallbackClassName = "",
  ...props
}) => {
  const fallbackSrc = useMemo(() => getDefaultCover(), []);
  const nextSrc = useMemo(() => (src ? resolveCoverImage(src) : getSafeCoverImage(user)), [src, user]);
  const [displaySrc, setDisplaySrc] = useState(nextSrc || fallbackSrc);

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
        setDisplaySrc(fallbackSrc);
      }
    };
    image.src = nextSrc;

    return () => {
      canceled = true;
    };
  }, [displaySrc, fallbackSrc, nextSrc]);

  return (
    <img
      src={displaySrc || fallbackSrc}
      alt={alt}
      className={`${className} ${fallbackClassName}`.trim()}
      loading={loading}
      decoding="async"
      onError={(event) => {
        handleCoverError(event);
        setDisplaySrc(fallbackSrc);
      }}
      {...props}
    />
  );
};

export default SafeCoverImage;
