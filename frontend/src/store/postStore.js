import { create } from "zustand";

const isCloudinaryPost = (post) => {
  const url = String(post?.url || "").trim();
  const mediaUrl = String(post?.mediaUrl || "").trim();

  return (
    !post?.Legacy &&
    !post?.legacy &&
    url.startsWith("https://res.cloudinary.com/") &&
    !url.includes("/uploads/") &&
    !mediaUrl.includes("/uploads/")
  );
};

const newestFirst = (items) =>
  [...items].sort((left, right) => {
    const scoreDelta = Number(right.score || 0) - Number(left.score || 0);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
  });

const mergeUniquePosts = (currentPosts, nextPosts) => {
  const byId = new Map();

  [...currentPosts, ...nextPosts].forEach((post) => {
    if (post?._id) {
      byId.set(post._id, { ...(byId.get(post._id) || {}), ...post });
    }
  });

  return newestFirst(Array.from(byId.values()).filter(isCloudinaryPost));
};

export const usePostStore = create((set) => ({
  posts: [],
  setPosts: (posts) => set({ posts: newestFirst((Array.isArray(posts) ? posts : []).filter(isCloudinaryPost)) }),
  mergePosts: (posts) =>
    set((state) => ({
      posts: mergeUniquePosts(state.posts, Array.isArray(posts) ? posts : []),
    })),
  prependPost: (post) =>
    set((state) => ({
      posts: isCloudinaryPost(post) ? mergeUniquePosts([post], state.posts) : state.posts,
    })),
  replacePost: (post) =>
    set((state) => ({
      posts: state.posts
        .map((item) => (item._id === post?._id ? { ...item, ...post } : item))
        .filter(isCloudinaryPost),
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

export { isCloudinaryPost };
