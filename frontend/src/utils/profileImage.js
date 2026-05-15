// @ts-nocheck
import { mediaUrl } from "../services/api";

export const DEFAULT_AVATAR = "/logo.png";

const firstString = (...values) => values.find((value) => typeof value === "string" && value.trim());

export const getSafeProfileImage = (user = {}) => {
  const image = firstString(
    user?.profilePicture,
    user?.profileImage,
    Array.isArray(user?.images) ? user.images[0] : "",
    Array.isArray(user?.gallery) ? user.gallery[0] : "",
    user?.avatar
  );

  return mediaUrl(image || DEFAULT_AVATAR);
};

export const handleAvatarError = (event) => {
  const image = event?.currentTarget;

  if (!image || image.dataset.avatarFallbackApplied === "true") {
    return;
  }

  image.dataset.avatarFallbackApplied = "true";
  image.src = mediaUrl(DEFAULT_AVATAR);
};
