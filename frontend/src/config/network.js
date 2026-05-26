// @ts-nocheck
const DEFAULT_BACKEND_URL = "https://vibe-book-api.onrender.com";
const DEFAULT_FRONTEND_URL = "https://vibe-book-kappa.vercel.app";

const trimSlashes = (value = "") => String(value || "").trim().replace(/\s+/g, "").replace(/\/+$/, "");

export const normalizeUrlRoot = (value = "", fallback = DEFAULT_BACKEND_URL) => {
  let next = trimSlashes(value || fallback);

  if (!next) {
    next = fallback;
  }

  next = next.replace(/^(https?:\/\/)(https?:\/\/)/i, "$2");

  if (next.startsWith("/") && typeof window !== "undefined") {
    next = `${window.location.origin}${next}`;
  }

  if (!/^https?:\/\//i.test(next)) {
    next = `https://${next.replace(/^\/+/, "")}`;
  }

  return trimSlashes(next);
};

const rawApiRoot = import.meta.env.VITE_API_URL || import.meta.env.SERVER_URL || DEFAULT_BACKEND_URL;
const rawSocketRoot = import.meta.env.VITE_SOCKET_URL || rawApiRoot;
const rawFrontendRoot = import.meta.env.VITE_APP_ROOT_URL || import.meta.env.VITE_FRONTEND_URL || DEFAULT_FRONTEND_URL;

export const API_ROOT = normalizeUrlRoot(rawApiRoot, DEFAULT_BACKEND_URL).replace(/(?:\/api)+\/?$/i, "");
export const API_BASE_URL = `${API_ROOT}/api`;
export const SOCKET_URL = normalizeUrlRoot(rawSocketRoot, API_ROOT).replace(/(?:\/api)+\/?$/i, "");
export const SOCKET_PATH = String(import.meta.env.VITE_SOCKET_PATH || import.meta.env.SOCKET_PATH || "/socket.io").trim() || "/socket.io";
export const FRONTEND_BASE_URL = normalizeUrlRoot(rawFrontendRoot, DEFAULT_FRONTEND_URL);
export const LIVE_STREAM_URL = normalizeUrlRoot(import.meta.env.VITE_LIVE_STREAM_URL || SOCKET_URL, SOCKET_URL);

const didUseApiFallback = !import.meta.env.VITE_API_URL;
const didUseSocketFallback = !import.meta.env.VITE_SOCKET_URL;

if (import.meta.env.DEV && typeof console !== "undefined") {
  if (didUseApiFallback) {
    console.warn("[env] VITE_API_URL is missing; using backend fallback.", { API_BASE_URL });
  }

  if (didUseSocketFallback) {
    console.warn("[env] VITE_SOCKET_URL is missing; using API host for sockets.", { SOCKET_URL, SOCKET_PATH });
  }
}
