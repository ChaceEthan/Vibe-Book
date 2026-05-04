const mongoose = require("mongoose");

const getDatabaseStatus = () => ({
  status: "OK",
  dbState: mongoose.connection.readyState,
  dbName: mongoose.connection.name || null,
});

const connectDB = async () => {
  const connection = await mongoose.connect(process.env.MONGO_URI);

  console.log("MongoDB Connected");

  return connection;
};

module.exports = connectDB;
module.exports.getDatabaseStatus = getDatabaseStatus;
