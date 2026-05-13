// @ts-nocheck
const providerName = () => String(process.env.SMS_PROVIDER || "").trim().toLowerCase();

const envValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

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
  const sid = envValue("TWILIO_ACCOUNT_SID", "SMS_TWILIO_ACCOUNT_SID");
  const token = envValue("TWILIO_AUTH_TOKEN", "SMS_TWILIO_AUTH_TOKEN");
  const from = envValue("TWILIO_FROM", "SMS_FROM");

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
  const apiKey = envValue("VONAGE_API_KEY", "SMS_VONAGE_API_KEY");
  const apiSecret = envValue("VONAGE_API_SECRET", "SMS_VONAGE_API_SECRET");

  if (!apiKey || !apiSecret) {
    return { sent: false, reason: "VONAGE_NOT_CONFIGURED" };
  }

  return postForm("https://rest.nexmo.com/sms/json", {
    api_key: apiKey,
    api_secret: apiSecret,
    from: envValue("VONAGE_FROM", "SMS_FROM") || "VibeBook",
    to: String(to || "").replace(/[^\d]/g, ""),
    text: `Your VibeBook verification code is: ${code}. It expires in ${expiresMinutes} minutes.`,
  });
};

const sendWithAfricasTalking = async ({ to, code, expiresMinutes = 10 }) => {
  const username = envValue("AFRICASTALKING_USERNAME", "AFRICASTALKING_USER");
  const apiKey = envValue("AFRICASTALKING_API_KEY", "AFRICASTALKING_TOKEN");

  if (!username || !apiKey) {
    return { sent: false, reason: "AFRICASTALKING_NOT_CONFIGURED" };
  }

  return postForm(
    "https://api.africastalking.com/version1/messaging",
    {
      username,
      from: envValue("AFRICASTALKING_FROM", "SMS_FROM"),
      to,
      message: `Your VibeBook verification code is: ${code}. It expires in ${expiresMinutes} minutes.`,
    },
    { apiKey }
  );
};

const getSmsConfigStatus = () => {
  const provider = providerName();

  if (provider === "twilio") {
    const missing = [
      envValue("TWILIO_ACCOUNT_SID", "SMS_TWILIO_ACCOUNT_SID") ? "" : "TWILIO_ACCOUNT_SID",
      envValue("TWILIO_AUTH_TOKEN", "SMS_TWILIO_AUTH_TOKEN") ? "" : "TWILIO_AUTH_TOKEN",
      envValue("TWILIO_FROM", "SMS_FROM") ? "" : "TWILIO_FROM",
    ].filter(Boolean);
    return { configured: missing.length === 0, provider, missing };
  }

  if (provider === "vonage") {
    const missing = [
      envValue("VONAGE_API_KEY", "SMS_VONAGE_API_KEY") ? "" : "VONAGE_API_KEY",
      envValue("VONAGE_API_SECRET", "SMS_VONAGE_API_SECRET") ? "" : "VONAGE_API_SECRET",
    ].filter(Boolean);
    return { configured: missing.length === 0, provider, missing };
  }

  if (provider === "africastalking" || provider === "africas_talking" || provider === "africa-talking") {
    const missing = [
      envValue("AFRICASTALKING_USERNAME", "AFRICASTALKING_USER") ? "" : "AFRICASTALKING_USERNAME",
      envValue("AFRICASTALKING_API_KEY", "AFRICASTALKING_TOKEN") ? "" : "AFRICASTALKING_API_KEY",
    ].filter(Boolean);
    return { configured: missing.length === 0, provider: "africastalking", missing };
  }

  return { configured: false, provider: provider || "none", missing: ["SMS_PROVIDER"] };
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
  getSmsConfigStatus,
  sendPhoneVerificationSms,
};
