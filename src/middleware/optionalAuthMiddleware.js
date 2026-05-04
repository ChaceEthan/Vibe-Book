const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { syncTrialState } = require("../utils/accessControl");

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (user && !user.isBlocked) {
      req.user = await syncTrialState(user);
    }

    return next();
  } catch (error) {
    return next();
  }
};

module.exports = optionalAuthMiddleware;
