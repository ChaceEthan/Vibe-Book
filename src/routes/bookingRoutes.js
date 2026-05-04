const express = require("express");

const {
  createBooking,
  getMyBookings,
  updateBookingStatus,
} = require("../controllers/bookingController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.post("/", createBooking);
router.get("/me", getMyBookings);
router.patch("/:id/status", updateBookingStatus);

module.exports = router;
