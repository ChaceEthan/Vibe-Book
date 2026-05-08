// @ts-nocheck
import { Ban, Bell, Camera, Globe2, ImagePlus, KeyRound, Languages, Lock, LogOut, Phone, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { GENDER_OPTIONS, PROFILE_CATEGORIES } from "../constants/profile";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { mediaUrl, userApi } from "../services/api";

const PHONE_COUNTRIES = [
  { country: "Rwanda", code: "+250", label: "RW" },
  { country: "Uganda", code: "+256", label: "UG" },
  { country: "Kenya", code: "+254", label: "KE" },
  { country: "Tanzania", code: "+255", label: "TZ" },
  { country: "Burundi", code: "+257", label: "BI" },
  { country: "DR Congo", code: "+243", label: "CD" },
  { country: "International", code: "+", label: "INT" },
];

const cleanUsername = (value = "") => value.trim().replace(/^@+/, "").replace(/\s+/g, "_").toLowerCase();
const cleanPhone = (value = "") => value.replace(/[^\d]/g, "");
const localPhoneFor = (currentUser = {}) => {
  const digits = cleanPhone(currentUser.phoneNumber || currentUser.phone || "");
  const codeDigits = cleanPhone(currentUser.countryCode || "");
  return !currentUser.phoneNumber && codeDigits && digits.startsWith(codeDigits) ? digits.slice(codeDigits.length) : digits;
};

const initialProfileForm = (user = {}) => {
  const categories = Array.from(
    new Set([
      user.category,
      ...(Array.isArray(user.creatorSkills) ? user.creatorSkills : []),
      ...(Array.isArray(user.skills) ? user.skills : []),
    ].filter((item) => PROFILE_CATEGORIES.includes(item)))
  );

  return {
    name: user.name || "",
    username: user.username || "",
    bio: user.bio || "",
    gender: user.gender || "",
    birthday: user.birthday ? String(user.birthday).slice(0, 10) : "",
    website: user.website || user.socialLinks?.website || "",
    coverImage: user.coverImage || "",
    categories,
    socialLinks: {
      instagram: user.socialLinks?.instagram || "",
      tiktok: user.socialLinks?.tiktok || "",
      youtube: user.socialLinks?.youtube || "",
      x: user.socialLinks?.x || "",
      website: user.website || user.socialLinks?.website || "",
    },
  };
};

const Settings = () => {
  const { languages, language, setLanguage } = useLanguage();
  const { logout, refreshProfile, sendPhoneCode, updateProfile, user, verifyPhoneCode } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [profileForm, setProfileForm] = useState(() => initialProfileForm(user || {}));
  const [password, setPassword] = useState("");
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

  const profileImage = mediaUrl(user?.profilePicture || user?.profileImage || "");
  const activeCountry = useMemo(
    () => PHONE_COUNTRIES.find((item) => item.country === phoneForm.country) || PHONE_COUNTRIES[0],
    [phoneForm.country]
  );

  useEffect(() => {
    setProfileForm(initialProfileForm(user || {}));
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

  const notifySuccess = (message) => {
    setStatus(message);
    addToast(message, "success");
  };

  const notifyError = (message) => {
    setError(message);
    addToast(message, "error");
  };

  const updateProfileField = (field, value) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const updateSocialField = (field, value) => {
    setProfileForm((current) => ({
      ...current,
      socialLinks: { ...current.socialLinks, [field]: value },
      ...(field === "website" ? { website: value } : {}),
    }));
  };

  const toggleCategory = (category) => {
    setProfileForm((current) => {
      const exists = current.categories.includes(category);
      const categories = exists ? current.categories.filter((item) => item !== category) : [...current.categories, category];
      return { ...current, categories };
    });
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving("profile");
    setStatus("");
    setError("");

    const categories = profileForm.categories.slice(0, 8);
    const optimisticName = profileForm.name.trim() || user?.name || "";

    try {
      await updateProfile({
        name: optimisticName,
        username: cleanUsername(profileForm.username),
        bio: profileForm.bio.trim(),
        gender: profileForm.gender,
        birthday: profileForm.birthday || undefined,
        category: categories[0] || "",
        creatorCategory: categories[0] || "",
        creatorSkills: categories,
        skills: categories,
        website: profileForm.website.trim(),
        coverImage: profileForm.coverImage.trim(),
        socialLinks: {
          ...profileForm.socialLinks,
          website: profileForm.website.trim(),
        },
      });
      await refreshProfile();
      notifySuccess("Profile updated.");
    } catch (requestError) {
      notifyError(requestError.response?.data?.message || "Unable to update profile.");
    } finally {
      setSaving("");
    }
  };

  const saveLanguage = async (nextLanguage) => {
    setLanguage(nextLanguage);
    setSaving("language");
    setStatus("");
    setError("");

    try {
      await updateProfile({ language: nextLanguage });
      notifySuccess("Language updated.");
    } catch (requestError) {
      notifyError(requestError.response?.data?.message || "Unable to update language.");
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
      notifySuccess("Password changed.");
    } catch (requestError) {
      notifyError(requestError.response?.data?.message || "Unable to change password.");
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
      notifySuccess(successMessage);
    } catch (requestError) {
      notifyError(requestError.response?.data?.message || "Unable to update settings.");
    } finally {
      setSaving("");
    }
  };

  const setPhoneCountry = (countryName) => {
    const country = PHONE_COUNTRIES.find((item) => item.country === countryName) || PHONE_COUNTRIES[0];
    setPhoneForm((current) => ({ ...current, country: country.country, countryCode: country.code }));
  };

  const requestPhoneCode = async () => {
    setSaving("phone");
    setStatus("");
    setError("");

    try {
      const data = await sendPhoneCode(phoneForm);
      setCooldown(Number(data.cooldownSeconds || 60));
      notifySuccess(data.code ? `Local verification code: ${data.code}` : "Verification code sent.");
    } catch (requestError) {
      setCooldown(Number(requestError.response?.data?.retryAfterSeconds || 0));
      notifyError(requestError.response?.data?.message || "Unable to send verification code.");
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
      notifySuccess("Phone verified.");
    } catch (requestError) {
      notifyError(requestError.response?.data?.message || "Unable to verify phone.");
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
      notifyError(requestError.response?.data?.message || "Unable to delete account.");
      setSaving("");
    }
  };

  const openProfileUpload = () => {
    window.dispatchEvent(new CustomEvent("vibebook:open-upload", { detail: { type: "profile" } }));
  };

  return (
    <section className="container-page py-6 sm:py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase text-brand">Settings</p>
        <h1 className="mt-2 text-3xl font-black text-navy">Account Controls</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Manage your profile, phone verification, privacy, and notifications in one place.</p>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={saveProfile}>
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <img src={profileImage} alt="" className="h-20 w-20 shrink-0 rounded-full bg-slate-100 object-cover ring-4 ring-slate-100" />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-black text-navy">{user?.name || "Profile"}</h2>
                <p className="mt-1 truncate text-sm font-semibold text-slate-500">@{user?.username || "creator"}</p>
              </div>
            </div>
            <button type="button" className="btn-secondary gap-2 px-4 py-2.5" onClick={openProfileUpload}>
              <Camera className="h-4 w-4" />
              Profile image
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="label">Display name</span>
              <input className="field" value={profileForm.name} onChange={(event) => updateProfileField("name", event.target.value)} required />
            </label>

            <label className="space-y-2">
              <span className="label">Username</span>
              <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                <span className="flex items-center px-3 text-sm font-black text-slate-400">@</span>
                <input
                  className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                  value={profileForm.username}
                  onChange={(event) => updateProfileField("username", cleanUsername(event.target.value))}
                  required
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className="label">Gender</span>
              <select className="field" value={profileForm.gender} onChange={(event) => updateProfileField("gender", event.target.value)}>
                <option value="">Prefer not to say</option>
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="label">Birthday</span>
              <input className="field" type="date" value={profileForm.birthday} onChange={(event) => updateProfileField("birthday", event.target.value)} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="label">Bio</span>
              <textarea
                className="field min-h-28 resize-y"
                value={profileForm.bio}
                onChange={(event) => updateProfileField("bio", event.target.value)}
                maxLength={200}
                placeholder="Tell people what you make or love watching."
              />
            </label>

            <div className="md:col-span-2">
              <span className="label">Categories</span>
              <div className="mt-2 flex max-h-52 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {PROFILE_CATEGORIES.map((category) => {
                  const active = profileForm.categories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                        active ? "bg-brand text-navy shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                      onClick={() => toggleCategory(category)}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="space-y-2">
              <span className="label">Website</span>
              <input className="field" value={profileForm.website} onChange={(event) => updateSocialField("website", event.target.value)} placeholder="https://..." />
            </label>

            <label className="space-y-2">
              <span className="label">Cover image URL</span>
              <div className="relative">
                <ImagePlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="field pl-10" value={profileForm.coverImage} onChange={(event) => updateProfileField("coverImage", event.target.value)} placeholder="Cloudinary image URL" />
              </div>
            </label>

            {["instagram", "tiktok", "youtube", "x"].map((field) => (
              <label key={field} className="space-y-2">
                <span className="label capitalize">{field === "x" ? "X" : field}</span>
                <input className="field" value={profileForm.socialLinks[field]} onChange={(event) => updateSocialField(field, event.target.value)} placeholder={`@${field}`} />
              </label>
            ))}
          </div>

          <button type="submit" className="btn-primary mt-5 w-full" disabled={saving === "profile"}>
            {saving === "profile" ? "Saving..." : "Save profile"}
          </button>
        </form>

        <div className="space-y-5">
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
            <div className="grid gap-3">
              <select className="field" value={phoneForm.country} onChange={(event) => setPhoneCountry(event.target.value)}>
                {PHONE_COUNTRIES.map((item) => (
                  <option key={item.country} value={item.country}>
                    {item.label} {item.country} {item.code}
                  </option>
                ))}
              </select>
              <div className="flex rounded-lg border border-slate-200 bg-white">
                <span className="flex shrink-0 items-center px-3 text-sm font-black text-slate-600">{activeCountry.code}</span>
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
            <input className="field" type="password" minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" required />
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
                  <Globe2 className="h-4 w-4 text-slate-500" />
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

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
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
        </div>
      </div>
    </section>
  );
};

export default Settings;
