// @ts-nocheck
const errorMiddleware = (err, req, res, next) => {
  // Cloudinary's SDK sets http_code (not statusCode/status) on its errors —
  // without reading it, a routine 4xx rejection from Cloudinary (bad format,
  // oversized file, unsupported codec) was always reported to the client as
  // a 500 and logged as a GLOBAL ERROR.
  const cloudinaryStatus = Number(err.http_code || 0);
  const inferredStatusCode = cloudinaryStatus >= 400 && cloudinaryStatus < 600 ? cloudinaryStatus : err.statusCode || 500;
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : inferredStatusCode;
  let message = err.message || "Server error";
  let data = null;

  if (err.name === "ValidationError") {
    statusCode = 400;
    data = Object.values(err.errors).map((error) => ({
      field: error.path,
      message: error.message,
    }));
    message = data.map((error) => error.message).join(", ");
  }

  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource id";
  }

  if (err.code === 11000) {
    statusCode = 400;
    if (err.keyPattern?.email || err.keyPattern?.emailNormalized) {
      message = "Email already exists";
    } else if (err.keyPattern?.username) {
      message = "Username already taken";
    } else {
      message = "Duplicate value already exists";
    }
  }

  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Invalid JSON payload";
  }

  if (err.name === "MulterError") {
    statusCode = 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "Uploaded file is too large" : err.message;
  }

  if (message === "Not allowed by CORS" || message === "Origin not allowed") {
    statusCode = 403;
    message = "Origin not allowed";
  }

  // 404s and other client-caused 4xx responses are expected, routine traffic
  // (stale links, bots probing, a typo'd URL) — logging them as "GLOBAL
  // ERROR" makes them indistinguishable from real server failures and
  // drowns out the incidents that actually need attention.
  if (statusCode >= 500) {
    console.error("GLOBAL ERROR:", err);
  } else if (process.env.NODE_ENV !== "production") {
    console.warn(`[${statusCode}] ${req.method} ${req.originalUrl}: ${message}`);
  }

  return res.status(statusCode).json({
    success: false,
    data,
    error: message,
    message,
  });
};

module.exports = errorMiddleware;
