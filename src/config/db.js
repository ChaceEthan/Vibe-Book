const dns = require("dns");
const mongoose = require("mongoose");

const configureMongoDns = () => {
  if (process.env.MONGO_URI && process.env.MONGO_URI.startsWith("mongodb+srv://")) {
    dns.setServers(["1.1.1.1", "8.8.8.8"]);
  }
};

const getDatabaseStatus = () => ({
  status: "OK",
  dbState: mongoose.connection.readyState,
  dbName: mongoose.connection.name || null,
});

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing");
  }

  configureMongoDns();

  const connection = await mongoose.connect(process.env.MONGO_URI);

  console.log(`MongoDB Connected: ${connection.connection.host}`);
  console.log(`DB Name: ${connection.connection.name}`);

  return connection;
};

module.exports = connectDB;
module.exports.getDatabaseStatus = getDatabaseStatus;
