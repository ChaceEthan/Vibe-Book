const Booking = require("../models/Booking");
const Message = require("../models/Message");
const User = require("../models/User");
const { sendBookingNotification } = require("../utils/emailService");
const {
  PLATFORM_ACCESS_AMOUNT,
  PLATFORM_ACCESS_CURRENCY,
  buildAccessState,
  hasPlatformAccess,
} = require("../utils/accessControl");
const {
  BOOKING_ACCESS_CURRENCY,
  getBookingAccessAmount,
} = require("../utils/pricing");

const allowedStatuses = ["pending", "accepted", "rejected", "cancelled", "completed"];

const cleanPhone = (value = "") => String(value).replace(/[^\d]/g, "");

const getTalentId = (body) => {
  return body.talent || body.talentId || body.userId;
};

const trimText = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const parsePositiveNumber = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
};

const requireBookingAccess = (req, res) => {
  if (hasPlatformAccess(req.user)) {
    return true;
  }

  res.status(402).json({
    message: `Pay ${PLATFORM_ACCESS_AMOUNT} ${PLATFORM_ACCESS_CURRENCY} to continue booking after your trial`,
    data: { access: buildAccessState(req.user) },
  });
  return false;
};

const buildWhatsappLink = ({ talent, requester, booking }) => {
  const phone = cleanPhone(talent.whatsappNumber || talent.whatsapp || talent.phone || "");

  if (!phone) {
    return "";
  }

  const text = [
    `Booking request from ${requester.name}`,
    booking.businessName ? `Business: ${booking.businessName}` : "",
    booking.location ? `Location: ${booking.location}` : "",
    booking.offeredPrice ? `Offer: ${booking.offeredPrice} RWF` : "",
    booking.message ? `Message: ${booking.message}` : "",
  ].filter(Boolean).join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
};

const createInternalBookingMessage = async ({ booking, talent, requester, whatsappLink }) => {
  return Message.create({
    sender: requester._id,
    recipient: talent._id,
    booking: booking._id,
    subject: `Booking request from ${requester.name}`,
    message: [
      booking.message || "New booking request",
      booking.businessName ? `Business: ${booking.businessName}` : "",
      booking.location ? `Event location: ${booking.location}` : "",
      booking.offeredPrice ? `Offered price: ${booking.offeredPrice} RWF` : "",
      whatsappLink ? `WhatsApp: ${whatsappLink}` : "",
    ].filter(Boolean).join("\n"),
    type: "booking",
  });
};

const triggerBookingNotifications = async ({ booking, talent, requester }) => {
  const whatsappLink = buildWhatsappLink({ talent, requester, booking });
  booking.whatsappLink = whatsappLink;
  booking.notificationStatus.whatsapp = whatsappLink ? "prepared" : "missing_phone";

  let inboxMessage = null;
  try {
    inboxMessage = await createInternalBookingMessage({ booking, talent, requester, whatsappLink });
    booking.notificationStatus.inbox = "sent";
  } catch (error) {
    booking.notificationStatus.inbox = "failed";
    console.error(`Booking inbox notification failed: ${error.message}`);
  }

  let emailNotification = { sent: false, reason: "NOT_ATTEMPTED" };
  try {
    emailNotification = await sendBookingNotification({
      to: talent.email,
      talent,
      requester,
      booking,
      whatsappLink,
    });
    booking.notificationStatus.email = emailNotification.sent ? "sent" : emailNotification.reason || "prepared";
  } catch (error) {
    booking.notificationStatus.email = "failed";
    console.error(`Booking email notification failed: ${error.message}`);
  }

  await booking.save();

  return {
    email: emailNotification.sent ? "email_sent" : "email_prepared",
    inbox: inboxMessage ? "message_created" : "message_failed",
    whatsappLink,
  };
};

const calculateNumberOfDays = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 1;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
};

