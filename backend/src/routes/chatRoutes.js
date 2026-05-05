const express = require("express");

const {
  clearMyChatView,
  getChatStats,
  getGlobalMessages,
  sendGlobalMessage,
} = require("../controllers/chatController");
const {
  getConversation,
  sendDirectMessage,
} = require("../controllers/messageController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/global", getGlobalMessages);
router.post("/global", sendGlobalMessage);
router.delete("/global/me", clearMyChatView);
router.get("/stats", getChatStats);
router.get("/:userId", getConversation);
router.post("/:userId", sendDirectMessage);

module.exports = router;
