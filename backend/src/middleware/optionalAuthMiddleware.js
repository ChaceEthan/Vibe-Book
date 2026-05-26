const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { syncTrialState } = require("../utils/accessControl");

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  let token = "";

  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    token = req.headers["x-auth-token"] || "";
  }

  const normalized = String(token || "").replace(/^bearer\s+/i, "").trim();
  return /^(undefined|null|false|nan)$/i.test(normalized) ? "" : normalized;
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
