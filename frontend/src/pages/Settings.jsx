// @ts-nocheck
import {
  BadgeCheck,
  Ban,
  BarChart3,
  Bell,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileText,
  Globe2,
  Heart,
  HelpCircle,
  ImagePlus,
  Info,
  KeyRound,
  Languages,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { GENDER_OPTIONS, PROFILE_CATEGORIES } from "../constants/profile";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { authApi, mediaUrl, userApi } from "../services/api";

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

const DEFAULT_LOCAL_PREFS = {
  darkMode: false,
  dataSaver: false,
  autoplay: true,
  soundPreference: "sound",
  commentPrivacy: "everyone",
  remixPrivacy: "everyone",
  mentionPrivacy: "everyone",
  activityStatus: true,
  captionLanguage: "en",
  videoQuality: "auto",
  accessibility: "default",
  notifyLikes: true,
  notifyComments: true,
  notifyFollows: true,
  notifyMessages: true,
  notifyMentions: true,
  notifyLive: true,
  securityAlerts: true,
};

const AUDIENCE_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "followers", label: "Followers" },
  { value: "none", label: "No one" },
];

const QUALITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "high", label: "High" },
  { value: "data_saver", label: "Data saver" },
];

const ACCESSIBILITY_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "reduced_motion", label: "Reduced motion" },
  { value: "larger_text", label: "Larger text" },
];

const SOUND_OPTIONS = [
  { value: "sound", label: "Sound on" },
  { value: "muted", label: "Muted" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9_][a-z0-9_-]{2,29}$/;

const emptyPasswordFlow = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  step: 1,
};

const emptyEmailFlow = {
  currentPassword: "",
  newEmail: "",
  code: "",
  expectedCode: "",
  cooldown: 0,
  expiresAt: "",
  step: 1,
};

const emptyUsernameFlow = {
  value: "",
  status: "idle",
  message: "",
};

const passwordStrengthFor = (value = "") => {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return score;
};

const securityDate = (value) => {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const verificationErrorMessage = (requestError, fallback = "Verification is temporarily unavailable.") => {
  const reason = requestError?.response?.data?.reason || "";
  const message = requestError?.response?.data?.message || requestError?.message || "";

  if (reason === "SMS_PROVIDER_NOT_CONFIGURED") return "Verification service temporarily unavailable. Please try again.";
  if (reason === "SMTP_NOT_CONFIGURED") return "Verification service temporarily unavailable. Please try again.";
  if (reason === "SMTP_AUTH_FAILED") return "Verification service temporarily unavailable. Please try again.";
  if (reason === "SMTP_CONNECTION_FAILED") return "Verification service temporarily unavailable. Please try again.";
  if (message) return message;
  return fallback;
};

const readLocalPrefs = () => {
  if (typeof window === "undefined") return DEFAULT_LOCAL_PREFS;

  try {
    const parsed = JSON.parse(window.localStorage.getItem("vibebook:settings-preferences") || "{}");
    const feedAudio = window.localStorage.getItem("vibebook:feed-audio");
    return { ...DEFAULT_LOCAL_PREFS, ...parsed, soundPreference: feedAudio === "muted" ? "muted" : parsed.soundPreference || DEFAULT_LOCAL_PREFS.soundPreference };
  } catch {
    return DEFAULT_LOCAL_PREFS;
  }
};

const saveLocalPrefs = (prefs) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("vibebook:settings-preferences", JSON.stringify(prefs));
  }
};

