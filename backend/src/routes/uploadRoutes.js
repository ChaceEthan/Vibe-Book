const express = require("express");

const {
  profileResponse,
  uploadProfileImage,
  uploadProfileImages,
  uploadProfileVideos,
} = require("../controllers/userController");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadImages, uploadSingleImage, uploadVideos } = require("../middleware/uploadMiddleware");
const upload = require("../middleware/upload");

const router = express.Router();
const FREE_IMAGE_LIMIT = 3;
const FREE_VIDEO_LIMIT = 1;

const buildUploadedFiles = (files = []) => {
  return files.map((file) => ({
    url: `/uploads/${file.filename}`,
    type: file.mimetype,
    originalName: file.originalname,
  }));
};

router.get("/", (req, res) => {
  return res.json({
    message: "Upload API is ready",
    fields: {
      files: "multipart/form-data field: files",
      images: "multipart/form-data field: images",
      videos: "multipart/form-data field: videos",
    },
  });
});

router.post("/", authMiddleware, upload.any(), async (req, res, next) => {
  try {
    const uploadedFiles = req.files || [];
    const file = uploadedFiles[0];

    if (!file) {
      return res.status(400).json({ message: "Image or video file is required" });
    }

    const mediaType = req.body.type || (file.mimetype.startsWith("video/") ? "video" : "image");

    if (!["image", "video"].includes(mediaType)) {
      return res.status(400).json({ message: "Upload type must be image or video" });
    }

    if (mediaType === "image" && !file.mimetype.startsWith("image/")) {
      return res.status(400).json({ message: "Selected file must be an image" });
    }

    if (mediaType === "video" && !file.mimetype.startsWith("video/")) {
      return res.status(400).json({ message: "Selected file must be a video" });
    }

    const url = `/uploads/${file.filename}`;
    const isPremium = Boolean(req.user.isPremium || req.user.premiumBadge);
    const currentImages = Array.isArray(req.user.images) ? req.user.images.filter(Boolean) : [];
    const currentVideos = Array.isArray(req.user.videos) ? req.user.videos.filter(Boolean) : [];
    const updates = {};

    if (mediaType === "image") {
      const nextImages = [...currentImages, url];
      if (!isPremium && nextImages.length > FREE_IMAGE_LIMIT) {
        return res.status(400).json({ message: `Free profiles can upload ${FREE_IMAGE_LIMIT} images.` });
      }

      updates.images = nextImages;
      updates.gallery = nextImages;
      if (!req.user.profilePicture && !req.user.profileImage) {
        updates.profilePicture = url;
        updates.profileImage = url;
      }
    }

    if (mediaType === "video") {
      const nextVideos = [...currentVideos, url];
      if (!isPremium && nextVideos.length > FREE_VIDEO_LIMIT) {
        return res.status(400).json({ message: `Free profiles can upload ${FREE_VIDEO_LIMIT} video.` });
      }

      updates.videos = nextVideos;
      updates.videoUrls = nextVideos;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    return res.status(201).json({
      url,
      type: mediaType,
      file: {
        url,
        type: file.mimetype,
        originalName: file.originalname,
      },
      files: buildUploadedFiles(uploadedFiles),
      user: profileResponse(user, user, { includePrivate: true }),
    });
  } catch (error) {
    return next(error);
  }
});
router.post("/profile-image", authMiddleware, uploadSingleImage, uploadProfileImage);
router.post("/images", authMiddleware, uploadImages, uploadProfileImages);
router.post("/videos", authMiddleware, uploadVideos, uploadProfileVideos);

module.exports = router;
