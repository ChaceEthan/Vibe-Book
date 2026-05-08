// @ts-nocheck
import { useState } from "react";
import { X } from "lucide-react";

import { PROFILE_CATEGORIES } from "../constants/profile";
import { userApi } from "../services/api";

export function EditProfileModal({ user, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: user?.name || "",
    username: user?.username || "",
    bio: user?.bio || "",
    category: user?.category || "",
    website: user?.website || user?.socialLinks?.website || "",
    coverImage: user?.coverImage || "",
    profileTheme: user?.profileTheme || "classic",
    creatorCategory: user?.creatorCategory || user?.category || "",
    creatorSkills: Array.isArray(user?.creatorSkills) ? user.creatorSkills.join(", ") : "",
    publicEmail: Boolean(user?.publicEmail),
    instagram: user?.socialLinks?.instagram || "",
    tiktok: user?.socialLinks?.tiktok || "",
    youtube: user?.socialLinks?.youtube || "",
    x: user?.socialLinks?.x || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError("");
  };

  const handleToggle = (e) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: checked,
    }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!formData.name.trim()) {
        throw new Error("Name is required");
      }
      if (formData.username && (formData.username.length < 3 || formData.username.length > 30)) {
        throw new Error("Username must be 3-30 characters");
      }

      const { data } = await userApi.updateProfile({
        name: formData.name,
        username: formData.username,
        bio: formData.bio,
        category: formData.category,
        website: formData.website,
        coverImage: formData.coverImage,
        profileTheme: formData.profileTheme,
        creatorCategory: formData.creatorCategory,
        creatorSkills: formData.creatorSkills,
        publicEmail: formData.publicEmail,
        socialLinks: {
          instagram: formData.instagram,
          tiktok: formData.tiktok,
          youtube: formData.youtube,
          x: formData.x,
          website: formData.website,
          whatsapp: user?.socialLinks?.whatsapp || user?.whatsapp || user?.whatsappNumber || "",
        },
      });

      setSuccess(true);
      setTimeout(() => {
        onSave?.(data.user);
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message || "Error updating profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-bold">Edit Profile</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
          {success && <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">Profile updated successfully!</div>}

          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="your_username"
            />
            <p className="text-xs text-gray-500 mt-1">3-30 characters, letters, numbers, _ and - only</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Bio</label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              maxLength={200}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Tell us about yourself"
            />
            <p className="text-xs text-gray-500 mt-1">{formData.bio.length}/200</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select category</option>
              {PROFILE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Website</label>
            <input
              type="url"
              name="website"
              value={formData.website}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Cover Image URL</label>
            <input
              type="url"
              name="coverImage"
              value={formData.coverImage}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Cloudinary image URL"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Theme</label>
              <select
                name="profileTheme"
                value={formData.profileTheme}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="classic">Classic</option>
                <option value="midnight">Midnight</option>
                <option value="spotlight">Spotlight</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Creator Category</label>
              <input
                type="text"
                name="creatorCategory"
                value={formData.creatorCategory}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Dance, music, comedy"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Creator Skills</label>
            <input
              type="text"
              name="creatorSkills"
              value={formData.creatorSkills}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="editing, choreography, live shows"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {["instagram", "tiktok", "youtube", "x"].map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium mb-1 capitalize">{field}</label>
                <input
                  type="text"
                  name={field}
                  value={formData[field]}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Your ${field}`}
                />
              </div>
            ))}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-sm font-medium">Public email</span>
            <input
              type="checkbox"
              name="publicEmail"
              checked={formData.publicEmail}
              onChange={handleToggle}
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditProfileModal;
