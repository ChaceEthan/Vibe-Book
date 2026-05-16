const express = require("express");

const {
  deleteNotification,
  clearNotifications,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} = require("../controllers/notificationController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", authMiddleware, getNotifications);
router.get("/unread-count", authMiddleware, getUnreadCount);
router.patch("/read/all", authMiddleware, markAllAsRead);
router.delete("/", authMiddleware, clearNotifications);
router.patch("/:id/read", authMiddleware, markAsRead);
router.delete("/:id", authMiddleware, deleteNotification);

module.exports = router;
