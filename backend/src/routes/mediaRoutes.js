const fs = require("fs/promises");
const express = require("express");

const Feed = require("../models/Feed");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const authMiddleware = require("../middleware/authMiddleware");
const { profileResponse } = require("../controllers/userController");
const { fromMediaId, normalizeStoredUploadPath, toUploadFilePath } = require("../utils/storagePaths");

const router = express.Router();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isRemoteMedia = (value) => /^https?:\/\//i.test(value || "");

const cloudinaryAssetFromUrl = (mediaPath) => {
  try {
    const parsed = new URL(mediaPath);

    if (parsed.hostname !== "res.cloudinary.com") {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = parts.indexOf("upload");
    const resourceType = parts[1];

    if (uploadIndex < 0 || !["image", "video", "raw"].includes(resourceType)) {
      return null;
    }

    let assetParts = parts.slice(uploadIndex + 1);

    if (/^v\d+$/.test(assetParts[0] || "")) {
      assetParts = assetParts.slice(1);
    }

    const publicId = assetParts.join("/").replace(/\.[^/.]+$/, "");

    return publicId ? { publicId, resourceType } : null;
  } catch {
    return null;
  }
};

const removeMediaFile = async (mediaPath) => {
  const cloudinaryAsset = cloudinaryAssetFromUrl(mediaPath);

  if (cloudinaryAsset) {
    try {
      await cloudinary.uploader.destroy(cloudinaryAsset.publicId, {
        resource_type: cloudinaryAsset.resourceType,
        invalidate: true,
      });
    } catch (error) {
      console.error(`Cloud media delete failed: ${error.message}`);
    }

    return;
  }

  const filePath = toUploadFilePath(mediaPath);

  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Media delete failed: ${error.message}`);
    }
  }
};

router.delete("/:id", authMiddleware, async (req, res, next) => {
  try {
    const mediaPath = fromMediaId(req.params.id);

    if (!mediaPath || (!mediaPath.startsWith("/uploads/") && !isRemoteMedia(mediaPath))) {
      return res.status(400).json({ message: "Invalid media id" });
    }

    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const normalizedProfilePicture = normalizeStoredUploadPath(user.profilePicture || user.profileImage);
    const ownedMedia = [
      normalizedProfilePicture,
      normalizeStoredUploadPath(user.profileImage),
      normalizeStoredUploadPath(user.profilePicture),
      ...(Array.isArray(user.images) ? user.images : []).map(normalizeStoredUploadPath),
      ...(Array.isArray(user.gallery) ? user.gallery : []).map(normalizeStoredUploadPath),
      ...(Array.isArray(user.videos) ? user.videos : []).map(normalizeStoredUploadPath),
      ...(Array.isArray(user.videoUrls) ? user.videoUrls : []).map(normalizeStoredUploadPath),
    ].filter(Boolean);

    if (!ownedMedia.includes(mediaPath)) {
      return res.status(403).json({ message: "You can only delete your own media" });
    }

    const removePath = (items = []) => items.filter((item) => normalizeStoredUploadPath(item) !== mediaPath);
    const removeDescription = (items = []) =>
      items.filter((item) => normalizeStoredUploadPath(item?.url) !== mediaPath);

    user.images = removePath(user.images);
    user.gallery = removePath(user.gallery);
    user.videos = removePath(user.videos);
    user.videoUrls = removePath(user.videoUrls);
    user.imageDescriptions = removeDescription(user.imageDescriptions);
    user.videoDescriptions = removeDescription(user.videoDescriptions);

    if (normalizedProfilePicture === mediaPath) {
      user.profilePicture = "";
      user.profileImage = "";
    }

    await user.save({ validateBeforeSave: false });
    await Feed.deleteMany({
      userId: user._id,
      $or: [
        { mediaUrl: mediaPath },
        { mediaUrl: { $regex: `${escapeRegex(mediaPath)}$` } },
      ],
    });
    await removeMediaFile(mediaPath);

    return res.json({
      message: "Media deleted",
      deleted: mediaPath,
      user: profileResponse(user, user, { includePrivate: true }),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
