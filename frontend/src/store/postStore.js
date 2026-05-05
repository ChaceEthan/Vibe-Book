import { create } from "zustand";

const newestFirst = (items) =>
  [...items].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

const mergeUniquePosts = (currentPosts, nextPosts) => {
  const byId = new Map();

  [...currentPosts, ...nextPosts].forEach((post) => {
    if (post?._id) {
      byId.set(post._id, { ...(byId.get(post._id) || {}), ...post });
    }
  });

  return newestFirst(Array.from(byId.values()));
};

export const usePostStore = create((set) => ({
  posts: [],
  setPosts: (posts) => set({ posts: newestFirst(Array.isArray(posts) ? posts : []) }),
  mergePosts: (posts) =>
    set((state) => ({
      posts: mergeUniquePosts(state.posts, Array.isArray(posts) ? posts : []),
    })),
  prependPost: (post) =>
    set((state) => ({
      posts: mergeUniquePosts([post], state.posts),
    })),
  replacePost: (post) =>
    set((state) => ({
      posts: state.posts.map((item) => (item._id === post?._id ? { ...item, ...post } : item)),
    })),
  updatePostsByUser: (userId, updater) =>
    set((state) => ({
      posts: state.posts.map((post) =>
        post.userId?._id === userId ? { ...post, userId: updater(post.userId || {}) } : post
      ),
    })),
}));
