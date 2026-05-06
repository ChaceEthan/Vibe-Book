import { io } from "socket.io-client";

const API_ROOT = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const API_BASE_URL = API_ROOT.endsWith("/api") ? API_ROOT : `${API_ROOT}/api`;
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket = null;

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
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    transports: ["websocket", "polling"],
  });

  return socket;
};

export const connectSocket = (token = getStoredToken()) => {
  const activeSocket = getSocket(token);

  if (activeSocket && !activeSocket.connected) {
    activeSocket.connect();
  }

  return activeSocket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
  }
};
