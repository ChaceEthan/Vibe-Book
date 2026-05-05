// @ts-nocheck
import { MapPin, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { GENDER_OPTIONS, PROFILE_CATEGORIES } from "../constants/profile";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { mediaUrl } from "../services/api";

const initialForm = () => ({
  name: "",
  gender: "",
  category: "Modern Dance",
  price: "",
  location: "",
  availability: "available",
});

const Dashboard = () => {
  const { user, refreshProfile, updateProfile } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const profileImage = mediaUrl(user?.profilePicture || user?.profileImage || user?.images?.[0] || "");

  useEffect(() => {
    refreshProfile().catch(() => undefined);
  }, [refreshProfile]);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        gender: user.gender || "",
        category: user.category || "Modern Dance",
        price: user.price || "",
        location: user.location || user.district || user.province || "",
        availability: user.availability || "available",
      });
    }
  }, [user]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");

    if (!form.name.trim() || !form.category || !form.availability) {
      setError("Name, category, and availability are required.");
      setSaving(false);
      return;
    }

    try {
      await updateProfile({
        ...form,
        price: form.price ? Number(form.price) : 0,
      });
      await refreshProfile();
      setStatus(t("profileUpdated"));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Profile update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="container-page py-6 sm:py-10">
      <div className="mb-6 rounded-lg bg-navy p-5 text-white shadow-soft">
        <div className="flex items-center gap-4">
          <img src={profileImage} alt="" className="h-20 w-20 shrink-0 rounded-full bg-white/10 object-cover ring-4 ring-white/10" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-brand">{premiumActive ? t("premium") : t("free")}</p>
            <h1 className="truncate text-2xl font-black">{user?.name || "Dashboard"}</h1>
            <p className="mt-1 text-sm text-slate-300">{user?.category || "Complete your profile"}</p>
          </div>
        </div>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={handleSubmit}>
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-navy">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
          <h2 className="text-xl font-black text-navy">Profile details</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="label">{t("name")}</span>
            <input className="field" name="name" value={form.name} onChange={handleChange} />
          </label>

          <label className="space-y-2">
            <span className="label">{t("category")}</span>
            <select className="field" name="category" value={form.category} onChange={handleChange}>
              {PROFILE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="label">{t("gender")}</span>
            <select className="field" name="gender" value={form.gender} onChange={handleChange}>
              <option value="">Select gender</option>
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="label">Starting price</span>
            <input className="field" type="number" min="0" name="price" value={form.price} onChange={handleChange} />
          </label>

          <label className="space-y-2">
            <span className="label">{t("location")}</span>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="field pl-10" name="location" value={form.location} onChange={handleChange} />
            </div>
          </label>

          <label className="space-y-2">
            <span className="label">{t("availability")}</span>
            <select className="field" name="availability" value={form.availability} onChange={handleChange}>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </label>
        </div>

        <button type="submit" className="btn-primary mt-5 w-full" disabled={saving}>
          {saving ? t("saving") : t("saveProfile")}
        </button>
      </form>
    </section>
  );
};

export default Dashboard;
