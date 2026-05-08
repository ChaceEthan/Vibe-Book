// @ts-nocheck
const LOCAL_DEV_PORTS = ["5173", "5174", "5175", "5176", "5177"];

const allowedOrigins = new Set([
  "https://vibe-book-kappa.vercel.app",
  "https://vibe-book-fri1.onrender.com",
  ...LOCAL_DEV_PORTS.map((port) => `http://localhost:${port}`),
  ...LOCAL_DEV_PORTS.map((port) => `http://127.0.0.1:${port}`),
]);

const normalizeOrigin = (value = "") => {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed;
  }
};

const addAllowedOrigins = (...origins) => {
  origins.filter(Boolean).forEach((origin) => {
    String(origin)
      .split(",")
      .map(normalizeOrigin)
      .filter(Boolean)
      .forEach((value) => allowedOrigins.add(value));
  });
};

addAllowedOrigins(
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  process.env.FRONTEND_ORIGIN,
  process.env.PUBLIC_FRONTEND_URL,
  process.env.PRODUCTION_FRONTEND_URL,
  process.env.APP_URL,
  process.env.CORS_ORIGIN,
  process.env.RENDER_EXTERNAL_URL,
  process.env.VERCEL_URL ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, "")}` : ""
);

const isVercelOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
};

const isAllowedLocalDevOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsed.hostname) &&
      LOCAL_DEV_PORTS.includes(parsed.port)
    );
  } catch {
    return false;
  }
};

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);

  return allowedOrigins.has(normalizedOrigin) || isAllowedLocalDevOrigin(normalizedOrigin) || isVercelOrigin(normalizedOrigin);
};

const corsOriginDelegate = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }

  return callback(null, false);
};

const corsOptions = {
  origin: corsOriginDelegate,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204,
};

module.exports = {
  allowedOrigins,
  corsOptions,
  isOriginAllowed,
  normalizeOrigin,
};
