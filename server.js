// @ts-nocheck
require("dotenv").config({ quiet: true });

const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

const verifyEnv = () => {
  const missingOrInvalid = [];

  if (!process.env.JWT_SECRET) {
    missingOrInvalid.push("JWT_SECRET");
  }

  if (!process.env.MONGO_URI) {
    missingOrInvalid.push("MONGO_URI");
  }

  const portNumber = Number(PORT);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    missingOrInvalid.push("PORT");
  }

  if (missingOrInvalid.length) {
    throw new Error(`Missing or invalid environment variable(s): ${missingOrInvalid.join(", ")}`);
  }
};

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:");
  console.error(error.stack || error.message);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:");
  console.error(error.stack || error.message);
  process.exit(1);
});

const startServer = async () => {
  try {
    verifyEnv();

    await connectDB();

    const app = require("./src/app");

    app.listen(PORT, () => {
      console.log("=================================");
      console.log("VIBEBOOK SERVER RUNNING");
      console.log(`PORT: ${PORT}`);
      console.log("DATABASE: CONNECTED");
      console.log(`API BASE URL: http://localhost:${PORT}/api`);
      console.log("=================================");
    });
  } catch (error) {
    console.error("SERVER STOPPED: DB FAILED");
    console.error(error.stack || error.message);
    console.error("=================================");
    console.error("DATABASE CONNECTION FAILED");
    console.error("Check:");
    console.error("- DNS / Internet");
    console.error("- MongoDB Atlas access");
    console.error("- Credentials");
    console.error("=================================");
    process.exit(1);
  }
};

startServer();
