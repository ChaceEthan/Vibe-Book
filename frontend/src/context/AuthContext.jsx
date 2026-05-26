// @ts-nocheck
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { authApi, isRetryableApiError, userApi } from "../services/api";

const AuthContext = createContext(null);

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("vibebook_user"));
  } catch {
    return null;
  }
};

const normalizeToken = (value = "") => {
  const token = String(value || "").replace(/^bearer\s+/i, "").trim();
  return /^(undefined|null|false|nan)$/i.test(token) ? "" : token;
};

const readStoredToken = () => normalizeToken(localStorage.getItem("token") || localStorage.getItem("vibebook_token"));

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readStoredUser);
  const [token, setToken] = useState(readStoredToken);
  const [loading, setLoading] = useState(Boolean(readStoredToken()));

  const syncUser = useCallback((nextUser) => {
    setUser(nextUser);
    localStorage.setItem("vibebook_user", JSON.stringify(nextUser));
    window.dispatchEvent(new CustomEvent("vibebook:user-updated", { detail: { user: nextUser } }));
    return nextUser;
  }, []);

  const saveSession = (nextUser, nextToken) => {
    const cleanToken = normalizeToken(nextToken);

    syncUser(nextUser);
    setToken(cleanToken);
    localStorage.setItem("token", cleanToken);
    localStorage.setItem("vibebook_token", cleanToken);
  };

  const clearSession = () => {
    setUser(null);
    setToken(null);
    setLoading(false);
    localStorage.removeItem("vibebook_user");
    localStorage.removeItem("token");
    localStorage.removeItem("vibebook_token");
  };

  const refreshProfile = useCallback(async () => {
    if (!readStoredToken()) {
      setLoading(false);
      return null;
    }

    const { data } = await userApi.getProfile();
    return syncUser(data.user);
  }, [syncUser]);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const nextUser = await refreshProfile();

        if (!active || !nextUser) {
          return;
        }
      } catch (requestError) {
        if (requestError.response?.status === 403 && requestError.response?.data?.requiresVerification && readStoredUser()) {
          syncUser({ ...readStoredUser(), accountStatus: "pending_verification", verificationRequired: true });
        } else if (isRetryableApiError(requestError) && readStoredUser()) {
          console.warn("[auth] profile refresh deferred after network/server failure", {
            message: requestError.userMessage || requestError.message,
          });
        } else {
          clearSession();
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [token, refreshProfile]);

  useEffect(() => {
    const handleInvalidAuth = () => {
      clearSession();
    };

    window.addEventListener("vibebook:auth-invalid", handleInvalidAuth);
    return () => window.removeEventListener("vibebook:auth-invalid", handleInvalidAuth);
  }, []);

  useEffect(() => {
    const handleUserPatch = (event) => {
      const patch = event.detail?.user;
      if (!patch || typeof patch !== "object") return;
      setUser((current) => {
        if (!current?._id) return current;
        const nextUser = {
          ...current,
          ...patch,
          marketplace: {
            ...(current.marketplace || {}),
            ...(patch.marketplace || {}),
          },
        };
        localStorage.setItem("vibebook_user", JSON.stringify(nextUser));
        window.dispatchEvent(new CustomEvent("vibebook:user-updated", { detail: { user: nextUser } }));
        return nextUser;
      });
    };

    window.addEventListener("vibebook:user-patch", handleUserPatch);
    return () => window.removeEventListener("vibebook:user-patch", handleUserPatch);
  }, []);

  const login = async (credentials) => {
    const { data } = await authApi.login(credentials);
    saveSession(data.user, data.token);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await authApi.register(payload);
    saveSession(data.user, data.token);
    return data.user;
  };

  const sendPhoneCode = async (payload = {}) => {
    const { data } = await authApi.sendPhoneCode(payload);
    if (data.user) {
      syncUser(data.user);
    }
    return data;
  };

  const sendEmailCode = async (payload = {}) => {
    const { data } = await authApi.sendEmailCode(payload);
    if (data.user) {
      syncUser(data.user);
    }
    return data;
  };

  const verifyEmailCode = async (payload = {}) => {
    const { data } = await authApi.verifyEmailCode(payload);
    if (data.user) {
      if (data.token) {
        saveSession(data.user, data.token);
      } else {
        syncUser(data.user);
      }
    }
    return data;
  };

  const verifyPhoneCode = async (payload = {}) => {
    const { data } = await authApi.verifyPhoneCode(payload);
    if (data.user) {
      syncUser(data.user);
    }
    return data;
  };

  const updateProfile = async (payload) => {
    const { data } = await userApi.updateProfile(payload);
    return syncUser(data.user);
  };

  const uploadMedia = async (formData, type, options = {}) => {
    const { data } = await userApi.uploadMedia(formData, type, options);
    if (data.user) {
      syncUser(data.user);
    }
    return data;
  };

  const uploadProfilePicture = async (formData, options = {}) => {
    const { data } = await userApi.uploadProfilePicture(formData, options);
    if (data.user) {
      syncUser(data.user);
    }
    return data;
  };

  const uploadProfileCover = async (formData, options = {}) => {
    const { data } = await userApi.uploadProfileCover(formData, options);
    if (data.user) {
      syncUser(data.user);
    }
    return data;
  };

  const deleteMedia = async (path) => {
    const { data } = await userApi.deleteMedia(path);
    if (data.user) {
      syncUser(data.user);
    }
    return data;
  };

  const payAccess = async (payload = {}) => {
    const { data } = await userApi.payAccess(payload);
    return syncUser(data.user);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      sendEmailCode,
      sendPhoneCode,
      verifyEmailCode,
      verifyPhoneCode,
      logout: clearSession,
      refreshProfile,
      updateProfile,
      uploadMedia,
      uploadProfileCover,
      uploadProfilePicture,
      deleteMedia,
      payAccess,
    }),
    [user, token, loading, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};
