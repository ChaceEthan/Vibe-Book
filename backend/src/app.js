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
const { searchUsers } = require("./controllers/userController");
const optionalAuthMiddleware = require("./middleware/optionalAuthMiddleware");
const responseMiddleware = require("./middleware/responseMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");
const { visitorMiddleware } = require("./middleware/visitorMiddleware");
const { ensureUploadFolders, uploadRoot } = require("./middleware/uploadMiddleware");

const app = express();
ensureUploadFolders();

const getAllowedOrigins = () => {
  const configuredOrigins = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    process.env.CORS_ORIGIN,
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(configuredOrigins)];
};

const allowedOrigins = getAllowedOrigins();
const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
};

app.use(cors(corsOptions));
app.use("/uploads", express.static("uploads"));
app.use("/uploads", express.static(uploadRoot));
app.use(express.json());
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
app.use("/api/bookings", bookingRoutes);

app.use((req, res, next) => {
  const error = new Error("Route not found");
  res.status(404);
  next(error);
});

app.use(errorMiddleware);

module.exports = app;
