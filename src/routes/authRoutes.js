const express = require("express");

const { login, register } = require("../controllers/authController");

const router = express.Router();

router.get("/", (req, res) => {
  return res.json({ message: "Auth API is ready" });
});

router.post("/register", register);
router.post("/login", login);

module.exports = router;
