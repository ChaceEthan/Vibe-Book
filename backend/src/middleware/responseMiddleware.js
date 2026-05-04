const buildData = (body, success) => {
  if (!success) {
    return body?.data ?? null;
  }

  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "data")) {
    return body.data;
  }

  if (!body || typeof body !== "object") {
    return body ?? null;
  }

  const { message, success: ignoredSuccess, ...data } = body;
  return Object.keys(data).length ? data : null;
};

const responseMiddleware = (req, res, next) => {
  const originalJson = res.json.bind(res);

  res.apiSuccess = (data = null, message = "OK", statusCode = 200, extra = {}) => {
    return res.status(statusCode).json({
      ...extra,
      success: true,
      data,
      message,
    });
  };

  res.apiError = (message = "Request failed", statusCode = 400, data = null, extra = {}) => {
    return res.status(statusCode).json({
      ...extra,
      success: false,
      data,
      message,
    });
  };

  res.json = (body = {}) => {
    if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "success")) {
      return originalJson(body);
    }

    const success = res.statusCode < 400;
    const message = body?.message || (success ? "OK" : "Request failed");
    const data = buildData(body, success);
    const envelope = {
      ...(body && typeof body === "object" ? body : {}),
      success,
      data,
      message,
    };

    return originalJson(envelope);
  };

  return next();
};

module.exports = responseMiddleware;
