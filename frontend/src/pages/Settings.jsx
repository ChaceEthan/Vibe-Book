// @ts-nocheck
import { Bell, KeyRound, Languages, LogOut, ShieldAlert, ToggleLeft, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { userApi } from "../services/api";

const Settings = () => {
  const { languages, language, setLanguage } = useLanguage();
  const { logout, refreshProfile, updateProfile, user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState(user?.accountType || "talent");
  const [notifications, setNotifications] = useState(user?.notificationEnabled !== false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    setAccountType(user?.accountType || "talent");
    setNotifications(user?.notificationEnabled !== false);
  }, [user]);

  const saveLanguage = async (nextLanguage) => {
    setLanguage(nextLanguage);
    setSaving("language");
    setStatus("");
    setError("");

    try {
      await updateProfile({ language: nextLanguage });
      setStatus("Language updated.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update language.");
    } finally {
      setSaving("");
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setSaving("password");
    setStatus("");
    setError("");

    try {
      await updateProfile({ password });
      setPassword("");
      setStatus("Password changed.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to change password.");
    } finally {
      setSaving("");
    }
  };

  const saveAccountSettings = async (payload, successMessage) => {
    setSaving("account");
    setStatus("");
    setError("");

    try {
      await updateProfile(payload);
      await refreshProfile();
      setStatus(successMessage);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update settings.");
    } finally {
      setSaving("");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const deleteAccount = async () => {
    setSaving("delete");
    setStatus("");
    setError("");

    try {
      await userApi.deleteMe();
      logout();
      navigate("/");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to delete account.");
      setSaving("");
    }
  };

  return (
    <section className="container-page py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase text-brand">Settings</p>
        <h1 className="mt-2 text-3xl font-black text-navy">Account Controls</h1>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <Languages className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Language</h2>
          </div>
          <select className="field" value={language} onChange={(event) => saveLanguage(event.target.value)} disabled={saving === "language"}>
            {languages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={savePassword}>
          <div className="mb-4 flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Change Password</h2>
          </div>
          <input
            className="field"
            type="password"
            minLength="6"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            required
          />
          <button type="submit" className="btn-primary mt-4 w-full" disabled={saving === "password"}>
            {saving === "password" ? "Saving..." : "Save Password"}
          </button>
        </form>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <ToggleLeft className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Role</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface p-1">
            {["user", "talent"].map((option) => (
              <button
                key={option}
                type="button"
                className={`rounded-lg px-4 py-3 text-sm font-black capitalize ${accountType === option ? "bg-brand text-navy" : "text-slate-500"}`}
                onClick={() => {
                  setAccountType(option);
                  saveAccountSettings({ accountType: option }, "Role updated.");
                }}
                disabled={saving === "account"}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <Bell className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Notifications</h2>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg bg-surface p-4 text-sm font-bold text-slate-700">
            <span className="min-w-0 truncate">Booking and chat notifications</span>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(event) => {
                setNotifications(event.target.checked);
                saveAccountSettings({ notificationEnabled: event.target.checked }, "Notifications updated.");
              }}
            />
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <LogOut className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Session</h2>
          </div>
          <button type="button" className="btn-secondary w-full" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <div className="rounded-lg border border-red-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-black text-navy">Delete Account</h2>
          </div>
          <button type="button" className="btn-secondary w-full border-red-200 text-red-700 hover:border-red-300" onClick={deleteAccount} disabled={saving === "delete"}>
            <Trash2 className="h-4 w-4" />
            {saving === "delete" ? "Deleting..." : "Delete Account"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default Settings;
