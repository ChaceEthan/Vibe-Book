const express = require("express");

const {
  getConversation,
  deleteMessage,
  getDrafts,
  getInbox,
  getMessageById,
  getUnreadCount,
  markMessageRead,
  markMessageUnread,
  replyToMessage,
  saveDraft,
  sendDirectMessage,
  updateDraft,
} = require("../controllers/messageController");
const authMiddleware = require("../middleware/authMiddleware");
const { uploadChatAttachments } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getInbox);
router.get("/inbox", getInbox);
router.get("/unread-count", getUnreadCount);
router.get("/drafts", getDrafts);
router.post("/drafts", saveDraft);
router.patch("/drafts/:id", updateDraft);
router.get("/conversation/:userId", getConversation);
router.post("/conversation/:userId", sendDirectMessage);
router.post("/", sendDirectMessage);
router.post("/with-attachments", uploadChatAttachments, sendDirectMessage);
router.get("/id/:id", getMessageById);
router.post("/:id/reply", replyToMessage);
router.delete("/:id", deleteMessage);
router.patch("/:id/read", markMessageRead);
router.patch("/:id/unread", markMessageUnread);
router.get("/:userId", getConversation);
router.post("/:userId", sendDirectMessage);

module.exports = router;
