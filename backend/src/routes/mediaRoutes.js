const fs = require("fs/promises");
const express = require("express");

const Feed = require("../models/Feed");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { profileResponse } = require("../controllers/userController");
const { fromMediaId, normalizeStoredUploadPath, toUploadFilePath } = require("../utils/storagePaths");

const router = express.Router();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const removeMediaFile = async (mediaPath) => {
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

    if (!mediaPath || !mediaPath.startsWith("/uploads/")) {
      return res.status(400).json({ message: "Invalid media id" });
    }

    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const normalizedProfilePicture = normalizeStoredUploadPath(user.profilePicture || user.profileImage);
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
