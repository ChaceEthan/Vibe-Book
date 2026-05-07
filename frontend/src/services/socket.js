import { io } from "socket.io-client";

const API_ROOT = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const API_BASE_URL = API_ROOT.endsWith("/api") ? API_ROOT : `${API_ROOT}/api`;
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket = null;
let connectRequested = false;
let disconnectTimer = null;

const clearDisconnectTimer = () => {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
};

export const getStoredToken = () => localStorage.getItem("token") || localStorage.getItem("vibebook_token");

export const getChatId = (left, right) => [left, right].filter(Boolean).map(String).sort().join(":");

export const getSocket = (token = getStoredToken()) => {
  if (!token) {
    return null;
  }

  if (socket) {
    socket.auth = { token };
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
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

  return socket;
};

export const connectSocket = (token = getStoredToken()) => {
  const activeSocket = getSocket(token);

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
