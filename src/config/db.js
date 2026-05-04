const mongoose = require("mongoose");

const isProduction = process.env.NODE_ENV === "production";

const getDatabaseStatus = () => ({
  status: "OK",
  dbState: mongoose.connection.readyState,
  dbName: mongoose.connection.name || null,
});

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    const connection = await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected");
    console.log(`DB Name: ${connection.connection.name}`);

    return connection;
  } catch (error) {
    console.error("MongoDB connection failed");
    console.error(isProduction ? error.message : error.stack || error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.getDatabaseStatus = getDatabaseStatus;
