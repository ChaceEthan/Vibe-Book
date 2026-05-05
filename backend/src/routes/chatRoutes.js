const express = require("express");

const {
  clearMyChatView,
  getChatStats,
  getGlobalMessages,
  sendGlobalMessage,
} = require("../controllers/chatController");
const {
  createGroup,
  getGroupMessages,
  listGroups,
  sendGroupMessage,
} = require("../controllers/groupChatController");
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
router.get("/groups", listGroups);
router.post("/group", createGroup);
router.get("/group/:groupId/messages", getGroupMessages);
router.post("/group/:groupId/messages", sendGroupMessage);
router.get("/:userId", getConversation);
router.post("/:userId", sendDirectMessage);

module.exports = router;
