// @ts-nocheck
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { applyAdminIsolation } = require("../utils/adminIsolation");
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

const authFailure = (res, status, message, code, extra = {}) =>
  res.status(status).json({
    message,
    code,
    authError: true,
    ...extra,
  });

const authMiddleware = async (req, res, next) => {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return authFailure(res, 401, "Authentication required. Please log in again.", "TOKEN_MISSING");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded._id || decoded.userId || decoded.sub;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return authFailure(res, 401, "Authentication expired. Please log in again.", "USER_NOT_FOUND", {
        recoverable: true,
      });
    }

    if (user.isBlocked) {
      return authFailure(res, 403, "Your account is blocked", "ACCOUNT_BLOCKED", {
        recoverable: false,
      });
    }

    if (user.accountStatus === "suspended") {
      return authFailure(res, 403, "Your account has been suspended", "ACCOUNT_SUSPENDED", {
        recoverable: false,
      });
    }

    await applyAdminIsolation(user);
    req.user = await syncTrialState(user);
    return next();
  } catch (error) {
    const expired = error?.name === "TokenExpiredError";
    return authFailure(
      res,
      401,
      expired ? "Session expired. Please log in again." : "Authentication failed. Please log in again.",
      expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      { recoverable: true }
    );
  }
};

module.exports = authMiddleware;
