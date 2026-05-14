// @ts-nocheck
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { applyAdminIsolation } = require("../utils/adminIsolation");
const { syncTrialState } = require("../utils/accessControl");

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";

  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return req.headers["x-auth-token"] || "";
};

const authMiddleware = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return res.status(401).json({ message: "Not authorized, token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId || decoded.sub;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(401).json({ message: "Not authorized, user not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account is blocked" });
    }

    if (user.accountStatus === "suspended") {
      return res.status(403).json({ message: "Your account has been suspended" });
    }

    await applyAdminIsolation(user);
    req.user = await syncTrialState(user);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

module.exports = authMiddleware;
