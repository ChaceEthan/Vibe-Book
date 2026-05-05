const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { syncTrialState } = require("../utils/accessControl");

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";

  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return req.headers["x-auth-token"] || "";
};

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId || decoded.sub;
    const user = await User.findById(userId).select("-password");

    if (user && !user.isBlocked) {
      req.user = await syncTrialState(user);
    }

    return next();
  } catch (error) {
    return next();
  }
};

module.exports = optionalAuthMiddleware;
