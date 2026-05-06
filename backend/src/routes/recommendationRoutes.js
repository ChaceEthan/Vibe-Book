const express = require("express");

const { getRecommendations } = require("../controllers/feedController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/:userId", authMiddleware, getRecommendations);

module.exports = router;
