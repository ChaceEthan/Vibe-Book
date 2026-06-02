// @ts-nocheck
const rejectedOriginsLogged = new Set();

const normalizeOrigin = (value = "") => {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  try {
    const cleaned = trimmed.replace(/^https?:\/\/https?:\/\//i, "https://");
    const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned.replace(/^\/+/, "")}`;
    const parsed = new URL(withProtocol);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed;
  }
};

const requiredOrigins = [
  "https://vibe-book-kappa.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const configuredOrigins = [
  ...requiredOrigins,
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  process.env.FRONTEND_ORIGIN,
  process.env.PUBLIC_FRONTEND_URL,
  process.env.PRODUCTION_FRONTEND_URL,
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.APP_URL,
  process.env.CORS_ORIGIN,
  process.env.CORS_ORIGINS,
  process.env.CLIENT_ORIGINS,
  process.env.SOCKET_ORIGIN,
  process.env.SOCKET_ORIGINS,
].flatMap((origin) => String(origin || "").split(","));

const allowedOrigins = Array.from(new Set(configuredOrigins.map(normalizeOrigin).filter((origin) => origin && origin !== "*")));

const allowedOriginPatterns = [
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i,
  /^https:\/\/(?:[a-z0-9-]+-)*vibe-?book(?:-[a-z0-9-]+)*\.vercel\.app$/i,
  /^https:\/\/(?:[a-z0-9-]+-)*vibebook(?:-[a-z0-9-]+)*\.vercel\.app$/i,
];

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOrigins.includes(normalizedOrigin) || allowedOriginPatterns.some((pattern) => pattern.test(normalizedOrigin));
};

const logRejectedOrigin = (origin, context = "request") => {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin || rejectedOriginsLogged.has(normalizedOrigin)) {
    return;
  }

  rejectedOriginsLogged.add(normalizedOrigin);
  console.warn(`[cors] rejected ${context} origin: ${normalizedOrigin}`);
};

const resolveCorsOrigin = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    callback(null, origin || true);
    return;
  }

  logRejectedOrigin(origin, "cors");
  callback(null, false);
};

const corsOptions = {
  origin: resolveCorsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma", "Expires", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Length"],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

const socketCorsOptions = {
  origin: resolveCorsOrigin,
  credentials: true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
};

module.exports = {
  allowedOriginPatterns,
  allowedOrigins,
  corsOptions,
  isOriginAllowed,
  logRejectedOrigin,
  normalizeOrigin,
  socketCorsOptions,
};
