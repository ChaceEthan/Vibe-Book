// @ts-nocheck
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { authApi, userApi } from "../services/api";

const AuthContext = createContext(null);

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("vibebook_user"));
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readStoredUser);
  const [token, setToken] = useState(() => localStorage.getItem("vibebook_token"));
  const [loading, setLoading] = useState(Boolean(localStorage.getItem("vibebook_token")));

  const syncUser = useCallback((nextUser) => {
    setUser(nextUser);
    localStorage.setItem("vibebook_user", JSON.stringify(nextUser));
    return nextUser;
  }, []);

  const saveSession = (nextUser, nextToken) => {
    syncUser(nextUser);
    setToken(nextToken);
    localStorage.setItem("vibebook_token", nextToken);
  };

  const clearSession = () => {
    setUser(null);
    setToken(null);
    setLoading(false);
    localStorage.removeItem("vibebook_user");
    localStorage.removeItem("vibebook_token");
  };

  const refreshProfile = useCallback(async () => {
    if (!localStorage.getItem("vibebook_token")) {
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
      } catch {
        clearSession();
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

  const updateProfile = async (payload) => {
    const { data } = await userApi.updateProfile(payload);
    return syncUser(data.user);
  };

  const uploadProfileImages = async (files) => {
    const { data } = await userApi.uploadImages(files);
    return syncUser(data.user);
  };

  const uploadProfileVideos = async (files) => {
    const { data } = await userApi.uploadVideos(files);
    return syncUser(data.user);
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
      logout: clearSession,
      refreshProfile,
      updateProfile,
      uploadProfileImages,
      uploadProfileVideos,
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
