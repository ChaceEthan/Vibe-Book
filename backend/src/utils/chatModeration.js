const illegalKeywords = [
  "terrorism",
  "human trafficking",
  "child abuse",
  "illegal drugs",
  "weapon sale",
  "kill",
];

const hasLink = (message = "") => {
  return /\bhttps?:\/\/|\bwww\./i.test(message);
};

const sanitizeChatMessage = (value = "") => {
  return String(value)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
};

const validateChatMessage = (value = "") => {
  const message = sanitizeChatMessage(value);

  if (!message) {
    return { error: "Message cannot be empty" };
  }

  if (hasLink(message)) {
    return { error: "Links are not allowed in chat" };
  }

  const lowerMessage = message.toLowerCase();
  const blockedKeyword = illegalKeywords.find((keyword) => lowerMessage.includes(keyword));

  if (blockedKeyword) {
    return { error: "Message contains restricted content" };
  }

  return { message };
};

module.exports = {
  sanitizeChatMessage,
  validateChatMessage,
};
