// @ts-nocheck
import axios from "axios";

const API_ROOT = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const API_BASE_URL = API_ROOT.endsWith("/api") ? API_ROOT : `${API_ROOT}/api`;
const API_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, "");
const APP_ROOT_URL = typeof window !== "undefined" ? window.location.origin : "";

if (!API_ROOT) {
  throw new Error("VITE_API_URL is required");
}

const API = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

const getStoredToken = () => localStorage.getItem("token") || localStorage.getItem("vibebook_token");

API.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const authApi = {
  login: (payload) => API.post("/auth/login", payload),
  register: (payload) => API.post("/auth/register", payload),
};

export const mediaId = (path = "") => {
  const value = String(path || "");

  try {
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return encodeURIComponent(value);
  }
};

export const uploadMedia = (formData, type, options = {}) => {
  const mediaType = type || formData.get?.("type") || "image";

  return API.post(`/upload/${mediaType === "video" ? "video" : "image"}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: options.onUploadProgress,
  });
};

export const uploadProfilePicture = (formData, options = {}) => {
  return API.post("/users/profile/image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: options.onUploadProgress,
  });
};

export const userApi = {
  search: async (params) => {
    const endpoint = "/search";
    const response = await API.get(endpoint, { params });
    return response;
  },
  getById: (id) => API.get(`/users/${id}`),
  getProfile: () => API.get("/profile"),
  updateProfile: async (payload) => {
    try {
      return await API.put("/profile", payload);
    } catch (error) {
      if (error.response?.status === 404) {
        return API.put("/users/profile", payload);
      }

      throw error;
    }
  },
  uploadMedia,
  uploadProfilePicture,
  deleteMedia: (path) => API.delete(`/media/${mediaId(path)}`),
  payAccess: (payload = {}) => API.post("/users/pay-access", { amount: 1000, currency: "RWF", ...payload }),
  follow: (id) => API.post(`/follow/${id}`),
  unfollow: (id) => API.post(`/unfollow/${id}`),
  likeProfile: (id) => API.post(`/users/${id}/like`),
  unlikeProfile: (id) => API.delete(`/users/${id}/like`),
  deleteMe: () => API.delete("/users/me"),
};

export const feedApi = {
  get: (params = {}) => API.get("/posts", { params }),
  toggleLike: (id) => API.post(`/posts/${id}/like`),
  addComment: (id, payload) => API.post(`/posts/${id}/comments`, payload),
  recordView: (id) => API.post(`/posts/${id}/view`),
  share: (id) => API.post(`/posts/${id}/share`),
  recommendations: (userId, params = {}) => API.get(`/recommendations/${userId}`, { params }),
};

export const exploreApi = {
  get: (params = {}) => API.get("/explore", { params }),
};

export const bookingApi = {
  create: (payload) => API.post("/book", payload),
  getMine: () => API.get("/bookings/me"),
  payAccess: (id, payload) => API.patch(`/bookings/${id}/pay`, payload),
  sendOffer: (payload) => API.post("/bookings/offers", payload),
  updateStatus: (id, payload) => API.patch(`/bookings/${id}/status`, payload),
};

export const paymentApi = {
  options: () => API.get("/payments/options"),
  create: (payload) => API.post("/payments/create", payload),
  verify: (payload) => API.post("/payments/verify", payload),
  tip: (profileId, amount = 1000, method = "MTN_MOMO") =>
    API.post("/payments/create", { purpose: "tip", profileId, amount, currency: "RWF", method }),
  boostPost: (postId, amount = 3000, method = "MTN_MOMO") =>
    API.post("/payments/create", { purpose: "post_boost", postId, amount, currency: "RWF", method }),
  premium: (amount = 5000, method = "MTN_MOMO") =>
    API.post("/payments/create", { purpose: "premium", amount, currency: "RWF", method }),
};

export const messageApi = {
  getInbox: () => API.get("/messages/inbox"),
  getUnreadCount: () => API.get("/messages/unread-count"),
  getDrafts: () => API.get("/messages/drafts"),
  getById: (id) => API.get(`/messages/id/${id}`),
  getConversation: (userId) => API.get(`/messages/${userId}`),
  sendDirect: (userId, payload) => API.post("/messages", { ...payload, recipientId: userId }),
  sendMessage: (payload) => API.post("/messages", payload),
  markRead: (id) => API.patch(`/messages/${id}/read`),
  markUnread: (id) => API.patch(`/messages/${id}/unread`),
  reply: (id, payload) => API.post(`/messages/${id}/reply`, payload),
  saveDraft: (payload) => API.post("/messages/drafts", payload),
  updateDraft: (id, payload) => API.patch(`/messages/drafts/${id}`, payload),
};

export const groupChatApi = {
  list: () => API.get("/chat/groups"),
  create: (payload) => API.post("/chat/group", payload),
  getMessages: (groupId) => API.get(`/chat/group/${groupId}/messages`),
  send: (groupId, payload) => API.post(`/chat/group/${groupId}/messages`, payload),
  join: (groupId) => API.post(`/chat/group/${groupId}/join`),
  leave: (groupId) => API.post(`/chat/group/${groupId}/leave`),
  members: (groupId) => API.get(`/chat/group/${groupId}/members`),
};

export const adminApi = {
  stats: () => API.get("/admin/dashboard"),
  users: () => API.get("/admin/users"),
  deleteUser: (id) => API.delete(`/admin/delete/${id}`),
  blockUser: (id) => API.patch(`/admin/block/${id}`),
  unblockUser: (id) => API.patch(`/admin/unblock/${id}`),
  verifyUser: (id) => API.patch(`/admin/verify/${id}`),
  featureProfile: (id, featured = true) => API.patch(`/admin/feature/${id}`, { featured }),
};

export const ratingApi = {
  add: (userId, payload) => API.post(`/ratings/${userId}`, payload),
  get: (userId) => API.get(`/ratings/${userId}`),
};

export const mediaUrl = (path) => {
  const value = String(path || "").trim();

  if (!value) {
    return `${APP_ROOT_URL}/logo.png`;
  }

  if (/^(https?:|blob:|data:)/.test(value)) {
    return value;
  }

  if (value.startsWith("/uploads")) {
    return `${API_ROOT_URL}${value}`;
  }

  if (value.startsWith("uploads/")) {
    return `${API_ROOT_URL}/${value}`;
  }

  if (value.startsWith("/")) {
    return `${APP_ROOT_URL}${value}`;
  }

  console.error("Media path is not an absolute URL:", value);
  return `${APP_ROOT_URL}/logo.png`;
};

export default API;
