// @ts-nocheck
/**
 * Wallet Routes
 * API endpoints for wallet operations
 */

const express = require("express");
const authMiddleware = require("../../middleware/authMiddleware");
const adminMiddleware = require("../../middleware/adminMiddleware");
const rateLimit = require("express-rate-limit");

const {
  getWallet,
  getTransactionHistory,
  transferPoints,
  claimDailyReward,
  redeemReward,
  referralReward,
  spendPoints,
  generateQr,
  scanQr,
  adminAddPoints,
  getTopEarners,
  getTopSpenders,
} = require("./walletController");

const router = express.Router();

// Rate limiters
const walletLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many wallet requests. Please try again later.", data: null },
  skip: (req) => req.method === "GET",
});

const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many transfers. Please try again later.", data: null },
});

const rewardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many reward requests. Please slow down.", data: null },
});

const qrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many QR requests. Please try again shortly.", data: null },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many admin wallet requests. Please try again later.", data: null },
});

// Public leaderboard routes
router.get("/leaderboard/earners", getTopEarners);
router.get("/leaderboard/spenders", getTopSpenders);

// Protected routes (require authentication)
router.get("/", authMiddleware, getWallet);
router.get("/history", authMiddleware, getTransactionHistory);
router.post("/transfer", authMiddleware, walletLimiter, transferLimiter, transferPoints);
router.post("/reward/daily", authMiddleware, walletLimiter, rewardLimiter, claimDailyReward);
router.post("/reward/redeem", authMiddleware, walletLimiter, rewardLimiter, redeemReward);
router.post("/reward/referral", authMiddleware, walletLimiter, rewardLimiter, referralReward);
router.post("/spend", authMiddleware, walletLimiter, spendPoints);
router.post("/qr/generate", authMiddleware, walletLimiter, qrLimiter, generateQr);
router.post("/qr/scan", authMiddleware, walletLimiter, qrLimiter, scanQr);

// Admin routes (require admin authentication)
router.post("/admin/add", authMiddleware, adminMiddleware, adminLimiter, adminAddPoints);

module.exports = router;
