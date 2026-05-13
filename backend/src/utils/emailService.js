// @ts-nocheck
const nodemailer = require("nodemailer");

let cachedTransporter = null;
let cachedTransporterKey = "";

const envValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const getSmtpConfig = () => {
  const user = envValue("EMAIL_USER", "SMTP_USER", "SMTP_EMAIL", "SMTP_USERNAME", "GMAIL_USER");
  const pass = envValue("EMAIL_PASS", "SMTP_PASS", "SMTP_PASSWORD", "SMTP_AUTH_TOKEN", "GMAIL_APP_PASSWORD", "GMAIL_PASS");
  const host = envValue("SMTP_HOST", "EMAIL_HOST") || "smtp.gmail.com";
  const isGmail = /gmail\.com$/i.test(host);
  const port = Number(envValue("SMTP_PORT", "EMAIL_PORT")) || (isGmail ? 465 : 587);
  const secure = envValue("SMTP_SECURE", "EMAIL_SECURE")
    ? ["1", "true", "yes"].includes(envValue("SMTP_SECURE", "EMAIL_SECURE").toLowerCase())
    : port === 465;
  const from = envValue("FROM_EMAIL", "SMTP_FROM", "EMAIL_FROM", "MAIL_FROM") || (user ? `VibeBook <${user}>` : "");

  return {
    configured: Boolean(user && pass && from && host && Number.isFinite(port) && port > 0),
    from,
    host,
    pass,
    port,
    secure,
    user,
  };
};

const getEmailConfigStatus = () => {
  const config = getSmtpConfig();
  return {
    configured: config.configured,
    missing: [
      config.user ? "" : "EMAIL_USER/SMTP_USER",
      config.pass ? "" : "EMAIL_PASS/SMTP_PASS",
      config.from ? "" : "FROM_EMAIL/SMTP_FROM",
      config.host ? "" : "SMTP_HOST",
      Number.isFinite(config.port) && config.port > 0 ? "" : "SMTP_PORT",
    ].filter(Boolean),
    host: config.host,
    port: config.port,
    secure: config.secure,
  };
};

const hasSmtpConfig = () => {
  return getSmtpConfig().configured;
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

  const transporterOptions = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      servername: config.host,
    },
  };

  if (config.user && config.pass) {
    transporterOptions.auth = {
      user: config.user,
      pass: config.pass,
    };
  }

  cachedTransporter = nodemailer.createTransport(transporterOptions);
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

  if (code === "EAUTH" || responseCode === 535 || /invalid login|authentication/i.test(response)) {
    return {
      reason: "SMTP_AUTH_FAILED",
      message: "Email delivery is unavailable. Please check SMTP credentials and try again.",
    };
  }

  if (code === "ECONNECTION" || code === "ETIMEDOUT" || /timeout|connect/i.test(response)) {
    return {
      reason: "SMTP_CONNECTION_FAILED",
      message: "Email delivery is unavailable due to a connection issue. Please try again later.",
    };
  }

  return {
    reason: "SMTP_SEND_FAILED",
    message: "Email delivery failed. Please try again later or contact support.",
  };
};

const sendContactNotification = async ({ to, contactedUser, fromUser, message }) => {
  if (!hasSmtpConfig()) {
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: defaultFrom(),
    to,
    subject: `New VibeBook contact from ${fromUser.name}`,
    text: [
      `Hi ${contactedUser.name},`,
      "",
      `${fromUser.name} contacted you on VibeBook.`,
      "",
      `Message: ${message}`,
      "",
      `Reply email: ${fromUser.email}`,
    ].join("\n"),
  });

  return { sent: true };
};

const sendBookingNotification = async ({ to, talent, requester, booking, whatsappLink }) => {
  if (!hasSmtpConfig()) {
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: defaultFrom(),
    to,
    subject: `New VibeBook booking request from ${requester.name}`,
    text: [
      `Hi ${talent.name},`,
      "",
      `${requester.name} sent you a booking request on VibeBook.`,
      "",
      `Business: ${booking.businessName || "Not provided"}`,
      `Event location: ${booking.location || "Not provided"}`,
      `Offered price: ${booking.offeredPrice || booking.offerPrice || "Not provided"} RWF`,
      `Message: ${booking.message || "No message"}`,
      "",
      whatsappLink ? `WhatsApp action link: ${whatsappLink}` : "",
      `Reply email: ${requester.email}`,
    ].filter(Boolean).join("\n"),
  });

  return { sent: true };
};

