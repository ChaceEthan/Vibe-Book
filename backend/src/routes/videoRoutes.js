const express = require("express");

const { recordVideoView } = require("../controllers/creatorController");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");

const router = express.Router();

router.post("/:id/view", optionalAuthMiddleware, recordVideoView);

module.exports = router;
