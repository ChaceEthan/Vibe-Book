// @ts-nocheck
const { Resend } = require("resend");

const RESEND_SEND_TIMEOUT_MS = 8000;

let resendClient = null;

const envValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const getEmailConfigStatus = () => {
  const apiKey = envValue("RESEND_API_KEY");
  const from = envValue("FROM_EMAIL");
  const missing = [];

  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!from) missing.push("FROM_EMAIL");

  return {
    configured: missing.length === 0,
    missing,
    provider: "resend",
    from,
  };
};

const hasEmailConfig = () => getEmailConfigStatus().configured;

const getResendClient = () => {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
};

const timeoutError = (label, timeoutMs) => {
  const error = new Error(`${label} timed out after ${timeoutMs}ms`);
  error.code = "ETIMEDOUT";
  error.command = label;
  return error;
};

const withTimeout = (promise, timeoutMs, label) => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(timeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

const defaultFrom = () => envValue("FROM_EMAIL");

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const classifyEmailError = (error = {}) => {
  const code = String(error.code || "");
  const statusCode = Number(error.statusCode || error.status || error.response?.status || 0);
  const response = String(error.message || error.response?.data?.message || "");

  if (code === "ETIMEDOUT" || /timeout|network|fetch failed|econnrefused|enotfound|unreachable/i.test(response)) {
    return {
      reason: "RESEND_CONNECTION_FAILED",
      message: "Email delivery connection failed. Please try again in a few moments.",
    };
  }

  if (statusCode === 401 || statusCode === 403 || /api key|unauthorized|forbidden|authentication/i.test(response)) {
    return {
      reason: "RESEND_AUTH_FAILED",
      message: "Email delivery authentication failed. Please verify the Resend API key.",
    };
  }

  if (statusCode === 422 || /domain|sender|from/i.test(response)) {
    return {
      reason: "RESEND_SENDER_FAILED",
      message: "Email sender configuration is invalid. Please verify FROM_EMAIL in Resend.",
    };
  }

  if (statusCode === 429) {
    return {
      reason: "RESEND_RATE_LIMITED",
      message: "Email service is busy. Please try again in a few moments.",
    };
  }

  if (statusCode >= 500) {
    return {
      reason: "RESEND_SERVICE_UNAVAILABLE",
      message: "Email service temporarily unavailable. Please try again in a few moments.",
    };
  }

  return {
    reason: "RESEND_SEND_FAILED",
    message: "Email delivery failed. Please try again later or contact support.",
    details: {
      code,
      statusCode,
      firstResponseLine: response.split("\n")[0],
    },
  };
};

const sendMailWithRetry = async (mailOptions) => {
  const startedAt = Date.now();
  const response = await withTimeout(
    getResendClient().emails.send(mailOptions),
    RESEND_SEND_TIMEOUT_MS,
    "Resend email send"
  );

  if (response?.error) {
    const error = new Error(response.error.message || "Resend email send failed");
    error.statusCode = response.error.statusCode || response.error.status;
    error.response = response.error;
    throw error;
  }

  console.log("[email] Mail sent successfully", {
    provider: "resend",
    elapsedMs: Date.now() - startedAt,
    recipient: mailOptions.to || "unknown",
    messageId: response?.data?.id || response?.id || "",
  });

  return response;
};

const sendContactNotification = async ({
  to,
  contactedUser = {},
  fromUser = {},
  message = "",
}) => {
  if (!hasEmailConfig()) {
    return {
      sent: false,
      reason: "RESEND_NOT_CONFIGURED",
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
    console.error("[email] Contact notification delivery failed", {
      ...classifyEmailError(error),
      originalError: {
        message: error?.message || "",
        code: error?.code || "",
        statusCode: error?.statusCode || "",
      },
      recipient: to,
    });

    return {
      sent: false,
      ...classifyEmailError(error),
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
  if (!hasEmailConfig()) {
    return {
      sent: false,
      reason: "RESEND_NOT_CONFIGURED",
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
    console.error("[email] Booking notification delivery failed", {
      ...classifyEmailError(error),
      originalError: {
        message: error?.message || "",
        code: error?.code || "",
        statusCode: error?.statusCode || "",
      },
      recipient: to,
    });

    return {
      sent: false,
      ...classifyEmailError(error),
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
  if (!hasEmailConfig()) {
    const status = getEmailConfigStatus();

    console.warn(
      `[email] Verification email skipped; missing Resend config. Missing: ${
        status.missing.join(", ") || "unknown"
      }`
    );

    return {
      sent: false,
      reason: "RESEND_NOT_CONFIGURED",
      message:
        "Verification service temporarily unavailable. Please ensure Resend email delivery is configured.",
    };
  }

  const subject = "Your VibeBook verification code";
  const appUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "";

  try {
    const startedAt = Date.now();
    const text = [
      `Hi ${name || "creator"},`,
      "",
      `Your VibeBook verification code is: ${code}`,
      "",
      `This code expires in ${expiresMinutes} minutes.`,
      "",
      "If you did not request this code, you can safely ignore this email.",
    ].join("\n");
    const html = verificationEmailHtml({
      appUrl,
      code,
      expiresMinutes,
      name,
    });

    console.log(`[email] Sending verification email to ${to} via Resend`);

    const response = await sendMailWithRetry({
      from: process.env.FROM_EMAIL,
      to,
      subject,
      html,
      text,
    });

    console.log("[email] Verification email sent successfully", {
      provider: "resend",
      recipient: to,
      elapsedMs: Date.now() - startedAt,
      messageId: response?.data?.id || response?.id || "",
    });

    return { sent: true };
  } catch (error) {
    const classified = classifyEmailError(error);

    console.error("[email] Verification email delivery failed", {
      reason: classified.reason,
      message: classified.message,
      details: classified.details || {},
      originalError: {
        message: error?.message || "",
        code: error?.code || "",
        statusCode: error?.statusCode || "",
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
  const status = getEmailConfigStatus();

  if (!status.configured) {
    console.warn(
      "[email] Resend email service not configured. Missing: " + status.missing.join(", ")
    );
    return {
      ok: false,
      reason: "RESEND_NOT_CONFIGURED",
      status,
    };
  }

  getResendClient();
  console.log("[email] Resend email service initialized");

  return {
    ok: true,
    status,
    message: "Resend email service initialized",
  };
};

const transporter = {
  sendMail: sendMailWithRetry,
  verify: verifyEmailTransporter,
};

const verifyConnection = verifyEmailTransporter;

module.exports = {
  transporter,
  verifyConnection,
  sendMailWithRetry,
  sendContactNotification,
  sendBookingNotification,
  sendVerificationEmail,
  getEmailConfigStatus,
  verifyEmailTransporter,
};
