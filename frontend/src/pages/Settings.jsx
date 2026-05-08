// @ts-nocheck
import { Ban, Bell, Eye, KeyRound, Languages, Lock, LogOut, Phone, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { userApi } from "../services/api";

const PHONE_COUNTRIES = [
  { country: "Rwanda", code: "+250", flag: "🇷🇼" },
  { country: "Uganda", code: "+256", flag: "🇺🇬" },
  { country: "Kenya", code: "+254", flag: "🇰🇪" },
  { country: "Tanzania", code: "+255", flag: "🇹🇿" },
  { country: "Burundi", code: "+257", flag: "🇧🇮" },
  { country: "DR Congo", code: "+243", flag: "🇨🇩" },
  { country: "International", code: "+", flag: "🌐" },
];

const cleanUsername = (value = "") => value.trim().replace(/^@+/, "").replace(/\s+/g, "_").toLowerCase();
const cleanPhone = (value = "") => value.replace(/[^\d]/g, "");
const localPhoneFor = (currentUser = {}) => {
  const digits = cleanPhone(currentUser.phoneNumber || currentUser.phone || "");
  const codeDigits = cleanPhone(currentUser.countryCode || "");
  return !currentUser.phoneNumber && codeDigits && digits.startsWith(codeDigits) ? digits.slice(codeDigits.length) : digits;
};

const Settings = () => {
  const { languages, language, setLanguage } = useLanguage();
  const { logout, refreshProfile, sendPhoneCode, updateProfile, user, verifyPhoneCode } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(user?.username || "");
  const [phoneForm, setPhoneForm] = useState({
    country: user?.country || "Rwanda",
    countryCode: user?.countryCode || "+250",
    phoneNumber: localPhoneFor(user),
  });
  const [phoneCode, setPhoneCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [notifications, setNotifications] = useState(user?.notificationEnabled !== false);
  const [privacy, setPrivacy] = useState({
    accountVisibility: user?.accountVisibility || "public",
    allowMessagesFrom: user?.allowMessagesFrom || "everyone",
    allowProfileDiscovery: user?.allowProfileDiscovery !== false,
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    setUsername(user?.username || "");
    setPhoneForm({
      country: user?.country || "Rwanda",
      countryCode: user?.countryCode || "+250",
      phoneNumber: localPhoneFor(user),
    });
    setNotifications(user?.notificationEnabled !== false);
    setPrivacy({
      accountVisibility: user?.accountVisibility || "public",
      allowMessagesFrom: user?.allowMessagesFrom || "everyone",
      allowProfileDiscovery: user?.allowProfileDiscovery !== false,
    });
  }, [user]);

  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const setPhoneCountry = (countryName) => {
    const country = PHONE_COUNTRIES.find((item) => item.country === countryName) || PHONE_COUNTRIES[0];
    setPhoneForm((current) => ({ ...current, country: country.country, countryCode: country.code }));
  };

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

  const saveUsername = async (event) => {
    event.preventDefault();
    setSaving("username");
    setStatus("");
    setError("");

    try {
      await updateProfile({ username: cleanUsername(username) });
      await refreshProfile();
      setStatus("Username updated.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update username.");
    } finally {
      setSaving("");
    }
  };

  const saveSettings = async (payload, successMessage) => {
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

  const requestPhoneCode = async () => {
    setSaving("phone");
    setStatus("");
    setError("");

    try {
      const data = await sendPhoneCode(phoneForm);
      setCooldown(Number(data.cooldownSeconds || 60));
      setStatus(data.code ? `Local verification code: ${data.code}` : "Verification code sent.");
    } catch (requestError) {
      setCooldown(Number(requestError.response?.data?.retryAfterSeconds || 0));
      setError(requestError.response?.data?.message || "Unable to send verification code.");
    } finally {
      setSaving("");
    }
  };

  const verifyPhone = async (event) => {
    event.preventDefault();
    setSaving("verify-phone");
    setStatus("");
    setError("");

    try {
      await verifyPhoneCode({ code: phoneCode });
      setPhoneCode("");
      setStatus("Phone verified.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to verify phone.");
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
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Manage your identity, phone verification, privacy, and notifications.</p>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={saveUsername}>
          <div className="mb-4 flex items-center gap-3">
            <UserRound className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Username</h2>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <span className="flex items-center px-3 text-sm font-black text-slate-400">@</span>
            <input
              className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
              value={username}
              onChange={(event) => setUsername(cleanUsername(event.target.value))}
              required
            />
          </div>
          <button type="submit" className="btn-primary mt-4 w-full" disabled={saving === "username"}>
            {saving === "username" ? "Saving..." : "Save username"}
          </button>
        </form>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-black text-navy">Verify phone</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${user?.phoneVerified ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {user?.phoneVerified ? "Verified" : "Unverified"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
            <select className="field" value={phoneForm.country} onChange={(event) => setPhoneCountry(event.target.value)}>
              {PHONE_COUNTRIES.map((item) => (
                <option key={item.country} value={item.country}>
                  {item.flag} {item.country} {item.code}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-slate-200 bg-white">
              <span className="flex shrink-0 items-center px-3 text-sm font-black text-slate-600">{phoneForm.countryCode}</span>
              <input
                className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                inputMode="tel"
                value={phoneForm.phoneNumber}
                onChange={(event) => setPhoneForm((current) => ({ ...current, phoneNumber: cleanPhone(event.target.value) }))}
              />
            </div>
          </div>
          <button type="button" className="btn-secondary mt-3 w-full" onClick={requestPhoneCode} disabled={saving === "phone" || cooldown > 0}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : saving === "phone" ? "Sending..." : "Send verification code"}
          </button>
          <form className="mt-3 flex gap-2" onSubmit={verifyPhone}>
            <input
              className="field text-center font-black tracking-[0.25em]"
              inputMode="numeric"
              maxLength={6}
              value={phoneCode}
              onChange={(event) => setPhoneCode(cleanPhone(event.target.value).slice(0, 6))}
              placeholder="000000"
              required
            />
            <button type="submit" className="btn-primary shrink-0 px-4" disabled={saving === "verify-phone"}>
              Verify
            </button>
          </form>
        </div>

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
            <Lock className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Privacy</h2>
          </div>
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="label">Account visibility</span>
              <select
                className="field"
                value={privacy.accountVisibility}
                onChange={(event) => {
                  const next = { ...privacy, accountVisibility: event.target.value };
                  setPrivacy(next);
                  saveSettings(next, "Privacy updated.");
                }}
              >
                <option value="public">Public</option>
                <option value="followers">Followers only</option>
                <option value="private">Private</option>
              </select>
            </label>
            <label className="block space-y-2">
              <span className="label">Messages</span>
              <select
                className="field"
                value={privacy.allowMessagesFrom}
                onChange={(event) => {
                  const next = { ...privacy, allowMessagesFrom: event.target.value };
                  setPrivacy(next);
                  saveSettings(next, "Message privacy updated.");
                }}
              >
                <option value="everyone">Everyone</option>
                <option value="followers">Followers</option>
                <option value="none">No one</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-4 rounded-lg bg-surface p-4 text-sm font-bold text-slate-700">
              <span className="inline-flex min-w-0 items-center gap-2">
                <Eye className="h-4 w-4 text-slate-500" />
                <span className="truncate">Show profile in discovery</span>
              </span>
              <input
                type="checkbox"
                checked={privacy.allowProfileDiscovery}
                onChange={(event) => {
                  const next = { ...privacy, allowProfileDiscovery: event.target.checked };
                  setPrivacy(next);
                  saveSettings(next, "Discovery updated.");
                }}
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <Bell className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Notifications</h2>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg bg-surface p-4 text-sm font-bold text-slate-700">
            <span className="min-w-0 truncate">Activity, chat, and creator updates</span>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(event) => {
                setNotifications(event.target.checked);
                saveSettings({ notificationEnabled: event.target.checked }, "Notifications updated.");
              }}
            />
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <Ban className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-black text-navy">Blocked users</h2>
          </div>
          <div className="rounded-lg bg-surface p-4 text-sm font-semibold text-slate-500">
            {Array.isArray(user?.blockedUsers) && user.blockedUsers.length
              ? `${user.blockedUsers.length} blocked account${user.blockedUsers.length === 1 ? "" : "s"}`
              : "No blocked accounts"}
          </div>
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
