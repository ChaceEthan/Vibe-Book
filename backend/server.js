// @ts-nocheck
require("dotenv").config({ quiet: true });

const http = require("http");

const connectDB = require("./src/config/db");
const { initSocket } = require("./src/socket");

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

const logError = (label, error) => {
  console.error("=================================");
  console.error(label);

  if (isProduction) {
    console.error(error.message || "Unexpected server error");
  } else {
    console.error(error.stack || error.message || error);
  }

  console.error("=================================");
};

const shutdown = (exitCode = 1) => {
  process.exit(exitCode);
};

const verifyEnv = () => {
  const requiredVariables = ["MONGO_URI", "JWT_SECRET"];

  requiredVariables.forEach((key) => {
    if (!process.env[key] || !process.env[key].trim()) {
      console.error(`ENV ERROR: Missing required variable: ${key}`);
      shutdown(1);
    }
  });

  const portNumber = Number(PORT);
  if (PORT && (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535)) {
    console.error("ENV ERROR: PORT must be between 1 and 65535");
    shutdown(1);
  }
};

process.on("unhandledRejection", (error) => {
  logError("Unhandled promise rejection:", error);
  shutdown(1);
});

process.on("uncaughtException", (error) => {
  logError("Uncaught exception:", error);
  shutdown(1);
});

const startServer = async () => {
  try {
    verifyEnv();

    await connectDB();

    const app = require("./src/app");
    const server = http.createServer(app);

    // Socket.io CORS origins - must match Express CORS allowedOrigins
    const socketCorsOrigins = [
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

    // Add dynamic origins from env if provided
    const dynamicOrigins = [
      process.env.FRONTEND_URL,
      process.env.CLIENT_URL,
      process.env.CORS_ORIGIN,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}` : "",
    ].filter(Boolean);

    dynamicOrigins.forEach((origin) => {
      origin
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
        .forEach((o) => {
          if (!socketCorsOrigins.includes(o)) {
            socketCorsOrigins.push(o);
          }
        });
    });

    const io = initSocket(server, {
      origin: socketCorsOrigins,
    });

    app.set("io", io);
    console.log(`[socket] initialized with ${socketCorsOrigins.length} allowed origin(s)`);

    server.listen(PORT, "0.0.0.0", () => {
      const address = server.address();
      const activePort = typeof address === "object" && address ? address.port : PORT;

      console.log("=================================");
      console.log("VIBEBOOK SERVER RUNNING");
      console.log(`PORT: ${activePort}`);
      console.log(`ENV: ${process.env.NODE_ENV || "development"}`);
      console.log("=================================");
    });

    server.on("error", (error) => {
      logError("SERVER ERROR: Express failed to start", error);
      shutdown(1);
    });
  } catch (error) {
    logError("SERVER STOPPED: DB FAILED", error);
    shutdown(1);
  }
};

startServer();
