// @ts-nocheck
import {
  AtSign,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

const statusClass = (status) => {
  if (status === "available") return "text-green-700";
  if (status === "taken" || status === "invalid") return "text-red-700";
  if (status === "checking") return "text-slate-500";
  return "text-slate-500";
};

const verificationErrorMessage = (requestError, fallback = "Verification is temporarily unavailable.") => {
  const reason = requestError?.response?.data?.reason || "";
  const message = requestError?.response?.data?.message || requestError?.message || "";

  if (reason === "SMS_PROVIDER_NOT_CONFIGURED") return "Phone verification coming soon.";
  if (reason === "SMTP_NOT_CONFIGURED") return "Email verification is temporarily unavailable. Please contact support.";
  if (reason === "SMTP_AUTH_FAILED") return "Email delivery is unavailable. Please contact support.";
  if (message) return message;
  return fallback;
};

const ValidationLine = ({ state }) => {
  if (!state?.message) return null;

  return <p className={`mt-1 text-xs font-semibold ${statusClass(state.status)}`}>{state.message}</p>;
};

const Register = () => {
  const { isAuthenticated, register, sendEmailCode, sendPhoneCode, verifyEmailCode, verifyPhoneCode } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState(emptyAvailability);
  const [emailVerification, setEmailVerification] = useState({ open: false, code: "", cooldown: 0, expiresAt: "", localCode: "" });
  const [phoneVerification, setPhoneVerification] = useState({ open: false, code: "", cooldown: 0, expiresAt: "", localCode: "", unavailable: false });
  const navigate = useNavigate();

  const selectedCountry = useMemo(
    () => PHONE_COUNTRIES.find((item) => item.country === form.country) || PHONE_COUNTRIES[0],
    [form.country]
  );

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

  useEffect(() => {
    if (!emailVerification.open || emailVerification.cooldown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setEmailVerification((current) => ({ ...current, cooldown: Math.max(0, Number(current.cooldown || 0) - 1) }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [emailVerification.open, emailVerification.cooldown]);

  useEffect(() => {
    if (!phoneVerification.open || phoneVerification.cooldown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setPhoneVerification((current) => ({ ...current, cooldown: Math.max(0, Number(current.cooldown || 0) - 1) }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phoneVerification.open, phoneVerification.cooldown]);

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

  if (isAuthenticated && !phoneVerification.open && !emailVerification.open) {
    return <Navigate to="/dashboard" replace />;
  }

  const updateField = (name, value) => {
    setError("");
    setStatus("");

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

      return { ...current, [name]: value };
    });
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

  const sendVerificationCode = async () => {
    setStatus("");
    setError("");

    try {
      const data = await sendPhoneCode({
        country: form.country,
        countryCode: form.countryCode,
        phoneNumber: form.phoneNumber,
      });
      setPhoneVerification((current) => ({
        ...current,
        open: true,
        cooldown: Number(data.cooldownSeconds || 60),
        expiresAt: data.expiresAt || "",
        localCode: data.code || "",
        unavailable: false,
      }));
      setStatus(data.code ? `Local verification code: ${data.code}` : "Verification code sent.");
    } catch (requestError) {
      const retryAfter = requestError.response?.data?.retryAfterSeconds;
      setPhoneVerification((current) => ({
        ...current,
        open: true,
        cooldown: Number(retryAfter || current.cooldown || 0),
        unavailable: requestError.response?.data?.reason === "SMS_PROVIDER_NOT_CONFIGURED",
      }));
      setError(verificationErrorMessage(requestError, "Unable to send verification code."));
    }
  };

  const sendEmailVerificationCode = async () => {
    setStatus("");
    setError("");

    try {
      const data = await sendEmailCode({ email: form.email.trim().toLowerCase() });
      setEmailVerification((current) => ({
        ...current,
        open: true,
        cooldown: Number(data.cooldownSeconds || 60),
        expiresAt: data.expiresAt || "",
        localCode: data.code || "",
      }));
      setStatus(data.code ? `Local verification code: ${data.code}` : "Verification code sent to your email.");
    } catch (requestError) {
      const retryAfter = requestError.response?.data?.retryAfterSeconds;
      setEmailVerification((current) => ({ ...current, open: true, cooldown: Number(retryAfter || current.cooldown || 0) }));
      setError(verificationErrorMessage(requestError, "Unable to send email verification code."));
    }
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

    if (usesPhone) {
      setPhoneVerification((current) => ({ ...current, open: true, unavailable: false }));
    } else {
      setEmailVerification((current) => ({ ...current, open: true }));
    }

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
        referralCode: searchParams.get("ref") || "",
      });

      if (usesPhone) {
        await sendVerificationCode();
      } else {
        await sendEmailVerificationCode();
      }
    } catch (requestError) {
      setPhoneVerification((current) => ({ ...current, open: false }));
      setEmailVerification((current) => ({ ...current, open: false }));
      setError(requestError.response?.data?.message || "Registration failed. Please review your details.");
      setSuggestions(requestError.response?.data?.suggestions || []);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyPhone = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await verifyPhoneCode({ code: phoneVerification.code });
      setPhoneVerification((current) => ({ ...current, open: false }));
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(verificationErrorMessage(requestError, "Unable to verify phone."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyEmail = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await verifyEmailCode({ code: emailVerification.code });
      setEmailVerification((current) => ({ ...current, open: false }));
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(verificationErrorMessage(requestError, "Unable to verify email."));
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

      {emailVerification.open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
          <form className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl" onSubmit={handleVerifyEmail}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-navy">
                <Mail className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-navy">Verify your email</h2>
                <p className="truncate text-sm text-slate-500">Code sent to {form.email.trim().toLowerCase()}</p>
              </div>
            </div>

            {status && <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
            {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <label className="space-y-2">
              <span className="label">6-digit code</span>
              <input
                className="field text-center text-2xl font-black tracking-[0.35em]"
                inputMode="numeric"
                maxLength={6}
                value={emailVerification.code}
                onChange={(event) => setEmailVerification((current) => ({ ...current, code: cleanPhone(event.target.value).slice(0, 6) }))}
                autoFocus
                required
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary py-2.5" onClick={() => navigate("/dashboard", { replace: true })}>
                Later
              </button>
              <button type="submit" className="btn-primary py-2.5" disabled={submitting}>
                {submitting ? "Checking..." : "Verify"}
              </button>
            </div>

            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              onClick={sendEmailVerificationCode}
              disabled={emailVerification.cooldown > 0}
            >
              <CheckCircle2 className="h-4 w-4" />
              {emailVerification.cooldown > 0 ? `Resend in ${emailVerification.cooldown}s` : "Resend code"}
            </button>
          </form>
        </div>
      )}

      {phoneVerification.open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
          <form className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl" onSubmit={handleVerifyPhone}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-navy">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-navy">Verify your phone</h2>
                <p className="truncate text-sm text-slate-500">
                  Code sent to {selectedCountry.code} {form.phoneNumber}
                </p>
              </div>
            </div>

            {status && <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
            {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            {phoneVerification.unavailable ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                Phone verification is coming soon. You can continue to VibeBook and verify later from Settings & Privacy.
              </div>
            ) : (
              <label className="space-y-2">
                <span className="label">6-digit code</span>
                <input
                  className="field text-center text-2xl font-black tracking-[0.35em]"
                  inputMode="numeric"
                  maxLength={6}
                  value={phoneVerification.code}
                  onChange={(event) => setPhoneVerification((current) => ({ ...current, code: cleanPhone(event.target.value).slice(0, 6) }))}
                  autoFocus
                  required
                />
              </label>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary py-2.5" onClick={() => navigate("/dashboard", { replace: true })}>
                Later
              </button>
              <button type="submit" className="btn-primary py-2.5" disabled={phoneVerification.unavailable || submitting}>
                {submitting ? "Checking..." : "Verify"}
              </button>
            </div>

            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              onClick={sendVerificationCode}
              disabled={phoneVerification.unavailable || phoneVerification.cooldown > 0}
            >
              <CheckCircle2 className="h-4 w-4" />
              {phoneVerification.cooldown > 0 ? `Resend in ${phoneVerification.cooldown}s` : "Resend code"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
};

export default Register;
