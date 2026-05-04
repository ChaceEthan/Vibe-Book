const express = require("express");

const {
  createBooking,
  getMyBookings,
  payBookingAccess,
  sendOffer,
  updateBookingStatus,
} = require("../controllers/bookingController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.post("/", createBooking);
router.post("/offers", sendOffer);
router.get("/me", getMyBookings);
router.patch("/:id/pay", payBookingAccess);
router.patch("/:id/status", updateBookingStatus);

module.exports = router;
