const toUploadPath = (file, folder) => `/uploads/${folder}/${file.filename}`;

const normalizeStoredUploadPath = (value) => {
  const mediaPath = typeof value === "string" ? value.trim() : "";

  if (!mediaPath) {
    return "";
  }

  if (mediaPath.startsWith("/uploads/")) {
    return mediaPath;
  }

  try {
    const parsed = new URL(mediaPath);
    return parsed.pathname.startsWith("/uploads/") ? parsed.pathname : mediaPath;
  } catch {
    return mediaPath;
  }
};

const normalizeStoredUploadPaths = (values = []) => {
  return (Array.isArray(values) ? values : [])
    .map(normalizeStoredUploadPath)
    .filter(Boolean);
};

module.exports = {
  normalizeStoredUploadPath,
  normalizeStoredUploadPaths,
  toUploadPath,
};
