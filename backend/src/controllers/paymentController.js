const Booking = require("../models/Booking");
const Feed = require("../models/Feed");
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
const allowedPaymentPurposes = ["platform_access", "booking_access", "contact_unlock", "tip", "post_boost", "premium"];
const BOOST_DURATION_DAYS = 7;

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
    if (!allowedPaymentPurposes.includes(purpose)) {
      return res.status(400).json({ message: `Payment purpose must be one of: ${allowedPaymentPurposes.join(", ")}` });
    }

    const amount = Number(req.body.amount || PLATFORM_ACCESS_AMOUNT);
    const currency = req.body.currency || (method === "USD" ? "USD" : PLATFORM_ACCESS_CURRENCY);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Payment amount must be a positive number" });
    }

    if (purpose === "tip") {
      if (!req.body.profileId) {
        return res.status(400).json({ message: "Creator profile is required for tips" });
      }

      if (req.body.profileId === req.user._id.toString()) {
        return res.status(400).json({ message: "You cannot tip yourself" });
      }

      const creator = await User.findOne({ _id: req.body.profileId, isBlocked: false, role: { $ne: "admin" } }).select("_id");
      if (!creator) {
        return res.status(404).json({ message: "Creator profile not found" });
      }
    }

    if (purpose === "post_boost") {
      if (!req.body.postId) {
        return res.status(400).json({ message: "Post id is required for boosts" });
      }

      const post = await Feed.findOne({ _id: req.body.postId, userId: req.user._id }).select("_id");
      if (!post) {
        return res.status(404).json({ message: "You can only boost your own posts" });
      }
    }

    const payment = await Payment.create({
      userId: req.user._id,
      bookingId: req.body.bookingId || undefined,
      postId: req.body.postId || undefined,
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
    lastPaymentDate: new Date(),
    trialActive: false,
  };
  let booking = null;
  let profileId = payment.profileId;

  if (["platform_access", "booking_access", "contact_unlock"].includes(payment.purpose)) {
    updates.hasPaidAccess = true;
  }

  if (payment.purpose === "premium") {
    updates.hasPaidAccess = true;
    updates.isPremium = true;
    updates.premiumBadge = true;
  }

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

  if (profileId && payment.purpose !== "tip") {
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

  if (payment.purpose === "tip" && profileId) {
    const creatorShare = Number((payment.amount * 0.9).toFixed(2));
    await User.findByIdAndUpdate(profileId, {
      $inc: {
        balance: creatorShare,
        monetizationScore: Math.max(1, Math.round(payment.amount / 1000)),
      },
      $set: { isMonetized: true },
    });
  }

  if (payment.purpose === "post_boost" && payment.postId) {
    const boostedUntil = new Date(Date.now() + BOOST_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const boostScore = Math.min(5000, Math.max(50, Math.round(payment.amount / 10)));
    await Feed.findOneAndUpdate(
      { _id: payment.postId, userId: payment.userId },
      { $set: { boostedUntil, boostScore } },
      { runValidators: true }
    );
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
  allowedPaymentPurposes,
  createPayment,
  getPaymentOptions,
  paymentOptions,
  verifyPayment,
};
