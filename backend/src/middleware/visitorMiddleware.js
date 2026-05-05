// @ts-nocheck
const VisitorStat = require("../models/VisitorStat");

const seenVisitors = new Set();

const getDateKey = () => new Date().toISOString().slice(0, 10);

const visitorMiddleware = (req, res, next) => {
  if (!req.path.startsWith("/api")) {
    return next();
  }

  const dateKey = getDateKey();
  const visitorId = `${dateKey}:${req.ip}:${req.headers["user-agent"] || ""}`;

  if (!seenVisitors.has(visitorId)) {
    seenVisitors.add(visitorId);
    VisitorStat.findOneAndUpdate(
      { dateKey },
      {
        $inc: { visitors: 1 },
        $set: { updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    ).catch((error) => {
      console.error(`Visitor analytics failed: ${error.message}`);
    });
  }

  return next();
};

module.exports = {
  getDateKey,
  visitorMiddleware,
};
