import { io } from "socket.io-client";

const DEFAULT_API_ROOT = "https://vibe-book-fri1.onrender.com";

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

const API_ROOT = normalizeApiRoot(import.meta.env.VITE_API_URL || DEFAULT_API_ROOT);
const API_BASE_URL = `${API_ROOT.replace(/(?:\/api)+\/?$/i, "")}/api`;
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket = null;
let connectRequested = false;
let disconnectTimer = null;
let socketAuth = {};

const clearDisconnectTimer = () => {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
};

export const getStoredToken = () => localStorage.getItem("token") || localStorage.getItem("vibebook_token");

export const getChatId = (left, right) => [left, right].filter(Boolean).map(String).sort().join(":");

const buildAuth = (token, extraAuth = {}) => {
  socketAuth = { ...socketAuth, ...extraAuth };
  return { ...socketAuth, token };
};

export const getSocket = (token = getStoredToken(), extraAuth = {}) => {
  if (!token) {
    return null;
  }

  const auth = buildAuth(token, extraAuth);

  if (socket) {
    socket.auth = auth;
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth,
    autoConnect: false,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 12000,
    transports: ["polling", "websocket"],
  });

  socket.on("connect", () => {
    connectRequested = false;
  });

  socket.on("connect_error", (error) => {
    connectRequested = false;
    console.warn("Socket connection failed:", error.message);
  });

  socket.on("disconnect", () => {
    connectRequested = false;
  });

  socket.io.on("reconnect_attempt", () => {
    const nextToken = getStoredToken();

    if (nextToken) {
      socket.auth = buildAuth(nextToken);
    }
  });

  return socket;
};

export const connectSocket = (token = getStoredToken(), extraAuth = {}) => {
  const activeSocket = getSocket(token, extraAuth);

  clearDisconnectTimer();

  if (activeSocket && !activeSocket.connected && !connectRequested && !activeSocket.active) {
    connectRequested = true;
    activeSocket.connect();
  }

  return activeSocket;
};

export const disconnectSocket = ({ immediate = false } = {}) => {
  if (!socket) {
    return;
  }

  clearDisconnectTimer();

  const disconnect = () => {
    if (socket && !socket.connected && !socket.active) {
      connectRequested = false;
      return;
    }

    socket?.disconnect();
    connectRequested = false;
  };

  if (immediate) {
    disconnect();
    return;
  }

  disconnectTimer = setTimeout(disconnect, 1200);
};
