// @ts-nocheck
const path = require("path");

const multer = require("multer");
const streamifier = require("streamifier");

const cloudinary = require("../config/cloudinary");

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const videoMimeTypes = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-msvideo",
  "video/3gpp",
  "video/3gpp2",
  "video/mpeg",
];
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".3gp", ".3g2", ".mpeg", ".mpg"]);
const maxImageSize = 5 * 1024 * 1024;
const maxVideoSize = 50 * 1024 * 1024;
const maxUploadSize = 50 * 1024 * 1024;

const storage = multer.memoryStorage();

const ensureUploadFolders = () => undefined;

const hasRealValue = (value) => Boolean(value && !/^your_/i.test(String(value).trim()));

const cloudinaryConfigured = () =>
  Boolean(
    hasRealValue(process.env.CLOUDINARY_URL) ||
      (hasRealValue(process.env.CLOUDINARY_CLOUD_NAME) &&
        hasRealValue(process.env.CLOUDINARY_API_KEY) &&
        hasRealValue(process.env.CLOUDINARY_API_SECRET))
  );

const safeName = (name, includeExtension = true) => {
  const extension = path.extname(name).toLowerCase();
  const baseName = path
    .basename(name, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${baseName || "upload"}-${Date.now()}-${Math.round(Math.random() * 1e9)}${includeExtension ? extension : ""}`;
};

const extensionFor = (file) => path.extname(file?.originalname || "").toLowerCase();

const normalizeUploadMimeType = (file) => {
  const mimetype = String(file?.mimetype || "").toLowerCase();
  const extension = extensionFor(file);

  if (videoExtensions.has(extension)) {
    if (extension === ".mov") return "video/quicktime";
    if (extension === ".webm") return "video/webm";
    if (extension === ".m4v") return "video/x-m4v";
    if (extension === ".avi") return "video/x-msvideo";
    if (extension === ".3gp") return "video/3gpp";
    if (extension === ".3g2") return "video/3gpp2";
    return "video/mp4";
  }

  if (imageExtensions.has(extension)) {
    if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
    return `image/${extension.slice(1)}`;
  }

  return mimetype;
};

const isVideoFile = (file) => file?.mimetype?.startsWith("video/") || videoExtensions.has(extensionFor(file));
const cloudinaryFolderFor = (file) => (isVideoFile(file) ? "vibebook/videos" : "vibebook/images");
const cloudinaryResourceTypeFor = (file) => (isVideoFile(file) ? "video" : "image");
const isCloudinarySecureUrl = (value) => /^https:\/\/res\.cloudinary\.com\//i.test(value || "");

const buildVideoThumbnailUrl = (url) => {
  if (!isCloudinarySecureUrl(url) || !url.includes("/video/upload/")) {
    return "";
  }

  const [baseUrl, queryString] = url.split("?");
  const thumbnailUrl = baseUrl
    .replace("/video/upload/", "/video/upload/so_0,w_720,c_limit,f_jpg/")
    .replace(/\.[a-z0-9]+$/i, ".jpg");

  return queryString ? `${thumbnailUrl}?${queryString}` : thumbnailUrl;
};

const createUploadError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableCloudinaryError = (error) => {
  const status = Number(error?.http_code || error?.statusCode || error?.status || 0);
  const message = `${error?.code || ""} ${error?.message || ""}`;

  return (
    [408, 425, 429, 500, 502, 503, 504].includes(status) ||
    /timeout|timed out|socket|ssl|tls|econnreset|econnrefused|enotfound|eai_again|err_cache_operation_not_supported/i.test(
      message
    )
  );
};

const uploadBufferOnce = (file, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || cloudinaryFolderFor(file),
        public_id: options.publicId || safeName(file.originalname, false),
        resource_type: options.resourceType || cloudinaryResourceTypeFor(file),
        overwrite: false,
      },
      (error, uploadedResult) => {
        if (error) {
          return reject(error);
        }

        return resolve(uploadedResult);
      }
    );

    streamifier.createReadStream(file.buffer).on("error", reject).pipe(stream);
  });

const uploadBufferToCloudinary = async (file, options = {}) => {
  console.log("UPLOAD FILE:", file?.originalname);

  if (!Buffer.isBuffer(file?.buffer)) {
    throw createUploadError("No file uploaded", 400);
  }

  if (!cloudinaryConfigured()) {
    throw createUploadError("Cloudinary not configured", 500);
  }

  let result;
  const retries = Number.isFinite(Number(options.retries)) ? Number(options.retries) : 2;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      result = await uploadBufferOnce(file, options);
      break;
    } catch (error) {
      if (attempt >= retries || !isRetryableCloudinaryError(error)) {
        throw error;
      }

      await delay(300 * (attempt + 1));
    }
  }

  console.log("Uploaded to Cloudinary:", result?.secure_url);

  if (!isCloudinarySecureUrl(result?.secure_url)) {
    throw createUploadError("Cloudinary upload did not return a secure URL", 502);
  }

  file.path = result.secure_url;
  file.secure_url = result.secure_url;
  file.filename = result.public_id;
  file.public_id = result.public_id;
  file.size = result.bytes || file.size;
  file.resource_type = result.resource_type || cloudinaryResourceTypeFor(file);
  file.duration = result.duration;
  file.thumbnail_url = result.thumbnail_url || (file.resource_type === "video" ? buildVideoThumbnailUrl(result.secure_url) : result.secure_url);
  file.detected_mimetype = normalizeUploadMimeType(file);
  file.cloudinary = {
    ...result,
    fallback_thumbnail_url: file.thumbnail_url,
    detected_mimetype: file.detected_mimetype,
  };

  return result;
};

const createFileFilter = (allowedTypes, label) => (req, file, callback) => {
  const detectedMimeType = normalizeUploadMimeType(file);

  if (!allowedTypes.includes(file.mimetype) && !allowedTypes.includes(detectedMimeType)) {
    const error = createUploadError(`Only ${label} files are allowed`, 400);
    return callback(error);
  }

  file.detected_mimetype = detectedMimeType;
  return callback(null, true);
};

const createMulter = (allowedTypes, label, options = {}) =>
  multer({
    storage,
    limits: {
      fileSize: options.fileSize || maxUploadSize,
      files: options.files || 1,
    },
    fileFilter: createFileFilter(allowedTypes, label),
  });

const flattenFiles = (files) => {
  if (!files) {
    return [];
  }

  if (Array.isArray(files)) {
    return files;
  }

  return Object.values(files).flat().filter(Boolean);
};

const withCloudinaryUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, async (error) => {
    if (error) {
      return next(error);
    }

    try {
      const files = [req.file, ...flattenFiles(req.files)].filter(Boolean);
      await Promise.all(files.map((file) => uploadBufferToCloudinary(file)));
      return next();
    } catch (uploadError) {
      return next(uploadError);
    }
  });
};

const uploadFiles = withCloudinaryUpload(
  createMulter([...imageMimeTypes, ...videoMimeTypes], "image or video", {
    files: 10,
  }).array("files", 10)
);

const uploadSingleMedia = createMulter([...imageMimeTypes, ...videoMimeTypes], "image or video").single("media");

const uploadFeedImage = createMulter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image", {
  fileSize: maxImageSize,
}).single("media");

const uploadFeedVideo = createMulter(videoMimeTypes, "MP4, MOV, or WEBM video", {
  fileSize: maxVideoSize,
}).single("media");

const uploadImages = withCloudinaryUpload(
  createMulter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image", {
    fileSize: maxImageSize,
    files: 5,
  }).array("images", 20)
);

const uploadSingleImage = withCloudinaryUpload(
  createMulter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image", {
    fileSize: maxImageSize,
    files: 1,
  }).single("image")
);

const uploadVideos = withCloudinaryUpload(
  createMulter(videoMimeTypes, "MP4, MOV, or WEBM video", {
    fileSize: maxVideoSize,
    files: 3,
  }).array("videos", 3)
);

module.exports = {
  cloudinaryConfigured,
  ensureUploadFolders,
  uploadBufferToCloudinary,
  uploadFiles,
  maxImageSize,
  maxVideoSize,
  uploadFeedImage,
  uploadFeedVideo,
  uploadImages,
  uploadSingleImage,
  uploadSingleMedia,
  uploadVideos,
};
