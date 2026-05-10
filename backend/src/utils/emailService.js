// @ts-nocheck
const nodemailer = require("nodemailer");

const hasSmtpConfig = () => {
  return Boolean((process.env.SMTP_HOST || process.env.SMTP_EMAIL) && (process.env.SMTP_USER || process.env.SMTP_EMAIL) && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD));
};

const createTransporter = () => {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user,
      pass,
    },
  });
};

const defaultFrom = () => process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.SMTP_EMAIL;

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const verificationEmailHtml = ({ code, expiresMinutes = 10, name = "creator" }) => `
  <div style="margin:0;background:#f8fafc;padding:24px;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
      <tr>
        <td style="background:#020617;color:#ffffff;padding:28px 24px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:#38bdf8;color:#020617;font-weight:900;font-size:18px;">VB</div>
          <h1 style="margin:18px 0 0;font-size:26px;line-height:1.2;">Verify your VibeBook email</h1>
          <p style="margin:10px 0 0;color:#cbd5e1;font-size:14px;line-height:1.6;">Hi ${escapeHtml(name)}, use this one-time code to finish securing your account.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px;">
          <p style="margin:0 0 12px;font-size:14px;color:#475569;">Your VibeBook verification code is:</p>
          <div style="letter-spacing:10px;font-size:34px;font-weight:900;text-align:center;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:14px;padding:18px 12px;color:#0f172a;">${code}</div>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#475569;">This code expires in ${expiresMinutes} minutes. If you did not request this code, you can safely ignore this email.</p>
          <div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;line-height:1.6;color:#64748b;">
            VibeBook will never ask for your password or payment details by email. Keep this code private.
          </div>
        </td>
      </tr>
    </table>
  </div>
`;

const sendVerificationEmail = async ({ to, code, name, expiresMinutes = 10 }) => {
  if (!hasSmtpConfig()) {
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const transporter = createTransporter();
  const subject = "Your VibeBook verification code";

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
    ].join("\n"),
    html: verificationEmailHtml({ code, expiresMinutes, name }),
  });

  return { sent: true };
};

module.exports = {
  sendContactNotification,
  sendBookingNotification,
  sendVerificationEmail,
};
