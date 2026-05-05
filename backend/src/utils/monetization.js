const User = require("../models/User");

const SCORE_VALUES = {
  follower: 5,
  like: 1,
  booking: 20,
};

const addMonetizationScore = async (userId, source, multiplier = 1) => {
  const score = SCORE_VALUES[source] || 0;

  if (!userId || !score || multiplier <= 0) {
    return null;
  }

  return User.findByIdAndUpdate(
    userId,
    {
      $inc: { monetizationScore: score * multiplier },
      $set: { isMonetized: true },
    },
    { returnDocument: "after", runValidators: true }
  ).select("-password");
};

module.exports = {
  SCORE_VALUES,
  addMonetizationScore,
};
