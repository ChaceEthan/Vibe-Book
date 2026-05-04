const express = require("express");

const {
  contactUser,
  getProfile,
  getUserById,
  searchUsers,
  payPlatformAccess,
  unlockProfileContact,
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
router.post("/:id/unlock-contact", authMiddleware, unlockProfileContact);
router.post("/:id/contact", authMiddleware, contactUser);
router.get("/:id", optionalAuthMiddleware, getUserById);

module.exports = router;
