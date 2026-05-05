const express = require("express");

const {
  createPayment,
  getPaymentOptions,
  verifyPayment,
} = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/options", getPaymentOptions);
router.post("/create", createPayment);
router.post("/verify", verifyPayment);

module.exports = router;

