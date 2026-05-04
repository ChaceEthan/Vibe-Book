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
  console.log(
    `Contact notification prepared: ${fromUser.name} (${fromUser.email}) contacted ${contactedUser.name} (${contactedUser.email})`
  );

  if (!hasSmtpConfig()) {
    console.log("Contact email not sent: SMTP configuration is missing");
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

module.exports = {
  sendContactNotification,
};
