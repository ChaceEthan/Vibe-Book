const express = require("express");

const {
  contactUser,
  deleteMyAccount,
  followBackProfile,
  followProfile,
  getProfile,
  getUserById,
  searchUsers,
  payPlatformAccess,
  likeProfile,
  unlikeProfile,
  unlockProfileContact,
  unfollowProfile,
  updateProfile,
  uploadProfileImage,
  uploadProfileImages,
  uploadProfileVideos,
} = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");
const { uploadImages, uploadSingleImage, uploadVideos } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/", optionalAuthMiddleware, searchUsers);
router.get("/search", optionalAuthMiddleware, searchUsers);
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.patch("/profile", authMiddleware, updateProfile);
router.post("/profile/image", authMiddleware, uploadSingleImage, uploadProfileImage);
router.post("/profile/images", authMiddleware, uploadImages, uploadProfileImages);
router.post("/profile/videos", authMiddleware, uploadVideos, uploadProfileVideos);
router.put("/update", authMiddleware, updateProfile);
router.patch("/update", authMiddleware, updateProfile);
router.post("/pay-access", authMiddleware, payPlatformAccess);
router.delete("/me", authMiddleware, deleteMyAccount);
router.post("/:id/follow", authMiddleware, followProfile);
router.post("/:id/follow-back", authMiddleware, followBackProfile);
router.post("/:id/unfollow", authMiddleware, unfollowProfile);
router.post("/:id/like", authMiddleware, likeProfile);
router.delete("/:id/like", authMiddleware, unlikeProfile);
router.post("/:id/unlock-contact", authMiddleware, unlockProfileContact);
router.post("/:id/contact", authMiddleware, contactUser);
router.get("/:id", optionalAuthMiddleware, getUserById);

module.exports = router;
