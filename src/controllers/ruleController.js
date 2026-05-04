const Rule = require("../models/Rule");

const getRules = async (req, res, next) => {
  try {
    const rules = await Rule.find().sort({ createdAt: -1 });
    return res.json({ rules });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getRules,
};
