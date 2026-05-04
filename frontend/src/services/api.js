// @ts-nocheck
import axios from "axios";

const API_ROOT = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:5000" : "");
const API = API_ROOT ? `${API_ROOT.replace(/\/+$/, "")}/api` : "";
const API_BASE_URL = API.replace(/\/api\/api$/i, "/api");
const API_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, "");

if (!API_BASE_URL) {
  throw new Error("VITE_API_URL is required");
}

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("vibebook_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const authApi = {
  login: (payload) => api.post("/auth/login", payload),
  register: (payload) => api.post("/auth/register", payload),
};

export const userApi = {
  search: async (params) => {
    const endpoint = "/users/search";
    const response = await api.get(endpoint, { params });
    console.log("[VibeBook API] GET", api.getUri({ url: endpoint, params }), response.data);
    return response;
  },
  getById: (id) => api.get(`/users/${id}`),
  getProfile: () => api.get("/users/profile"),
  updateProfile: async (payload) => {
    try {
      return await api.put("/users/profile", payload);
    } catch (error) {
      if (error.response?.status === 404) {
        return api.put("/users/update", payload);
      }

      throw error;
    }
  },
  uploadImages: (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    return api.post("/users/profile/images", formData);
  },
  uploadVideos: (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("videos", file));
    return api.post("/users/profile/videos", formData);
  },
  payAccess: (payload = {}) => api.post("/users/pay-access", { amount: 1000, currency: "RWF", ...payload }),
  unlockContact: (id, payload) => api.post(`/users/${id}/unlock-contact`, payload),
};

export const bookingApi = {
  create: (payload) => api.post("/bookings", payload),
  getMine: () => api.get("/bookings/me"),
  payAccess: (id, payload) => api.patch(`/bookings/${id}/pay`, payload),
  sendOffer: (payload) => api.post("/bookings/offers", payload),
};

export const messageApi = {
  getInbox: () => api.get("/messages/inbox"),
  getDrafts: () => api.get("/messages/drafts"),
  getById: (id) => api.get(`/messages/${id}`),
  markRead: (id) => api.patch(`/messages/${id}/read`),
  markUnread: (id) => api.patch(`/messages/${id}/unread`),
  reply: (id, payload) => api.post(`/messages/${id}/reply`, payload),
  saveDraft: (payload) => api.post("/messages/drafts", payload),
  updateDraft: (id, payload) => api.patch(`/messages/drafts/${id}`, payload),
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
