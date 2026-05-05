// @ts-nocheck
import { Edit3, ImagePlus, MapPin, SlidersHorizontal, Trash2, Video } from "lucide-react";
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

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 30 * 1024 * 1024;

const initialMediaState = {
  profilePicture: "",
  images: [],
  videos: [],
  imageDescriptions: [],
  videoDescriptions: [],
};

const descriptionFor = (items = [], url = "") => {
  return items.find((item) => item.url === url)?.description || "";
};

const Dashboard = () => {
  const { deleteMedia, refreshProfile, updateProfile, uploadMedia, uploadProfilePicture, user } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [mediaState, setMediaState] = useState(initialMediaState);
  const [imageDescription, setImageDescription] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [uploadProgress, setUploadProgress] = useState({ profile: 0, image: 0, video: 0 });
  const [deletingMedia, setDeletingMedia] = useState("");
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);
  const profileImage = mediaUrl(mediaState.profilePicture || user?.profilePicture || user?.profileImage || "");

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
      setMediaState({
        profilePicture: user.profilePicture || user.profileImage || "",
        images: Array.isArray(user.images) ? user.images : user.gallery || [],
        videos: Array.isArray(user.videos) ? user.videos : user.videoUrls || [],
        imageDescriptions: Array.isArray(user.imageDescriptions) ? user.imageDescriptions : [],
        videoDescriptions: Array.isArray(user.videoDescriptions) ? user.videoDescriptions : [],
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

  const syncMedia = (nextUser) => {
    if (!nextUser) {
      return;
    }

    setMediaState({
      profilePicture: nextUser.profilePicture || nextUser.profileImage || "",
      images: Array.isArray(nextUser.images) ? nextUser.images : nextUser.gallery || [],
      videos: Array.isArray(nextUser.videos) ? nextUser.videos : nextUser.videoUrls || [],
      imageDescriptions: Array.isArray(nextUser.imageDescriptions) ? nextUser.imageDescriptions : [],
      videoDescriptions: Array.isArray(nextUser.videoDescriptions) ? nextUser.videoDescriptions : [],
    });
  };

  const setProgress = (key, event) => {
    if (!event.total) {
      return;
    }

    setUploadProgress((current) => ({
      ...current,
      [key]: Math.round((event.loaded * 100) / event.total),
    }));
  };

  const uploadProfileFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE) {
      setError("Choose an image under 5MB.");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    setUploading("profile");
    setUploadProgress((current) => ({ ...current, profile: 0 }));
    setStatus("");
    setError("");

    try {
      const data = await uploadProfilePicture(formData, {
        onUploadProgress: (progressEvent) => setProgress("profile", progressEvent),
      });
      syncMedia(data.user);
      setUploadProgress((current) => ({ ...current, profile: 100 }));
      setStatus("Profile picture updated.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Profile picture upload failed.");
    } finally {
      setUploading("");
    }
  };

  const uploadGalleryFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE) {
      setError("Choose an image under 5MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "image");
    if (imageDescription.trim()) {
      formData.append("description", imageDescription.trim());
    }

    setUploading("image");
    setUploadProgress((current) => ({ ...current, image: 0 }));
    setStatus("");
    setError("");

    try {
      const data = await uploadMedia(formData, "image", {
        onUploadProgress: (progressEvent) => setProgress("image", progressEvent),
      });
      syncMedia(data.user);
      setImageDescription("");
      setUploadProgress((current) => ({ ...current, image: 100 }));
      setStatus("Gallery image uploaded.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Image upload failed.");
    } finally {
      setUploading("");
    }
  };

  const uploadVideoFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("video/") || file.size > MAX_VIDEO_SIZE) {
      setError("Choose a video under 30MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "video");
    setUploading("video");
    setUploadProgress((current) => ({ ...current, video: 0 }));
    setStatus("");
    setError("");

    try {
      const data = await uploadMedia(formData, "video", {
        onUploadProgress: (progressEvent) => setProgress("video", progressEvent),
      });
      syncMedia(data.user);
      setUploadProgress((current) => ({ ...current, video: 100 }));
      setStatus("Video uploaded.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Video upload failed.");
    } finally {
      setUploading("");
    }
  };

  const removeMedia = async (url, kind) => {
    if (!url || !window.confirm("Delete this media?")) {
      return;
    }

    const previousMedia = mediaState;
    setDeletingMedia(url);
    setStatus("");
    setError("");
    setMediaState((current) => ({
      ...current,
      profilePicture: kind === "profile" ? "" : current.profilePicture,
      images: current.images.filter((image) => image !== url),
      videos: current.videos.filter((videoUrl) => videoUrl !== url),
      imageDescriptions: current.imageDescriptions.filter((item) => item.url !== url),
      videoDescriptions: current.videoDescriptions.filter((item) => item.url !== url),
    }));

    try {
      const data = await deleteMedia(url);
      syncMedia(data.user);
      setStatus("Media deleted.");
    } catch (requestError) {
      setMediaState(previousMedia);
      setError(requestError.response?.data?.message || "Unable to delete media.");
    } finally {
      setDeletingMedia("");
    }
  };

  const progressBar = (key) =>
    uploading === key ? (
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
          <span>Uploading...</span>
          <span>{uploadProgress[key]}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${uploadProgress[key]}%` }} />
        </div>
      </div>
    ) : null;

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

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-navy">Profile Picture</h2>
            <label className="btn-secondary cursor-pointer gap-2 px-4 py-2">
              <Edit3 className="h-4 w-4" />
              Edit
              <input className="hidden" type="file" accept="image/*" onChange={uploadProfileFile} />
            </label>
          </div>
          <div className="relative mx-auto h-44 w-44 overflow-hidden rounded-full bg-slate-100 shadow-soft">
            <img src={profileImage} alt="" className="h-full w-full object-cover" />
            {mediaState.profilePicture && (
              <button
                type="button"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow"
                onClick={() => removeMedia(mediaState.profilePicture, "profile")}
                disabled={deletingMedia === mediaState.profilePicture}
                aria-label="Delete profile picture"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          {progressBar("profile")}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-navy">Gallery</h2>
              <p className="mt-1 text-sm text-slate-500">{mediaState.images.length} images</p>
            </div>
            <label className="btn-primary cursor-pointer gap-2">
              <ImagePlus className="h-4 w-4" />
              Upload Image
              <input className="hidden" type="file" accept="image/*" onChange={uploadGalleryFile} />
            </label>
          </div>
          <label className="mb-4 block space-y-2">
            <span className="label">Image description</span>
            <input
              className="field"
              value={imageDescription}
              onChange={(event) => setImageDescription(event.target.value)}
              placeholder="Optional description for the next image"
            />
          </label>
          {progressBar("image")}
          <div className="mt-4 grid max-h-[400px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {mediaState.images.length ? (
              mediaState.images.map((image) => (
                <article key={image} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <img src={mediaUrl(image)} alt="" className="h-[180px] w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow"
                    onClick={() => removeMedia(image, "image")}
                    disabled={deletingMedia === image}
                    aria-label="Delete gallery image"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <p className="line-clamp-2 min-h-11 p-3 text-sm text-slate-600">
                    {descriptionFor(mediaState.imageDescriptions, image) || "No description"}
                  </p>
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 sm:col-span-2">
                No gallery images yet.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-navy">Videos</h2>
            <p className="mt-1 text-sm text-slate-500">Videos must be 60 seconds or shorter.</p>
          </div>
          <label className="btn-primary cursor-pointer gap-2">
            <Video className="h-4 w-4" />
            Upload Video
            <input className="hidden" type="file" accept="video/*" onChange={uploadVideoFile} />
          </label>
        </div>
        {progressBar("video")}
        <div className="mt-4 grid max-h-[400px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {mediaState.videos.length ? (
            mediaState.videos.map((videoUrl) => (
              <article key={videoUrl} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                <video
                  src={mediaUrl(videoUrl)}
                  className="max-h-[300px] w-full bg-slate-950"
                  controls
                  playsInline
                  preload="metadata"
                  style={{ borderRadius: "12px" }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow"
                  onClick={() => removeMedia(videoUrl, "video")}
                  disabled={deletingMedia === videoUrl}
                  aria-label="Delete video"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 md:col-span-2">
              No videos yet.
            </div>
          )}
        </div>
      </section>

      <form className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={handleSubmit}>
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
