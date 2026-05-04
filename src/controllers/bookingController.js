const Booking = require("../models/Booking");
const User = require("../models/User");

const allowedStatuses = ["pending", "accepted", "rejected", "cancelled", "completed"];

const getTalentId = (body) => {
  return body.talent || body.talentId || body.userId;
};

const createBooking = async (req, res, next) => {
  try {
    const talentId = getTalentId(req.body);

    if (!talentId) {
      return res.status(400).json({ message: "Talent user id is required" });
    }

    if (talentId === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot book yourself" });
    }

    const talent = await User.findOne({
      _id: talentId,
      isBlocked: false,
      role: { $ne: "admin" },
    });

    if (!talent) {
      return res.status(404).json({ message: "Talent user not found" });
    }

    const booking = await Booking.create({
      requester: req.user._id,
      talent: talent._id,
      eventDate: req.body.eventDate,
      message: req.body.message,
    });

    await booking.populate([
      { path: "requester", select: "name email role" },
      { path: "talent", select: "name email role price availability" },
    ]);

    return res.status(201).json({ booking });
  } catch (error) {
    return next(error);
  }
};

const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      $or: [{ requester: req.user._id }, { talent: req.user._id }],
    })
      .populate("requester", "name email role")
      .populate("talent", "name email role price availability")
      .sort({ createdAt: -1 });

    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
};

const updateBookingStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowedStatuses.join(", ")}` });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isRequester = booking.requester.toString() === req.user._id.toString();
    const isTalent = booking.talent.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isRequester && !isTalent && !isAdmin) {
      return res.status(403).json({ message: "You cannot update this booking" });
    }

    booking.status = status;
    await booking.save();
    await booking.populate([
      { path: "requester", select: "name email role" },
      { path: "talent", select: "name email role price availability" },
    ]);

    return res.json({ booking });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  updateBookingStatus,
};
