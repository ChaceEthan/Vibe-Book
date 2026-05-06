const express = require("express");

const { getExplore } = require("../controllers/exploreController");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

const router = express.Router();

router.get("/", optionalAuthMiddleware, getExplore);

module.exports = router;
