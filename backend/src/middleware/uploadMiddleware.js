// @ts-nocheck
const fs = require("fs");
const path = require("path");

const multer = require("multer");

const uploadRoot = path.join(__dirname, "..", "..", "uploads");
const imageUploadDir = path.join(uploadRoot, "images");
const videoUploadDir = path.join(uploadRoot, "videos");

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const videoMimeTypes = ["video/mp4", "video/quicktime", "video/webm"];
const maxImageSize = 5 * 1024 * 1024;
const maxVideoSize = 30 * 1024 * 1024;

const ensureUploadFolders = () => {
  [imageUploadDir, videoUploadDir].forEach((directory) => {
    fs.mkdirSync(directory, { recursive: true });
  });
};

ensureUploadFolders();

const safeName = (name) => {
  const extension = path.extname(name).toLowerCase();
  const baseName = path
    .basename(name, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${baseName || "upload"}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
};

const createStorage = (directory) =>
  multer.diskStorage({
    destination(req, file, callback) {
      callback(null, directory);
    },
    filename(req, file, callback) {
      callback(null, safeName(file.originalname));
    },
  });

const mediaUploadStorage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, file.mimetype.startsWith("video/") ? videoUploadDir : imageUploadDir);
  },
  filename(req, file, callback) {
    callback(null, safeName(file.originalname));
  },
});

const genericUploadStorage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, uploadRoot);
  },
  filename(req, file, callback) {
    callback(null, safeName(file.originalname));
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
  storage: genericUploadStorage,
  limits: {
    fileSize: maxVideoSize,
    files: 10,
  },
  fileFilter: createFileFilter([...imageMimeTypes, ...videoMimeTypes], "image or video"),
});

const uploadSingleMedia = multer({
  storage: mediaUploadStorage,
  limits: {
    fileSize: maxVideoSize,
    files: 1,
  },
  fileFilter: createFileFilter([...imageMimeTypes, ...videoMimeTypes], "image or video"),
}).single("file");

const uploadFeedImage = multer({
  storage: createStorage(imageUploadDir),
  limits: {
    fileSize: maxImageSize,
    files: 1,
  },
  fileFilter: createFileFilter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image"),
}).single("file");

const uploadFeedVideo = multer({
  storage: createStorage(videoUploadDir),
  limits: {
    fileSize: maxVideoSize,
    files: 1,
  },
  fileFilter: createFileFilter(videoMimeTypes, "MP4, MOV, or WEBM video"),
}).single("file");

const uploadImages = multer({
  storage: createStorage(imageUploadDir),
  limits: {
    fileSize: maxImageSize,
    files: 5,
  },
  fileFilter: createFileFilter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image"),
}).array("images", 20);

const uploadSingleImage = multer({
  storage: createStorage(imageUploadDir),
  limits: {
    fileSize: maxImageSize,
    files: 1,
  },
  fileFilter: createFileFilter(imageMimeTypes, "JPEG, PNG, WEBP, or GIF image"),
}).single("image");

const uploadVideos = multer({
  storage: createStorage(videoUploadDir),
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
