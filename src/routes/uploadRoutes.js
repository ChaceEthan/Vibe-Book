const express = require("express");

const {
  uploadProfileImage,
  uploadProfileImages,
  uploadProfileVideos,
} = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadImages, uploadSingleImage, uploadVideos } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/", (req, res) => {
  return res.json({
    message: "Upload API is ready",
    fields: {
      images: "multipart/form-data field: images",
      videos: "multipart/form-data field: videos",
    },
  });
});

router.post("/", authMiddleware, uploadImages, uploadProfileImages);
router.post("/profile-image", authMiddleware, uploadSingleImage, uploadProfileImage);
router.post("/images", authMiddleware, uploadImages, uploadProfileImages);
router.post("/videos", authMiddleware, uploadVideos, uploadProfileVideos);

module.exports = router;
