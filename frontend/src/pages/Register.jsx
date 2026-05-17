// @ts-nocheck
import {
  AtSign,
  CalendarDays,
  Camera,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  QrCode,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { authApi } from "../services/api";

const PHONE_COUNTRIES = [
  { country: "Rwanda", code: "+250" },
  { country: "Uganda", code: "+256" },
  { country: "Kenya", code: "+254" },
  { country: "Tanzania", code: "+255" },
  { country: "Burundi", code: "+257" },
  { country: "DR Congo", code: "+243" },
  { country: "International", code: "+" },
];

const initialForm = {
  username: "",
  contactMethod: "email",
  email: "",
  password: "",
  birthday: "",
  country: "Rwanda",
  countryCode: "+250",
  phoneNumber: "",
  referralCode: "",
};

const emptyAvailability = {
  username: { status: "idle", message: "" },
  email: { status: "idle", message: "" },
  phone: { status: "idle", message: "" },
};

const cleanUsername = (value = "") => value.trim().replace(/^@+/, "").replace(/\s+/g, "_").toLowerCase();
const cleanPhone = (value = "") => value.replace(/[^\d]/g, "");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9_][a-z0-9_-]{2,29}$/;
const isAbortError = (error) => error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError";
const today = () => new Date().toISOString().slice(0, 10);
const sanitizeReferralCode = (value = "") => String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
const extractReferralCode = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const paramMatch = raw.match(/[?&](?:ref|referralCode)=([^&#\s]+)/i) || raw.match(/^(?:ref|referralCode)=([^&#\s]+)/i);

  if (paramMatch?.[1]) {
    try {
      return sanitizeReferralCode(decodeURIComponent(paramMatch[1]));
    } catch {
      return sanitizeReferralCode(paramMatch[1]);
    }
  }

  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^www\./i.test(raw) || /^[\w.-]+\.[a-z]{2,}(?:[/:?]|$)/i.test(raw);

  if (looksLikeUrl) {
    try {
      const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
      const url = new URL(normalized);
      return sanitizeReferralCode(url.searchParams.get("ref") || url.searchParams.get("referralCode") || "");
    } catch {
      return "";
    }
  }

  return sanitizeReferralCode(raw.replace(/^#?ref(?:erralCode)?[:=\s-]*/i, ""));
};

const statusClass = (status) => {
  if (status === "available") return "text-green-700";
  if (status === "taken" || status === "invalid") return "text-red-700";
  if (status === "checking") return "text-slate-500";
  return "text-slate-500";
};

const ValidationLine = ({ state }) => {
  if (!state?.message) return null;

  return <p className={`mt-1 text-xs font-semibold ${statusClass(state.status)}`}>{state.message}</p>;
};

const Register = () => {
  const { isAuthenticated, register } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState(emptyAvailability);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [referralLocked, setReferralLocked] = useState(false);
  const [referralSource, setReferralSource] = useState("");
  const navigate = useNavigate();
  const referralParam = searchParams.get("ref") || searchParams.get("referralCode") || "";

  const contactValue = form.contactMethod === "email" ? form.email.trim().toLowerCase() : form.phoneNumber;
  const contactAvailability = form.contactMethod === "email" ? availability.email : availability.phone;
  const passwordState =
    form.password && form.password.length < 6
      ? { status: "invalid", message: "Weak password. Use at least 6 characters." }
      : form.password.length >= 6
        ? { status: "available", message: "Password looks usable." }
        : { status: "idle", message: "" };
  const birthdayState =
    form.birthday && form.birthday > today()
      ? { status: "invalid", message: "Birthday cannot be in the future." }
      : { status: "idle", message: "" };

  const canSubmit =
    cleanUsername(form.username) &&
    contactValue &&
    form.password.length >= 6 &&
    form.birthday &&
    birthdayState.status !== "invalid" &&
    availability.username.status !== "checking" &&
    availability.username.status !== "taken" &&
    availability.username.status !== "invalid" &&
    contactAvailability.status !== "checking" &&
    contactAvailability.status !== "taken" &&
    contactAvailability.status !== "invalid";

  const applyReferralCode = useCallback((value, source = "manual") => {
    const code = extractReferralCode(value);

    if (!code) {
      return false;
    }

    setForm((current) => ({ ...current, referralCode: code }));
    setReferralLocked(source !== "manual");
    setReferralSource(source);
    return true;
  }, []);

  useEffect(() => {
    const ref = extractReferralCode(referralParam);
    if (ref) {
      applyReferralCode(ref, "link");
      setStatus("Invite applied.");
    }
  }, [applyReferralCode, referralParam]);

  useEffect(() => {
    if (!scannerOpen) return undefined;

    let active = true;
    let started = false;
    const scanner = new Html5Qrcode("referral-qr-reader", {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });

    const stopScanner = async () => {
      try {
        if (started) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch {
        // Camera cleanup is best-effort.
      }
    };

    setScannerError("");

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (!active) {
          return undefined;
        }

        if (!Array.isArray(cameras) || !cameras.length) {
          throw new Error("NO_CAMERA");
        }

        const preferredCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label || "")) || cameras[0];

        return scanner
          .start(
            { deviceId: { exact: preferredCamera.id } },
            {
              fps: 10,
              aspectRatio: 1,
              qrbox: (width, height) => {
                const size = Math.floor(Math.min(width, height) * 0.72);
                return { width: Math.max(180, size), height: Math.max(180, size) };
              },
            },
            (decodedText) => {
              const applied = applyReferralCode(decodedText, "qr");

              if (!applied) {
                setScannerError("That QR code does not contain a VibeBook referral code.");
                return;
              }

              setStatus("Invite applied from QR.");
              setScannerError("");
              setScannerOpen(false);
            },
            () => undefined
          )
          .then(() => {
            started = true;
            if (!active) {
              stopScanner();
            }
          });
      })
      .catch((scanError) => {
        if (!active) {
          return;
        }

        setScannerError(
          scanError?.message === "NO_CAMERA"
            ? "No camera was found on this device."
            : "Camera permission is needed to scan a referral QR code."
        );
      });

    return () => {
      active = false;
      stopScanner();
    };
  }, [applyReferralCode, scannerOpen]);

  useEffect(() => {
    const username = cleanUsername(form.username);

    setSuggestions([]);

    if (!username) {
      setAvailability((current) => ({ ...current, username: { status: "idle", message: "" } }));
      return undefined;
    }

    if (!usernamePattern.test(username)) {
      setAvailability((current) => ({
        ...current,
        username: { status: "invalid", message: "Use 3-30 lowercase letters, numbers, hyphens, or underscores." },
      }));
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAvailability((current) => ({ ...current, username: { status: "checking", message: "Checking username..." } }));

      try {
        const { data } = await authApi.checkAvailability({ field: "username", value: username }, { signal: controller.signal });
        setAvailability((current) => ({
          ...current,
          username: { status: data.available ? "available" : "taken", message: data.message || "" },
        }));
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (requestError) {
        if (!isAbortError(requestError)) {
          setAvailability((current) => ({
            ...current,
            username: { status: "invalid", message: requestError.response?.data?.message || "Unable to check username." },
          }));
        }
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.username]);

  useEffect(() => {
    if (form.contactMethod !== "email") {
      setAvailability((current) => ({ ...current, email: { status: "idle", message: "" } }));
      return undefined;
    }

    const email = form.email.trim().toLowerCase();

    if (!email) {
      setAvailability((current) => ({ ...current, email: { status: "idle", message: "" } }));
      return undefined;
    }

    if (!emailPattern.test(email)) {
      setAvailability((current) => ({ ...current, email: { status: "invalid", message: "Invalid email address." } }));
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAvailability((current) => ({ ...current, email: { status: "checking", message: "Checking email..." } }));

      try {
        const { data } = await authApi.checkAvailability({ field: "email", value: email }, { signal: controller.signal });
        setAvailability((current) => ({
          ...current,
          email: { status: data.available ? "available" : "taken", message: data.message || "" },
        }));
      } catch (requestError) {
        if (!isAbortError(requestError)) {
          setAvailability((current) => ({
            ...current,
            email: { status: "invalid", message: requestError.response?.data?.message || "Unable to check email." },
          }));
        }
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.contactMethod, form.email]);

  useEffect(() => {
    if (form.contactMethod !== "phone") {
      setAvailability((current) => ({ ...current, phone: { status: "idle", message: "" } }));
      return undefined;
    }

    const phoneNumber = cleanPhone(form.phoneNumber);

    if (!phoneNumber) {
      setAvailability((current) => ({ ...current, phone: { status: "idle", message: "" } }));
      return undefined;
    }

    if (phoneNumber.length < 7 || phoneNumber.length > 15) {
      setAvailability((current) => ({ ...current, phone: { status: "invalid", message: "Invalid phone number." } }));
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAvailability((current) => ({ ...current, phone: { status: "checking", message: "Checking phone..." } }));

      try {
        const { data } = await authApi.checkAvailability(
          {
            field: "phone",
            value: phoneNumber,
            country: form.country,
            countryCode: form.countryCode,
          },
          { signal: controller.signal }
        );
        setAvailability((current) => ({
          ...current,
          phone: { status: data.available ? "available" : "taken", message: data.message || "" },
        }));
      } catch (requestError) {
        if (!isAbortError(requestError)) {
          setAvailability((current) => ({
            ...current,
            phone: { status: "invalid", message: requestError.response?.data?.message || "Unable to check phone." },
          }));
        }
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.contactMethod, form.country, form.countryCode, form.phoneNumber]);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const updateField = (name, value) => {
    setError("");
    setStatus("");
    const manualReferralCode = name === "referralCode" ? extractReferralCode(value).replace(/\s+/g, "") : "";

    if (name === "referralCode") {
      setReferralLocked(false);
      setReferralSource(manualReferralCode ? "manual" : "");
    }

    setForm((current) => {
      if (name === "country") {
        const country = PHONE_COUNTRIES.find((item) => item.country === value) || PHONE_COUNTRIES[0];
        return { ...current, country: country.country, countryCode: country.code };
      }

      if (name === "username") {
        return { ...current, username: cleanUsername(value) };
      }

      if (name === "email") {
        return { ...current, email: value.trim().toLowerCase() };
      }

      if (name === "phoneNumber") {
        return { ...current, phoneNumber: cleanPhone(value) };
      }

      if (name === "referralCode") {
        return { ...current, referralCode: manualReferralCode };
      }

      return { ...current, [name]: value };
    });
  };

  const clearReferralCode = () => {
    setError("");
    setStatus("");
    setReferralLocked(false);
    setReferralSource("");
    setForm((current) => ({ ...current, referralCode: "" }));
  };

  const validateForm = () => {
    const username = cleanUsername(form.username);

    if (!username) return "Username is required.";
    if (!usernamePattern.test(username)) return "Username must be 3-30 characters and use only lowercase letters, numbers, hyphens, or underscores.";
    if (availability.username.status === "taken") return "Username already taken.";

    if (form.contactMethod === "email") {
      const email = form.email.trim().toLowerCase();
      if (!email) return "Email is required.";
      if (!emailPattern.test(email)) return "Invalid email address.";
      if (availability.email.status === "taken") return "Email already exists.";
    } else {
      if (!form.phoneNumber) return "Phone number is required.";
      if (form.phoneNumber.length < 7 || form.phoneNumber.length > 15) return "Invalid phone number.";
      if (availability.phone.status === "taken") return "Phone already exists.";
    }

    if (form.password.length < 6) return "Weak password. Use at least 6 characters.";
    if (!form.birthday) return "Birthday is required.";
    if (form.birthday > today()) return "Birthday cannot be in the future.";

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = validateForm();
    setError(message);
    setSuggestions([]);

    if (message) {
      return;
    }

    const usesPhone = form.contactMethod === "phone";
    setSubmitting(true);

    try {
      await register({
        username: cleanUsername(form.username),
        email: form.contactMethod === "email" ? form.email.trim().toLowerCase() : "",
        password: form.password,
        birthday: form.birthday,
        country: usesPhone ? form.country : "",
        countryCode: usesPhone ? form.countryCode : "",
        phoneNumber: usesPhone ? form.phoneNumber : "",
        phone: usesPhone && form.phoneNumber ? `${form.countryCode}${form.phoneNumber}` : "",
        acceptedTerms: true,
        referralCode: form.referralCode,
      });
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Registration failed. Please review your details.");
      setSuggestions(requestError.response?.data?.suggestions || []);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container-page flex min-h-[78vh] items-center justify-center py-6 sm:py-10">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-100 bg-slate-950 p-5 text-white sm:p-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-black uppercase text-navy">
            <ShieldCheck className="h-4 w-4" />
            Join VibeBook
          </p>
          <h1 className="mt-4 text-2xl font-black leading-tight">Create your account</h1>
          <p className="mt-2 text-sm text-white/70">Start watching and posting in seconds.</p>
        </div>

        <form className="grid gap-4 p-5 sm:p-6" onSubmit={handleSubmit}>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          {status && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">{status}</div>}

          {suggestions.length > 0 && (
            <div className="rounded-lg bg-surface p-3 text-sm text-slate-600">
              <span className="font-bold text-navy">Try:</span>{" "}
              {suggestions.map((item) => (
                <button key={item} type="button" className="mr-2 font-bold text-brand" onClick={() => updateField("username", item)}>
                  @{item}
                </button>
              ))}
            </div>
          )}

          <label className="space-y-2">
            <span className="label">Username</span>
            <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <span className="flex items-center px-3 text-sm font-black text-slate-400">
                <AtSign className="h-4 w-4" />
              </span>
              <input
                className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                name="username"
                value={form.username}
                onChange={(event) => updateField("username", event.target.value)}
                placeholder="vibebook_user"
                autoComplete="username"
                required
              />
            </div>
            <ValidationLine state={availability.username} />
          </label>

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface p-1">
            {[
              { value: "email", label: "Email", icon: Mail },
              { value: "phone", label: "Phone", icon: Phone },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-black ${
                  form.contactMethod === value ? "bg-white text-navy shadow-sm" : "text-slate-500"
                }`}
                onClick={() => updateField("contactMethod", value)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {form.contactMethod === "email" ? (
            <label className="space-y-2">
              <span className="label">Email</span>
              <input
                className="field"
                type="email"
                name="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="Enter your email address"
                autoComplete="email"
                required
              />
              <ValidationLine state={availability.email} />
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
              <label className="space-y-2">
                <span className="label">Code</span>
                <select className="field" value={form.country} onChange={(event) => updateField("country", event.target.value)}>
                  {PHONE_COUNTRIES.map((item) => (
                    <option key={item.country} value={item.country}>
                      {item.country} {item.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="label">Phone</span>
                <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                  <span className="flex shrink-0 items-center px-3 text-sm font-black text-slate-600">{form.countryCode}</span>
                  <input
                    className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                    inputMode="tel"
                    name="phoneNumber"
                    value={form.phoneNumber}
                    onChange={(event) => updateField("phoneNumber", event.target.value)}
                    placeholder={form.countryCode === "+250" ? "+250 7XX XXX XXX" : "Enter your phone number"}
                    autoComplete="tel-national"
                    required
                  />
                </div>
                <ValidationLine state={availability.phone} />
              </label>
            </div>
          )}

          <label className="space-y-2">
            <span className="label">Password</span>
            <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <span className="flex items-center px-3 text-sm font-black text-slate-400">
                <LockKeyhole className="h-4 w-4" />
              </span>
              <input
                className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                type="password"
                name="password"
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
                minLength={6}
                autoComplete="new-password"
                required
              />
            </div>
            <ValidationLine state={passwordState} />
          </label>

          <label className="space-y-2">
            <span className="label">Birthday</span>
            <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <span className="flex items-center px-3 text-sm font-black text-slate-400">
                <CalendarDays className="h-4 w-4" />
              </span>
              <input
                className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                type="date"
                name="birthday"
                value={form.birthday}
                max={today()}
                onChange={(event) => updateField("birthday", event.target.value)}
                required
              />
            </div>
            <ValidationLine state={birthdayState} />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="label">Referral code</p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Optional invite reward code.</p>
              </div>
              {form.referralCode && referralSource !== "manual" ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-black uppercase text-green-700 dark:bg-green-500/15 dark:text-green-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {referralSource === "qr" ? "QR applied" : "Invite applied"}
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2">
              <div className="flex rounded-xl border border-slate-200 bg-white transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 dark:border-slate-700 dark:bg-slate-950">
                <input
                  className="min-w-0 flex-1 rounded-xl border-0 bg-transparent px-3 py-3 text-sm font-bold uppercase tracking-[0.08em] text-slate-900 outline-none placeholder:normal-case placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400 read-only:text-slate-600 dark:text-white dark:read-only:text-slate-300"
                  name="referralCode"
                  value={form.referralCode}
                  onChange={(event) => updateField("referralCode", event.target.value)}
                  placeholder="Optional invite code"
                  autoComplete="off"
                  readOnly={referralLocked}
                />
                {form.referralCode ? (
                  <button
                    type="button"
                    className="m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                    onClick={clearReferralCode}
                    aria-label="Remove referral code"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-navy transition hover:border-brand hover:bg-brand/10 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:border-brand"
                onClick={() => setScannerOpen(true)}
              >
                <QrCode className="h-4 w-4" />
                Scan referral QR
              </button>
            </div>
            {referralLocked ? (
              <p className="mt-2 text-xs font-semibold text-green-700 dark:text-green-300">This invite is preserved. Remove it to enter a different code.</p>
            ) : null}
          </div>

          <button type="submit" className="btn-primary mt-2 w-full py-3.5" disabled={submitting || !canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
            {submitting ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="border-t border-slate-100 p-5 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="font-bold text-brand">
            Login
          </Link>
        </p>
      </div>

      {scannerOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 p-3 sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0 p-4 pb-1">
                <h2 className="flex items-center gap-2 text-lg font-black text-navy dark:text-white">
                  <Camera className="h-5 w-5 text-brand" />
                  Scan referral QR
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Point the camera at a QR code that contains an invite code or referral link.</p>
              </div>
              <button
                type="button"
                className="mr-3 mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => setScannerOpen(false)}
                aria-label="Close scanner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pb-4">
              <div
                id="referral-qr-reader"
                className="min-h-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 text-white dark:border-slate-700"
              />
              {scannerError ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {scannerError}
                </div>
              ) : (
                <p className="mt-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">QR codes only. VibeBook will not open scanned links.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Register;
