const express = require("express");

const {
  followCreator,
  getCreatorAnalytics,
  getCreatorDashboard,
  getCreatorProfile,
  unfollowCreator,
} = require("../controllers/creatorController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

const router = express.Router();

router.get("/dashboard", authMiddleware, getCreatorDashboard);
router.post("/follow/:id", authMiddleware, followCreator);
router.post("/unfollow/:id", authMiddleware, unfollowCreator);
router.get("/:id/analytics", optionalAuthMiddleware, getCreatorAnalytics);
router.get("/:id", optionalAuthMiddleware, getCreatorProfile);

module.exports = router;
