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
const bookingRoutes = require("./routes/bookingRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const chatRoutes = require("./routes/chatRoutes");
const groupRoutes = require("./routes/groupRoutes");
const messageRoutes = require("./routes/messageRoutes");
const feedRoutes = require("./routes/feedRoutes");
const exploreRoutes = require("./routes/exploreRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const { createBooking } = require("./controllers/bookingController");
const { followProfile, getProfile, searchUsers, unfollowProfile, updateProfile } = require("./controllers/userController");
const optionalAuthMiddleware = require("./middleware/optionalAuthMiddleware");
const authMiddleware = require("./middleware/authMiddleware");
const responseMiddleware = require("./middleware/responseMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");
const { visitorMiddleware } = require("./middleware/visitorMiddleware");

const app = express();
app.set("trust proxy", 1);

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

const allowedOrigins = [
  "https://vibe-book-kappa.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
];

const addAllowedOrigins = (...origins) => {
  origins.filter(Boolean).forEach((origin) => {
    origin
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => {
        if (!allowedOrigins.includes(value)) {
          allowedOrigins.push(value);
        }
      });
  });
};

addAllowedOrigins(process.env.CLIENT_URL, process.env.FRONTEND_URL, process.env.CORS_ORIGIN);
if (process.env.VERCEL_URL) {
  addAllowedOrigins(`https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`);
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.trim();

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

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

  const privatePrefixes = ["/api/auth", "/api/profile", "/api/messages", "/api/inbox", "/api/chat", "/api/groups", "/api/admin", "/api/bookings", "/api/payments"];
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
app.post("/api/unfollow/:id", authMiddleware, unfollowProfile);
app.get("/api/search", optionalAuthMiddleware, searchUsers);
app.use("/api/feed", feedRoutes);
app.use("/api/posts", feedRoutes);
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
app.use("/api/admin", adminRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/ratings", ratingRoutes);
app.post("/api/book", bookingLimiter, authMiddleware, createBooking);
app.use("/api/bookings", bookingLimiter, bookingRoutes);

app.use((req, res, next) => {
  const error = new Error("Route not found");
  res.status(404);
  next(error);
});

app.use(errorMiddleware);

module.exports = app;
