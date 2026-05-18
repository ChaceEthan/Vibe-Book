const express = require("express");

const {
  addFeedComment,
  deletePost,
  downloadPostVideo,
  editPost,
  getFeed,
  incrementPostView,
  recordPostFeedback,
  sharePost,
  toggleFeedLike,
  togglePostSave,
} = require("../controllers/feedController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

const router = express.Router();

router.get("/", optionalAuthMiddleware, getFeed);
router.get("/:id/download", optionalAuthMiddleware, downloadPostVideo);
router.post("/:id/view", optionalAuthMiddleware, incrementPostView);
router.patch("/:id/edit", authMiddleware, editPost);
router.delete("/:id", authMiddleware, deletePost);
router.post("/:id/share", optionalAuthMiddleware, sharePost);
router.post("/:id/like", authMiddleware, toggleFeedLike);
router.post("/:id/save", authMiddleware, togglePostSave);
router.post("/:id/feedback", authMiddleware, recordPostFeedback);
router.post("/:id/comments", authMiddleware, addFeedComment);

module.exports = router;
