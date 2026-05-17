import { create } from "zustand";

const isCloudinaryUrl = (value) => /^https:\/\/res\.cloudinary\.com\//i.test(String(value || "").trim());
const isRenderableMediaUrl = (value) => {
  const url = String(value || "").trim();

  return Boolean(url && (/^https?:/i.test(url) || url.startsWith("/uploads") || url.startsWith("uploads/") || url.startsWith("/")));
};
const stablePostUrl = (post = {}) => String(post?.url || post?.mediaUrl || post?.videoUrl || post?.imageUrl || "").trim();
const normalizePost = (post = {}) => {
  const url = stablePostUrl(post);
  return url ? { ...post, url, mediaUrl: post.mediaUrl || url } : post;
};
const isValidPost = (post) => isRenderableMediaUrl(stablePostUrl(post));
const timestampFor = (value) => {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};
const isVideoPost = (post = {}) => post?.type === "video" || String(stablePostUrl(post)).includes("/video/upload/");
const freshnessScoreFor = (post = {}) => {
  const createdAt = timestampFor(post.createdAt);
  const cappedEngagementBoost = Math.min(Math.max(Number(post.score || 0), 0), 180) * 1000;
  const videoBoost = isVideoPost(post) ? 45 * 1000 : 0;

  return createdAt + cappedEngagementBoost + videoBoost;
};

const newestFirst = (items) =>
  [...items].sort((left, right) => {
    const freshnessDelta = freshnessScoreFor(right) - freshnessScoreFor(left);

    if (freshnessDelta !== 0) {
      return freshnessDelta;
    }

    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });

const countFor = (post = {}, fields = []) => {
  const value = fields.map((field) => post?.[field]).find((item) => item !== undefined && item !== null);
  const count = Number(value || 0);
  return Number.isFinite(count) ? count : 0;
};

const mergePost = (current = {}, incoming = {}, options = {}) => {
  const next = { ...current, ...normalizePost(incoming) };

  if (options.preserveLikeState && typeof current.likedByViewer === "boolean") {
    const likes = countFor(current, ["likes", "likeCount"]);
    next.likedByViewer = current.likedByViewer;
    next.likes = likes;
    next.likeCount = likes;
  }

  if (options.preserveSaveState && typeof current.savedByViewer === "boolean") {
    const saves = countFor(current, ["saveCount", "saves"]);
    next.savedByViewer = current.savedByViewer;
    next.saves = saves;
    next.saveCount = saves;
  }

  return next;
};

const mergeUniquePosts = (currentPosts, nextPosts) => {
  const byId = new Map();

  [...currentPosts, ...nextPosts].map(normalizePost).forEach((post) => {
    if (post?._id) {
      byId.set(post._id, { ...(byId.get(post._id) || {}), ...post, url: stablePostUrl(post) });
    }
  });

  return newestFirst(Array.from(byId.values()).filter(isValidPost));
};

export const usePostStore = create((set) => ({
  posts: [],
  setPosts: (posts) => set({ posts: newestFirst((Array.isArray(posts) ? posts : []).map(normalizePost).filter(isValidPost)) }),
  mergePosts: (posts) =>
    set((state) => ({
      posts: mergeUniquePosts(state.posts, Array.isArray(posts) ? posts : []),
    })),
  prependPost: (post) =>
    set((state) => ({
      posts: isValidPost(post) ? mergeUniquePosts([post], state.posts) : state.posts,
    })),
  replacePost: (post, options = {}) =>
    set((state) => ({
      posts: state.posts
        .map((item) => (item._id === post?._id ? mergePost(item, post, options) : item))
        .filter(isValidPost),
    })),
  applyPostLike: (postId, liked, nextCount) =>
    set((state) => ({
      posts: state.posts.map((post) => {
        if (post._id !== postId) {
          return post;
        }

        const currentCount = countFor(post, ["likes", "likeCount"]);
        const likes = Math.max(0, Number.isFinite(Number(nextCount)) ? Number(nextCount) : currentCount + (liked ? 1 : -1));

        return {
          ...post,
          likedByViewer: Boolean(liked),
          likes,
          likeCount: likes,
        };
      }),
    })),
  removePost: (postId) =>
    set((state) => ({
      posts: state.posts.filter((post) => post._id !== postId),
    })),
  updatePostsByUser: (userId, updater) =>
    set((state) => ({
      posts: state.posts.map((post) =>
        post.userId?._id === userId ? { ...post, userId: updater(post.userId || {}) } : post
      ),
    })),
}));

export { isCloudinaryUrl, isRenderableMediaUrl, isValidPost, normalizePost, stablePostUrl };
