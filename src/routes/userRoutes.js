const express = require("express");

const {
  contactUser,
  getProfile,
  getUserById,
  searchUsers,
  updateProfile,
} = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/search", searchUsers);
router.get("/profile", authMiddleware, getProfile);
router.put("/update", authMiddleware, updateProfile);
router.patch("/update", authMiddleware, updateProfile);
router.post("/:id/contact", authMiddleware, contactUser);
router.get("/:id", getUserById);

module.exports = router;
