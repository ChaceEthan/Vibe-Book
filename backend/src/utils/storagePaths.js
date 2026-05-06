// @ts-nocheck
const path = require("path");

const { uploadRoot } = require("../middleware/uploadMiddleware");

const isCloudinarySecureUrl = (value) => /^https:\/\/res\.cloudinary\.com\//i.test(value || "");

const toUploadPath = (file, folder) => {
  if (isCloudinarySecureUrl(file?.cloudinary?.secure_url)) {
    return file.cloudinary.secure_url;
  }

  if (isCloudinarySecureUrl(file?.secure_url)) {
    return file.secure_url;
  }

  if (isCloudinarySecureUrl(file?.path)) {
    return file.path;
  }

  const error = new Error("Upload did not return a Cloudinary URL");
  error.statusCode = 502;
  error.details = {
    folder,
    originalName: file?.originalname,
    filename: file?.filename,
  };
  throw error;
};

const getPublicBaseUrl = (req) => {
  const configuredUrl = process.env.API_URL || process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const protocol = req?.headers?.["x-forwarded-proto"] || req?.protocol || "http";
  const host = req?.get?.("host") || req?.headers?.host || "";
  return host ? `${protocol}://${host}` : "";
};

const toPublicUploadUrl = (req, uploadPath) => {
  const mediaPath = normalizeStoredUploadPath(uploadPath);

  if (!mediaPath || /^https?:\/\//i.test(mediaPath)) {
    return mediaPath;
  }

  return `${getPublicBaseUrl(req)}${mediaPath}`;
};

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

const toUploadFilePath = (uploadPath) => {
  const mediaPath = normalizeStoredUploadPath(uploadPath);

  if (!mediaPath.startsWith("/uploads/")) {
    return "";
  }

  const relativePath = mediaPath.replace(/^\/uploads\//, "");
  const filePath = path.resolve(uploadRoot, relativePath);
  const rootPath = path.resolve(uploadRoot);

  if (!filePath.startsWith(rootPath)) {
    return "";
  }

  return filePath;
};

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
  fromMediaId,
  isCloudinarySecureUrl,
  toMediaId,
  toPublicUploadUrl,
  toUploadFilePath,
  normalizeStoredUploadPath,
  normalizeStoredUploadPaths,
  toUploadPath,
};
