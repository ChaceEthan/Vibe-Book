const express = require("express");

const {
  blockUser,
  createRule,
  deleteUser,
  getAllUsers,
  getDashboardStats,
  getStats,
  unblockUser,
  verifyUser,
} = require("../controllers/adminController");
const adminMiddleware = require("../middleware/adminMiddleware");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get("/stats", getStats);
router.get("/dashboard", getDashboardStats);
router.get("/users", getAllUsers);
router.delete("/delete/:id", deleteUser);
router.patch("/block/:id", blockUser);
router.patch("/unblock/:id", unblockUser);
router.patch("/verify/:id", verifyUser);
router.post("/rules", createRule);

module.exports = router;
