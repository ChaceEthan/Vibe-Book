// @ts-nocheck
import { io } from "socket.io-client";

import { SOCKET_PATH, SOCKET_URL } from "../config/network";

let socket = null;
let connectRequested = false;
let disconnectTimer = null;
let socketAuth = {};
let lastSocketWarningAt = 0;
let networkListenersAttached = false;

const warnSocketIssue = (message, payload = {}) => {
  if (typeof console === "undefined") return;
  if (!import.meta.env.DEV) return;

  const now = Date.now();
  if (now - lastSocketWarningAt < 60000) {
    return;
  }

  lastSocketWarningAt = now;
  console.warn(message, payload);
};

const clearDisconnectTimer = () => {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
};

const normalizeToken = (value = "") => {
  const token = String(value || "").replace(/^bearer\s+/i, "").trim();
  return /^(undefined|null|false|nan)$/i.test(token) ? "" : token;
};

export const getStoredToken = () => {
  if (typeof localStorage === "undefined") {
    return "";
  }

  return normalizeToken(localStorage.getItem("token") || localStorage.getItem("vibebook_token"));
};

export const getChatId = (left, right) => [left, right].filter(Boolean).map(String).sort().join(":");

const buildAuth = (token, extraAuth = {}) => {
  socketAuth = { ...socketAuth, ...extraAuth };
  return { ...socketAuth, token: normalizeToken(token) };
};

export const getSocket = (token = getStoredToken(), extraAuth = {}) => {
  const cleanToken = normalizeToken(token);

  if (!cleanToken) {
    return null;
  }

  const auth = buildAuth(cleanToken, extraAuth);

  if (socket) {
    socket.auth = auth;
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth,
    autoConnect: false,
    closeOnBeforeunload: false,
    withCredentials: true,
    path: SOCKET_PATH,
    transports: ["websocket", "polling"],
    transportOptions: {
      polling: {
        withCredentials: true,
      },
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 12000,
    randomizationFactor: 0.6,
    timeout: 20000,
    tryAllTransports: true,
  });

  socket.on("connect", () => {
    connectRequested = false;
  });

  socket.on("connect_error", (error) => {
    connectRequested = false;
    if (/unauthorized|jwt|token/i.test(error?.message || "")) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("vibebook:auth-invalid", {
            detail: {
              code: "SOCKET_AUTH_INVALID",
              message: "Your realtime session expired. Please log in again.",
            },
          })
        );
      }
      disconnectSocket({ immediate: true });
      return;
    }
    warnSocketIssue("[socket] connection failed", {
      message: error?.message || "Socket connection failed",
      url: SOCKET_URL,
      path: SOCKET_PATH,
    });
  });

  socket.on("disconnect", (reason) => {
    connectRequested = false;
    if (typeof window !== "undefined" && reason === "io server disconnect" && getStoredToken()) {
      window.setTimeout(() => connectSocket(getStoredToken()), 1200);
    }
  });

  const refreshSocketAuth = () => {
    const nextToken = getStoredToken();

    if (nextToken) {
      socket.auth = buildAuth(nextToken);
    }
  };

  socket.io.on("reconnect_attempt", refreshSocketAuth);

  socket.io.on("reconnect", () => {
    connectRequested = false;
  });

  if (typeof window !== "undefined" && !networkListenersAttached) {
    networkListenersAttached = true;
    window.addEventListener("online", () => {
      if (socket && !socket.connected && getStoredToken()) {
        refreshSocketAuth();
        connectSocket(getStoredToken());
      }
    });
  }

  return socket;
};

export const connectSocket = (token = getStoredToken(), extraAuth = {}) => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    warnSocketIssue("[socket] offline; connection deferred");
    return socket;
  }

  const activeSocket = getSocket(token, extraAuth);

  clearDisconnectTimer();

  if (!activeSocket) {
    return null;
  }

  const managerState = activeSocket.io?._readyState;
  if (activeSocket.connected || managerState === "opening" || managerState === "open" || connectRequested) {
    return activeSocket;
  }

  connectRequested = true;
  activeSocket.connect();
  return activeSocket;
};

export const disconnectSocket = ({ immediate = false } = {}) => {
  if (!socket) {
    return;
  }

  clearDisconnectTimer();

  if (immediate) {
    socket.disconnect();
    connectRequested = false;
    return;
  }

  const disconnect = () => {
    if (socket && !socket.connected && !socket.connecting) {
      connectRequested = false;
      return;
    }

    socket?.disconnect();
    connectRequested = false;
  };

  disconnectTimer = setTimeout(disconnect, 1200);
};
