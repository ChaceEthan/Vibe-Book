// @ts-nocheck
const nodemailer = require("nodemailer");

const hasSmtpConfig = () => {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

const createTransporter = () => {
  const port = Number(process.env.SMTP_PORT) || 587;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendContactNotification = async ({ to, contactedUser, fromUser, message }) => {
  if (!hasSmtpConfig()) {
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
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
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
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

module.exports = {
  sendContactNotification,
  sendBookingNotification,
};
