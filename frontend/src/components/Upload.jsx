// @ts-nocheck
import { Image as ImageIcon, Trash2, UploadCloud, UserRound, Video, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl } from "../services/api";
import { isValidPost, usePostStore } from "../store/postStore";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 120;
const uploadUrl = (value) => String(value || "").trim();

const Upload = ({ open, initialType = "image", onClose }) => {
  const { deleteMedia, uploadMedia, uploadProfilePicture } = useAuth();
  const prependPost = usePostStore((state) => state.prependPost);
  const [type, setType] = useState("image");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [uploadedPath, setUploadedPath] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [orientation, setOrientation] = useState("portrait");
  const [detectedOrientation, setDetectedOrientation] = useState("");
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  useEffect(() => {
    if (open) {
      setType(initialType || "image");
    }
  }, [initialType, open]);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setUploadedUrl("");
      setUploadedPath("");
      setCaption("");
      setTags("");
      setOrientation("portrait");
      setDetectedOrientation("");
      setDuration(0);
      setStatus("");
      setError("");
      setProgress(0);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const isProfile = type === "profile";
  const isImage = type === "image" || isProfile;

  const switchType = (nextType) => {
    setType(nextType);
    setFile(null);
    setUploadedUrl("");
    setUploadedPath("");
    setCaption("");
    setTags("");
    setOrientation("portrait");
    setDetectedOrientation("");
    setDuration(0);
    setStatus("");
    setError("");
    setProgress(0);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const setDetectedMediaShape = (width, height, nextDuration = 0) => {
    if (!width || !height) {
      return;
    }

    const nextOrientation = width > height ? "landscape" : "portrait";
    setDetectedOrientation(nextOrientation);
    setOrientation(nextOrientation);
    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
  };

  const handleSelect = (event) => {
    const selectedFile = event.target.files?.[0];
    setError("");
    setStatus("");
    setUploadedUrl("");
    setUploadedPath("");
    setProgress(0);
    setDetectedOrientation("");
    setDuration(0);

    if (!selectedFile) {
      setFile(null);
      setPreview("");
      return;
    }

    if (isImage && (!selectedFile.type.startsWith("image/") || selectedFile.size > MAX_IMAGE_SIZE)) {
      setError("Choose an image under 5MB.");
      event.target.value = "";
      return;
    }

    if (!isImage && (!selectedFile.type.startsWith("video/") || selectedFile.size > MAX_VIDEO_SIZE)) {
      setError("Choose a video under 100MB.");
      event.target.value = "";
      return;
    }

    const nextPreview = URL.createObjectURL(selectedFile);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreview;
    });
    setFile(selectedFile);

    if (isImage) {
      const image = new Image();
      image.onload = () => setDetectedMediaShape(image.naturalWidth, image.naturalHeight);
      image.src = nextPreview;
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const nextDuration = Number(video.duration || 0);
      setDetectedMediaShape(video.videoWidth, video.videoHeight, nextDuration);
      if (nextDuration > MAX_VIDEO_SECONDS) {
        setError("Videos must be 2 minutes or shorter.");
      }
    };
    video.src = nextPreview;
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Choose a file first.");
      return;
    }

    if (type === "video" && duration > MAX_VIDEO_SECONDS) {
      setError("Videos must be 2 minutes or shorter.");
      return;
    }

    const formData = new FormData();
    if (isProfile) {
      formData.append("image", file);
    } else {
      formData.append("file", file);
      formData.append("type", type);
      formData.append("orientation", orientation);
      formData.append("caption", caption.trim());
      formData.append("description", caption.trim());
      formData.append("tags", tags);
      if (duration) {
        formData.append("duration", String(Math.round(duration)));
      }
    }

    setUploading(true);
    setError("");
    setStatus("");
    setProgress(0);

    try {
      const data = isProfile
        ? await uploadProfilePicture(formData, {
            onUploadProgress: (event) => {
              if (event.total) {
                setProgress(Math.round((event.loaded * 100) / event.total));
              }
            },
          })
        : await uploadMedia(formData, type, {
            onUploadProgress: (event) => {
              if (event.total) {
                setProgress(Math.round((event.loaded * 100) / event.total));
              }
            },
      });
      const nextUrl =
        uploadUrl(data.secure_url) ||
        uploadUrl(data.url) ||
        uploadUrl(data.file?.secure_url) ||
        uploadUrl(data.file?.url) ||
        uploadUrl(data.file?.path) ||
        uploadUrl(data.files?.[0]?.secure_url) ||
        uploadUrl(data.files?.[0]?.url) ||
        uploadUrl(data.files?.[0]?.path) ||
        uploadUrl(data.path) ||
        uploadUrl(data.user?.profilePicture);
      const nextPath = nextUrl;
      setUploadedUrl(nextUrl);
      setUploadedPath(nextPath);
      setProgress(100);
      setStatus(isProfile ? "Profile picture updated." : isImage ? "Image uploaded." : "Video uploaded.");
      if (data.feedItem && isValidPost(data.feedItem)) {
        const uploadedPost = {
          ...data.feedItem,
          url: uploadUrl(data.feedItem.url) || nextUrl,
          mediaUrl: uploadUrl(data.feedItem.mediaUrl) || nextUrl,
        };
        prependPost(uploadedPost);
        console.log("[VibeBook upload] post saved and added to state", uploadedPost);
        window.dispatchEvent(new CustomEvent("vibebook:post-created", { detail: { post: uploadedPost } }));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteUploaded = async () => {
    const pathToDelete = uploadedPath || uploadedUrl;

    if (!pathToDelete || !window.confirm("Delete this upload?")) {
      return;
    }

    setUploadedUrl("");
    setUploadedPath("");
    setFile(null);
    setDetectedOrientation("");
    setDuration(0);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setProgress(0);
    setStatus("Media deleted.");

    try {
      await deleteMedia(pathToDelete);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to delete media.");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-brand">Upload</p>
            <h2 className="text-xl font-black text-navy">Add media</h2>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close upload">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 rounded-lg bg-surface p-1">
          {[
            { value: "profile", label: "Profile", icon: UserRound },
            { value: "image", label: "Image", icon: ImageIcon },
            { value: "video", label: "Video", icon: Video },
          ].map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
                  type === option.value ? "bg-white text-navy shadow-sm" : "text-slate-500"
                }`}
                onClick={() => switchType(option.value)}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {status && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}

        <label className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-brand hover:bg-brand/5">
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="mt-3 text-sm font-bold text-navy">
            {isProfile ? "Choose profile picture" : isImage ? "Choose image" : "Choose video"}
          </span>
          <input className="hidden" type="file" accept={isImage ? "image/*" : "video/*"} onChange={handleSelect} />
        </label>

        {!isProfile && (
          <label className="mt-4 block space-y-2">
            <span className="label">Caption</span>
            <input
              className="field"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Optional caption"
            />
          </label>
        )}

        {!isProfile && (
          <label className="mt-4 block space-y-2">
            <span className="label">Tags</span>
            <input
              className="field"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="dance, kigali, party"
            />
          </label>
        )}

        {!isProfile && (
          <div className="mt-4">
            <span className="label">Orientation</span>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-surface p-1">
              {["portrait", "landscape"].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`rounded-lg px-3 py-2 text-sm font-bold capitalize ${
                    orientation === option ? "bg-white text-navy shadow-sm" : "text-slate-500"
                  }`}
                  onClick={() => setOrientation(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            {detectedOrientation && (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Detected {detectedOrientation}
                {type === "video" && duration ? ` - ${Math.round(duration)}s` : ""}
              </p>
            )}
          </div>
        )}

        {(preview || uploadedUrl) && (
          <div className="relative mt-4 max-h-[350px] overflow-y-auto rounded-lg bg-slate-100 p-2">
            {uploadedUrl && (
              <button
                type="button"
                className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow"
                onClick={handleDeleteUploaded}
                aria-label="Delete upload"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {isImage ? (
              <img src={uploadedUrl ? mediaUrl(uploadedUrl) : preview} alt="" className="h-auto max-h-[300px] w-full rounded-lg object-cover" />
            ) : (
              <video
                src={uploadedUrl ? mediaUrl(uploadedUrl) : preview}
                className="h-auto max-h-[350px] bg-slate-900"
                controls
                muted
                playsInline
                preload="metadata"
                style={{ width: "100%", borderRadius: "12px" }}
              />
            )}
          </div>
        )}

        {uploading && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500">
              <span>Uploading...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="sticky bottom-0 z-20 -mx-5 -mb-5 mt-5 border-t border-slate-200 bg-white p-5">
          <button
            type="button"
            className="btn-primary w-full"
            onClick={handleUpload}
            disabled={uploading || !file || (type === "video" && duration > MAX_VIDEO_SECONDS)}
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Upload;
