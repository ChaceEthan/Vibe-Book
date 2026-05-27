/**
 * Chat Filter & Moderation Utilities
 * Handles spam detection, content filtering, and comment moderation
 */

const BANNED_WORDS = [
  // Offensive language (basic filter - expand as needed)
  "hate", "racist", "sexist", "slur",
  // Spam patterns
  "viagra", "casino", "lottery", "click here",
  // Scam keywords
  "crypto airdrop", "free money", "wire transfer",
];

const CRYPTO_SCAM_PATTERNS = [
  /send\s+(\d+)\s*(eth|btc|bnb)/gi,
  /transfer.*wallet/gi,
  /confirm.*payment/gi,
];

const SPAM_LINK_PATTERNS = [
  /http[s]?:\/\/[^ ]+/g,
  /www\.[^ ]+/g,
];

/**
 * Validate if comment contains banned words or offensive content
 */
const hasBannedContent = (text = "") => {
  const lower = String(text).toLowerCase();
  return BANNED_WORDS.some((word) => lower.includes(word));
};

/**
 * Check for crypto scam patterns
 */
const hasCryptoScam = (text = "") => {
  return CRYPTO_SCAM_PATTERNS.some((pattern) => pattern.test(String(text)));
};

/**
 * Extract URLs from text
 */
const extractUrls = (text = "") => {
  const matches = String(text).match(/https?:\/\/[^\s]+/g);
  return matches || [];
};

/**
 * Filter comment text for moderation
 */
const filterComment = (text = "", settings = {}) => {
  const {
    slowModeEnabled = false,
    followersOnlyMode = false,
    allowLinks = false,
    checkSpam = true,
    checkScams = true,
  } = settings;

  const trimmed = String(text).trim();

  // Basic validation
  if (!trimmed || trimmed.length === 0) {
    return { valid: false, error: "Comment cannot be empty" };
  }

  if (trimmed.length > 500) {
    return { valid: false, error: "Comment too long (max 500 characters)" };
  }

  // Check for offensive content
  if (checkSpam && hasBannedContent(trimmed)) {
    return { valid: false, error: "Comment contains inappropriate content", filtered: true };
  }

  // Check for crypto scams
  if (checkScams && hasCryptoScam(trimmed)) {
    return { valid: false, error: "Suspicious pattern detected", filtered: true };
  }

  // Check for spam links
  const urls = extractUrls(trimmed);
  if (urls.length > 0 && !allowLinks) {
    return { valid: false, error: "Links not allowed in this chat" };
  }

  return {
    valid: true,
    text: trimmed,
    hasLinks: urls.length > 0,
    urls,
  };
};

/**
 * Check for spam (repeated messages)
 */
const isSpamMessage = (socket, text = "", windowMs = 5000, maxMessages = 3) => {
  const key = `chat:spam:${text.toLowerCase()}`;
  const current = socket.data[key] || [];
  const now = Date.now();

  // Remove old entries
  const filtered = current.filter((t) => now - t < windowMs);

  if (filtered.length >= maxMessages) {
    return true;
  }

  filtered.push(now);
  socket.data[key] = filtered;

  return false;
};

module.exports = {
  filterComment,
  hasBannedContent,
  hasCryptoScam,
  extractUrls,
  isSpamMessage,
};
