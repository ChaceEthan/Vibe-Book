// @ts-nocheck
import { mediaUrl } from "../services/api";

export const DEFAULT_AVATAR = "/logo.png";
export const DEFAULT_COVER = "/default-cover.jpg";

const firstString = (...values) => values.find((value) => typeof value === "string" && value.trim());
const invalidAvatarValues = new Set(["null", "undefined", "none", "false", "nan"]);

const isUsableImage = (value = "") => {
  const image = String(value || "").trim();
  const lowered = image.toLowerCase();

  if (!image || invalidAvatarValues.has(lowered) || lowered.endsWith("/undefined") || lowered.endsWith("/null")) {
    return false;
  }

  return /^(https?:|blob:|data:)/i.test(image) || image.startsWith("/") || image.startsWith("uploads/");
};

export const isUsableProfileImage = isUsableImage;
export const isUsableCoverImage = isUsableImage;

export const getDefaultAvatar = () => mediaUrl(DEFAULT_AVATAR);
export const getDefaultCover = () => mediaUrl(DEFAULT_COVER);

export const resolveProfileImage = (value = "") => {
  const image = String(value || "").trim();
  return isUsableProfileImage(image) ? mediaUrl(image) : getDefaultAvatar();
};

export const resolveCoverImage = (value = "") => {
  const image = String(value || "").trim();
  return isUsableCoverImage(image) ? mediaUrl(image) : getDefaultCover();
};

export const getSafeProfileImage = (user = {}) => {
  const image = firstString(
    user?.profilePicture,
    user?.profileImage,
    Array.isArray(user?.images) ? user.images[0] : "",
    Array.isArray(user?.gallery) ? user.gallery[0] : "",
    user?.avatar
  );

  return resolveProfileImage(image);
};

export const getSafeCoverImage = (user = {}) => {
  const image = firstString(
    user?.coverImage,
    user?.coverPicture,
    user?.bannerImage,
    user?.coverPhoto
  );

  return resolveCoverImage(image);
};

export const handleAvatarError = (event) => {
  const image = event?.currentTarget;

  if (!image || image.dataset.avatarFallbackApplied === "true") {
    return;
  }

  image.dataset.avatarFallbackApplied = "true";
  image.src = getDefaultAvatar();
};

export const handleCoverError = (event) => {
  const image = event?.currentTarget;

  if (!image || image.dataset.coverFallbackApplied === "true") {
    return;
  }

  image.dataset.coverFallbackApplied = "true";
  image.src = getDefaultCover();
};
