// @ts-nocheck
import { BadgeCheck, Camera, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { GENDER_OPTIONS } from "../constants/profile";
import { useAuth } from "../context/AuthContext.jsx";

const PHONE_COUNTRIES = [
  { country: "Rwanda", code: "+250", flag: "🇷🇼" },
  { country: "Uganda", code: "+256", flag: "🇺🇬" },
  { country: "Kenya", code: "+254", flag: "🇰🇪" },
  { country: "Tanzania", code: "+255", flag: "🇹🇿" },
  { country: "Burundi", code: "+257", flag: "🇧🇮" },
  { country: "DR Congo", code: "+243", flag: "🇨🇩" },
  { country: "International", code: "+", flag: "🌐" },
];

const initialForm = {
  name: "",
  username: "",
  contactMethod: "email",
  email: "",
  password: "",
  birthday: "",
  gender: "",
  country: "Rwanda",
  countryCode: "+250",
  phoneNumber: "",
  profilePicture: "",
  bio: "",
  acceptedTerms: false,
};

const cleanUsername = (value = "") => value.trim().replace(/^@+/, "").replace(/\s+/g, "_").toLowerCase();
const cleanPhone = (value = "") => value.replace(/[^\d]/g, "");

const Register = () => {
  const { isAuthenticated, register, sendPhoneCode, verifyPhoneCode } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [phoneVerification, setPhoneVerification] = useState({ open: false, code: "", cooldown: 0, expiresAt: "", localCode: "" });
  const navigate = useNavigate();

  const selectedCountry = useMemo(
    () => PHONE_COUNTRIES.find((item) => item.country === form.country) || PHONE_COUNTRIES[0],
    [form.country]
  );

  useEffect(() => {
    if (!phoneVerification.open || phoneVerification.cooldown <= 0) {
      return undefined;
    }

    const timer = setInterval(() => {
      setPhoneVerification((current) => ({ ...current, cooldown: Math.max(0, Number(current.cooldown || 0) - 1) }));
    }, 1000);

    return () => clearInterval(timer);
  }, [phoneVerification.open, phoneVerification.cooldown]);

  if (isAuthenticated && !phoneVerification.open) {
    return <Navigate to="/dashboard" replace />;
  }

  const updateField = (name, value) => {
    setForm((current) => {
      if (name === "country") {
        const country = PHONE_COUNTRIES.find((item) => item.country === value) || PHONE_COUNTRIES[0];
        return { ...current, country: country.country, countryCode: country.code };
      }

      if (name === "username") {
        return { ...current, username: cleanUsername(value) };
      }

      if (name === "phoneNumber") {
        return { ...current, phoneNumber: cleanPhone(value) };
      }

      return { ...current, [name]: value };
    });
  };

  const validateStep = () => {
    if (step === 1) {
      if (!form.name.trim() || !form.username.trim() || !form.password) {
        return "Name, username, and password are required.";
      }

      if (form.username.length < 3) {
        return "Username must be at least 3 characters.";
      }

      if (form.contactMethod === "email" && !form.email.trim()) {
        return "Email is required.";
      }

      if (form.contactMethod === "phone" && !form.phoneNumber.trim()) {
        return "Phone number is required.";
      }

      if (form.password.length < 6) {
        return "Password must be at least 6 characters.";
      }
    }

    if (step === 2 && !form.birthday) {
      return "Birthday is required.";
    }

    return "";
  };

  const goNext = () => {
    const message = validateStep();
    setError(message);

    if (!message) {
      setStep((current) => Math.min(3, current + 1));
    }
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
      }));
      setStatus(data.code ? `Local verification code: ${data.code}` : "Verification code sent.");
    } catch (requestError) {
      const retryAfter = requestError.response?.data?.retryAfterSeconds;
      setPhoneVerification((current) => ({ ...current, open: true, cooldown: Number(retryAfter || current.cooldown || 0) }));
      setError(requestError.response?.data?.message || "Unable to send verification code.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = validateStep();
    setError(message);
    setSuggestions([]);

    if (message) {
      return;
    }

    setSubmitting(true);

    try {
      await register({
        name: form.name.trim(),
        username: cleanUsername(form.username),
        email: form.contactMethod === "email" ? form.email.trim().toLowerCase() : "",
        password: form.password,
        birthday: form.birthday,
        gender: form.gender,
        country: form.country,
        countryCode: form.countryCode,
        phoneNumber: form.phoneNumber,
        phone: form.phoneNumber ? `${form.countryCode}${form.phoneNumber}` : "",
        profilePicture: form.profilePicture.trim(),
        bio: form.bio.trim(),
        acceptedTerms: form.acceptedTerms,
        referralCode: searchParams.get("ref") || "",
      });

      if (form.phoneNumber) {
        setPhoneVerification((current) => ({ ...current, open: true }));
        await sendVerificationCode();
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Registration failed. Please review your details.");
      setSuggestions(requestError.response?.data?.suggestions || []);
      setStep(1);
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
      setError(requestError.response?.data?.message || "Unable to verify phone.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container-page flex min-h-[78vh] items-center justify-center py-6 sm:py-10">
      <div className="w-full max-w-xs overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft md:max-w-2xl">
        <div className="border-b border-slate-100 bg-slate-950 p-5 text-white sm:p-6">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-1 text-xs font-black uppercase text-navy">
            <ShieldCheck className="h-4 w-4" />
            Join VibeBook
          </p>
          <h1 className="mt-4 text-2xl font-black leading-tight md:text-3xl">Create your social profile</h1>
          <p className="mt-2 text-sm text-white/70">Set up your identity, choose how people find you, and start watching or posting.</p>
        </div>

        <div className="grid grid-cols-3 border-b border-slate-100 text-center text-[11px] font-black text-slate-500 md:text-xs">
          {["Account", "About", "Profile"].map((item, index) => (
            <button
              key={item}
              type="button"
              className={`px-1 py-3 md:px-3 ${step === index + 1 ? "bg-brand/10 text-navy" : ""}`}
              onClick={() => setStep(index + 1)}
            >
              {index + 1}. {item}
            </button>
          ))}
        </div>

        <form className="p-5 sm:p-6" onSubmit={handleSubmit}>
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {status && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}

          {suggestions.length > 0 && (
            <div className="mb-4 rounded-lg bg-surface p-3 text-sm text-slate-600">
              <span className="font-bold text-navy">Try:</span>{" "}
              {suggestions.map((item) => (
                <button key={item} type="button" className="mr-2 font-bold text-brand" onClick={() => updateField("username", item)}>
                  @{item}
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="label">Name</span>
                <input className="field" name="name" value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
              </label>

              <label className="space-y-2">
                <span className="label">Username</span>
                <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                  <span className="flex items-center px-3 text-sm font-black text-slate-400">@</span>
                  <input
                    className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                    name="username"
                    value={form.username}
                    onChange={(event) => updateField("username", event.target.value)}
                    placeholder="vibebook_user"
                    required
                  />
                </div>
              </label>

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface p-1">
                {[
                  { value: "email", label: "Email" },
                  { value: "phone", label: "Phone" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`rounded-lg px-4 py-3 text-sm font-black ${form.contactMethod === item.value ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}
                    onClick={() => updateField("contactMethod", item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {form.contactMethod === "email" ? (
                <label className="space-y-2">
                  <span className="label">Email</span>
                  <input className="field" type="email" name="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
                </label>
              ) : (
                <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
                  <label className="space-y-2">
                    <span className="label">Country</span>
                    <select className="field" value={form.country} onChange={(event) => updateField("country", event.target.value)}>
                      {PHONE_COUNTRIES.map((item) => (
                        <option key={item.country} value={item.country}>
                          {item.flag} {item.country} {item.code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="label">Phone number</span>
                    <div className="flex rounded-lg border border-slate-200 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                      <span className="flex shrink-0 items-center gap-1 px-3 text-sm font-black text-slate-600">
                        <Phone className="h-4 w-4" />
                        {form.countryCode}
                      </span>
                      <input
                        className="min-w-0 flex-1 rounded-lg border-0 px-0 py-3 pr-3 text-sm text-slate-900 outline-none"
                        inputMode="tel"
                        name="phoneNumber"
                        value={form.phoneNumber}
                        onChange={(event) => updateField("phoneNumber", event.target.value)}
                        required
                      />
                    </div>
                  </label>
                </div>
              )}

              <label className="space-y-2">
                <span className="label">Password</span>
                <input
                  className="field"
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  minLength={6}
                  required
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="label">Birthday</span>
                <input className="field" type="date" name="birthday" value={form.birthday} onChange={(event) => updateField("birthday", event.target.value)} required />
              </label>

              <label className="space-y-2">
                <span className="label">Gender (optional)</span>
                <select className="field" name="gender" value={form.gender} onChange={(event) => updateField("gender", event.target.value)}>
                  <option value="">Prefer not to say</option>
                  {GENDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="label">Country</span>
                <select className="field" value={form.country} onChange={(event) => updateField("country", event.target.value)}>
                  {PHONE_COUNTRIES.map((item) => (
                    <option key={item.country} value={item.country}>
                      {item.flag} {item.country}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4">
              <div className="rounded-lg border border-dashed border-slate-300 bg-surface p-5 text-center">
                <Camera className="mx-auto h-8 w-8 text-slate-400" />
                <h2 className="mt-3 text-base font-black text-navy">Profile picture is optional</h2>
                <p className="mt-1 text-sm text-slate-500">You can add or replace it later from your profile.</p>
              </div>

              <label className="space-y-2">
                <span className="label">Profile picture URL (optional)</span>
                <input className="field" name="profilePicture" value={form.profilePicture} onChange={(event) => updateField("profilePicture", event.target.value)} placeholder="https://..." />
              </label>

              <label className="space-y-2">
                <span className="label">Bio (optional)</span>
                <textarea
                  className="field min-h-28 resize-y"
                  name="bio"
                  value={form.bio}
                  onChange={(event) => updateField("bio", event.target.value)}
                  maxLength={200}
                  placeholder="Tell people what you create or love watching."
                />
              </label>

              <label className="flex items-start gap-3 rounded-lg bg-surface p-4">
                <input
                  className="mt-1 h-4 w-4 accent-brand"
                  type="checkbox"
                  name="acceptedTerms"
                  checked={form.acceptedTerms}
                  onChange={(event) => updateField("acceptedTerms", event.target.checked)}
                  required
                />
                <span className="text-sm text-slate-600">I agree to create an authentic VibeBook account and follow the community guidelines.</span>
              </label>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn-secondary px-4 py-2.5"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              disabled={step === 1 || submitting}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            {step < 3 ? (
              <button type="button" className="btn-primary px-4 py-2.5" onClick={goNext}>
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="submit" className="btn-primary px-4 py-2.5" disabled={submitting || !form.acceptedTerms}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                {submitting ? "Creating..." : "Create account"}
              </button>
            )}
          </div>
        </form>

        <p className="border-t border-slate-100 p-5 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="font-bold text-brand">
            Login
          </Link>
        </p>
      </div>

      {phoneVerification.open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
          <form className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl" onSubmit={handleVerifyPhone}>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-navy">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-black text-navy">Verify your phone</h2>
                <p className="text-sm text-slate-500">
                  Code sent to {selectedCountry.flag} {form.countryCode} {form.phoneNumber}
                </p>
              </div>
            </div>

            {status && <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
            {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <label className="space-y-2">
              <span className="label">6-digit code</span>
              <input
                className="field text-center text-2xl font-black tracking-[0.4em]"
                inputMode="numeric"
                maxLength={6}
                value={phoneVerification.code}
                onChange={(event) => setPhoneVerification((current) => ({ ...current, code: cleanPhone(event.target.value).slice(0, 6) }))}
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
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              onClick={sendVerificationCode}
              disabled={phoneVerification.cooldown > 0}
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
