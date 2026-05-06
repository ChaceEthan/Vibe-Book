const isCloudinarySecureUrl = (value) => /^https:\/\/res\.cloudinary\.com\//i.test(value || "");

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
  const mediaPath = typeof value === "string" ? value.trim() : "";

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
  fromMediaId,
  isCloudinarySecureUrl,
  toMediaId,
  toPublicUploadUrl,
  normalizeStoredUploadPath,
  normalizeStoredUploadPaths,
};
