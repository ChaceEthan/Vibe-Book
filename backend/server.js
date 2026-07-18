// @ts-nocheck
require("dotenv").config({ quiet: true });

const { createServer } = require("http");

const connectDB = require("./src/config/db");
const { initSocket } = require("./src/socket");
const { allowedOrigins, socketCorsOptions } = require("./src/config/cors");

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
    const httpServer = createServer(app);

    try {
      const io = initSocket(httpServer, {
        ...socketCorsOptions,
      });

      app.set("io", io);
      console.log(`[socket] initialized with ${allowedOrigins.length} explicit allowed origin(s)`);
    } catch (error) {
      console.error("[socket] initialization failed; continuing HTTP startup:", error.message || error);
      app.set("io", null);
    }

    httpServer.listen(PORT, "0.0.0.0", () => {
      const address = httpServer.address();
      const activePort = typeof address === "object" && address ? address.port : PORT;

      console.log("=================================");
      console.log("VIBEBOOK SERVER RUNNING");
      console.log(`PORT: ${activePort}`);
      console.log(`ENV: ${process.env.NODE_ENV || "development"}`);
      console.log("=================================");
    });

    httpServer.on("error", (error) => {
      logError("SERVER ERROR: Express failed to start", error);
      shutdown(1);
    });
  } catch (error) {
    logError("SERVER STOPPED: DB FAILED", error);
    shutdown(1);
  }
};

startServer();
