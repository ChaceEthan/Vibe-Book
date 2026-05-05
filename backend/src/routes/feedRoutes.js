const express = require("express");

const {
  addFeedComment,
  getFeed,
  toggleFeedLike,
} = require("../controllers/feedController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

const router = express.Router();

router.get("/", optionalAuthMiddleware, getFeed);
router.post("/:id/like", authMiddleware, toggleFeedLike);
router.post("/:id/comments", authMiddleware, addFeedComment);

module.exports = router;

