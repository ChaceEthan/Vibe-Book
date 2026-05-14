// @ts-nocheck
const { Resend } = require("resend");

const RESEND_SEND_TIMEOUT_MS = 8000;
const CONTROLLED_FROM_EMAIL = "vibebooksocialofficial@gmail.com";

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
  const from = envValue("FROM_EMAIL") || CONTROLLED_FROM_EMAIL;
  const missing = [];

  if (!apiKey) missing.push("RESEND_API_KEY");

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
    resendClient = new Resend(envValue("RESEND_API_KEY"));
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

const defaultFrom = () => envValue("FROM_EMAIL") || CONTROLLED_FROM_EMAIL;

const getResendMessageId = (response = {}) => {
  return response?.data?.id || response?.id || "";
};

const safeMailPayload = (mailOptions = {}) => ({
  from: mailOptions.from || "",
  to: mailOptions.to || "",
  subject: mailOptions.subject || "",
  hasHtml: Boolean(mailOptions.html),
  hasText: Boolean(mailOptions.text),
});

const safeResendResponse = (response = {}) => ({
  id: getResendMessageId(response),
  error: response?.error || null,
});

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
  const response = String(error.message || error.response?.data?.message || error.response?.message || "");

  if (
    /onboarding@resend\.dev|domain|sender|from|verified|verify your domain|not verified/i.test(response)
  ) {
    return {
      success: false,
      reason: "SENDER_NOT_VERIFIED",
      message: "EMAIL NOT DELIVERED - SENDER NOT VERIFIED",
    };
  }

  if (code === "ETIMEDOUT" || /timeout|network|fetch failed|econnrefused|enotfound|unreachable/i.test(response)) {
    return {
      success: false,
      reason: "RESEND_CONNECTION_FAILED",
      message: "Email delivery connection failed. Please try again in a few moments.",
    };
  }

  if (statusCode === 401 || statusCode === 403 || /api key|unauthorized|forbidden|authentication/i.test(response)) {
    return {
      success: false,
      reason: "RESEND_AUTH_FAILED",
      message: "Email delivery authentication failed. Please verify the Resend API key.",
    };
  }

  if (statusCode === 422 || /domain|sender|from/i.test(response)) {
    return {
      success: false,
      reason: "SENDER_NOT_VERIFIED",
      message: "EMAIL NOT DELIVERED - SENDER NOT VERIFIED",
    };
  }

  if (statusCode === 429) {
    return {
      success: false,
      reason: "RESEND_RATE_LIMITED",
      message: "Email service is busy. Please try again in a few moments.",
    };
  }

  if (statusCode >= 500) {
    return {
      success: false,
      reason: "RESEND_SERVICE_UNAVAILABLE",
      message: "Email verification is currently unavailable. Your account remains active.",
    };
  }

  return {
    success: false,
    reason: "RESEND_SEND_FAILED",
    message: "Email delivery failed. Please try again later or contact support.",
    details: {
      code,
      statusCode,
      firstResponseLine: response.split("\n")[0],
    },
  };
};

const resendErrorDetails = (error = {}) => ({
  message: error?.message || "",
  code: error?.code || "",
  statusCode: error?.statusCode || error?.status || error?.response?.status || "",
  response: error?.response || null,
});

const sendMailWithRetry = async (mailOptions) => {
  const startedAt = Date.now();
  console.log("[email] Resend request payload", safeMailPayload(mailOptions));

  const response = await withTimeout(
    getResendClient().emails.send(mailOptions),
    RESEND_SEND_TIMEOUT_MS,
    "Resend email send"
  );

  console.log("[email] Resend response", safeResendResponse(response));

  if (response?.error) {
    const error = new Error(response.error.message || "Resend email send failed");
    error.statusCode = response.error.statusCode || response.error.status;
    error.response = response.error;
    throw error;
  }

  const messageId = getResendMessageId(response);

  if (!messageId) {
    const error = new Error("Resend email send did not return a message id");
    error.code = "RESEND_MISSING_MESSAGE_ID";
    error.response = safeResendResponse(response);
    throw error;
  }

  console.log("[email] Mail sent successfully", {
    provider: "resend",
    elapsedMs: Date.now() - startedAt,
    recipient: mailOptions.to || "unknown",
    messageId,
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
      resendResponse: resendErrorDetails(error),
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
      resendResponse: resendErrorDetails(error),
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
      success: false,
      reason: "RESEND_NOT_CONFIGURED",
      message:
        "Email verification is currently unavailable. Your account remains active.",
    };
  }

  const subject = "Your VibeBook verification code";
  const appUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "";
  const from = defaultFrom();

  if (/onboarding@resend\.dev/i.test(from)) {
    console.warn("[email] EMAIL NOT DELIVERED - SENDER NOT VERIFIED", {
      provider: "resend",
      recipient: to,
      from,
      reason: "SENDER_NOT_VERIFIED",
    });

    return {
      sent: false,
      success: false,
      reason: "SENDER_NOT_VERIFIED",
      message: "EMAIL NOT DELIVERED - SENDER NOT VERIFIED",
    };
  }

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

    console.log("[email] OTP generated for verification email", {
      provider: "resend",
      recipient: to,
      expiresMinutes,
      codeLength: String(code || "").length,
    });

    console.log(`[email] Sending verification email to ${to} via Resend`);

    const response = await sendMailWithRetry({
      from,
      to,
      subject,
      html,
      text,
    });
    const messageId = getResendMessageId(response);

    console.log("[email] Verification email sent successfully", {
      provider: "resend",
      recipient: to,
      elapsedMs: Date.now() - startedAt,
      messageId,
    });

    return {
      sent: true,
      success: true,
      messageId,
      provider: "resend",
    };
  } catch (error) {
    const classified = classifyEmailError(error);
    const logMethod = classified.reason === "SENDER_NOT_VERIFIED" ? console.warn : console.error;

    logMethod("[email] Verification email delivery failed", {
      reason: classified.reason,
      message: classified.message,
      details: classified.details || {},
      resendResponse: resendErrorDetails(error),
      recipient: to,
      from: defaultFrom(),
    });

    return {
      sent: false,
      ...classified,
      resendResponse: resendErrorDetails(error),
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
