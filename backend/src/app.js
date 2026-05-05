const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const ruleRoutes = require("./routes/ruleRoutes");
const healthRoutes = require("./routes/healthRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const { createBooking } = require("./controllers/bookingController");
const { getProfile, searchUsers, updateProfile } = require("./controllers/userController");
const optionalAuthMiddleware = require("./middleware/optionalAuthMiddleware");
const authMiddleware = require("./middleware/authMiddleware");
const responseMiddleware = require("./middleware/responseMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");
const { visitorMiddleware } = require("./middleware/visitorMiddleware");
const { ensureUploadFolders, uploadRoot } = require("./middleware/uploadMiddleware");

const app = express();
ensureUploadFolders();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
  "https://vibe-book-kappa.vercel.app",
];

if (process.env.CLIENT_URL && !allowedOrigins.includes(process.env.CLIENT_URL)) {
  allowedOrigins.push(process.env.CLIENT_URL);
}

[process.env.FRONTEND_URL, process.env.CORS_ORIGIN].filter(Boolean).forEach((origin) => {
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

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS BLOCKED: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use("/uploads", express.static("uploads"));
app.use("/uploads", express.static(uploadRoot));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(responseMiddleware);
app.use(visitorMiddleware);

// Simple request logger for local debugging.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
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
app.get("/api/search", optionalAuthMiddleware, searchUsers);
app.use("/api/upload", uploadRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/inbox", messageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/ratings", ratingRoutes);
app.post("/api/book", authMiddleware, createBooking);
app.use("/api/bookings", bookingRoutes);

app.use((req, res, next) => {
  const error = new Error("Route not found");
  res.status(404);
  next(error);
});

app.use(errorMiddleware);

module.exports = app;
