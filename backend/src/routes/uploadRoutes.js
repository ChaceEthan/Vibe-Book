const express = require("express");

const {
  profileResponse,
} = require("../controllers/userController");
const Feed = require("../models/Feed");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const {
  maxImageSize,
  uploadFeedImage,
  uploadFeedVideo,
  uploadSingleMedia,
} = require("../middleware/uploadMiddleware");
const { removeFiles } = require("../utils/fileCleanup");
const { toPublicUploadUrl, toUploadPath } = require("../utils/storagePaths");
const { getMp4DurationSeconds } = require("../utils/videoDuration");
const { serializeFeedItem, userSelect } = require("../controllers/feedController");

const router = express.Router();
const MAX_VIDEO_SECONDS = 60;

const cleanDescription = (value) => (typeof value === "string" ? value.trim().slice(0, 500) : "");

const buildUploadedFiles = (req, files = []) => {
  return files.map((file) => ({
    path: toUploadPath(file, file.mimetype.startsWith("video/") ? "videos" : "images"),
    url: toPublicUploadUrl(req, toUploadPath(file, file.mimetype.startsWith("video/") ? "videos" : "images")),
    type: file.mimetype,
    originalName: file.originalname,
  }));
};

const getUploadedFile = (req) => {
  return req.file || (Array.isArray(req.files) ? req.files[0] : null);
};

const createFeedUpload = async (req, res, next, expectedType = null) => {
  const file = getUploadedFile(req);

  try {
    if (!file) {
      return res.status(400).json({ message: "Media file is required" });
    }

    const type = file.mimetype.startsWith("video/") ? "video" : "image";

    if (expectedType && type !== expectedType) {
      await removeFiles([file]);
      return res.status(400).json({ message: `Selected file must be a ${expectedType}` });
    }

    if (type === "image" && file.size > maxImageSize) {
      await removeFiles([file]);
      return res.status(400).json({ message: "Images must be under 5MB" });
    }

    if (type === "video") {
      const duration = await getMp4DurationSeconds(file.path);

      if (duration && duration > MAX_VIDEO_SECONDS) {
        await removeFiles([file]);
        return res.status(400).json({ message: "Videos must be 60 seconds or shorter" });
      }
    }

    const url = toUploadPath(file, type === "video" ? "videos" : "images");
    const publicUrl = toPublicUploadUrl(req, url);
    const mediaField = type === "video" ? "videos" : "images";
    const mirrorField = type === "video" ? "videoUrls" : "gallery";
    const description = cleanDescription(req.body.description);
    const update = {
      $addToSet: {
        [mediaField]: url,
        [mirrorField]: url,
      },
    };

    if (description) {
      update.$push = {
        [type === "video" ? "videoDescriptions" : "imageDescriptions"]: {
          url,
          description,
        },
      };
    }

    if (type === "image" && !req.user.profilePicture && !req.user.profileImage) {
      update.$set = {
        profilePicture: url,
        profileImage: url,
      };
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    const feed = await Feed.findOneAndUpdate(
      { userId: req.user._id, mediaUrl: url },
      {
        $setOnInsert: {
          userId: req.user._id,
          mediaUrl: url,
          type,
          likes: 0,
          comments: [],
        },
      },
      { new: true, upsert: true, runValidators: true }
    ).populate("userId", userSelect);

    return res.status(201).json({
      url: publicUrl,
      path: url,
      type,
      file: {
        url: publicUrl,
        path: url,
        type: file.mimetype,
        originalName: file.originalname,
      },
      files: buildUploadedFiles(req, [file]),
      feedItem: serializeFeedItem(feed, req.user),
      user: profileResponse(user, user, { includePrivate: true }),
    });
  } catch (error) {
    if (file) {
      await removeFiles([file]);
    }
    return next(error);
  }
};

router.get("/", (req, res) => {
  return res.json({
    message: "Upload API is ready",
    fields: {
      file: "multipart/form-data field: file",
    },
    endpoints: ["/api/upload/image", "/api/upload/video"],
  });
});

router.post("/", authMiddleware, uploadSingleMedia, (req, res, next) => createFeedUpload(req, res, next));
router.post("/image", authMiddleware, uploadFeedImage, (req, res, next) => createFeedUpload(req, res, next, "image"));
router.post("/video", authMiddleware, uploadFeedVideo, (req, res, next) => createFeedUpload(req, res, next, "video"));

module.exports = router;
