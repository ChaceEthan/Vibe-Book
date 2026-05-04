const express = require("express");

const { getDatabaseStatus } = require("../config/db");

const router = express.Router();

router.get("/", (req, res) => {
  const health = getDatabaseStatus();

  return res.json(health);
});

module.exports = router;
