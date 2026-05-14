// @ts-nocheck
const nodemailer = require("nodemailer");

let cachedTransporter = null;
let cachedTransporterKey = "";

const smtpNumber = (key, fallback, min = 1000, max = 60000) => {
  const value = Number(process.env[key]);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
};

const SMTP_CONNECTION_TIMEOUT_MS = smtpNumber("SMTP_CONNECTION_TIMEOUT_MS", 7000);
const SMTP_GREETING_TIMEOUT_MS = smtpNumber("SMTP_GREETING_TIMEOUT_MS", 5000);
const SMTP_SOCKET_TIMEOUT_MS = smtpNumber("SMTP_SOCKET_TIMEOUT_MS", 7000);
const SMTP_DNS_TIMEOUT_MS = smtpNumber("SMTP_DNS_TIMEOUT_MS", 5000);
const SMTP_SEND_TIMEOUT_MS = smtpNumber("SMTP_SEND_TIMEOUT_MS", 10000);
const SMTP_VERIFY_TIMEOUT_MS = smtpNumber("SMTP_VERIFY_TIMEOUT_MS", 8000);
const configuredSmtpRetries = Number(process.env.SMTP_SEND_RETRIES);
const SMTP_MAX_RETRIES = Number.isFinite(configuredSmtpRetries)
  ? Math.min(Math.max(configuredSmtpRetries, 0), 2)
  : 1;
const SMTP_RETRY_BACKOFF_MS = smtpNumber("SMTP_RETRY_BACKOFF_MS", 500, 100, 5000);

const envValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const truthy = (value) =>
  ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());

const getSmtpConfig = () => {
  const host = envValue("SMTP_HOST", "EMAIL_HOST") || "smtp.gmail.com";
  // Production default: Port 587 (STARTTLS) for Gmail reliability
  // Port 465 (SMTPS implicit TLS) can have connection issues
  const portEnv = Number(envValue("SMTP_PORT", "EMAIL_PORT")) || 0;
  const port = portEnv > 0 ? portEnv : (host?.includes("gmail") ? 587 : 465);
  const secure =
    !envValue("SMTP_SECURE", "EMAIL_SECURE")
      ? port === 465
      : truthy(envValue("SMTP_SECURE", "EMAIL_SECURE"));
  const user = envValue(
    "EMAIL_USER",
    "SMTP_USER",
    "SMTP_EMAIL",
    "SMTP_USERNAME",
    "GMAIL_USER"
  );
  const pass = envValue(
    "EMAIL_PASS",
    "EMAIL_APP_PASSWORD",
    "SMTP_PASS",
    "SMTP_PASSWORD",
    "SMTP_AUTH_TOKEN",
    "GMAIL_APP_PASSWORD",
    "GMAIL_PASS"
  );
  const from =
    envValue("FROM_EMAIL", "SMTP_FROM", "EMAIL_FROM", "MAIL_FROM") ||
    (user ? `VibeBook <${user}>` : "");

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
};

const getEmailConfigStatus = () => {
  const config = getSmtpConfig();
  const missing = [];

  if (!config.host) missing.push("SMTP_HOST");
  if (!Number.isFinite(config.port) || config.port <= 0) missing.push("SMTP_PORT");
  if (!config.user) missing.push("EMAIL_USER/SMTP_USER");
  if (!config.pass) missing.push("EMAIL_PASS/SMTP_PASS");
  if (!config.from) missing.push("FROM_EMAIL/SMTP_FROM");

  return {
    configured: missing.length === 0,
    missing,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user ? config.user.replace(/^(.{2}).*(@.*)?$/, "$1***$2") : "",
    from: config.from,
  };
};

const hasSmtpConfig = () => getEmailConfigStatus().configured;

const closeCachedTransporter = (reason = "reset") => {
  if (!cachedTransporter) {
    cachedTransporterKey = "";
    return;
  }

  const transporter = cachedTransporter;
  cachedTransporter = null;
  cachedTransporterKey = "";

  try {
    if (typeof transporter.close === "function") {
      transporter.close();
      console.warn(`[email] SMTP transporter closed after ${reason}`);
    }
  } catch (error) {
    console.warn("[email] SMTP transporter close failed", {
      reason,
      message: error?.message || "",
    });
  }
};

const timeoutError = (label, timeoutMs) => {
  const error = new Error(`${label} timed out after ${timeoutMs}ms`);
  error.code = "ETIMEDOUT";
  error.command = label;
  return error;
};

const withTimeout = (promise, timeoutMs, label, onTimeout) => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(timeoutError(label, timeoutMs));
      }
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

