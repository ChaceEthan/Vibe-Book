// @ts-nocheck
const rejectedOriginsLogged = new Set();

const normalizeOrigin = (value = "") => {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed.replace(/^https?:\/\/https?:\/\//i, "https://"));
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed;
  }
};

const configuredOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://vibe-book-kappa.vercel.app",
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  process.env.FRONTEND_ORIGIN,
  process.env.PUBLIC_FRONTEND_URL,
  process.env.PRODUCTION_FRONTEND_URL,
  process.env.APP_URL,
  process.env.CORS_ORIGIN,
].flatMap((origin) => String(origin || "").split(","));

const allowedOrigins = Array.from(new Set(configuredOrigins.map(normalizeOrigin).filter((origin) => origin && origin !== "*")));

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(normalizeOrigin(origin));
};

const logRejectedOrigin = (origin, context = "request") => {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin || rejectedOriginsLogged.has(normalizedOrigin)) {
    return;
  }

  rejectedOriginsLogged.add(normalizedOrigin);
  console.warn(`[cors] rejected ${context} origin: ${normalizedOrigin}`);
};

const corsOriginDelegate = (origin, callback) => {
  if (!origin) {
    return callback(null, true);
  }

  if (isOriginAllowed(origin)) {
    return callback(null, normalizeOrigin(origin));
  }

  logRejectedOrigin(origin);
  return callback(new Error("Not allowed by CORS"));
};

const corsOptions = {
  origin: corsOriginDelegate,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma", "Expires", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Length"],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

const socketCorsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
};

module.exports = {
  allowedOrigins,
  corsOptions,
  isOriginAllowed,
  logRejectedOrigin,
  normalizeOrigin,
  socketCorsOptions,
};
