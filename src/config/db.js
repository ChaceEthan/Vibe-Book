const dns = require("dns");
const mongoose = require("mongoose");

const fallbackDnsServers = ["1.1.1.1", "8.8.8.8"];

const getConnectionOptions = () => {
  const options = {
    serverSelectionTimeoutMS: 15000,
  };

  // Mongoose 6+ rejects these legacy options, so only pass them when supported.
  if (Number(mongoose.version.split(".")[0]) < 6) {
    options.useNewUrlParser = true;
    options.useUnifiedTopology = true;
  }

  return options;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeError = (error) => {
  const text = error.stack || error.message || String(error);
  return text.replace(/mongodb(?:\+srv)?:\/\/[^@]+@/gi, "mongodb://[credentials]@");
};

const classifyMongoError = (error) => {
  const message = (error.message || "").toLowerCase();

  if (message.includes("authentication failed") || message.includes("bad auth")) {
    return "authentication error";
  }

  if (message.includes("not authorized") || message.includes("permission")) {
    return "permission error";
  }

  if (
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("querysrv") ||
    message.includes("timed out") ||
    message.includes("network")
  ) {
    return "network error";
  }

  return "unknown error";
};

const shouldUseDnsFallback = (error) => {
  return process.env.MONGO_URI.startsWith("mongodb+srv://") && (error.message || "").includes("querySrv");
};

const connectOnce = async () => {
  console.log("MongoDB Connecting...");
  const connection = await mongoose.connect(process.env.MONGO_URI, getConnectionOptions());

  console.log("MongoDB Connected Successfully");
  console.log("SUCCESS: MongoDB Connected");
  console.log(`MongoDB Host: ${connection.connection.host}`);
  console.log(`MongoDB Database: ${connection.connection.name}`);
  console.log(`MongoDB ReadyState: ${mongoose.connection.readyState}`);

  return connection;
};

const getDatabaseStatus = () => ({
  dbState: mongoose.connection.readyState,
  dbName: mongoose.connection.name || null,
  status: mongoose.connection.readyState === 1 ? "OK" : "ERROR",
});

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in .env");
  }

  try {
    return await connectOnce();
  } catch (error) {
    console.error("ERROR: MongoDB connection failed");
    console.error(sanitizeError(error));
    console.error(`MongoDB failure classification: ${classifyMongoError(error)}`);

    if (shouldUseDnsFallback(error)) {
      console.warn(`Node DNS SRV lookup failed. Retrying with DNS servers: ${fallbackDnsServers.join(", ")}`);
      dns.setServers(fallbackDnsServers);
    }
  }

  console.log("Retrying MongoDB connection in 5 seconds...");
  await wait(5000);

  try {
    return await connectOnce();
  } catch (error) {
    console.error("ERROR: MongoDB connection failed");
    console.error(sanitizeError(error));
    console.error(`MongoDB failure classification: ${classifyMongoError(error)}`);
    throw error;
  }
};

module.exports = connectDB;
module.exports.getDatabaseStatus = getDatabaseStatus;
module.exports.classifyMongoError = classifyMongoError;