const shouldResetTransporter = (error = {}) => {
  const code = String(error.code || "");
  const responseCode = Number(error.responseCode || 0);

  return (
    ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH"].includes(code) ||
    [421, 450, 451, 452].includes(responseCode)
  );
};

const shouldRetrySmtpError = (error = {}) => {
  if (error.code === "EAUTH" || [534, 535].includes(Number(error.responseCode || 0))) {
    return false;
  }

  return shouldResetTransporter(error) || Number(error.responseCode || 0) >= 500;
};

const createTransporter = () => {
  const config = getSmtpConfig();
  const transporterKey = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
  });

  if (cachedTransporter && cachedTransporterKey === transporterKey) {
    return cachedTransporter;
  }

  // Reset cache if configuration changed
  closeCachedTransporter("SMTP config changed");

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    family: 4,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    dnsTimeout: SMTP_DNS_TIMEOUT_MS,
    pool: true,
    maxConnections: 2,
    maxMessages: 25,
    rateDelta: 1000,
    rateLimit: 5,
    requireTLS: !config.secure && (config.port === 587 || config.host?.includes("gmail")),
    tls: {
      rejectUnauthorized: true,
      servername: config.host,
      // Allow connection to Gmail with proper TLS handling
      ...(config.host?.includes("gmail") && !config.secure && config.port === 587
        ? { minVersion: "TLSv1.2" }
        : {}),
    },
    // Enable detailed logging in non-production for debugging
    ...(process.env.NODE_ENV !== "production"
      ? { logger: true, debug: true }
      : {}),
  });

  cachedTransporter = transporter;
  cachedTransporterKey = transporterKey;

  return cachedTransporter;
};

const defaultFrom = () => getSmtpConfig().from;

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const classifySmtpError = (error = {}) => {
  const code = String(error.code || "");
  const response = String(error.response || error.message || "");
  const responseCode = Number(error.responseCode || 0);
  const stack = String(error.stack || "");

  // Authentication failures
  if (
    code === "EAUTH" ||
    responseCode === 535 ||
    responseCode === 534 ||
    /authentication|invalid login|invalid credentials|login failed|verify credentials/i.test(response)
  ) {
    return {
      reason: "SMTP_AUTH_FAILED",
      message:
        "Email delivery authentication failed. Please verify SMTP credentials and Gmail App Password.",
    };
  }

  // Connection/network failures
  if (
    code === "ECONNECTION" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    /timeout|connect|network|socket|econnrefused|enotfound|unreachable|refused/i.test(response)
  ) {
    return {
      reason: "SMTP_CONNECTION_FAILED",
      message:
        "Email delivery connection failed. Please check SMTP host and port configuration. Verify firewall/network access.",
    };
  }

  // TLS/SSL certificate failures
  if (
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "CERT_HAS_EXPIRED" ||
    /certificate|tls|ssl|handshake/i.test(response)
  ) {
    return {
      reason: "SMTP_TLS_FAILED",
      message:
        "Email delivery TLS configuration issue. Check SMTP_SECURE and port compatibility.",
    };
  }

  // Service unavailable
  if (
    responseCode === 421 ||
    responseCode === 450 ||
    /temporarily unavailable|try again later|service unavailable/i.test(response)
  ) {
    return {
      reason: "SMTP_SERVICE_UNAVAILABLE",
      message:
        "Email service temporarily unavailable. Please try again in a few moments.",
    };
  }

  // Generic failure with detailed info
  return {
    reason: "SMTP_SEND_FAILED",
    message:
      "Email delivery failed. Please try again later or contact support.",
    details: {
      code,
      responseCode,
      firstResponseLine: response.split("\n")[0],
    },
  };
};