const SwitchControl = ({ checked, disabled = false, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-brand" : "bg-slate-300"} ${disabled ? "opacity-60" : "hover:shadow-sm"}`}
  >
    <span
      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
        checked ? "left-6" : "left-1"
      }`}
    />
  </button>
);

const SettingRow = ({
  actionLabel = "",
  checked,
  detail = "",
  disabled = false,
  icon: Icon,
  label,
  onClick,
  onSelect,
  onToggle,
  options = [],
  selectValue,
  value = "",
}) => (
  <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0">
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-navy">{label}</p>
        {detail && <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-500">{detail}</p>}
      </div>
    </div>

    {onToggle ? (
      <SwitchControl checked={checked} disabled={disabled} label={label} onChange={onToggle} />
    ) : onSelect ? (
      <select
        className="max-w-[9rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        value={selectValue}
        onChange={(event) => onSelect(event.target.value)}
        disabled={disabled}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ) : onClick ? (
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs font-black text-slate-500 transition hover:bg-slate-100 hover:text-navy"
        onClick={onClick}
        disabled={disabled}
      >
        {actionLabel || value}
        <ChevronRight className="h-4 w-4" />
      </button>
    ) : (
      <span className="max-w-[9rem] shrink-0 truncate text-right text-xs font-black text-slate-500">{value}</span>
    )}
  </div>
);

const SettingsSection = ({ children, icon: Icon, title }) => (
  <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
    <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
      <Icon className="h-5 w-5 text-brand" />
      <h2 className="text-sm font-black uppercase tracking-wide text-navy">{title}</h2>
    </div>
    <div>{children}</div>
  </section>
);

const Settings = () => {
  const { languages, language, setLanguage } = useLanguage();
  const { logout, refreshProfile, sendEmailCode, sendPhoneCode, updateProfile, user, verifyEmailCode, verifyPhoneCode } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [profileForm, setProfileForm] = useState(() => initialProfileForm(user || {}));
  const [phoneForm, setPhoneForm] = useState({
    country: user?.country || "Rwanda",
    countryCode: user?.countryCode || "+250",
    phoneNumber: localPhoneFor(user),
  });
  const [phoneCode, setPhoneCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [notifications, setNotifications] = useState(user?.notificationEnabled !== false);
  const [localPrefs, setLocalPrefs] = useState(() => readLocalPrefs());
  const [privacy, setPrivacy] = useState({
    accountVisibility: user?.accountVisibility || "public",
    allowMessagesFrom: user?.allowMessagesFrom || "everyone",
    allowProfileDiscovery: user?.allowProfileDiscovery !== false,
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [authModal, setAuthModal] = useState("");
  const [passwordFlow, setPasswordFlow] = useState(emptyPasswordFlow);
  const [emailFlow, setEmailFlow] = useState(emptyEmailFlow);
  const [usernameFlow, setUsernameFlow] = useState(() => ({ ...emptyUsernameFlow, value: cleanUsername(user?.username || "") }));
  const [authFlowError, setAuthFlowError] = useState("");
  const [phoneUnavailable, setPhoneUnavailable] = useState(false);
  const [phoneSuccess, setPhoneSuccess] = useState(false);

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
    setUsernameFlow({ ...emptyUsernameFlow, value: cleanUsername(user?.username || "") });
  }, [user]);

  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (authModal !== "email" || emailFlow.cooldown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setEmailFlow((current) => ({ ...current, cooldown: Math.max(0, Number(current.cooldown || 0) - 1) }));
    }, 1000);
    return () => clearInterval(timer);
  }, [authModal, emailFlow.cooldown]);

  useEffect(() => {
    if (authModal !== "username") {
      return undefined;
    }

    const username = cleanUsername(usernameFlow.value);
    const currentUsername = cleanUsername(user?.username || "");

    if (!username) {
      setUsernameFlow((current) => ({ ...current, status: "idle", message: "" }));
      return undefined;
    }

    if (!USERNAME_PATTERN.test(username)) {
      setUsernameFlow((current) => ({
        ...current,
        value: username,
        status: "invalid",
        message: "Use 3-30 lowercase letters, numbers, hyphens, or underscores.",
      }));
      return undefined;
    }

    if (username === currentUsername) {
      setUsernameFlow((current) => ({ ...current, value: username, status: "current", message: "This is your current username." }));
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setUsernameFlow((current) => ({ ...current, value: username, status: "checking", message: "Checking availability..." }));

      try {
        const { data } = await authApi.checkAvailability({ field: "username", value: username }, { signal: controller.signal });
        setUsernameFlow((current) => ({
          ...current,
          value: username,
          status: data.available ? "available" : "taken",
          message: data.message || (data.available ? "Username is available." : "Username is already taken."),
        }));
      } catch (requestError) {
        if (requestError.name === "CanceledError" || requestError.code === "ERR_CANCELED") {
          return;
        }

        setUsernameFlow((current) => ({
          ...current,
          value: username,
          status: "invalid",
          message: requestError.response?.data?.message || "Unable to check username.",
        }));
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authModal, user?.username, usernameFlow.value]);

  const notifySuccess = (message) => {
    setStatus(message);
    addToast(message, "success");
  };

  const notifyError = (message) => {
    setError(message);
    addToast(message, "error");
  };

  const saveLocalPreference = (field, value, message = "Preference saved.") => {
    setLocalPrefs((current) => {
      const next = { ...current, [field]: value };
      saveLocalPrefs(next);
      if (field === "soundPreference") {
        window.localStorage.setItem("vibebook:feed-audio", value === "muted" ? "muted" : "sound");
      }
      return next;
    });
    notifySuccess(message);
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

  const closeAuthModal = () => {
    setAuthModal("");
    setAuthFlowError("");
    setSaving("");
    setPasswordFlow(emptyPasswordFlow);
    setEmailFlow(emptyEmailFlow);
    setUsernameFlow({ ...emptyUsernameFlow, value: cleanUsername(user?.username || "") });
    setPhoneUnavailable(false);
    setPhoneSuccess(false);
  };

  const openManageAccountModal = () => {
    setAuthModal("manage");
    setAuthFlowError("");
  };

  const openUsernameModal = () => {
    setAuthModal("username");
    setAuthFlowError("");
    setUsernameFlow({ ...emptyUsernameFlow, value: cleanUsername(user?.username || profileForm.username || "") });
  };

  const openPasswordModal = () => {
    setAuthModal("password");
    setAuthFlowError("");
    setPasswordFlow(emptyPasswordFlow);
  };

  const openEmailModal = () => {
    setAuthModal("email");
    setAuthFlowError("");
    setEmailFlow({ ...emptyEmailFlow, newEmail: String(user?.email || "").toLowerCase() });
  };

  const openSessionsModal = () => {
    setAuthModal("sessions");
    setAuthFlowError("");
  };

  const openPhoneModal = () => {
    setAuthModal("phone");
    setAuthFlowError("");
    setPhoneUnavailable(false);
    setPhoneSuccess(Boolean(user?.phoneVerified));
  };

  const verifyCurrentPassword = async (currentPassword) => {
    const identifier = user?.email || user?.phone || user?.phoneNumber || user?.username;

    if (!identifier) {
      throw new Error("No login identifier is available for this account.");
    }

    await authApi.login({ identifier, password: currentPassword });
  };

  const handlePasswordFlow = async (event) => {
    event.preventDefault();
    setAuthFlowError("");

    try {
      if (passwordFlow.step === 1) {
        if (!passwordFlow.currentPassword) {
          setAuthFlowError("Enter your current password.");
          return;
        }

        setSaving("password-current");
        await verifyCurrentPassword(passwordFlow.currentPassword);
        setPasswordFlow((current) => ({ ...current, step: 2 }));
        return;
      }

      if (passwordFlow.step === 2) {
        if (passwordFlow.newPassword.length < 8 || passwordStrengthFor(passwordFlow.newPassword) < 2) {
          setAuthFlowError("Use at least 8 characters with a mix of letters, numbers, or symbols.");
          return;
        }

        setPasswordFlow((current) => ({ ...current, step: 3 }));
        return;
      }

      if (passwordFlow.step === 3) {
        if (passwordFlow.newPassword !== passwordFlow.confirmPassword) {
          setAuthFlowError("Passwords do not match.");
          return;
        }

        setSaving("password");
        await updateProfile({ password: passwordFlow.newPassword });
        await refreshProfile();
        setPasswordFlow((current) => ({ ...current, currentPassword: "", newPassword: "", confirmPassword: "", step: 4 }));
        notifySuccess("Password changed.");
      }
    } catch (requestError) {
      setAuthFlowError(requestError.response?.data?.message || requestError.message || "Unable to verify password.");
    } finally {
      setSaving("");
    }
  };

  const handleUsernameSave = async (event) => {
    event.preventDefault();
    const username = cleanUsername(usernameFlow.value);

    if (usernameFlow.status !== "available" || !USERNAME_PATTERN.test(username)) {
      setAuthFlowError("Choose an available username first.");
      return;
    }

    setSaving("username");
    setAuthFlowError("");

    try {
      await updateProfile({ username, name: user?.name || profileForm.name || username });
      await refreshProfile();
      notifySuccess("Username updated.");
      closeAuthModal();
    } catch (requestError) {
      setAuthFlowError(requestError.response?.data?.message || "Unable to update username.");
    } finally {
      setSaving("");
    }
  };

  const requestEmailCode = async (email) => {
    const nextEmail = String(email || emailFlow.newEmail || user?.email || "").trim().toLowerCase();

    if (!EMAIL_PATTERN.test(nextEmail)) {
      setAuthFlowError("Enter a valid email address.");
      return null;
    }

    setSaving("email-code");
    try {
      const data = await sendEmailCode({ email: nextEmail });
      setEmailFlow((current) => ({
        ...current,
        newEmail: nextEmail,
        code: "",
        expectedCode: data.code || "",
        expiresAt: data.expiresAt || "",
        cooldown: Number(data.cooldownSeconds || 60),
        step: 3,
      }));
      notifySuccess(data.code ? `Local verification code: ${data.code}` : "Verification code sent to your email.");
      return data;
    } finally {
      setSaving("");
    }
  };

  const handleEmailFlow = async (event) => {
    event.preventDefault();
    setAuthFlowError("");

    try {
      if (emailFlow.step === 1) {
        if (!emailFlow.currentPassword) {
          setAuthFlowError("Enter your current password.");
          return;
        }

        setSaving("email-current");
        await verifyCurrentPassword(emailFlow.currentPassword);
        setEmailFlow((current) => ({ ...current, step: 2 }));
        return;
      }

      if (emailFlow.step === 2) {
        const nextEmail = (emailFlow.newEmail || user?.email || "").trim().toLowerCase();

        if (!EMAIL_PATTERN.test(nextEmail)) {
          setAuthFlowError("Enter a valid email address.");
          return;
        }

        if (nextEmail === String(user?.email || "").toLowerCase() && user?.emailVerified) {
          setAuthFlowError("This email is already on your account.");
          return;
        }

        setSaving("email-check");
        if (nextEmail !== String(user?.email || "").toLowerCase()) {
          const { data } = await authApi.checkAvailability({ field: "email", value: nextEmail });
          if (!data.available) {
            setAuthFlowError(data.message || "Email already exists.");
            return;
          }
        }

        await requestEmailCode(nextEmail);
        return;
      }

      if (emailFlow.step === 3) {
        setEmailFlow((current) => ({ ...current, step: 4 }));
        setSaving("email-verify");
        await verifyEmailCode({ code: emailFlow.code.trim() });
        await refreshProfile();
        setEmailFlow((current) => ({ ...current, currentPassword: "", code: "", expectedCode: "", step: 5 }));
        notifySuccess("Email verified.");
      }
    } catch (requestError) {
      setEmailFlow((current) => (current.step === 4 ? { ...current, step: 3 } : current));
      setAuthFlowError(verificationErrorMessage(requestError, "Unable to update email."));
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
      setPhoneUnavailable(false);
      setPhoneSuccess(false);
      notifySuccess(data.code ? `Local verification code: ${data.code}` : "Verification code sent.");
    } catch (requestError) {
      setCooldown(Number(requestError.response?.data?.retryAfterSeconds || 0));
      if (requestError.response?.data?.reason === "SMS_PROVIDER_NOT_CONFIGURED") {
        setPhoneUnavailable(true);
      }
      notifyError(verificationErrorMessage(requestError, "Unable to send verification code."));
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
      setPhoneSuccess(true);
      notifySuccess("Phone verified.");
    } catch (requestError) {
      notifyError(verificationErrorMessage(requestError, "Unable to verify phone."));
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

  const languageOptions = languages.map((item) => ({ value: item.code, label: item.label }));
  const phoneDisplay = [user?.countryCode, user?.phoneNumber || user?.phone].filter(Boolean).join(" ") || "Not added";
  const accountStatus = user?.isSuspended || user?.accountStatus === "suspended" ? "Limited" : "Active";
  const verificationStatus = user?.isVerified || user?.verified ? "Verified" : "Not verified";
  const emailVerificationLabel = user?.emailVerified ? "Verified" : emailFlow.step >= 3 && emailFlow.step <= 4 ? "Pending" : user?.email ? "Not Verified" : "Missing";
  const phoneVerificationLabel = user?.phoneVerified ? "Verified" : cooldown > 0 || phoneCode ? "Pending" : phoneDisplay !== "Not added" ? "Not Verified" : "Missing";
  const usernameCanSave = usernameFlow.status === "available" && USERNAME_PATTERN.test(cleanUsername(usernameFlow.value));
  const passwordStrength = passwordStrengthFor(passwordFlow.newPassword);
  const passwordStrengthLabel = ["Weak", "Weak", "Fair", "Good", "Strong"][passwordStrength] || "Weak";
  const sessionBrowser = typeof navigator !== "undefined" ? navigator.userAgent.split(" ").slice(-2).join(" ") : "Current browser";
  const notificationRows = [
    ["notifyLikes", "Likes", Heart],
    ["notifyComments", "Comments", MessageSquare],
    ["notifyFollows", "Follows", Users],
    ["notifyMessages", "Messages", Bell],
    ["notifyMentions", "Mentions", MessageSquare],
    ["notifyLive", "Live notifications", Smartphone],
  ];

  return (
    <section className="container-page py-6 sm:py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase text-brand">Settings & Privacy</p>
        <h1 className="mt-2 text-3xl font-black text-navy">Settings & Privacy</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Manage account access, privacy, content preferences, notifications, safety, creator tools, and support.</p>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <SettingsSection title="Account" icon={UserRound}>
          <SettingRow icon={UserRound} label="Manage account" detail="Username, password, email, phone, verification, and public identity" actionLabel="Open" onClick={openManageAccountModal} />
          <SettingRow icon={UserRound} label="Username" detail="Lowercase and unique" actionLabel={`@${user?.username || profileForm.username || "creator"}`} onClick={openUsernameModal} />
          <SettingRow icon={Mail} label="Email verified" detail={user?.email || "No email added"} value={emailVerificationLabel} />
          <SettingRow icon={Phone} label="Phone verified" detail={phoneDisplay} value={phoneVerificationLabel} />
          <SettingRow icon={ShieldCheck} label="Account status" detail="Current account standing" value={accountStatus} />
          <SettingRow icon={BadgeCheck} label="Verification status" detail="Creator identity signal" value={verificationStatus} />
        </SettingsSection>

        <SettingsSection title="Security" icon={ShieldAlert}>
          <SettingRow icon={Smartphone} label="Login devices" detail="Current device is signed in" actionLabel="View" onClick={openSessionsModal} />
          <SettingRow icon={LogOut} label="Session management" detail="Review or end this session" actionLabel="Open" onClick={openSessionsModal} />
          <SettingRow icon={ShieldCheck} label="2FA placeholder" detail="Extra login protection is coming soon" value="Coming soon" />
          <SettingRow icon={FileText} label="Download preferences" detail="Export account and content data when available" value="Coming soon" />
          <SettingRow icon={ShieldAlert} label="Security alerts" checked={localPrefs.securityAlerts} onToggle={(checked) => saveLocalPreference("securityAlerts", checked, "Security alerts saved.")} />
        </SettingsSection>

        <SettingsSection title="Privacy" icon={Lock}>
          <SettingRow
            icon={Lock}
            label="Private account"
            detail="Only approved followers can see private content"
            checked={privacy.accountVisibility === "private"}
            onToggle={(checked) => {
              const next = { ...privacy, accountVisibility: checked ? "private" : "public" };
              setPrivacy(next);
              saveSettings(next, "Privacy updated.");
            }}
          />
          <SettingRow icon={MessageSquare} label="Who can comment" selectValue={localPrefs.commentPrivacy} options={AUDIENCE_OPTIONS} onSelect={(value) => saveLocalPreference("commentPrivacy", value, "Comment privacy saved.")} />
          <SettingRow
            icon={MessageSquare}
            label="Who can message"
            selectValue={privacy.allowMessagesFrom}
            options={AUDIENCE_OPTIONS}
            onSelect={(value) => {
              const next = { ...privacy, allowMessagesFrom: value };
              setPrivacy(next);
              saveSettings(next, "Message privacy updated.");
            }}
          />
          <SettingRow icon={Users} label="Who can duet/remix" selectValue={localPrefs.remixPrivacy} options={AUDIENCE_OPTIONS} onSelect={(value) => saveLocalPreference("remixPrivacy", value, "Remix privacy saved.")} />
          <SettingRow icon={Users} label="Who can mention" selectValue={localPrefs.mentionPrivacy} options={AUDIENCE_OPTIONS} onSelect={(value) => saveLocalPreference("mentionPrivacy", value, "Mention privacy saved.")} />
          <SettingRow icon={Ban} label="Blocked accounts" detail={Array.isArray(user?.blockedUsers) && user.blockedUsers.length ? `${user.blockedUsers.length} blocked` : "No blocked accounts"} value={Array.isArray(user?.blockedUsers) && user.blockedUsers.length ? `${user.blockedUsers.length}` : "None"} />
          <SettingRow icon={Ban} label="Muted users" detail="Quiet accounts and keywords without blocking" value="Coming soon" />
          <SettingRow icon={CheckCircle2} label="Activity status" detail="Show when you are active" checked={localPrefs.activityStatus} onToggle={(checked) => saveLocalPreference("activityStatus", checked, "Activity status saved.")} />
          <SettingRow
            icon={Globe2}
            label="Profile visibility"
            detail="Allow people to discover your profile"
            checked={privacy.allowProfileDiscovery}
            onToggle={(checked) => {
              const next = { ...privacy, allowProfileDiscovery: checked };
              setPrivacy(next);
              saveSettings(next, "Discovery updated.");
            }}
          />
        </SettingsSection>

        <SettingsSection title="Notifications" icon={Bell}>
          <SettingRow
            icon={Bell}
            label="Push notifications"
            detail="Activity, chat, and creator updates"
            checked={notifications}
            onToggle={(checked) => {
              setNotifications(checked);
              saveSettings({ notificationEnabled: checked }, "Notifications updated.");
            }}
          />
          {notificationRows.map(([field, label, Icon]) => (
            <SettingRow
              key={field}
              icon={Icon}
              label={label}
              checked={Boolean(localPrefs[field])}
              disabled={!notifications}
              onToggle={(checked) => saveLocalPreference(field, checked, "Notification preference saved.")}
            />
          ))}
        </SettingsSection>

        <SettingsSection title="Content Preferences" icon={Globe2}>
          <SettingRow icon={Languages} label="Language" selectValue={language} options={languageOptions} onSelect={saveLanguage} />
          <SettingRow icon={Moon} label="Dark mode" detail="Remember this preference on this device" checked={localPrefs.darkMode} onToggle={(checked) => saveLocalPreference("darkMode", checked, "Display preference saved.")} />
          <SettingRow icon={Smartphone} label="Data saver" detail="Reduce mobile data usage where supported" checked={localPrefs.dataSaver} onToggle={(checked) => saveLocalPreference("dataSaver", checked, "Data saver saved.")} />
          <SettingRow icon={Bell} label="Autoplay" detail="Allow videos to start automatically" checked={localPrefs.autoplay} onToggle={(checked) => saveLocalPreference("autoplay", checked, "Autoplay preference saved.")} />
          <SettingRow icon={Volume2} label="Sound preference" detail="Default feed playback audio" selectValue={localPrefs.soundPreference} options={SOUND_OPTIONS} onSelect={(value) => saveLocalPreference("soundPreference", value, "Sound preference saved.")} />
          <SettingRow icon={BarChart3} label="Video quality preference" selectValue={localPrefs.videoQuality} options={QUALITY_OPTIONS} onSelect={(value) => saveLocalPreference("videoQuality", value, "Video quality saved.")} />
          <SettingRow icon={Languages} label="Caption language" selectValue={localPrefs.captionLanguage} options={languageOptions} onSelect={(value) => saveLocalPreference("captionLanguage", value, "Caption language saved.")} />
          <SettingRow icon={CheckCircle2} label="Accessibility" selectValue={localPrefs.accessibility} options={ACCESSIBILITY_OPTIONS} onSelect={(value) => saveLocalPreference("accessibility", value, "Accessibility preference saved.")} />
        </SettingsSection>

        <SettingsSection title="Creator Tools" icon={BarChart3}>
          <SettingRow icon={BarChart3} label="Creator Studio" detail="Analytics, performance, and creator tools" actionLabel="Open" onClick={() => navigate("/creator-studio")} />
          <SettingRow icon={BarChart3} label="Analytics" actionLabel="Open" onClick={() => navigate("/creator-studio")} />
          <SettingRow icon={CheckCircle2} label="Monetization status" value={user?.monetizationEnabled ? "Active" : "Review"} />
          <SettingRow icon={BadgeCheck} label="Verification request" actionLabel="Request" onClick={() => notifySuccess("Verification request shortcut saved.")} />
          <SettingRow icon={FileText} label="Saved drafts" actionLabel="Open" onClick={() => navigate("/drafts")} />
        </SettingsSection>

        <SettingsSection title="Support" icon={HelpCircle}>
          <SettingRow icon={HelpCircle} label="Help Center" actionLabel="Open" onClick={() => navigate("/contact")} />
          <SettingRow icon={Mail} label="Contact support" actionLabel="Email" onClick={() => { window.location.href = "mailto:gebmelody@gmail.com"; }} />
          <SettingRow icon={HelpCircle} label="Report a Problem" actionLabel="Start" onClick={() => notifySuccess("Problem report shortcut opened.")} />
          <SettingRow icon={BookOpen} label="Community Guidelines" actionLabel="Read" onClick={() => navigate("/community-guidelines")} />
          <SettingRow icon={MessageSquare} label="Feedback" actionLabel="Send" onClick={() => { window.location.href = "mailto:gebmelody@gmail.com?subject=VibeBook%20Feedback"; }} />
        </SettingsSection>

        <SettingsSection title="Legal" icon={FileText}>
          <SettingRow icon={FileText} label="Privacy Policy" actionLabel="View" onClick={() => navigate("/privacy-policy")} />
          <SettingRow icon={FileText} label="Terms of Service" actionLabel="View" onClick={() => navigate("/terms-of-service")} />
          <SettingRow icon={BarChart3} label="Creator Monetization Policy" actionLabel="Read" onClick={() => navigate("/creator-monetization-policy")} />
          <SettingRow icon={FileText} label="Cookie Policy" actionLabel="View" onClick={() => navigate("/cookie-policy")} />
          <SettingRow icon={FileText} label="Copyright Policy" actionLabel="View" onClick={() => navigate("/copyright-policy")} />
        </SettingsSection>

        <SettingsSection title="About" icon={Info}>
          <SettingRow icon={Info} label="About VibeBook" detail="Rwanda-based short-video platform" actionLabel="View" onClick={() => navigate("/about")} />
          <SettingRow icon={UserRound} label="Company Info" detail="Founder" value="Isaacson" />
          <SettingRow icon={Mail} label="Contact Email" detail="Official support" actionLabel="Email" onClick={() => { window.location.href = "mailto:gebmelody@gmail.com"; }} />
          <SettingRow icon={Globe2} label="Rwanda Location" detail="Operations base" value="Kigali, Rwanda" />
          <SettingRow icon={Smartphone} label="Version/App Info" detail="VibeBook social video platform" value="1.0" />
        </SettingsSection>
      </div>

      <div className="hidden">
        <form id="account-editor" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={saveProfile}>
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
          <div id="phone-editor" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
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

          <div id="password-editor" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-brand" />
              <h2 className="text-lg font-black text-navy">Account security</h2>
            </div>
            <div className="grid gap-3 text-sm font-semibold text-slate-600">
              <div className="rounded-lg bg-surface p-3">
                <p className="font-black text-navy">Password</p>
                <p className="mt-1 text-xs">Last account update: {securityDate(user?.updatedAt || user?.createdAt)}</p>
              </div>
              <div className="rounded-lg bg-surface p-3">
                <p className="font-black text-navy">Email</p>
                <p className="mt-1 text-xs">{user?.email ? `${user.email} - active` : "No email added"}</p>
              </div>
            </div>
            <button type="button" className="btn-primary mt-4 w-full" onClick={openPasswordModal}>
              Change Password
            </button>
            <button type="button" className="btn-secondary mt-3 w-full" onClick={openEmailModal}>
              Change Email
            </button>
          </div>

          <div id="privacy-controls" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
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

          <div id="notification-controls" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
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

          <div id="blocked-accounts" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
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
            <div id="session-controls" className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
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

      {authModal === "manage" && (
        <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true">
          <form className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg" onSubmit={saveProfile}>
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Auth & Account Security</p>
                <h2 className="text-lg font-black text-navy">Manage Account</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-slate-600" onClick={closeAuthModal} aria-label="Close manage account">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <h3 className="text-sm font-black uppercase tracking-wide text-navy">Account sign-in</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Update the credentials people use to find or access this account.</p>
                </div>
                <SettingRow icon={UserRound} label="Username" detail={`@${user?.username || profileForm.username || "creator"}`} actionLabel="Edit" onClick={openUsernameModal} />
                <SettingRow icon={KeyRound} label="Password" detail={`Last account update: ${securityDate(user?.updatedAt || user?.createdAt)}`} actionLabel="Change" onClick={openPasswordModal} />
                <SettingRow icon={Mail} label="Email" detail={user?.email || "No email added"} actionLabel={emailVerificationLabel} onClick={openEmailModal} />
                <SettingRow icon={Phone} label="Phone Number" detail={phoneDisplay} actionLabel={phoneVerificationLabel} onClick={openPhoneModal} />
                <SettingRow icon={ShieldCheck} label="Verification Status" detail="Creator and identity review" value={verificationStatus} />
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <img src={profileImage} alt="" className="h-20 w-20 shrink-0 rounded-full bg-slate-100 object-cover ring-4 ring-slate-100" />
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-wide text-brand">Profile identity</p>
                      <h3 className="truncate text-xl font-black text-navy">{profileForm.name || user?.name || "Profile"}</h3>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-500">@{user?.username || profileForm.username || "creator"}</p>
                    </div>
                  </div>
                  <button type="button" className="btn-secondary gap-2 px-4 py-2.5" onClick={openProfileUpload}>
                    <Camera className="h-4 w-4" />
                    Profile image
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="label">Display name</span>
                    <input className="field" value={profileForm.name} onChange={(event) => updateProfileField("name", event.target.value)} required />
                  </label>

                  <label className="space-y-2">
                    <span className="label">Birthday</span>
                    <input className="field" type="date" value={profileForm.birthday} onChange={(event) => updateProfileField("birthday", event.target.value)} />
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
                    <span className="label">Website</span>
                    <input className="field" value={profileForm.website} onChange={(event) => updateSocialField("website", event.target.value)} placeholder="https://..." />
                  </label>

                  <label className="space-y-2 md:col-span-2">
                    <span className="label">Bio</span>
                    <textarea
                      className="field min-h-24 resize-y"
                      value={profileForm.bio}
                      onChange={(event) => updateProfileField("bio", event.target.value)}
                      maxLength={200}
                      placeholder="Tell people what you make or love watching."
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-black uppercase tracking-wide text-navy">Public information</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Creator categories, links, and profile visuals shown on your public page.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="label">Categories</span>
                    <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
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

                  <label className="block space-y-2">
                    <span className="label">Cover image URL</span>
                    <div className="relative">
                      <ImagePlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input className="field pl-10" value={profileForm.coverImage} onChange={(event) => updateProfileField("coverImage", event.target.value)} placeholder="Cloudinary image URL" />
                    </div>
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    {["instagram", "tiktok", "youtube", "x"].map((field) => (
                      <label key={field} className="space-y-2">
                        <span className="label capitalize">{field === "x" ? "X" : field}</span>
                        <input className="field" value={profileForm.socialLinks[field]} onChange={(event) => updateSocialField(field, event.target.value)} placeholder={`@${field}`} />
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <div className="flex gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" className="btn-secondary flex-1" onClick={closeAuthModal}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving === "profile"}>
                {saving === "profile" ? "Saving..." : "Save Public Identity"}
              </button>
            </div>
          </form>
        </div>
      )}

      {authModal === "username" && (
        <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true">
          <form className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg" onSubmit={handleUsernameSave}>
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Public handle</p>
                <h2 className="text-lg font-black text-navy">Edit Username</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-slate-600" onClick={closeAuthModal} aria-label="Close username editor">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              {authFlowError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{authFlowError}</div>}

              <div className="rounded-lg bg-surface p-4 text-center">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Your profile link</p>
                <p className="mt-1 truncate text-xl font-black text-navy">@{cleanUsername(usernameFlow.value) || "username"}</p>
              </div>

              <label className="block space-y-2">
                <span className="label">Username</span>
                <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                  <span className="flex items-center px-3 text-sm font-black text-slate-400">@</span>
                  <input
                    className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                    value={usernameFlow.value}
                    onChange={(event) => setUsernameFlow((current) => ({ ...current, value: cleanUsername(event.target.value), message: "" }))}
                    autoCapitalize="none"
                    autoComplete="username"
                    spellCheck="false"
                    required
                  />
                </div>
              </label>

              <div
                className={`rounded-lg border p-3 text-sm font-semibold ${
                  usernameFlow.status === "available"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : usernameFlow.status === "checking"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : usernameFlow.status === "current"
                        ? "border-slate-200 bg-slate-50 text-slate-600"
                        : usernameFlow.status === "invalid" || usernameFlow.status === "taken"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {usernameFlow.message || "Use 3-30 lowercase letters, numbers, underscores, or hyphens."}
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="button" className="btn-secondary flex-1" onClick={closeAuthModal}>
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving === "username" || !usernameCanSave}>
                {saving === "username" ? "Saving..." : "Save Username"}
              </button>
            </div>
          </form>
        </div>
      )}

      {authModal === "phone" && (
        <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Phone verification</p>
                <h2 className="text-lg font-black text-navy">Phone Number</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-slate-600" onClick={closeAuthModal} aria-label="Close phone verification">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              {phoneSuccess && (
                <div className="rounded-lg bg-green-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
                  <p className="mt-3 text-lg font-black text-navy">Phone verified</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Your VibeBook phone number is now trusted.</p>
                </div>
              )}

              <div className={`rounded-lg p-4 ${user?.phoneVerified ? "bg-green-50" : "bg-surface"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-navy">{phoneDisplay}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {phoneUnavailable ? "Verification service temporarily unavailable. Please try again." : user?.phoneVerified ? "Phone verification is active." : "Add a phone number and verify it with a code."}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${user?.phoneVerified ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                    {phoneVerificationLabel}
                  </span>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="space-y-2">
                  <span className="label">Country</span>
                  <select className="field" value={phoneForm.country} onChange={(event) => setPhoneCountry(event.target.value)}>
                    {PHONE_COUNTRIES.map((item) => (
                      <option key={item.country} value={item.country}>
                        {item.label} {item.country} {item.code}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="label">Phone number</span>
                  <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                    <span className="flex shrink-0 items-center px-3 text-sm font-black text-slate-600">{activeCountry.code}</span>
                    <input
                      className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                      inputMode="tel"
                      value={phoneForm.phoneNumber}
                      onChange={(event) => setPhoneForm((current) => ({ ...current, phoneNumber: cleanPhone(event.target.value) }))}
                      placeholder="7XX XXX XXX"
                    />
                  </div>
                </label>

                <button type="button" className="btn-secondary w-full" onClick={requestPhoneCode} disabled={saving === "phone" || cooldown > 0}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : saving === "phone" ? "Sending..." : "Send OTP"}
                </button>
              </div>

              {phoneUnavailable ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                  Verification service temporarily unavailable. Please try again.
                </div>
              ) : (
                <form className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={verifyPhone}>
                  <label className="block space-y-2">
                    <span className="label">Verification code</span>
                    <input
                      className="field text-center text-lg font-black tracking-[0.35em]"
                      inputMode="numeric"
                      maxLength={6}
                      value={phoneCode}
                      onChange={(event) => setPhoneCode(cleanPhone(event.target.value).slice(0, 6))}
                      placeholder="000000"
                      autoFocus
                      required
                    />
                  </label>
                  <button type="submit" className="btn-primary w-full" disabled={saving === "verify-phone"}>
                    {saving === "verify-phone" ? "Verifying..." : "Verify Phone"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {authModal === "password" && (
        <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true">
          <form className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg" onSubmit={handlePasswordFlow}>
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Secure change</p>
                <h2 className="text-lg font-black text-navy">Change Password</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-slate-600" onClick={closeAuthModal} aria-label="Close password flow">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((step) => (
                  <span key={step} className={`h-1.5 rounded-full ${passwordFlow.step >= step ? "bg-brand" : "bg-slate-200"}`} />
                ))}
              </div>

              {authFlowError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{authFlowError}</div>}

              {passwordFlow.step === 1 && (
                <label className="block space-y-2">
                  <span className="label">Current password</span>
                  <input className="field" type="password" value={passwordFlow.currentPassword} onChange={(event) => setPasswordFlow((current) => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" required />
                </label>
              )}

              {passwordFlow.step === 2 && (
                <div className="space-y-3">
                  <label className="block space-y-2">
                    <span className="label">New password</span>
                    <input className="field" type="password" minLength="8" value={passwordFlow.newPassword} onChange={(event) => setPasswordFlow((current) => ({ ...current, newPassword: event.target.value }))} autoComplete="new-password" required />
                  </label>
                  <div>
                    <div className="flex items-center justify-between text-xs font-black text-slate-500">
                      <span>Password strength</span>
                      <span>{passwordStrengthLabel}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1">
                      {[1, 2, 3, 4].map((score) => (
                        <span key={score} className={`h-2 rounded-full ${passwordStrength >= score ? "bg-brand" : "bg-slate-200"}`} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {passwordFlow.step === 3 && (
                <label className="block space-y-2">
                  <span className="label">Confirm new password</span>
                  <input className="field" type="password" value={passwordFlow.confirmPassword} onChange={(event) => setPasswordFlow((current) => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" required />
                </label>
              )}

              {passwordFlow.step === 4 && (
                <div className="rounded-lg bg-green-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
                  <p className="mt-3 text-lg font-black text-navy">Password updated</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Your current session remains active.</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {passwordFlow.step > 1 && passwordFlow.step < 4 && (
                <button type="button" className="btn-secondary flex-1" onClick={() => setPasswordFlow((current) => ({ ...current, step: Math.max(1, current.step - 1) }))}>
                  Back
                </button>
              )}
              {passwordFlow.step === 4 ? (
                <button type="button" className="btn-primary flex-1" onClick={closeAuthModal}>
                  Done
                </button>
              ) : (
                <button type="submit" className="btn-primary flex-1" disabled={Boolean(saving)}>
                  {saving ? "Checking..." : passwordFlow.step === 1 ? "Verify" : passwordFlow.step === 2 ? "Continue" : "Save Password"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {authModal === "email" && (
        <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true">
          <form className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg" onSubmit={handleEmailFlow}>
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Secure email verification</p>
                <h2 className="text-lg font-black text-navy">{user?.emailVerified ? "Change Email" : "Verify Email"}</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-slate-600" onClick={closeAuthModal} aria-label="Close email flow">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((step) => (
                  <span key={step} className={`h-1.5 rounded-full ${emailFlow.step >= step ? "bg-brand" : "bg-slate-200"}`} />
                ))}
              </div>

              {authFlowError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{authFlowError}</div>}

              {emailFlow.step === 1 && (
                <label className="block space-y-2">
                  <span className="label">Current password</span>
                  <input className="field" type="password" value={emailFlow.currentPassword} onChange={(event) => setEmailFlow((current) => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" required />
                </label>
              )}

              {emailFlow.step === 2 && (
                <label className="block space-y-2">
                  <span className="label">{user?.emailVerified ? "New email" : "Email address"}</span>
                  <input className="field" type="email" value={emailFlow.newEmail} onChange={(event) => setEmailFlow((current) => ({ ...current, newEmail: event.target.value.trim().toLowerCase() }))} placeholder="you@example.com" autoComplete="email" required />
                  <span className="block text-xs font-semibold text-slate-500">We will send a 6-digit VibeBook code to this inbox.</span>
                </label>
              )}

              {emailFlow.step === 3 && (
                <div className="space-y-3">
                  <label className="block space-y-2">
                    <span className="label">Verification code</span>
                    <input className="field text-center text-lg font-black tracking-[0.35em]" inputMode="numeric" value={emailFlow.code} onChange={(event) => setEmailFlow((current) => ({ ...current, code: event.target.value.replace(/[^\d]/g, "").slice(0, 6) }))} placeholder="000000" autoFocus required />
                    <span className="block text-xs font-semibold text-slate-500">Enter the 6-digit code sent to {emailFlow.newEmail}. Codes expire after 5 minutes.</span>
                  </label>
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => requestEmailCode(emailFlow.newEmail).catch((requestError) => setAuthFlowError(verificationErrorMessage(requestError, "Unable to resend code.")))}
                    disabled={emailFlow.cooldown > 0 || Boolean(saving)}
                  >
                    {emailFlow.cooldown > 0 ? `Resend in ${emailFlow.cooldown}s` : "Resend code"}
                  </button>
                </div>
              )}

              {emailFlow.step === 4 && (
                <div className="rounded-lg bg-blue-50 p-5 text-center">
                  <Mail className="mx-auto h-10 w-10 text-blue-600" />
                  <p className="mt-3 text-lg font-black text-navy">Verifying email</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Checking your one-time code securely.</p>
                </div>
              )}

              {emailFlow.step === 5 && (
                <div className="rounded-lg bg-green-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
                  <p className="mt-3 text-lg font-black text-navy">Email verified</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Your VibeBook email is now trusted for account recovery.</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {emailFlow.step > 1 && emailFlow.step < 5 && emailFlow.step !== 4 && (
                <button type="button" className="btn-secondary flex-1" onClick={() => setEmailFlow((current) => ({ ...current, step: Math.max(1, current.step - 1) }))}>
                  Back
                </button>
              )}
              {emailFlow.step === 5 ? (
                <button type="button" className="btn-primary flex-1" onClick={closeAuthModal}>
                  Done
                </button>
              ) : (
                <button type="submit" className="btn-primary flex-1" disabled={Boolean(saving) || emailFlow.step === 4}>
                  {saving ? (emailFlow.step === 4 ? "Verifying..." : "Checking...") : emailFlow.step === 1 ? "Verify Password" : emailFlow.step === 2 ? "Send Code" : "Verify Email"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {authModal === "sessions" && (
        <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-brand">Security</p>
                <h2 className="text-lg font-black text-navy">Login Sessions</h2>
              </div>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-slate-600" onClick={closeAuthModal} aria-label="Close sessions">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-slate-200 bg-surface p-4">
                <p className="text-sm font-black text-navy">Current session</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{sessionBrowser}</p>
                <p className="mt-2 text-xs font-semibold text-green-700">Active now</p>
              </div>
              <div className="grid gap-2 text-sm font-semibold text-slate-600">
                <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                  <span>Email</span>
                  <span className="font-black text-navy">{user?.email ? "Added" : "Not added"}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                  <span>Phone</span>
                  <span className="font-black text-navy">{user?.phoneVerified ? "Verified" : "Unverified"}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
                  <span>Password updated</span>
                  <span className="max-w-[10rem] truncate text-right text-xs font-black text-navy">{securityDate(user?.updatedAt || user?.createdAt)}</span>
                </div>
              </div>
              <button type="button" className="btn-secondary w-full" onClick={openPasswordModal}>
                Change Password
              </button>
              <button type="button" className="btn-primary w-full" onClick={handleLogout}>
                Sign out this device
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Settings;
