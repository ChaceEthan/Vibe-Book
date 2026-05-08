// @ts-nocheck
import { useState } from "react";
import { X } from "lucide-react";

import { feedApi } from "../services/api";

export function EditVideoModal({ post, onClose, onSave }) {
  const [formData, setFormData] = useState({
    caption: post?.caption || "",
    tags: Array.isArray(post?.tags) ? post.tags.join(", ") : "",
    visibility: post?.visibility || "public",
    category: post?.category || "",
    commentsEnabled: post?.commentsEnabled !== false,
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
      const { data } = await feedApi.edit(post._id, {
        ...formData,
        tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });

      setSuccess(true);
      setTimeout(() => {
        onSave?.(data.feedItem);
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message || "Error updating post");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-bold">Edit Video</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
              Video updated successfully!
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Caption</label>
            <textarea
              name="caption"
              value={formData.caption}
              onChange={handleChange}
              maxLength={500}
              rows={4}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Describe your video"
            />
            <p className="text-xs text-gray-500 mt-1">{formData.caption.length}/500</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Tags</label>
            <input
              type="text"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="dance, party, kigali (comma-separated)"
            />
            <p className="text-xs text-gray-500 mt-1">Separate tags with commas</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Visibility</label>
            <select
              name="visibility"
              value={formData.visibility}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Modern Dance, Hip-Hop"
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-sm font-medium">Comments</span>
            <input
              type="checkbox"
              name="commentsEnabled"
              checked={formData.commentsEnabled}
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

export default EditVideoModal;
