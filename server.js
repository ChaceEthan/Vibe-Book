// @ts-nocheck
require("dotenv").config({ quiet: true });

const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

const logError = (label, error) => {
  console.error(label);

  if (isProduction) {
    console.error(error.message || "Unexpected server error");
    return;
  }

  console.error(error.stack || error.message || error);
};

const shutdown = (exitCode = 1) => {
  process.exit(exitCode);
};

const verifyEnv = () => {
  const requiredVariables = ["MONGO_URI", "JWT_SECRET"];

  requiredVariables.forEach((key) => {
    if (!process.env[key]) {
      console.error(`ENV ERROR: Missing required variable: ${key}`);
      shutdown(1);
    }
  });

  const portNumber = Number(PORT);

  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    console.error("ENV ERROR: Missing required variable: PORT");
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
  verifyEnv();

  try {
    await connectDB();

    const app = require("./src/app");

    const server = app.listen(PORT, () => {
      console.log("=================================");
      console.log("VIBEBOOK SERVER RUNNING");
      console.log(`PORT: ${PORT}`);
      console.log(`API BASE URL: http://localhost:${PORT}/api`);
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
