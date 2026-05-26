// @ts-nocheck
const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middleware/authMiddleware");
const optionalAuthMiddleware = require("../../middleware/optionalAuthMiddleware");
const livestreamController = require("./livestreamController");

// Public routes
router.get("/active", livestreamController.getActiveLiveStreams);
router.get("/category/:category", livestreamController.getLiveStreamsByCategory);
router.get("/creator/:creatorId", livestreamController.getCreatorLiveStreams);
router.get("/:streamId", optionalAuthMiddleware, livestreamController.getStreamDetails);

// Protected routes
router.post("/start", authMiddleware, livestreamController.startLiveStream);
router.post("/:streamId/end", authMiddleware, livestreamController.endLiveStream);
router.post("/:streamId/join", optionalAuthMiddleware, livestreamController.joinLiveStream);
router.post("/session/:sessionId/leave", optionalAuthMiddleware, livestreamController.leaveLiveStream);
router.patch("/:streamId", authMiddleware, livestreamController.updateStreamMetadata);

module.exports = router;