const createBooking = async (req, res, next) => {
  try {
    const talentId = getTalentId(req.body);
    const startDate = req.body.startDate || req.body.eventDate;
    const endDate = req.body.endDate || startDate;
    const numberOfDays = calculateNumberOfDays(startDate, endDate);

    if (!talentId) {
      return res.status(400).json({ message: "Talent user id is required" });
    }

    if (talentId === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot book yourself" });
    }

    if (!numberOfDays) {
      return res.status(400).json({ message: "Booking dates are invalid" });
    }

    if (!requireBookingAccess(req, res)) {
      return null;
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
      userName: trimText(req.body.userName) || req.user.name,
      businessName: trimText(req.body.businessName),
      location: trimText(req.body.location),
      eventDate: startDate,
      startDate,
      endDate,
      numberOfDays,
      message: trimText(req.body.message),
      offerPrice: parsePositiveNumber(req.body.offerPrice || req.body.offeredPrice),
      offeredPrice: parsePositiveNumber(req.body.offeredPrice || req.body.offerPrice),
      paymentStatus: "pending",
      amount: getBookingAccessAmount(talent.role),
      currency: BOOKING_ACCESS_CURRENCY,
    });

    const notification = await triggerBookingNotifications({ booking, talent, requester: req.user });

    await booking.populate([
      { path: "requester", select: "name role" },
      { path: "talent", select: "name role price availability profileImage images" },
    ]);

    return res.status(201).json({ booking, notification });
  } catch (error) {
    return next(error);
  }
};

const sendOffer = async (req, res, next) => {
  try {
    const talentId = getTalentId(req.body);
    const offerPrice = Number(req.body.offerPrice);
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    const startDate = req.body.startDate || req.body.eventDate;
    const endDate = req.body.endDate || startDate;
    const numberOfDays = calculateNumberOfDays(startDate, endDate);

    if (!talentId) {
      return res.status(400).json({ message: "Talent user id is required" });
    }

    if (talentId === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot send an offer to yourself" });
    }

    if (!Number.isFinite(offerPrice) || offerPrice <= 0) {
      return res.status(400).json({ message: "Offer price must be a valid positive number" });
    }

    if (!numberOfDays) {
      return res.status(400).json({ message: "Offer dates are invalid" });
    }

    if (!requireBookingAccess(req, res)) {
      return null;
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
      userName: trimText(req.body.userName) || req.user.name,
      businessName: trimText(req.body.businessName),
      location: trimText(req.body.location),
      eventDate: startDate,
      startDate,
      endDate,
      numberOfDays,
      message,
      offerPrice,
      offeredPrice: offerPrice,
      paymentStatus: "pending",
      amount: getBookingAccessAmount(talent.role),
      currency: BOOKING_ACCESS_CURRENCY,
    });

    const notification = await triggerBookingNotifications({ booking, talent, requester: req.user });

    await booking.populate([
      { path: "requester", select: "name role" },
      { path: "talent", select: "name role price availability profileImage images" },
    ]);

    return res.status(201).json({ booking, notification });
  } catch (error) {
    return next(error);
  }
};

const payBookingAccess = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("talent", "name role");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.requester.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the requester can pay booking access" });
    }

    const amount = Number(req.body.amount || booking.amount);

    if (amount !== booking.amount) {
      return res.status(400).json({ message: `Payment amount must be ${booking.amount} ${booking.currency}` });
    }

    booking.paymentStatus = "paid";
    booking.paymentReference =
      typeof req.body.paymentReference === "string" && req.body.paymentReference.trim()
        ? req.body.paymentReference.trim()
        : `booking-access-${booking._id}-${Date.now()}`;
    booking.paidAt = new Date();
    await booking.save();

    await User.findByIdAndUpdate(req.user._id, {
      hasPaidAccess: true,
      lastPaymentDate: new Date(),
      trialActive: false,
      $addToSet: {
        paidProfileViews: {
          profile: booking.talent._id,
          amount: booking.amount,
          currency: booking.currency,
          paymentReference: booking.paymentReference,
          paidAt: booking.paidAt,
        },
      },
    });

    await booking.populate([
      { path: "requester", select: "name role" },
      { path: "talent", select: "name role price availability profileImage images" },
    ]);

    return res.json({ booking, message: "Booking access paid" });
  } catch (error) {
    return next(error);
  }
};

const getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      $or: [{ requester: req.user._id }, { talent: req.user._id }],
    })
      .populate("requester", "name role")
      .populate("talent", "name role price availability profileImage images")
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
      { path: "requester", select: "name role" },
      { path: "talent", select: "name role price availability profileImage images" },
    ]);

    return res.json({ booking });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  payBookingAccess,
  sendOffer,
  updateBookingStatus,
};
