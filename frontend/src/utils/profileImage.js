// @ts-nocheck
import { mediaUrl } from "../services/api";

export const DEFAULT_AVATAR = "/logo.png";

const firstString = (...values) => values.find((value) => typeof value === "string" && value.trim());
const invalidAvatarValues = new Set(["null", "undefined", "none", "false", "nan"]);

export const isUsableProfileImage = (value = "") => {
  const image = String(value || "").trim();
  const lowered = image.toLowerCase();

  if (!image || invalidAvatarValues.has(lowered) || lowered.endsWith("/undefined") || lowered.endsWith("/null")) {
    return false;
  }

  return /^(https?:|blob:|data:)/i.test(image) || image.startsWith("/") || image.startsWith("uploads/");
};

export const getDefaultAvatar = () => mediaUrl(DEFAULT_AVATAR);

export const resolveProfileImage = (value = "") => {
  const image = String(value || "").trim();
  return isUsableProfileImage(image) ? mediaUrl(image) : getDefaultAvatar();
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

export const handleAvatarError = (event) => {
  const image = event?.currentTarget;

  if (!image || image.dataset.avatarFallbackApplied === "true") {
    return;
  }

  image.dataset.avatarFallbackApplied = "true";
  image.src = getDefaultAvatar();
};
