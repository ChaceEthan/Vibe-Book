// @ts-nocheck
import axios from "axios";

import { APP_ROOT_URL } from "../config/env";

const DEFAULT_API_ROOT = "https://vibe-book-fri1.onrender.com";
const rawApiRoot = import.meta.env.VITE_API_URL || DEFAULT_API_ROOT;

const normalizeApiRoot = (value) => {
  let next = String(value || DEFAULT_API_ROOT).trim().replace(/\s+/g, "");

  if (!next) {
    next = DEFAULT_API_ROOT;
  }

  next = next.replace(/^(https?:\/\/)(https?:\/\/)/i, "$2");

  if (next.startsWith("/") && typeof window !== "undefined") {
    next = `${window.location.origin}${next}`;
  }

  if (!/^https?:\/\//i.test(next)) {
    next = `https://${next.replace(/^\/+/, "")}`;
  }

  return next.replace(/\/+$/, "");
};

const API_ROOT = normalizeApiRoot(rawApiRoot);
const API_BASE_URL = `${API_ROOT.replace(/(?:\/api)+\/?$/i, "")}/api`;
const API_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, "");
const DEFAULT_FRONTEND_URL = "https://vibe-book-kappa.vercel.app";

export const FRONTEND_BASE_URL = DEFAULT_FRONTEND_URL;
export const referralUrlFor = (referralCode = "") => `${FRONTEND_BASE_URL}/register?ref=${encodeURIComponent(String(referralCode || "").trim())}`;

const API = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 25000,
});
const UPLOAD_TIMEOUT_MS = 180000;
const WALLET_REQUEST_TIMEOUT_MS = 15000;
const MARKETPLACE_REQUEST_TIMEOUT_MS = 20000;

export const getApiErrorMessage = (error, fallback = "Request failed. Please try again.") => {
  const data = error?.response?.data;
  const serverMessage =
    (typeof data?.message === "string" && data.message.trim()) ||
    (typeof data?.error === "string" && data.error.trim()) ||
    (typeof data === "string" && data.trim()) ||
    "";
  const status = error?.response?.status;

  if (serverMessage) {
    return serverMessage;
  }

  if (status === 401) {
    return "Please log in again.";
  }

  if (status === 403) {
    return "You do not have permission to complete this request.";
  }

  if (status === 404) {
    return "That resource was not found.";
  }

  if (status >= 500) {
    return "Server is temporarily unavailable. Please try again.";
  }

  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    return "Request timed out. Please check your connection and retry.";
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Reconnect and try again.";
  }

  if (error?.message === "Network Error" || !error?.response) {
    return "Network error: the API is unreachable or this origin is not allowed yet. Please retry.";
  }

  return error?.message || fallback;
};

export const isRetryableApiError = (error) => {
  if (!error?.response) {
    return true;
  }

  return [408, 429, 500, 502, 503, 504].includes(Number(error.response.status));
};

const getStoredToken = () => localStorage.getItem("token") || localStorage.getItem("vibebook_token");

API.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    error.userMessage = getApiErrorMessage(error);

    if (!error.response) {
      console.warn("[api] network request failed", {
        baseURL: API_BASE_URL,
        code: error.code || "NETWORK_ERROR",
        message: error.message,
      });
    } else if (error.response.status >= 500) {
      console.warn("[api] server request failed", {
        status: error.response.status,
        url: error.config?.url,
      });
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  login: (payload) => API.post("/auth/login", payload),
  register: (payload) => API.post("/auth/register", payload),
  checkAvailability: (params = {}, options = {}) => API.get("/auth/check", { params, signal: options.signal }),
  sendEmailCode: (payload = {}) => API.post("/auth/send-email-code", payload),
  verifyEmailCode: (payload = {}) => API.post("/auth/verify-email-code", payload),
  sendPhoneCode: (payload = {}) => API.post("/auth/send-phone-code", payload),
  verifyPhoneCode: (payload = {}) => API.post("/auth/verify-phone-code", payload),
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
    onUploadProgress: options.onUploadProgress,
    signal: options.signal,
    timeout: options.timeout || UPLOAD_TIMEOUT_MS,
  });
};

