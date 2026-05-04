const mongoose = require("mongoose");

let listenersAttached = false;

const readyStateNames = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

const attachConnectionListeners = () => {
  if (listenersAttached) {
    return;
  }

  mongoose.connection.on("error", (error) => {
    console.error(`MongoDB connection error: ${error.message}`);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
  });

  listenersAttached = true;
};

const getDatabaseStatus = () => ({
  status: mongoose.connection.readyState === 1 ? "ok" : "degraded",
  dbState: mongoose.connection.readyState,
  dbName: mongoose.connection.db?.databaseName || mongoose.connection.name || null,
});

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  mongoose.set("strictQuery", true);
  attachConnectionListeners();

  const connection = await mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
  });

  const dbName = connection.connection.db?.databaseName || connection.connection.name;
  console.log(`MongoDB connected${dbName ? `: ${dbName}` : ""}`);

  return connection;
};

module.exports = connectDB;
module.exports.getDatabaseStatus = getDatabaseStatus;
module.exports.readyStateNames = readyStateNames;
