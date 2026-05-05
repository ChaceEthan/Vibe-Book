// @ts-nocheck
import { Camera, Edit3, Image as ImageIcon, MapPin, Video } from "lucide-react";
import { useEffect, useState } from "react";

import { GENDER_OPTIONS, PROFILE_CATEGORIES, TALENT_TYPES } from "../constants/profile";
import { RWANDA_PROVINCES, getDistrictsForProvince } from "../constants/rwanda";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { mediaUrl } from "../services/api";

const MAX_IMAGES = 3;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
const FREE_VIDEO_LIMIT = 1;

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

const Section = ({ title, children, icon: Icon }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
    <div className="mb-5 flex items-center gap-3">
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-navy">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <h2 className="text-xl font-black text-navy">{title}</h2>
    </div>
    {children}
  </section>
);

const Dashboard = () => {
  const { user, refreshProfile, updateProfile, uploadProfileImage, uploadProfileImages, uploadProfileVideos } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [profileImagePreview, setProfileImagePreview] = useState("");
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [selectedVideoFiles, setSelectedVideoFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const existingImages = Array.isArray(user?.images)
    ? user.images.filter((image) => image && !image.includes("default-profile.svg"))
    : [];
  const existingVideos = Array.isArray(user?.videos) && user.videos.length
    ? user.videos
    : Array.isArray(user?.videoUrls)
      ? user.videoUrls
      : [];
  const profileImage = profileImagePreview || mediaUrl(user?.profilePicture || user?.profileImage || existingImages[0] || "");
  const districtOptions = getDistrictsForProvince(form.province);

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

  useEffect(() => {
    return () => {
      if (profileImagePreview) {
        URL.revokeObjectURL(profileImagePreview);
      }
    };
  }, [profileImagePreview]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "province" ? { district: "" } : {}),
    }));
  };

  const handleProfileImageFile = async (event) => {
    const file = event.target.files?.[0];
    setError("");
    setStatus("");

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE) {
      setError("Profile image must be under 5MB.");
      event.target.value = "";
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setProfileImagePreview((currentPreview) => {
      if (currentPreview) URL.revokeObjectURL(currentPreview);
      return previewUrl;
    });

    setMediaUploading(true);
    try {
      await uploadProfileImage(file);
      setStatus("Profile picture uploaded.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Profile picture upload failed.");
    } finally {
      setMediaUploading(false);
      event.target.value = "";
    }
  };

  const handleImageFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    setError("");
    setStatus("");

    if (!files.length) {
      return;
    }

    if (!premiumActive && existingImages.length + files.length > MAX_IMAGES) {
      setError(`Free profiles can upload ${MAX_IMAGES} images.`);
      event.target.value = "";
      return;
    }

    if (files.some((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE)) {
      setError("Images must be under 5MB.");
      event.target.value = "";
      return;
    }

    setSelectedImageFiles(files);
    setMediaUploading(true);

    try {
      await uploadProfileImages(files);
      setSelectedImageFiles([]);
      setStatus("Images uploaded.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Image upload failed.");
    } finally {
      setMediaUploading(false);
      event.target.value = "";
    }
  };

  const handleVideoFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    setError("");
    setStatus("");

    if (!files.length) {
      return;
    }

    try {
      if (!premiumActive && existingVideos.length + files.length > FREE_VIDEO_LIMIT) {
        throw new Error(`Free profiles can upload ${FREE_VIDEO_LIMIT} video up to 60 seconds.`);
      }

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
      setMediaUploading(true);
      await uploadProfileVideos(files);
      setSelectedVideoFiles([]);
      setStatus("Video uploaded.");
    } catch (validationError) {
      setSelectedVideoFiles([]);
      setError(validationError.response?.data?.message || validationError.message || "Video upload failed.");
    } finally {
      setMediaUploading(false);
      event.target.value = "";
    }
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
          <label className="relative block h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-full bg-slate-100 ring-4 ring-white/10">
            <img src={profileImage} alt="" className="h-full w-full object-cover" />
            <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-navy shadow">
              <Edit3 className="h-4 w-4" />
            </span>
            <input className="hidden" type="file" accept="image/*" onChange={handleProfileImageFile} />
          </label>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-brand">{premiumActive ? t("premium") : t("free")}</p>
            <h1 className="truncate text-2xl font-black">{user?.name || "Dashboard"}</h1>
            <p className="mt-1 text-sm text-slate-300">{user?.category || "Set up your profile"}</p>
          </div>
        </div>
      </div>

      {status && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <Section title="Basic info" icon={Camera}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="label">{t("name")}</span>
              <input className="field" name="name" value={form.name} onChange={handleChange} />
            </label>
            <label className="space-y-2">
              <span className="label">{t("category")}</span>
              <select className="field" name="category" value={form.category} onChange={handleChange}>
                {PROFILE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">{t("type")}</span>
              <select className="field" name="type" value={form.type} onChange={handleChange}>
                {TALENT_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">{t("gender")}</span>
              <select className="field" name="gender" value={form.gender} onChange={handleChange}>
                <option value="">Select gender</option>
                {GENDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
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
              <span className="label">{t("bio")}</span>
              <textarea className="field min-h-28 resize-y" name="bio" value={form.bio} onChange={handleChange} />
            </label>
          </div>
        </Section>

        <Section title="Location" icon={MapPin}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="label">Province</span>
              <select className="field" name="province" value={form.province} onChange={handleChange}>
                <option value="">Select province</option>
                {RWANDA_PROVINCES.map((province) => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">District</span>
              <select className="field" name="district" value={form.district} onChange={handleChange} disabled={!form.province}>
                <option value="">Select district</option>
                {districtOptions.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">{t("location")}</span>
              <input className="field" name="location" value={form.location} onChange={handleChange} />
            </label>
          </div>
        </Section>

        <Section title="Availability" icon={Camera}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="label">{t("availability")}</span>
              <select className="field" name="availability" value={form.availability} onChange={handleChange}>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">Starting price</span>
              <input className="field" type="number" min="0" name="price" value={form.price} onChange={handleChange} />
            </label>
          </div>
        </Section>

        <Section title="Media" icon={ImageIcon}>
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-black text-navy">Image gallery</h3>
                <label className="btn-secondary cursor-pointer px-4 py-2">
                  Add image
                  <input className="hidden" type="file" accept="image/*" multiple onChange={handleImageFiles} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {existingImages.map((image, index) => (
                  <div key={`${image}-${index}`} className="aspect-square overflow-hidden rounded-lg bg-slate-100">
                    <img src={mediaUrl(image)} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
                {selectedImageFiles.map((file) => (
                  <div key={file.name} className="aspect-square rounded-lg bg-slate-100 p-2 text-xs font-semibold text-slate-500">
                    {file.name}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-black text-navy">
                  <Video className="h-4 w-4" />
                  Videos
                </h3>
                <label className="btn-secondary cursor-pointer px-4 py-2">
                  Add video
                  <input className="hidden" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" multiple onChange={handleVideoFiles} />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {existingVideos.map((video, index) => (
                  <video key={`${video}-${index}`} src={mediaUrl(video)} className="aspect-video w-full rounded-lg bg-slate-100 object-cover" controls preload="metadata" />
                ))}
                {selectedVideoFiles.map((file) => (
                  <div key={file.name} className="rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-500">{file.name}</div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <button type="submit" className="btn-primary w-full" disabled={saving || mediaUploading}>
          {saving ? t("saving") : mediaUploading ? "Uploading media..." : t("saveProfile")}
        </button>
      </form>

      {user?.referralLink && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
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
    </section>
  );
};

export default Dashboard;
