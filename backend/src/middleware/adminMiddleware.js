// @ts-nocheck
const { isAdminUser } = require("../utils/adminIsolation");

const adminMiddleware = (req, res, next) => {
  if (!req.user || !isAdminUser(req.user)) {
    return res.status(403).json({ message: "Admin access required" });
  }

  return next();
};

module.exports = adminMiddleware;