export const uploadProfilePicture = (formData, options = {}) => {
  return API.post("/users/profile/image", formData, {
    onUploadProgress: options.onUploadProgress,
    signal: options.signal,
    timeout: options.timeout || UPLOAD_TIMEOUT_MS,
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
  followBack: (id) => API.post(`/follow-back/${id}`),
  unfollow: (id) => API.post(`/unfollow/${id}`),
  likeProfile: (id) => API.post(`/users/${id}/like`),
  unlikeProfile: (id) => API.delete(`/users/${id}/like`),
  deleteMe: () => API.delete("/users/me"),
};

export const feedApi = {
  get: (params = {}) => API.get("/posts", { params }),
  toggleLike: (id) => API.post(`/posts/${id}/like`),
  addComment: (id, payload) => API.post(`/posts/${id}/comments`, payload),
  recordView: (id, payload = {}) => API.post(`/posts/${id}/view`, payload),
  share: (id) => API.post(`/posts/${id}/share`),
  save: (id) => API.post(`/posts/${id}/save`),
  feedback: (id, payload) => API.post(`/posts/${id}/feedback`, payload),
  edit: (id, payload) => API.patch(`/posts/${id}/edit`, payload),
  recommendations: (userId, params = {}) => API.get(`/recommendations/${userId}`, { params }),
};

export const creatorApi = {
  dashboard: () => API.get("/creator/dashboard"),
};

export const walletApi = {
  get: () => API.get("/wallet", { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  identity: () => API.get("/wallet/identity", { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  receive: () => API.get("/wallet/receive", { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  settings: () => API.get("/wallet/settings", { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  updateSettings: (payload = {}) => API.patch("/wallet/settings", payload, { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  history: (params = {}) => API.get("/wallet/history", { params, timeout: WALLET_REQUEST_TIMEOUT_MS }),
  claimDaily: () => API.post("/wallet/reward/daily", {}, {
    timeout: WALLET_REQUEST_TIMEOUT_MS,
    "axios-retry": { retries: 0 },
    retry: false,
  }),
  redeem: (payload = {}) => API.post("/wallet/reward/redeem", payload, { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  referral: (payload = {}) => API.post("/wallet/reward/referral", payload, { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  spend: (payload = {}) => API.post("/wallet/spend", payload, { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  generateQr: (payload = {}) => API.post("/wallet/qr/generate", payload, { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  scanQr: (payload = {}) => API.post("/wallet/qr/scan", payload, { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  transfer: (payload = {}) => API.post("/wallet/transfer", payload, { timeout: WALLET_REQUEST_TIMEOUT_MS }),
  topEarners: (params = {}) => API.get("/wallet/leaderboard/earners", { params, timeout: WALLET_REQUEST_TIMEOUT_MS }),
  topSpenders: (params = {}) => API.get("/wallet/leaderboard/spenders", { params, timeout: WALLET_REQUEST_TIMEOUT_MS }),
};

export const marketplaceApi = {
  items: (params = {}) => API.get("/marketplace/items", { params, timeout: MARKETPLACE_REQUEST_TIMEOUT_MS }),
  inventory: () => API.get("/marketplace/inventory", { timeout: MARKETPLACE_REQUEST_TIMEOUT_MS }),
  purchase: (itemId, payload = {}) => API.post(`/marketplace/purchase/${itemId}`, payload, { timeout: MARKETPLACE_REQUEST_TIMEOUT_MS }),
  equip: (itemId, action = "equip") => API.post(`/marketplace/inventory/${itemId}/${action === "unequip" ? "unequip" : "equip"}`, { action }, { timeout: MARKETPLACE_REQUEST_TIMEOUT_MS }),
  adminOverview: () => API.get("/marketplace/admin/overview"),
  adminSaveItem: (payload = {}) => API.post("/marketplace/admin/items", payload),
  adminFeaturedStatus: (id, payload = {}) => API.patch(`/marketplace/admin/featured/${id}`, payload),
};

export const notificationApi = {
  list: (params = {}) => API.get("/notifications", { params }),
  unreadCount: () => API.get("/notifications/unread-count"),
  markRead: (id) => API.patch(`/notifications/${id}/read`),
  markAllRead: () => API.patch("/notifications/read/all"),
  delete: (id) => API.delete(`/notifications/${id}`),
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
  list: () => API.get("/groups"),
  create: (payload) => API.post("/groups/create", payload),
  getMessages: (groupId) => API.get(`/groups/${groupId}`),
  send: (groupId, payload) => API.post("/groups/message", { ...payload, groupId }),
  join: (groupId) => API.post(`/groups/join/${groupId}`),
  joinById: (groupId) => API.post(`/groups/${groupId}/join`),
  invite: (groupId, payload = {}) => API.post(`/groups/${groupId}/invite`, payload),
  addMember: (groupId, payload = {}) => API.post(`/groups/${groupId}/add-member`, payload),
  leave: (groupId) => API.post(`/groups/leave/${groupId}`),
  members: (groupId) => API.get(`/groups/${groupId}/members`),
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
