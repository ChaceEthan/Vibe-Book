// @ts-nocheck
const providerName = () => String(process.env.SMS_PROVIDER || "").trim().toLowerCase();

const maskPhone = (value = "") => {
  const raw = String(value || "");
  if (raw.length <= 4) return raw;
  return `${"*".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
};

const postForm = async (url, body, headers = {}) => {
  if (typeof fetch !== "function") {
    return { sent: false, reason: "FETCH_UNAVAILABLE" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    return { sent: false, reason: `HTTP_${response.status}` };
  }

  return { sent: true };
};

const sendWithTwilio = async ({ to, code, expiresMinutes = 10 }) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    return { sent: false, reason: "TWILIO_NOT_CONFIGURED" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  return postForm(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      From: from,
      To: to,
      Body: `Your VibeBook verification code is: ${code}. It expires in ${expiresMinutes} minutes.`,
    },
    { Authorization: `Basic ${auth}` }
  );
};

const sendWithVonage = async ({ to, code, expiresMinutes = 10 }) => {
  if (!process.env.VONAGE_API_KEY || !process.env.VONAGE_API_SECRET) {
    return { sent: false, reason: "VONAGE_NOT_CONFIGURED" };
  }

  return postForm("https://rest.nexmo.com/sms/json", {
    api_key: process.env.VONAGE_API_KEY,
    api_secret: process.env.VONAGE_API_SECRET,
    from: process.env.VONAGE_FROM || "VibeBook",
    to: String(to || "").replace(/[^\d]/g, ""),
    text: `Your VibeBook verification code is: ${code}. It expires in ${expiresMinutes} minutes.`,
  });
};

const sendWithAfricasTalking = async ({ to, code, expiresMinutes = 10 }) => {
  if (!process.env.AFRICASTALKING_USERNAME || !process.env.AFRICASTALKING_API_KEY) {
    return { sent: false, reason: "AFRICASTALKING_NOT_CONFIGURED" };
  }

  return postForm(
    "https://api.africastalking.com/version1/messaging",
    {
      username: process.env.AFRICASTALKING_USERNAME,
      from: process.env.AFRICASTALKING_FROM || "",
      to,
      message: `Your VibeBook verification code is: ${code}. It expires in ${expiresMinutes} minutes.`,
    },
    { apiKey: process.env.AFRICASTALKING_API_KEY }
  );
};

const sendPhoneVerificationSms = async ({ to, code, expiresMinutes = 10 }) => {
  const provider = providerName();

  if (!to || !code) {
    return { sent: false, reason: "MISSING_PHONE_OR_CODE" };
  }

  try {
    if (provider === "twilio") {
      return { provider, ...(await sendWithTwilio({ to, code, expiresMinutes })) };
    }

    if (provider === "vonage") {
      return { provider, ...(await sendWithVonage({ to, code, expiresMinutes })) };
    }

    if (provider === "africastalking" || provider === "africas_talking" || provider === "africa-talking") {
      return { provider: "africastalking", ...(await sendWithAfricasTalking({ to, code, expiresMinutes })) };
    }

    return { sent: false, provider: provider || "none", reason: "SMS_PROVIDER_NOT_CONFIGURED", to: maskPhone(to) };
  } catch (error) {
    return { sent: false, provider: provider || "unknown", reason: error.message || "SMS_SEND_FAILED", to: maskPhone(to) };
  }
};

module.exports = {
  sendPhoneVerificationSms,
};
