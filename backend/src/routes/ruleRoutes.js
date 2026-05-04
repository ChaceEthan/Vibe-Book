const express = require("express");

const { getRules } = require("../controllers/ruleController");

const router = express.Router();

router.get("/", getRules);

module.exports = router;
