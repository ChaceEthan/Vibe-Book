const errorMiddleware = (err, req, res, next) => {
  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : err.statusCode || 500;
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
    message = "Duplicate value already exists";
  }

  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Invalid JSON payload";
  }

  if (err.name === "MulterError") {
    statusCode = 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "Uploaded file is too large" : err.message;
  }

  if (message === "Not allowed by CORS") {
    statusCode = 403;
  }

  return res.status(statusCode).json({
    success: false,
    data,
    message: statusCode === 500 ? "Server error" : message,
  });
};

module.exports = errorMiddleware;
