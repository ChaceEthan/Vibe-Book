// @ts-nocheck
const LOCAL_DEV_PORTS = ["3000", "4173", "5173", "5174", "5175", "5176", "5177", "5178", "5179"];
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const rejectedOriginsLogged = new Set();

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

const isRenderOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".onrender.com");
  } catch {
    return false;
  }
};

const isValidPort = (port) => {
  if (!port) {
    return true;
  }

  const portNumber = Number(port);
  return Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
};

const isAllowedLocalDevOrigin = (origin) => {
  try {
    const parsed = new URL(origin);

    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      LOCAL_HOSTNAMES.has(parsed.hostname) &&
      isValidPort(parsed.port)
    );
  } catch {
    return false;
  }
};

const isAllowedPrivateNetworkOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;

    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      isValidPort(parsed.port) &&
      (/^192\.168\.(?:\d{1,3})\.(?:\d{1,3})$/.test(host) || /^10\.(?:\d{1,3})\.(?:\d{1,3})\.(?:\d{1,3})$/.test(host))
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

  return (
    allowedOrigins.has(normalizedOrigin) ||
    isAllowedLocalDevOrigin(normalizedOrigin) ||
    isAllowedPrivateNetworkOrigin(normalizedOrigin) ||
    isVercelOrigin(normalizedOrigin) ||
    isRenderOrigin(normalizedOrigin)
  );
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
  if (isOriginAllowed(origin)) {
    return callback(null, origin ? normalizeOrigin(origin) : true);
  }

  logRejectedOrigin(origin);
  return callback(null, false);
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

module.exports = {
  allowedOrigins,
  corsOptions,
  isOriginAllowed,
  logRejectedOrigin,
  normalizeOrigin,
};
