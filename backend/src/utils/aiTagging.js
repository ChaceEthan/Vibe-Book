const { normalizeTopic, uniqueTopics } = require("./feedRanking");

const DEFAULT_METADATA = Object.freeze({
  topics: [],
  hashtags: [],
  emotion: "neutral",
  language: "unknown",
  category: "",
  moderation: "pending",
});

const EMOTION_KEYWORDS = Object.freeze({
  funny: ["funny", "lol", "haha", "comedy", "joke", "meme"],
  hype: ["hype", "energy", "dance", "party", "win", "fire", "amazing"],
  shocking: ["shocking", "crazy", "wild", "unexpected", "wow"],
  emotional: ["love", "sad", "heart", "cry", "family", "story"],
});

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractJsonObject = (value = "") => {
  const text = String(value || "").trim();
  const direct = safeJsonParse(text);

  if (direct && typeof direct === "object") {
    return direct;
  }

  const match = text.match(/\{[\s\S]*\}/);
  return match ? safeJsonParse(match[0]) : null;
};

const hashtagsFromCaption = (caption = "") => {
  const matches = String(caption || "").match(/#[\p{L}\p{N}_-]+/gu) || [];
  return matches.map((tag) => tag.slice(1));
};

const detectEmotion = (caption = "") => {
  const text = String(caption || "").toLowerCase();
  const match = Object.entries(EMOTION_KEYWORDS).find(([, words]) => words.some((word) => text.includes(word)));
  return match?.[0] || "neutral";
};

const fallbackMetadata = ({ caption = "", tags = [] } = {}) => {
  const captionWords = String(caption || "")
    .split(/[\s,.;:!?()[\]{}"']+/)
    .map(normalizeTopic)
    .filter((word) => word && word.length > 2)
    .slice(0, 8);
  const hashtags = uniqueTopics([...hashtagsFromCaption(caption), ...tags]).slice(0, 8);

  return {
    ...DEFAULT_METADATA,
    topics: uniqueTopics([...tags, ...captionWords]).slice(0, 8),
    hashtags,
    emotion: detectEmotion(caption),
  };
};

const normalizeMetadata = (metadata = {}, fallback = DEFAULT_METADATA) => {
  const topics = uniqueTopics([...(Array.isArray(metadata.topics) ? metadata.topics : []), ...(fallback.topics || [])]).slice(0, 8);
  const hashtags = uniqueTopics([...(Array.isArray(metadata.hashtags) ? metadata.hashtags : []), ...(fallback.hashtags || [])]).slice(0, 8);

  return {
    topics,
    hashtags,
    emotion: normalizeTopic(metadata.emotion) || fallback.emotion || "neutral",
    language: String(metadata.language || fallback.language || "unknown").trim().slice(0, 12) || "unknown",
    category: normalizeTopic(metadata.category || fallback.category),
    moderation: String(metadata.moderation || fallback.moderation || "pending").trim().slice(0, 32),
  };
};

const analyzeWithGemini = async ({ caption = "", tags = [], type = "video", duration = 0 } = {}) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;

  if (!apiKey || typeof fetch !== "function") {
    return null;
  }

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "Analyze this VibeBook post for recommendation ranking.",
                    "Return only JSON with topics, emotion, language, hashtags, category, moderation.",
                    "Use short lowercase topics and hashtags without #.",
                    `Type: ${type}`,
                    `Duration seconds: ${duration || 0}`,
                    `Caption: ${caption || ""}`,
                    `Existing tags: ${tags.join(", ")}`,
                  ].join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || "";
    return extractJsonObject(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const analyzePostMetadata = async (input = {}) => {
  const fallback = fallbackMetadata(input);
  const geminiMetadata = await analyzeWithGemini(input);
  return normalizeMetadata(geminiMetadata || fallback, fallback);
};

module.exports = {
  analyzePostMetadata,
  fallbackMetadata,
  normalizeMetadata,
};
