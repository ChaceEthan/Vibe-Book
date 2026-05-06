// @ts-nocheck
const path = require("path");

const multer = require("multer");

const cloudinary = require("../config/cloudinary");

const uploadRoot = path.join(__dirname, "..", "..", "uploads");
const imageUploadDir = path.join(uploadRoot, "images");
const videoUploadDir = path.join(uploadRoot, "videos");

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const videoMimeTypes = ["video/mp4", "video/quicktime", "video/webm"];
const maxImageSize = 5 * 1024 * 1024;
const maxVideoSize = 100 * 1024 * 1024;

const ensureUploadFolders = () => undefined;

const cloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
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

const cloudinaryFolderFor = (file) => (file.mimetype.startsWith("video/") ? "vibebook/videos" : "vibebook/images");
const cloudinaryResourceTypeFor = (file) => (file.mimetype.startsWith("video/") ? "video" : "image");
const isCloudinarySecureUrl = (value) => /^https:\/\/res\.cloudinary\.com\//i.test(value || "");

const createCloudinaryStorage = () => ({
  _handleFile(req, file, callback) {
    if (!cloudinaryConfigured()) {
      const error = new Error("Cloudinary is not configured");
      error.statusCode = 500;
      return callback(error);
    }

    let settled = false;
    const done = (error, uploadedFile) => {
      if (settled) {
        return;
      }

      settled = true;
      callback(error, uploadedFile);
    };

    const uploadOptions = {
      folder: cloudinaryFolderFor(file),
      public_id: safeName(file.originalname, false),
      resource_type: "auto",
      overwrite: false,
    };

    const uploadStream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        return done(error);
      }

      if (!isCloudinarySecureUrl(result?.secure_url)) {
        const missingUrlError = new Error("Cloudinary upload did not return a secure URL");
        missingUrlError.statusCode = 502;
        return done(missingUrlError);
      }

      console.log("Uploaded to Cloudinary:", result.secure_url);

      return done(null, {
        path: result.secure_url,
        secure_url: result.secure_url,
        filename: result.public_id,
        size: result.bytes,
        mimetype: file.mimetype,
        originalname: file.originalname,
        resource_type: result.resource_type || cloudinaryResourceTypeFor(file),
        duration: result.duration,
        cloudinary: result,
      });
    });

    file.stream.on("error", done);
    file.stream.pipe(uploadStream);
  },
  _removeFile(req, file, callback) {
    if (!file?.filename) {
      return callback(null);
    }

    return cloudinary.uploader.destroy(
      file.filename,
      {
        resource_type: file.resource_type || cloudinaryResourceTypeFor(file),
        invalidate: true,
      },
      callback
    );
  },
});

const createFileFilter = (allowedTypes, label) => (req, file, callback) => {
  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error(`Only ${label} files are allowed`);
    error.statusCode = 400;
    return callback(error);
  }

  return callback(null, true);
};

const uploadFiles = multer({
  storage: createCloudinaryStorage(),
  limits: {
    fileSize: maxVideoSize,
    files: 10,
  },
  fileFilter: createFileFilter([...imageMimeTypes, ...videoMimeTypes], "image or video"),
});

const uploadSingleMedia = multer({
  storage: createCloudinaryStorage(),
  limits: {
    fileSize: maxVideoSize,
    files: 1,
  },
  fileFilter: createFileFilter([...imageMimeTypes, ...videoMimeTypes], "image or video"),
}).single("file");

const uploadFeedImage = multer({
  storage: createCloudinaryStorage(),
  limits: {
    fileSize: maxImageSize,
    files: 1,
  },
  fileFilter: createFileFilter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image"),
}).single("file");

const uploadFeedVideo = multer({
  storage: createCloudinaryStorage(),
  limits: {
    fileSize: maxVideoSize,
    files: 1,
  },
  fileFilter: createFileFilter(videoMimeTypes, "MP4, MOV, or WEBM video"),
}).single("file");

const uploadImages = multer({
  storage: createCloudinaryStorage(),
  limits: {
    fileSize: maxImageSize,
    files: 5,
  },
  fileFilter: createFileFilter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image"),
}).array("images", 20);

const uploadSingleImage = multer({
  storage: createCloudinaryStorage(),
  limits: {
    fileSize: maxImageSize,
    files: 1,
  },
  fileFilter: createFileFilter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image"),
}).single("image");

const uploadVideos = multer({
  storage: createCloudinaryStorage(),
  limits: {
    fileSize: maxVideoSize,
    files: 3,
  },
  fileFilter: createFileFilter(videoMimeTypes, "MP4, MOV, or WEBM video"),
}).array("videos", 3);

module.exports = {
  ensureUploadFolders,
  uploadFiles,
  imageUploadDir,
  maxImageSize,
  maxVideoSize,
  uploadFeedImage,
  uploadFeedVideo,
  uploadImages,
  uploadSingleImage,
  uploadSingleMedia,
  uploadRoot,
  uploadVideos,
  videoUploadDir,
};
