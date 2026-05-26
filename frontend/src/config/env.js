const DEFAULT_APP_ROOT_URL = "https://vibe-book-kappa.vercel.app";
const runtimeAppRoot =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : DEFAULT_APP_ROOT_URL;

export const APP_ROOT_URL =
  String(import.meta.env.VITE_APP_ROOT_URL || import.meta.env.VITE_FRONTEND_URL || runtimeAppRoot)
    .trim()
    .replace(/\/+$/, "") || DEFAULT_APP_ROOT_URL;
