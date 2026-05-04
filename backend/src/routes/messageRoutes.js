const express = require("express");

const {
  getDrafts,
  getInbox,
  getMessageById,
  markMessageRead,
  markMessageUnread,
  replyToMessage,
  saveDraft,
  updateDraft,
} = require("../controllers/messageController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getInbox);
router.get("/inbox", getInbox);
router.get("/drafts", getDrafts);
router.post("/drafts", saveDraft);
router.patch("/drafts/:id", updateDraft);
router.get("/:id", getMessageById);
router.post("/:id/reply", replyToMessage);
router.patch("/:id/read", markMessageRead);
router.patch("/:id/unread", markMessageUnread);

module.exports = router;
