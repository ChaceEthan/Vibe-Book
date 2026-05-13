// @ts-nocheck
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const ruleRoutes = require("./routes/ruleRoutes");
const healthRoutes = require("./routes/healthRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const chatRoutes = require("./routes/chatRoutes");
const groupRoutes = require("./routes/groupRoutes");
const creatorRoutes = require("./routes/creatorRoutes");
const messageRoutes = require("./routes/messageRoutes");
const feedRoutes = require("./routes/feedRoutes");
const exploreRoutes = require("./routes/exploreRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const videoRoutes = require("./routes/videoRoutes");
const walletRoutes = require("./routes/walletRoutes");
const marketplaceRoutes = require("./modules/marketplace/marketplaceRoutes");
const { createBooking } = require("./controllers/bookingController");
const { followBackProfile, followProfile, getProfile, searchUsers, unfollowProfile, updateProfile } = require("./controllers/userController");
const optionalAuthMiddleware = require("./middleware/optionalAuthMiddleware");
const authMiddleware = require("./middleware/authMiddleware");
const responseMiddleware = require("./middleware/responseMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");
const { visitorMiddleware } = require("./middleware/visitorMiddleware");
const { corsOptions, isOriginAllowed, logRejectedOrigin } = require("./config/cors");
const { getEmailConfigStatus } = require("./utils/emailService");

const app = express();
app.set("trust proxy", 1);

const emailConfigStatus = getEmailConfigStatus();
if (!emailConfigStatus.configured) {
  console.warn(`[startup] Email verification delivery is not fully configured. Missing: ${emailConfigStatus.missing.join(", ") || "unknown"}`);
}

if (!process.env.JWT_SECRET) {
  console.warn("[startup] JWT_SECRET is missing. Authentication tokens will fail until it is configured.");
}

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many uploads. Please try again soon." },
});

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many booking or payment requests. Please try again soon." },
});

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (req.method === "OPTIONS" && !isOriginAllowed(origin)) {
    logRejectedOrigin(origin, `preflight ${req.path}`);
  }

  return next();
});
app.use(cors(corsOptions));
// Express 5-safe wildcard preflight handler.
app.options(/.*/, cors(corsOptions));
app.use(compression({ threshold: 1024 }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(responseMiddleware);
app.use(visitorMiddleware);
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  if (req.method !== "GET") {
    res.set("Cache-Control", "no-store");
    return next();
  }

  const privatePrefixes = ["/api/auth", "/api/profile", "/api/messages", "/api/inbox", "/api/chat", "/api/groups", "/api/creator", "/api/admin", "/api/bookings", "/api/payments", "/api/marketplace", "/api/wallet", "/api/media", "/api/upload"];
  if (privatePrefixes.some((prefix) => req.path.startsWith(prefix))) {
    res.set("Cache-Control", "no-store");
  } else {
    res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  }

  return next();
});

app.get("/", (req, res) => {
  res.json({ message: "VibeBook API is running" });
});

app.use("/api/auth", authRoutes);
app.get("/api/profile", authMiddleware, getProfile);
app.put("/api/profile", authMiddleware, updateProfile);
app.patch("/api/profile", authMiddleware, updateProfile);
app.use("/api/users", userRoutes);
app.use("/api/profiles", userRoutes);
app.post("/api/follow/:id", authMiddleware, followProfile);
app.post("/api/follow-back/:id", authMiddleware, followBackProfile);
app.post("/api/unfollow/:id", authMiddleware, unfollowProfile);
app.get("/api/search", optionalAuthMiddleware, searchUsers);
app.use("/api/feed", feedRoutes);
app.use("/api/posts", feedRoutes);
app.use("/api/creator", creatorRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/upload", uploadLimiter, uploadRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/groups", groupRoutes);
console.log("[routes] mounted /api/groups");
app.use("/api/messages", messageRoutes);
app.use("/api/inbox", messageRoutes);
app.use("/api/payments", bookingLimiter, paymentRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/notifications", notificationRoutes);
app.post("/api/book", bookingLimiter, authMiddleware, createBooking);
app.use("/api/bookings", bookingLimiter, bookingRoutes);

app.use((req, res, next) => {
  const error = new Error("Route not found");
  res.status(404);
  next(error);
});

app.use(errorMiddleware);

module.exports = app;
