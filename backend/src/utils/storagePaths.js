const cloudinaryMediaRegex = /^https?:\/\/res\.cloudinary\.com\//i;
const cloudinarySecureMediaRegex = /^https:\/\/res\.cloudinary\.com\//i;

const normalizeMediaUrl = (value) => {
  let mediaPath = typeof value === "string" ? value.trim() : "";

  if (!mediaPath) {
    return "";
  }

  mediaPath = mediaPath.replace(/^(https?:\/\/)(https?:\/\/)/i, "$2");

  if (mediaPath.startsWith("//")) {
    mediaPath = `https:${mediaPath}`;
  }

  if (/^res\.cloudinary\.com\//i.test(mediaPath)) {
    mediaPath = `https://${mediaPath}`;
  }

  if (/^http:\/\/res\.cloudinary\.com\//i.test(mediaPath)) {
    mediaPath = mediaPath.replace(/^http:/i, "https:");
  }

  return mediaPath;
};

const isCloudinarySecureUrl = (value) => cloudinarySecureMediaRegex.test(normalizeMediaUrl(value));

const toPublicUploadUrl = (_req, uploadPath) => normalizeStoredUploadPath(uploadPath);

const toMediaId = (uploadPath) => {
  return Buffer.from(normalizeStoredUploadPath(uploadPath), "utf8").toString("base64url");
};

const fromMediaId = (mediaId) => {
  try {
    return normalizeStoredUploadPath(Buffer.from(String(mediaId || ""), "base64url").toString("utf8"));
  } catch {
    return "";
  }
};

const normalizeStoredUploadPath = (value) => {
  const mediaPath = normalizeMediaUrl(value);

  if (!mediaPath) {
    return "";
  }

  if (isCloudinarySecureUrl(mediaPath)) {
    return mediaPath;
  }

  return "";
};

const normalizeStoredUploadPaths = (values = []) => {
  return (Array.isArray(values) ? values : [])
    .map(normalizeStoredUploadPath)
    .filter(Boolean);
};

module.exports = {
  cloudinaryMediaRegex,
  fromMediaId,
  isCloudinarySecureUrl,
  normalizeMediaUrl,
  toMediaId,
  toPublicUploadUrl,
  normalizeStoredUploadPath,
  normalizeStoredUploadPaths,
};
