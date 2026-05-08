// @ts-nocheck
const express = require("express");

const Feed = require("../models/Feed");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const {
  maxImageSize,
  uploadBufferToCloudinary,
  uploadFeedImage,
  uploadFeedVideo,
  uploadSingleMedia,
} = require("../middleware/uploadMiddleware");
const { removeFiles } = require("../utils/fileCleanup");
const { analyzePostMetadata } = require("../utils/aiTagging");
const { rankingFieldsForPost, uniqueTopics } = require("../utils/feedRanking");
const { getUploadedVideoDurationSeconds } = require("../utils/videoDuration");

const router = express.Router();
const MAX_VIDEO_SECONDS = 120;

const cleanDescription = (value) => (typeof value === "string" ? value.trim().slice(0, 500) : "");
const normalizeOrientation = (value) => (value === "landscape" ? "landscape" : "portrait");
const parseDuration = (value) => {
  const duration = Number(value || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};
const parseTags = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap(parseTags).slice(0, 10);
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.flatMap(parseTags).slice(0, 10);
    }
  } catch {
    // Comma-separated tags are the default upload form format.
  }

  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
    .slice(0, 10);
};

const mergeUploadTags = (tags = [], aiMetadata = {}) =>
  uniqueTopics([
    ...tags,
    ...(Array.isArray(aiMetadata.topics) ? aiMetadata.topics : []),
    ...(Array.isArray(aiMetadata.hashtags) ? aiMetadata.hashtags : []),
  ]).slice(0, 12);

const getUploadedFile = (req) => {
  return req.file || req.files?.media?.[0] || (Array.isArray(req.files) ? req.files[0] : null);
};

const sendUploadError = (res, error) => {
  const statusCode = error.statusCode || error.status || (error.name === "MulterError" ? 400 : 500);
  const message = error.message || "Upload failed";

  return res.status(statusCode).json({
    success: false,
    error: message,
    message,
  });
};

const createFeedUpload = async (req, res, next, expectedType = null) => {
  const file = getUploadedFile(req);
  console.log("UPLOAD FILE:", file?.originalname);

  try {
    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded", message: "No file uploaded" });
    }

    const type = file.mimetype.startsWith("video/") ? "video" : "image";
    const clientDuration = parseDuration(req.body.duration);

    if (expectedType && type !== expectedType) {
      await removeFiles([file]);
      return res.status(400).json({ success: false, error: `Selected file must be a ${expectedType}`, message: `Selected file must be a ${expectedType}` });
    }

    if (type === "image" && file.size > maxImageSize) {
      await removeFiles([file]);
      return res.status(400).json({ success: false, error: "Images must be under 5MB", message: "Images must be under 5MB" });
    }

    if (type === "video" && clientDuration && clientDuration > MAX_VIDEO_SECONDS) {
      return res.status(400).json({ success: false, error: "Videos must be 2 minutes or shorter", message: "Videos must be 2 minutes or shorter" });
    }

    const uploadResult = await uploadBufferToCloudinary(file);
    const url = uploadResult.secure_url;
    const publicId = uploadResult.public_id;

    if (type === "video") {
      const duration = await getUploadedVideoDurationSeconds(file);
      const knownDuration = duration || clientDuration;

      if (knownDuration && knownDuration > MAX_VIDEO_SECONDS) {
        await removeFiles([file]);
        return res.status(400).json({ success: false, error: "Videos must be 2 minutes or shorter", message: "Videos must be 2 minutes or shorter" });
      }
    }

    const mediaField = type === "video" ? "videos" : "images";
    const mirrorField = type === "video" ? "videoUrls" : "gallery";
    const caption = cleanDescription(req.body.caption || req.body.description);
    const tags = parseTags(req.body.tags);
    const orientation = normalizeOrientation(req.body.orientation);
    const duration = type === "video" ? parseDuration(req.body.duration) || (await getUploadedVideoDurationSeconds(file)) || 0 : 0;
    const aiMetadata = await analyzePostMetadata({
      caption,
      tags,
      type,
      duration,
    });
    const rankedTags = mergeUploadTags(tags, aiMetadata);
    const update = {
      $addToSet: {
        [mediaField]: url,
        [mirrorField]: url,
      },
    };

    if (caption) {
      update.$push = {
        [type === "video" ? "videoDescriptions" : "imageDescriptions"]: {
          url,
          description: caption,
        },
      };
    }

    if (type === "image" && !req.user.profilePicture && !req.user.profileImage) {
      update.$set = {
        profilePicture: url,
        profileImage: url,
      };
    }

    await User.findByIdAndUpdate(req.user._id, update, {
      returnDocument: "after",
      runValidators: true,
    }).select("-password");

    await Feed.findOneAndUpdate(
      { userId: req.user._id, mediaUrl: url },
      {
        $set: {
          caption,
          tags: rankedTags,
          orientation,
          duration,
          aiMetadata,
          emotion: aiMetadata.emotion || "neutral",
          ...rankingFieldsForPost({
            userId: req.user,
            mediaUrl: url,
            type,
            caption,
            tags: rankedTags,
            orientation,
            duration,
            aiMetadata,
            emotion: aiMetadata.emotion || "neutral",
            views: 0,
            watchTime: 0,
            completionRate: 0,
            replays: 0,
            shareCount: 0,
            saves: 0,
            likes: 0,
            comments: [],
            createdAt: new Date(),
          }),
        },
        $setOnInsert: {
          userId: req.user._id,
          mediaUrl: url,
          type,
          views: 0,
          watchTime: 0,
          completionRate: 0,
          replays: 0,
          engagementScore: 0,
          viralScore: 0,
          trendScore: 0,
          engagementVelocity: 0,
          likes: 0,
          shareCount: 0,
          saves: 0,
          skips: 0,
          reports: 0,
          notInterestedCount: 0,
          distributionStage: "test",
          comments: [],
        },
      },
      { returnDocument: "after", upsert: true, runValidators: true }
    );

    return res.status(201).json({
      success: true,
      url,
      public_id: publicId,
    });
  } catch (error) {
    if (file) {
      await removeFiles([file]);
    }
    return sendUploadError(res, error);
  }
};

const handleUpload = (uploadMiddleware, expectedType = null) => (req, res, next) => {
  uploadMiddleware(req, res, (error) => {
    if (error) {
      console.error(`Upload failed: ${error.message}`);
      return sendUploadError(res, error);
    }

    return createFeedUpload(req, res, next, expectedType);
  });
};

router.get("/", (req, res) => {
  return res.json({
    message: "Upload API is ready",
    fields: {
      media: "multipart/form-data field: media",
    },
    endpoints: ["/api/upload/image", "/api/upload/video"],
  });
});

router.post("/", authMiddleware, handleUpload(uploadSingleMedia));
router.post("/image", authMiddleware, handleUpload(uploadFeedImage, "image"));
router.post("/video", authMiddleware, handleUpload(uploadFeedVideo, "video"));

module.exports = router;
