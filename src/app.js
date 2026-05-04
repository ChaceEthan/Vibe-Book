const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const ruleRoutes = require("./routes/ruleRoutes");
const healthRoutes = require("./routes/healthRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const errorMiddleware = require("./middleware/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json());

// Simple request logger for local debugging.
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.send("VibeBook API is running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
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
