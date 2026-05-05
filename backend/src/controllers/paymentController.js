const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const User = require("../models/User");
const { profileResponse } = require("./userController");
const {
  PLATFORM_ACCESS_AMOUNT,
  PLATFORM_ACCESS_CURRENCY,
} = require("../utils/accessControl");

const methodLabels = {
  USDT: "USDT",
  USDC: "USDC",
  USD: "USD (Stripe sandbox)",
  MTN_MOMO: "MTN MoMo",
  AIRTEL_MONEY: "Airtel Money",
};

const paymentOptions = Object.entries(methodLabels).map(([value, label]) => ({ value, label }));

const normalizeMethod = (value = "USD") => String(value).trim().toUpperCase().replace(/\s+/g, "_");

const createReference = (purpose) => {
  return `${purpose || "payment"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const createPayment = async (req, res, next) => {
  try {
    const method = normalizeMethod(req.body.method);

    if (!methodLabels[method]) {
      return res.status(400).json({ message: "Payment method is not supported", options: paymentOptions });
    }

    const purpose = req.body.purpose || "platform_access";
    const amount = Number(req.body.amount || PLATFORM_ACCESS_AMOUNT);
    const currency = req.body.currency || (method === "USD" ? "USD" : PLATFORM_ACCESS_CURRENCY);

    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: "Payment amount must be valid" });
    }

    const payment = await Payment.create({
      userId: req.user._id,
      bookingId: req.body.bookingId || undefined,
      profileId: req.body.profileId || undefined,
      purpose,
      method,
      amount,
      currency,
      reference: createReference(purpose),
      status: "pending",
      sandbox: true,
    });

    return res.status(201).json({
      payment,
      options: paymentOptions,
      sandbox: true,
      message: "Sandbox payment created",
    });
  } catch (error) {
    return next(error);
  }
};

const applySuccessfulPayment = async (payment) => {
  const updates = {
    hasPaidAccess: true,
    lastPaymentDate: new Date(),
    trialActive: false,
  };
  let booking = null;
  let profileId = payment.profileId;

  if (payment.bookingId) {
    booking = await Booking.findById(payment.bookingId).populate("talent", "name role");

    if (booking) {
      booking.paymentStatus = "paid";
      booking.paymentReference = payment.reference;
      booking.paidAt = payment.paidAt;
      await booking.save();
      profileId = booking.talent?._id || booking.talent || profileId;
    }
  }

  if (profileId) {
    updates.$push = {
      paidProfileViews: {
        profile: profileId,
        amount: payment.amount,
        currency: payment.currency,
        paymentReference: payment.reference,
        paidAt: payment.paidAt,
      },
    };
  }

  const user = await User.findByIdAndUpdate(payment.userId, updates, {
    returnDocument: "after",
    runValidators: true,
  }).select("-password");

  if (booking) {
    await booking.populate([
      { path: "requester", select: "name role" },
      { path: "talent", select: "name role price availability profileImage images" },
    ]);
  }

  return { booking, user };
};

const verifyPayment = async (req, res, next) => {
  try {
    const reference = req.body.reference || req.body.paymentReference;
    const paymentId = req.body.paymentId || req.body.id;
    const query = paymentId ? { _id: paymentId, userId: req.user._id } : { reference, userId: req.user._id };

    if (!paymentId && !reference) {
      return res.status(400).json({ message: "Payment reference is required" });
    }

    const payment = await Payment.findOne(query);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    payment.status = "succeeded";
    payment.paidAt = payment.paidAt || new Date();
    await payment.save();

    const { booking, user } = await applySuccessfulPayment(payment);

    return res.json({
      success: true,
      payment,
      booking,
      user: profileResponse(user, user, { includePrivate: true }),
      message: "Sandbox payment verified",
    });
  } catch (error) {
    return next(error);
  }
};

const getPaymentOptions = (req, res) => {
  return res.json({ options: paymentOptions, sandbox: true });
};

module.exports = {
  createPayment,
  getPaymentOptions,
  paymentOptions,
  verifyPayment,
};

