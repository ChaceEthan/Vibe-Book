const express = require("express");
const rateLimit = require("express-rate-limit");

const { checkAvailability, login, register, sendPhoneCode, verifyPhoneCode } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
const phoneOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many phone verification requests. Please try again soon." },
});

router.get("/", (req, res) => {
  return res.json({ message: "Auth API is ready" });
});

router.get("/check", checkAvailability);
router.post("/register", register);
router.post("/login", login);
router.post("/send-phone-code", authMiddleware, phoneOtpLimiter, sendPhoneCode);
router.post("/verify-phone-code", authMiddleware, phoneOtpLimiter, verifyPhoneCode);

module.exports = router;
