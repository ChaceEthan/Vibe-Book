const express = require("express");

const { addRating, getUserRatings } = require("../controllers/ratingController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/:userId", authMiddleware, addRating);
router.get("/:userId", getUserRatings);

module.exports = router;
