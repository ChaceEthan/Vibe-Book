const mongoose = require("mongoose");

const visitorStatSchema = new mongoose.Schema({
  dateKey: {
    type: String,
    required: true,
    unique: true,
  },
  visitors: {
    type: Number,
    default: 0,
    min: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("VisitorStat", visitorStatSchema);