const verificationEmailHtml = ({ appUrl = "", code, expiresMinutes = 10, name = "creator" }) => `
  <div style="margin:0;background:#f8fafc;padding:24px;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
      <tr>
        <td style="background:#020617;color:#ffffff;padding:28px 24px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:#38bdf8;color:#020617;font-weight:900;font-size:18px;">VB</div>
          <h1 style="margin:18px 0 0;font-size:26px;line-height:1.2;">VibeBook email verification</h1>
          <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;line-height:1.6;">Hi ${escapeHtml(name)}, use this one-time code to finish securing your account.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px;">
          <p style="margin:0 0 12px;font-size:14px;color:#475569;">Your VibeBook verification code is:</p>
          <div style="letter-spacing:10px;font-size:34px;font-weight:900;text-align:center;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:14px;padding:18px 12px;color:#0f172a;">${code}</div>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#475569;">This code expires in ${expiresMinutes} minutes. If you did not request this code, you can safely ignore this email.</p>
          ${appUrl ? `<p style="margin:22px 0 0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:800;">Open VibeBook</a></p>` : ""}
          <div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;line-height:1.6;color:#64748b;">
            VibeBook will never ask for your password or payment details by email. Keep this code private.
            <br />VibeBook, Kigali, Rwanda. Support: gebmelody@gmail.com
          </div>
        </td>
      </tr>
    </table>
  </div>
`;

const sendVerificationEmail = async ({ to, code, name, expiresMinutes = 10 }) => {
  if (!hasSmtpConfig()) {
    const status = getEmailConfigStatus();
    console.warn(`[email] Verification email skipped; missing config: ${status.missing.join(", ") || "unknown"}`);
    return {
      sent: false,
      reason: "SMTP_NOT_CONFIGURED",
      message: "Verification service temporarily unavailable. Please try again.",
    };
  }

  const transporter = createTransporter();
  const subject = "Your VibeBook verification code";
  const appUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "";

  try {
    await transporter.sendMail({
      from: defaultFrom(),
      to,
      subject,
      text: [
        `Hi ${name || "creator"},`,
        "",
        `Your VibeBook verification code is: ${code}`,
        "",
        `This code expires in ${expiresMinutes} minutes.`,
        "If you did not request this code, you can safely ignore this email.",
        "",
        "VibeBook will never ask for your password or payment details by email.",
        "VibeBook, Kigali, Rwanda. Support: gebmelody@gmail.com",
      ].join("\n"),
      html: verificationEmailHtml({ appUrl, code, expiresMinutes, name }),
    });

    return { sent: true };
  } catch (error) {
    const classified = classifySmtpError(error);
    console.error("[email] Verification email delivery failed", {
      reason: classified.reason,
      code: error?.code || "",
      responseCode: error?.responseCode || "",
      host: getSmtpConfig().host,
      port: getSmtpConfig().port,
    });
    return { sent: false, ...classified };
  }
};

const verifyEmailTransporter = async () => {
  if (!hasSmtpConfig()) {
    return { ok: false, reason: "SMTP_NOT_CONFIGURED", status: getEmailConfigStatus() };
  }

  try {
    await createTransporter().verify();
    return { ok: true, status: getEmailConfigStatus() };
  } catch (error) {
    const classified = classifySmtpError(error);
    console.error("[email] SMTP verification failed", {
      reason: classified.reason,
      code: error?.code || "",
      responseCode: error?.responseCode || "",
      host: getSmtpConfig().host,
      port: getSmtpConfig().port,
    });
    return { ok: false, ...classified, status: getEmailConfigStatus() };
  }
};

module.exports = {
  sendContactNotification,
  sendBookingNotification,
  sendVerificationEmail,
  getSmtpConfig,
  getEmailConfigStatus,
  verifyEmailTransporter,
};
