const DEFAULT_APP_ROOT_URL = "https://vibe-book-fri1.onrender.com";

export const APP_ROOT_URL =
  String(import.meta.env.VITE_APP_ROOT_URL || DEFAULT_APP_ROOT_URL)
    .trim()
    .replace(/\/+$/, "") || DEFAULT_APP_ROOT_URL;