const sendMailWithRetry = async (mailOptions, retries = SMTP_MAX_RETRIES) => {
  const maxRetries = Math.min(Math.max(Number(retries), 0), 2);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const config = getSmtpConfig();
    const transporter = createTransporter();
    const startedAt = Date.now();

    try {
      const response = await withTimeout(
        transporter.sendMail(mailOptions),
        SMTP_SEND_TIMEOUT_MS,
        "SMTP sendMail",
        () => closeCachedTransporter("sendMail timeout")
      );
      const elapsedMs = Date.now() - startedAt;
      console.log("[email] Mail sent successfully", {
        attempt: attempt + 1,
        elapsedMs,
        host: config.host,
        port: config.port,
        recipient: mailOptions.to || "unknown",
        response: response?.response || response?.messageId || "",
      });
      return response;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries || !shouldRetrySmtpError(error);
      const classified = classifySmtpError(error);

      console.error(`[email] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, {
        reason: classified.reason,
        message: error?.message || "",
        code: error?.code || "",
        responseCode: error?.responseCode || "",
        command: error?.command || "",
        response: error?.response?.split("\n")[0] || "",
        to: mailOptions.to || "unknown",
        elapsedMs: Date.now() - startedAt,
      });

      if (classified.reason === "SMTP_AUTH_FAILED") {
        console.error("[email] SMTP authentication failed; check Gmail App Password and account access", {
          code: error?.code || "",
          responseCode: error?.responseCode || "",
          command: error?.command || "",
          host: config.host,
          user: config.user ? config.user.replace(/^(.{2}).*(@.*)?$/, "$1***$2") : "not-set",
        });
      }

      // On certain errors, clear the transporter cache so it can be recreated
      if (shouldResetTransporter(error)) {
        closeCachedTransporter(classified.reason);
      }

      if (isLastAttempt) {
        throw error;
      }

      const backoffMs = SMTP_RETRY_BACKOFF_MS * Math.pow(2, attempt);
      console.log(
        `[email] Retrying in ${backoffMs}ms after ${classified.reason}...`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
};

const sendContactNotification = async ({
  to,
  contactedUser = {},
  fromUser = {},
  message = "",
}) => {
  if (!hasSmtpConfig()) {
    return {
      sent: false,
      reason: "SMTP_NOT_CONFIGURED",
    };
  }

  try {
    await sendMailWithRetry({
      from: defaultFrom(),
      to,
      subject: `New VibeBook contact from ${fromUser.name || "a user"}`,
      text: [
        `Hi ${contactedUser.name || "there"},`,
        "",
        `${fromUser.name || "A VibeBook user"} contacted you on VibeBook.`,
        "",
        `Message: ${message || "No message"}`,
        "",
        `Reply email: ${fromUser.email || "Not provided"}`,
      ].join("\n"),
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      ...classifySmtpError(error),
    };
  }
};

const sendBookingNotification = async ({
  to,
  talent = {},
  requester = {},
  booking = {},
  whatsappLink,
}) => {
  if (!hasSmtpConfig()) {
    return {
      sent: false,
      reason: "SMTP_NOT_CONFIGURED",
    };
  }

  try {
    await sendMailWithRetry({
      from: defaultFrom(),
      to,
      subject: `Your VibeBook booking request from ${requester.name || "a user"}`,
      text: [
        `Hi ${talent.name || "there"},`,
        "",
        `${requester.name || "A VibeBook user"} sent you a booking request on VibeBook.`,
        "",
        `Business: ${booking.businessName || "Not provided"}`,
        `Event location: ${booking.location || "Not provided"}`,
        `Offered price: ${
          booking.offeredPrice || booking.offerPrice || "Not provided"
        } RWF`,
        `Message: ${booking.message || "No message"}`,
        "",
        whatsappLink ? `WhatsApp action link: ${whatsappLink}` : "",
        `Reply email: ${requester.email || "Not provided"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      ...classifySmtpError(error),
    };
  }
};

const verificationEmailHtml = ({
  appUrl = "",
  code,
  expiresMinutes = 10,
  name = "creator",
}) => `
<div style="margin:0;background:#f8fafc;padding:24px;font-family:Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
    <tr>
      <td style="background:#020617;color:#ffffff;padding:28px 24px;">
        <h1 style="margin:0;font-size:26px;">VibeBook email verification</h1>
        <p style="margin-top:10px;color:#cbd5e1;">
          Hi ${escapeHtml(name)}, use this verification code to secure your account.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 24px;">
        <div style="letter-spacing:10px;font-size:34px;font-weight:900;text-align:center;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:14px;padding:18px 12px;color:#0f172a;">
          ${escapeHtml(code)}
        </div>
        <p style="margin-top:18px;color:#475569;">
          This code expires in ${escapeHtml(expiresMinutes)} minutes.
        </p>
        <p style="margin-top:18px;color:#475569;">
          If you did not request this code, you can safely ignore this email.
        </p>
        ${
          appUrl
            ? `
        <p>
          <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:bold;">
            Open VibeBook
          </a>
        </p>
        `
            : ""
        }
        <div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;line-height:1.6;color:#64748b;">
          VibeBook will never ask for your password or payment details by email. Keep this code private.
        </div>
      </td>
    </tr>
  </table>
</div>
`;

const sendVerificationEmail = async ({
  to,
  code,
  name = "creator",
  expiresMinutes = 10,
}) => {
  if (!hasSmtpConfig()) {
    const status = getEmailConfigStatus();

    console.warn(
      `[email] Verification email skipped; missing SMTP config. Missing: ${
        status.missing.join(", ") || "unknown"
      }`
    );

    return {
      sent: false,
      reason: "SMTP_NOT_CONFIGURED",
      message:
        "Verification service temporarily unavailable. Please ensure SMTP credentials are configured.",
    };
  }

  const subject = "Your VibeBook verification code";
  const appUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "";
  const config = getSmtpConfig();

  try {
    const startedAt = Date.now();
    console.log(`[email] Sending verification email to ${to} via ${config.host}:${config.port} (secure=${config.secure})`);
    
    const response = await sendMailWithRetry({
      from: defaultFrom(),
      to,
      subject,
      text: [
        `Hi ${name || "creator"},`,
        "",
        `Your VibeBook verification code is: ${code}`,
        "",
        `This code expires in ${expiresMinutes} minutes.`,
        "",
        "If you did not request this code, you can safely ignore this email.",
      ].join("\n"),
      html: verificationEmailHtml({
        appUrl,
        code,
        expiresMinutes,
        name,
      }),
    });

    console.log("[email] Verification email sent successfully", {
      recipient: to,
      elapsedMs: Date.now() - startedAt,
      host: config.host,
      port: config.port,
      response: response?.response || response?.messageId || "",
    });
    return { sent: true };
  } catch (error) {
    const classified = classifySmtpError(error);

    if (classified.reason === "SMTP_AUTH_FAILED") {
      console.error("[email] Verification email blocked by SMTP authentication failure", {
        code: error?.code || "",
        responseCode: error?.responseCode || "",
        command: error?.command || "",
        host: config.host,
        user: config.user ? config.user.replace(/^(.{2}).*(@.*)?$/, "$1***$2") : "not-set",
      });
    }

    console.error("[email] Verification email delivery failed", {
      reason: classified.reason,
      message: classified.message,
      details: classified.details || {},
      originalError: {
        message: error?.message || "",
        code: error?.code || "",
        response: error?.response?.split("\n")[0] || "",
        responseCode: error?.responseCode || "",
      },
      config: {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user ? config.user.replace(/^(.{2}).*(@.*)?$/, "$1***$2") : "not-set",
      },
      recipient: to,
    });

    return {
      sent: false,
      ...classified,
    };
  }
};

const verifyEmailTransporter = async () => {
  const config = getSmtpConfig();
  const status = getEmailConfigStatus();

  if (!status.configured) {
    console.warn(
      "[email] SMTP not configured. Missing: " + status.missing.join(", ")
    );
    return {
      ok: false,
      reason: "SMTP_NOT_CONFIGURED",
      status,
    };
  }

  try {
    console.log(
      `[email] Verifying SMTP connection to ${config.host}:${config.port} (secure=${config.secure})`
    );

    await withTimeout(
      createTransporter().verify(),
      SMTP_VERIFY_TIMEOUT_MS,
      "SMTP verify",
      () => closeCachedTransporter("verify timeout")
    );

    console.log("[email] ✓ SMTP transporter verified successfully");

    closeCachedTransporter("verify completed");

    return {
      ok: true,
      status,
      message: `Connected to ${config.host}:${config.port}`,
    };
  } catch (error) {
    const classified = classifySmtpError(error);
    if (shouldResetTransporter(error)) {
      closeCachedTransporter(classified.reason);
    }

    console.error("[email] ✗ SMTP verification failed", {
      reason: classified.reason,
      message: classified.message,
      details: classified.details || {},
      originalError: {
        message: error?.message || "",
        code: error?.code || "",
        response: error?.response?.split("\n")[0] || "",
        responseCode: error?.responseCode || "",
      },
      config: {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user ? config.user.replace(/^(.{2}).*(@.*)?$/, "$1***$2") : "not-set",
      },
    });

    return {
      ok: false,
      ...classified,
      status,
    };
  }
};

const transporter = {
  sendMail: (mailOptions) => createTransporter().sendMail(mailOptions),
  verify: () => createTransporter().verify(),
};

const verifyConnection = verifyEmailTransporter;

module.exports = {
  transporter,
  verifyConnection,
  sendMailWithRetry,
  sendContactNotification,
  sendBookingNotification,
  sendVerificationEmail,
  getSmtpConfig,
  getEmailConfigStatus,
  verifyEmailTransporter,
};
