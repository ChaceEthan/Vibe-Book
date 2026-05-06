// @ts-nocheck
const path = require("path");

const multer = require("multer");
const streamifier = require("streamifier");

const cloudinary = require("../config/cloudinary");

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const videoMimeTypes = ["video/mp4", "video/quicktime", "video/webm"];
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

const cloudinaryFolderFor = (file) => (file?.mimetype?.startsWith("video/") ? "vibebook/videos" : "vibebook/images");
const cloudinaryResourceTypeFor = (file) => (file?.mimetype?.startsWith("video/") ? "video" : "image");
const isCloudinarySecureUrl = (value) => /^https:\/\/res\.cloudinary\.com\//i.test(value || "");

const createUploadError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const uploadBufferToCloudinary = async (file, options = {}) => {
  console.log("UPLOAD FILE:", file?.originalname);

  if (!Buffer.isBuffer(file?.buffer)) {
    throw createUploadError("No file uploaded", 400);
  }

  if (!cloudinaryConfigured()) {
    throw createUploadError("Cloudinary not configured", 500);
  }

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || cloudinaryFolderFor(file),
        public_id: options.publicId || safeName(file.originalname, false),
        resource_type: "auto",
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
  file.cloudinary = result;

  return result;
};

const createFileFilter = (allowedTypes, label) => (req, file, callback) => {
  if (!allowedTypes.includes(file.mimetype)) {
    const error = createUploadError(`Only ${label} files are allowed`, 400);
    return callback(error);
  }

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
