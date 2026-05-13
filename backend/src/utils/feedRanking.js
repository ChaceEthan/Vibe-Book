const VIRAL_WEIGHTS = Object.freeze({
  views: 1,
  likes: 3,
  comments: 4,
  shares: 6,
  saves: 5,
  watchTime: 0.08,
  completionRate: 50,
  replays: 8,
  skips: -4,
  reports: -20,
  notInterested: -8,
});

const EMOTION_BOOSTS = Object.freeze({
  funny: 18,
  hype: 18,
  shocking: 16,
  emotional: 14,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundScore = (value) => Number((Number(value || 0)).toFixed(2));

const idOf = (value) => value?._id?.toString?.() || value?.toString?.() || "";

const normalizeTopic = (value) => {
  const topic = String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return topic && topic.length <= 48 ? topic : "";
};

const uniqueTopics = (items = []) => Array.from(new Set(items.map(normalizeTopic).filter(Boolean)));

const countArray = (value) => (Array.isArray(value) ? value.length : 0);

const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const likedCountFor = (post) => {
  const likedByCount = countArray(post?.likedBy);
  return likedByCount || safeNumber(post?.likes);
};

const commentCountFor = (post) => countArray(post?.comments);

const saveCountFor = (post) => {
  const savedByCount = countArray(post?.savedBy);
  return savedByCount || safeNumber(post?.saves || post?.saveCount);
};

const completionRateFor = (post) => {
  const explicitRate = safeNumber(post?.completionRate, -1);

  if (explicitRate > 0) {
    return clamp(explicitRate > 1 ? explicitRate / 100 : explicitRate, 0, 1);
  }

  const views = safeNumber(post?.views);
  const duration = safeNumber(post?.duration);
  const watchTime = safeNumber(post?.watchTime);

  if (!views || !duration) {
    return 0;
  }

  return clamp(watchTime / views / duration, 0, 1);
};

const engagementCountsFor = (post) => ({
  views: safeNumber(post?.views),
  likes: likedCountFor(post),
  comments: commentCountFor(post),
  shares: safeNumber(post?.shareCount || post?.shares),
  saves: saveCountFor(post),
  watchTime: safeNumber(post?.watchTime),
  completionRate: completionRateFor(post),
  replays: safeNumber(post?.replays || post?.replayCount),
  skips: safeNumber(post?.skips || post?.skipCount),
  reports: safeNumber(post?.reports || post?.reportCount),
  notInterested: safeNumber(post?.notInterestedCount),
});

const topicsFromCaption = (caption = "") => {
  const matches = String(caption || "").match(/#[\p{L}\p{N}_-]+/gu) || [];
  return matches.map((tag) => tag.slice(1));
};

const topicSignalsForPost = (post) => {
  const creator = post?.userId || {};
  const metadata = post?.aiMetadata || {};

  return uniqueTopics([
    ...(Array.isArray(post?.tags) ? post.tags : []),
    ...(Array.isArray(metadata.topics) ? metadata.topics : []),
    ...(Array.isArray(metadata.hashtags) ? metadata.hashtags : []),
    ...(Array.isArray(creator.skills) ? creator.skills : []),
    creator.category,
    creator.role,
    metadata.category,
    ...topicsFromCaption(post?.caption),
  ]);
};

const interestEntriesFor = (viewer) => {
  const interests = viewer?.interests;
  const entries = [];

  if (interests instanceof Map) {
    interests.forEach((score, topic) => entries.push([topic, score]));
  } else if (interests && typeof interests === "object") {
    Object.entries(interests).forEach(([topic, score]) => entries.push([topic, score]));
  }

  if (Array.isArray(viewer?.likedTopics)) {
    viewer.likedTopics.forEach((topic) => entries.push([topic, 25]));
  }

  return entries
    .map(([topic, score]) => [normalizeTopic(topic), safeNumber(score)])
    .filter(([topic, score]) => topic && score > 0);
};

const interestMatchScoreFor = (post, viewer) => {
  const postTopics = topicSignalsForPost(post);

  if (!postTopics.length || !viewer) {
    return 0;
  }

  const interestMap = new Map(interestEntriesFor(viewer));

  if (!interestMap.size) {
    return 0;
  }

  const topicScore = postTopics.reduce((score, topic) => {
    return score + clamp(safeNumber(interestMap.get(topic)), 0, 100);
  }, 0);
  const creatorId = idOf(post?.userId);
  const favoriteCreatorBoost = Array.isArray(viewer.favoriteCreators) && viewer.favoriteCreators.some((id) => idOf(id) === creatorId) ? 30 : 0;

  return clamp(topicScore / Math.max(1, postTopics.length), 0, 80) + favoriteCreatorBoost;
};

const freshnessBoostFor = (createdAt, now = Date.now()) => {
  const created = new Date(createdAt || 0).getTime();

  if (!created) {
    return 0;
  }

  const ageHours = Math.max(0, (now - created) / 36e5);
  return roundScore(Math.max(0, 90 - ageHours * 2.2));
};

const newestFirstBoostFor = (post, now = Date.now()) => {
  const created = new Date(post?.createdAt || 0).getTime();

  if (!created) {
    return 0;
  }

  const ageHours = Math.max(0, (now - created) / 36e5);
  const isVideo = post?.type === "video" || String(post?.mediaUrl || "").includes("/video/upload/");
  const windowHours = isVideo ? 12 : 4;

  if (ageHours > windowHours) {
    return 0;
  }

  return roundScore((windowHours - ageHours) * (isVideo ? 24 : 8));
};

const velocityScoreFor = (post, now = Date.now()) => {
  const created = new Date(post?.createdAt || 0).getTime();

  if (!created) {
    return 0;
  }

  const ageMinutes = Math.max(1, (now - created) / 6e4);
  const counts = engagementCountsFor(post);
  const engagement =
    counts.likes +
    counts.comments * 1.5 +
    counts.shares * 3 +
    counts.saves * 2.5 +
    counts.replays * 3;
  const velocity = engagement / ageMinutes;
  const earlyMultiplier = ageMinutes <= 10 ? 5 : ageMinutes <= 30 ? 3 : ageMinutes <= 60 ? 2 : 1;

  return roundScore(clamp(velocity * earlyMultiplier * 10, 0, 120));
};

const smallCreatorBoostFor = (post) => {
  const followerCount = countArray(post?.userId?.followers);
  return followerCount < 1000 ? 25 : 0;
};

const emotionBoostFor = (post) => {
  const emotion = normalizeTopic(post?.emotion || post?.aiMetadata?.emotion);
  return EMOTION_BOOSTS[emotion] || 0;
};

const activeBoostScoreFor = (post) => {
  const boostActive = post?.boostedUntil && new Date(post.boostedUntil).getTime() > Date.now();
  const rawBoost = boostActive ? safeNumber(post?.boostScore) : 0;
  return rawBoost ? Math.max(75, roundScore(rawBoost * 1.35)) : 0;
};

const premiumBoostFor = (post) => (post?.userId?.isPremium || post?.userId?.premiumBadge ? 15 : 0);

const recentHistoryFor = (viewer) => {
  if (!Array.isArray(viewer?.watchHistory)) {
    return [];
  }

  return viewer.watchHistory.slice(-120);
};

const repeatPenaltyFor = (post, viewer) => {
  const history = recentHistoryFor(viewer);

  if (!history.length) {
    return 0;
  }

  const postId = idOf(post?._id);
  const creatorId = idOf(post?.userId);
  const postSeen = postId && history.some((entry) => idOf(entry?.postId) === postId);

  if (postSeen) {
    return 140;
  }

  if (!creatorId) {
    return 0;
  }

  const recentCreatorViews = history.filter((entry) => idOf(entry?.creatorId) === creatorId).length;
  return clamp(recentCreatorViews * 8, 0, 48);
};

const viralScoreFor = (post) => {
  const counts = engagementCountsFor(post);
  const score =
    counts.views * VIRAL_WEIGHTS.views +
    counts.likes * VIRAL_WEIGHTS.likes +
    counts.comments * VIRAL_WEIGHTS.comments +
    counts.shares * VIRAL_WEIGHTS.shares +
    counts.saves * VIRAL_WEIGHTS.saves +
    counts.watchTime * VIRAL_WEIGHTS.watchTime +
    counts.completionRate * VIRAL_WEIGHTS.completionRate +
    counts.replays * VIRAL_WEIGHTS.replays +
    counts.skips * VIRAL_WEIGHTS.skips +
    counts.reports * VIRAL_WEIGHTS.reports +
    counts.notInterested * VIRAL_WEIGHTS.notInterested;

  return roundScore(Math.max(0, score));
};

const engagementScoreFor = (post) => {
  const counts = engagementCountsFor(post);
  return roundScore(
    counts.views +
      counts.likes * 3 +
      counts.comments * 4 +
      counts.shares * 6 +
      counts.saves * 5 +
      counts.watchTime * 0.08 +
      counts.replays * 8
  );
};

const distributionStageFor = (post, viralScore = viralScoreFor(post)) => {
  const views = safeNumber(post?.views);

  if (views < 200) {
    return "test";
  }

  if (views < 1000 || viralScore < 400) {
    return "expansion_1k";
  }

  if (views < 10000 || viralScore < 1500) {
    return "expansion_10k";
  }

  return "viral";
};

const distributionBoostFor = (post, viralScore = viralScoreFor(post)) => {
  const stage = distributionStageFor(post, viralScore);
  const completion = completionRateFor(post);

  if (stage === "test") {
    return completion >= 0.7 || viralScore >= 80 ? 30 : 12;
  }

  if (stage === "expansion_1k") {
    return completion >= 0.6 || viralScore >= 300 ? 24 : 8;
  }

  if (stage === "expansion_10k") {
    return completion >= 0.55 || viralScore >= 1000 ? 18 : 0;
  }

  return 0;
};

const buildTrendMap = (items = [], now = Date.now()) => {
  const trendMap = new Map();

  items.forEach((post) => {
    const created = new Date(post?.createdAt || 0).getTime();
    const ageHours = created ? Math.max(0, (now - created) / 36e5) : 999;
    const recencyMultiplier = ageHours <= 6 ? 3 : ageHours <= 24 ? 1.5 : 0.35;
    const counts = engagementCountsFor(post);
    const signal = 1 + counts.shares * 2 + counts.saves + counts.comments * 0.5 + counts.replays;

    topicSignalsForPost(post).forEach((topic) => {
      trendMap.set(topic, safeNumber(trendMap.get(topic)) + signal * recencyMultiplier);
    });
  });

  return trendMap;
};

const trendScoreFor = (post, trendMap) => {
  if (!trendMap?.size) {
    return 0;
  }

  return roundScore(
    clamp(
      topicSignalsForPost(post).reduce((score, topic) => score + safeNumber(trendMap.get(topic)), 0),
      0,
      100
    )
  );
};

const rankingFieldsForPost = (post, options = {}) => {
  const viralScore = viralScoreFor(post);
  const trendScore = trendScoreFor(post, options.trendMap);
  const engagementVelocity = velocityScoreFor(post, options.now);

  return {
    engagementScore: engagementScoreFor(post),
    engagementVelocity,
    viralScore,
    trendScore,
    distributionStage: distributionStageFor(post, viralScore),
  };
};

const scorePostForViewer = (post, viewer = null, options = {}) => {
  const viralScore = safeNumber(post?.viralScore) || viralScoreFor(post);
  const trendScore = options.trendMap ? trendScoreFor(post, options.trendMap) : safeNumber(post?.trendScore) || trendScoreFor(post, options.trendMap);
  const interestMatchScore = interestMatchScoreFor(post, viewer);
  const freshnessBoost = freshnessBoostFor(post?.createdAt, options.now);
  const newestFirstBoost = newestFirstBoostFor(post, options.now);
  const velocityScore = safeNumber(post?.engagementVelocity) || velocityScoreFor(post, options.now);
  const creatorBoost = smallCreatorBoostFor(post);
  const emotionBoost = emotionBoostFor(post);
  const boostScore = activeBoostScoreFor(post);
  const premiumBoost = premiumBoostFor(post);
  const distributionBoost = distributionBoostFor(post, viralScore);
  const repeatPenalty = repeatPenaltyFor(post, viewer);
  const finalScore =
    viralScore +
    interestMatchScore +
    freshnessBoost +
    newestFirstBoost +
    velocityScore +
    creatorBoost +
    trendScore +
    emotionBoost +
    boostScore +
    premiumBoost +
    distributionBoost -
    repeatPenalty;

  return {
    finalScore: roundScore(finalScore),
    viralScore: roundScore(viralScore),
    interestMatchScore: roundScore(interestMatchScore),
    freshnessBoost,
    newestFirstBoost,
    velocityScore,
    creatorBoost,
    trendScore: roundScore(trendScore),
    emotionBoost,
    boostScore: roundScore(boostScore),
    premiumBoost,
    distributionBoost,
    repeatPenalty,
    distributionStage: distributionStageFor(post, viralScore),
  };
};

const rankFeedItems = (items = [], viewer = null, options = {}) => {
  const now = options.now || Date.now();
  const trendMap = options.trendMap || buildTrendMap(items, now);
  const scored = items
    .map((post) => {
      const ranking = scorePostForViewer(post, viewer, { ...options, now, trendMap });
      return {
        post,
        ranking,
        sortScore: ranking.finalScore,
      };
    })
    .sort((left, right) => {
      if (options.newestFirst) {
        const leftCreated = new Date(left.post?.createdAt || 0).getTime();
        const rightCreated = new Date(right.post?.createdAt || 0).getTime();
        const leftRecent = now - leftCreated <= 12 * 60 * 60 * 1000;
        const rightRecent = now - rightCreated <= 12 * 60 * 60 * 1000;

        if (leftRecent || rightRecent) {
          return rightCreated - leftCreated;
        }
      }

      const scoreDelta = right.sortScore - left.sortScore;
      return scoreDelta || new Date(right.post?.createdAt || 0) - new Date(left.post?.createdAt || 0);
    });

  const creatorCounts = new Map();

  return scored
    .map((entry) => {
      const creatorId = idOf(entry.post?.userId);
      const seenCount = safeNumber(creatorCounts.get(creatorId));
      creatorCounts.set(creatorId, seenCount + 1);
      return {
        ...entry,
        sortScore: roundScore(entry.sortScore - seenCount * 22),
      };
    })
    .sort((left, right) => {
      if (options.newestFirst) {
        const leftCreated = new Date(left.post?.createdAt || 0).getTime();
        const rightCreated = new Date(right.post?.createdAt || 0).getTime();
        const leftRecent = now - leftCreated <= 12 * 60 * 60 * 1000;
        const rightRecent = now - rightCreated <= 12 * 60 * 60 * 1000;

        if (leftRecent || rightRecent) {
          return rightCreated - leftCreated;
        }
      }

      const scoreDelta = right.sortScore - left.sortScore;
      return scoreDelta || new Date(right.post?.createdAt || 0) - new Date(left.post?.createdAt || 0);
    });
};

module.exports = {
  buildTrendMap,
  completionRateFor,
  distributionStageFor,
  engagementCountsFor,
  engagementScoreFor,
  idOf,
  normalizeTopic,
  rankingFieldsForPost,
  rankFeedItems,
  roundScore,
  scorePostForViewer,
  topicSignalsForPost,
  uniqueTopics,
  viralScoreFor,
};
