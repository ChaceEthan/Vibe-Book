// @ts-nocheck
import { useEffect, useState } from "react";

import { GENDER_OPTIONS, PROFILE_CATEGORIES, TALENT_TYPES } from "../constants/profile";
import { RWANDA_PROVINCES, getDistrictsForProvince } from "../constants/rwanda";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { mediaUrl } from "../services/api";

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;

const initialForm = () => ({
  name: "",
  type: "single",
  gender: "",
  category: "Modern Dance",
  price: "",
  phone: "",
  whatsappNumber: "",
  province: "",
  district: "",
  location: "",
  availability: "available",
  bio: "",
});

const getVideoDuration = (file) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read video duration"));
    };
    video.src = url;
  });
};

const Dashboard = () => {
  const { user, refreshProfile, updateProfile, uploadProfileImages, uploadProfileVideos } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [selectedVideoFiles, setSelectedVideoFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const existingImages = Array.isArray(user?.images) ? user.images : [];
  const existingVideos = Array.isArray(user?.videoUrls) ? user.videoUrls : [];
  const districtOptions = getDistrictsForProvince(form.province);
  const hasProfile = Boolean(
    user?.bio || existingImages.length || existingVideos.length || user?.phone || user?.location || Number(user?.price || 0) > 0
  );

  useEffect(() => {
    refreshProfile().catch(() => undefined);
  }, [refreshProfile]);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        type: user.type || "single",
        gender: user.gender || "",
        category: user.category || "Modern Dance",
        price: user.price || "",
        phone: user.phone || "",
        whatsappNumber: user.whatsappNumber || user.socialLinks?.whatsapp || "",
        province: user.province || "",
        district: user.district || "",
        location: user.location || "",
        availability: user.availability || "available",
        bio: user.bio || "",
      });
    }
  }, [user]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "province" ? { district: "" } : {}),
    }));
  };

  const handleImageFiles = (event) => {
    const files = Array.from(event.target.files || []);
    setError("");

    if (!files.length) {
      setSelectedImageFiles([]);
      return;
    }

    if (!premiumActive && existingImages.length + files.length > MAX_IMAGES) {
      setError(`A profile can have a maximum of ${MAX_IMAGES} images.`);
      event.target.value = "";
      return;
    }

    const invalidFile = files.find((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE);

    if (invalidFile) {
      setError("Images must be valid image files under 5MB.");
      event.target.value = "";
      return;
    }

    setSelectedImageFiles(files);
  };

  const handleCopyReferral = async () => {
    if (!user?.referralLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(user.referralLink);
      setStatus("Referral link copied.");
    } catch {
      setError("Unable to copy referral link.");
    }
  };

  const handleVideoFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    setError("");

    if (!files.length) {
      setSelectedVideoFiles([]);
      return;
    }

    try {
      for (const file of files) {
        if (!["video/mp4", "video/quicktime"].includes(file.type) || file.size > MAX_VIDEO_SIZE) {
          throw new Error("Videos must be MP4 or MOV files under 50MB.");
        }

        const duration = await getVideoDuration(file);
        if (!duration || duration > MAX_VIDEO_SECONDS) {
          throw new Error("Videos must be 60 seconds or shorter.");
        }
      }

      setSelectedVideoFiles(files);
    } catch (validationError) {
      setSelectedVideoFiles([]);
      setError(validationError.message);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");

    if (!form.name.trim() || !form.category || !form.type || !form.availability) {
      setError("Name, category, type, and availability are required.");
      setSaving(false);
      return;
    }

    try {
      await updateProfile({
        ...form,
        price: form.price ? Number(form.price) : 0,
      });

      if (selectedImageFiles.length) {
        await uploadProfileImages(selectedImageFiles);
      }

      if (selectedVideoFiles.length) {
        await uploadProfileVideos(selectedVideoFiles);
      }

      setSelectedImageFiles([]);
      setSelectedVideoFiles([]);
      setStatus(t("profileUpdated"));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Profile update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="container-page py-10">
      <div className="mb-8 rounded-lg bg-navy p-6 text-white shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-brand">{t("dashboard")}</p>
            <h1 className="mt-2 text-3xl font-black">
              {t("welcome")}, {user?.name}
            </h1>
          </div>
          <span className="inline-flex w-fit rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase text-brand">
            {premiumActive ? t("premium") : t("free")}
          </span>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-slate-200 md:grid-cols-5">
          <p>{t("role")}: {user?.role || "Not set"}</p>
          <p>{t("category")}: {user?.category || "Not set"}</p>
          <p>{t("availability")}: {user?.availability || "available"}</p>
          <p>{t("rating")}: {Number(user?.averageRating || 0).toFixed(1)}</p>
          <p>{t("price")}: {user?.price || 0}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <h2 className="text-2xl font-black text-navy">{hasProfile ? t("updateProfile") : t("createProfile")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          Free profiles show the first 3 images. Premium profiles unlock the full gallery.
        </p>

        {status && <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
        {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form className="mt-6 space-y-8" onSubmit={handleSubmit}>
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
              <span className="label">{t("type")}</span>
              <select className="field" name="type" value={form.type} onChange={handleChange}>
                {TALENT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
              <span className="label">{t("price")}</span>
              <input className="field" type="number" min="0" name="price" value={form.price} onChange={handleChange} />
            </label>

            <label className="space-y-2">
              <span className="label">{t("availability")}</span>
              <select className="field" name="availability" value={form.availability} onChange={handleChange}>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="label">{t("phone")}</span>
              <input className="field" name="phone" value={form.phone} onChange={handleChange} />
            </label>

            <label className="space-y-2">
              <span className="label">{t("whatsapp")}</span>
              <input className="field" name="whatsappNumber" value={form.whatsappNumber} onChange={handleChange} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="label">Province</span>
              <select className="field" name="province" value={form.province} onChange={handleChange}>
                <option value="">Select province</option>
                {RWANDA_PROVINCES.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="label">District</span>
              <select className="field" name="district" value={form.district} onChange={handleChange}>
                <option value="">Select district</option>
                {districtOptions.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="label">{t("location")}</span>
              <input className="field" name="location" value={form.location} onChange={handleChange} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="label">{t("bio")}</span>
              <textarea className="field min-h-32 resize-y" name="bio" value={form.bio} onChange={handleChange} />
            </label>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-navy">{t("imageGallery")}</h3>
              <label className="btn-secondary cursor-pointer px-4 py-2">
                Add image
                <input className="hidden" type="file" accept="image/*" multiple onChange={handleImageFiles} />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {existingImages.map((image, index) => (
                <div key={image} className="field flex items-center gap-3">
                  <img src={mediaUrl(image)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  <span>Saved image {index + 1}</span>
                </div>
              ))}
              {selectedImageFiles.map((file) => (
                <div key={file.name} className="field">
                  {file.name}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-navy">{t("videos")}</h3>
              <label className="btn-secondary cursor-pointer px-4 py-2">
                Add video
                <input className="hidden" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" multiple onChange={handleVideoFiles} />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {existingVideos.map((video, index) => (
                <div key={video} className="field space-y-2">
                  <span>Saved video {index + 1}</span>
                  <video src={mediaUrl(video)} className="aspect-video w-full rounded-lg bg-slate-100" controls preload="metadata" />
                </div>
              ))}
              {selectedVideoFiles.map((file) => (
                <div key={file.name} className="field">
                  {file.name}
                </div>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? t("saving") : t("saveProfile")}
          </button>
        </form>

        {user?.referralLink && (
          <div className="mt-8 rounded-lg border border-slate-200 bg-surface p-4">
            <h3 className="text-lg font-black text-navy">Referral</h3>
            <p className="mt-2 text-sm text-slate-600">{user.referredUsers || 0} invited users</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-secondary" onClick={handleCopyReferral}>
                Copy link
              </button>
              <a
                className="btn-primary"
                href={`https://wa.me/?text=${encodeURIComponent(`Join me on VibeBook: ${user.referralLink}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default Dashboard;
