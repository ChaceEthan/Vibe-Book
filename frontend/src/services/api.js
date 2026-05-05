// @ts-nocheck
import axios from "axios";

const API_ROOT = import.meta.env.DEV ? "http://localhost:5000" : import.meta.env.VITE_API_URL || "";
const API = API_ROOT ? `${API_ROOT.replace(/\/+$/, "")}/api` : "";
const API_BASE_URL = API.replace(/\/api\/api$/i, "/api");
const API_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, "");

if (!API_BASE_URL) {
  throw new Error("VITE_API_URL is required");
}

const api = axios.create({
  baseURL: API_BASE_URL,
});

const getStoredToken = () => localStorage.getItem("token") || localStorage.getItem("vibebook_token");

api.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const authApi = {
  login: (payload) => api.post("/auth/login", payload),
  register: (payload) => api.post("/auth/register", payload),
};

export const uploadMedia = (formData, type) => {
  const mediaType = type || formData.get?.("type") || "image";

  return api.post(`/upload/${mediaType === "video" ? "video" : "image"}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const userApi = {
  search: async (params) => {
    const endpoint = "/search";
    const response = await api.get(endpoint, { params });
    return response;
  },
  getById: (id) => api.get(`/users/${id}`),
  getProfile: () => api.get("/profile"),
  updateProfile: async (payload) => {
    try {
      return await api.put("/profile", payload);
    } catch (error) {
      if (error.response?.status === 404) {
        return api.put("/users/profile", payload);
      }

      throw error;
    }
  },
  uploadMedia,
  payAccess: (payload = {}) => api.post("/users/pay-access", { amount: 1000, currency: "RWF", ...payload }),
  follow: (id) => api.post(`/follow/${id}`),
  unfollow: (id) => api.post(`/unfollow/${id}`),
  likeProfile: (id) => api.post(`/users/${id}/like`),
  unlikeProfile: (id) => api.delete(`/users/${id}/like`),
  deleteMe: () => api.delete("/users/me"),
};

export const feedApi = {
  get: (params = {}) => api.get("/feed", { params }),
  toggleLike: (id) => api.post(`/feed/${id}/like`),
  addComment: (id, payload) => api.post(`/feed/${id}/comments`, payload),
};

export const bookingApi = {
  create: (payload) => api.post("/book", payload),
  getMine: () => api.get("/bookings/me"),
  payAccess: (id, payload) => api.patch(`/bookings/${id}/pay`, payload),
  sendOffer: (payload) => api.post("/bookings/offers", payload),
  updateStatus: (id, payload) => api.patch(`/bookings/${id}/status`, payload),
};

export const paymentApi = {
  options: () => api.get("/payments/options"),
  create: (payload) => api.post("/payments/create", payload),
  verify: (payload) => api.post("/payments/verify", payload),
};

export const messageApi = {
  getInbox: () => api.get("/messages/inbox"),
  getUnreadCount: () => api.get("/messages/unread-count"),
  getDrafts: () => api.get("/messages/drafts"),
  getById: (id) => api.get(`/messages/${id}`),
  getConversation: (userId) => api.get(`/chat/${userId}`),
  sendDirect: (userId, payload) => api.post(`/chat/${userId}`, payload),
  sendMessage: (payload) => api.post("/messages", payload),
  markRead: (id) => api.patch(`/messages/${id}/read`),
  markUnread: (id) => api.patch(`/messages/${id}/unread`),
  reply: (id, payload) => api.post(`/messages/${id}/reply`, payload),
  saveDraft: (payload) => api.post("/messages/drafts", payload),
  updateDraft: (id, payload) => api.patch(`/messages/drafts/${id}`, payload),
};

export const groupChatApi = {
  list: () => api.get("/chat/groups"),
  create: (payload) => api.post("/chat/group", payload),
  getMessages: (groupId) => api.get(`/chat/group/${groupId}/messages`),
  send: (groupId, payload) => api.post(`/chat/group/${groupId}/messages`, payload),
};

export const adminApi = {
  stats: () => api.get("/admin/dashboard"),
  users: () => api.get("/admin/users"),
  deleteUser: (id) => api.delete(`/admin/delete/${id}`),
  blockUser: (id) => api.patch(`/admin/block/${id}`),
  unblockUser: (id) => api.patch(`/admin/unblock/${id}`),
  featureProfile: (id, featured = true) => api.patch(`/admin/feature/${id}`, { featured }),
};

export const ratingApi = {
  add: (userId, payload) => api.post(`/ratings/${userId}`, payload),
  get: (userId) => api.get(`/ratings/${userId}`),
};

export const mediaUrl = (path) => {
  if (!path) {
    return "/logo.png";
  }

  if (/^(https?:|blob:|data:)/.test(path)) {
    return path;
  }

  if (path.startsWith("/uploads")) {
    return `${API_ROOT_URL}${path}`;
  }

  return path;
};

export default api;
