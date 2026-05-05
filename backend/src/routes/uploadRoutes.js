const express = require("express");

const {
  uploadProfileImage,
  uploadProfileImages,
  uploadProfileVideos,
} = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadImages, uploadSingleImage, uploadVideos } = require("../middleware/uploadMiddleware");
const upload = require("../middleware/upload");

const router = express.Router();

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

router.post("/", upload.array("files", 10), (req, res) => {
  const files = buildUploadedFiles(req.files || []);

  if (!files.length) {
    return res.status(400).json({ message: "At least one image or video file is required" });
  }

  return res.status(201).json({ files });
});
router.post("/profile-image", authMiddleware, uploadSingleImage, uploadProfileImage);
router.post("/images", authMiddleware, uploadImages, uploadProfileImages);
router.post("/videos", authMiddleware, uploadVideos, uploadProfileVideos);

module.exports = router;
