// @ts-nocheck
import { Image as ImageIcon, UploadCloud, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { mediaUrl } from "../services/api";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 30 * 1024 * 1024;

const Upload = ({ open, onClose }) => {
  const { uploadMedia, user } = useAuth();
  const [type, setType] = useState("image");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setUploadedUrl("");
      setStatus("");
      setError("");
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const isImage = type === "image";

  const switchType = (nextType) => {
    setType(nextType);
    setFile(null);
    setUploadedUrl("");
    setStatus("");
    setError("");
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const handleSelect = (event) => {
    const selectedFile = event.target.files?.[0];
    setError("");
    setStatus("");
    setUploadedUrl("");

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
      setError("Choose a video under 30MB.");
      event.target.value = "";
      return;
    }

    const nextPreview = URL.createObjectURL(selectedFile);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreview;
    });
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Choose a file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    setUploading(true);
    setError("");
    setStatus("");

    try {
      const data = await uploadMedia(formData, type);
      const nextUrl = data.url || data.file?.url || data.files?.[0]?.url || "";
      setUploadedUrl(nextUrl);
      setStatus(isImage ? "Image uploaded." : "Video uploaded.");
      window.setTimeout(() => {
        onClose?.();
        navigate(`/profile/${data.user?._id || user?._id}`);
      }, 450);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-brand">Upload</p>
            <h2 className="text-xl font-black text-navy">Add media</h2>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close upload">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-surface p-1">
          <button
            type="button"
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
              isImage ? "bg-white text-navy shadow-sm" : "text-slate-500"
            }`}
            onClick={() => switchType("image")}
          >
            <ImageIcon className="h-4 w-4" />
            Upload Image
          </button>
          <button
            type="button"
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
              !isImage ? "bg-white text-navy shadow-sm" : "text-slate-500"
            }`}
            onClick={() => switchType("video")}
          >
            <Video className="h-4 w-4" />
            Upload Video
          </button>
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {status && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}

        <label className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-brand hover:bg-brand/5">
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="mt-3 text-sm font-bold text-navy">{isImage ? "Choose image" : "Choose video"}</span>
          <input className="hidden" type="file" accept={isImage ? "image/*" : "video/*"} onChange={handleSelect} />
        </label>

        {(preview || uploadedUrl) && (
          <div className="mt-4 overflow-hidden rounded-lg bg-slate-100">
            {isImage ? (
              <img src={uploadedUrl ? mediaUrl(uploadedUrl) : preview} alt="" className="max-h-72 w-full object-cover" />
            ) : (
              <video
                src={uploadedUrl ? mediaUrl(uploadedUrl) : preview}
                className="max-h-72 bg-slate-900"
                controls
                muted
                playsInline
                preload="metadata"
                style={{ width: "100%", borderRadius: "12px" }}
              />
            )}
          </div>
        )}

        <button type="button" className="btn-primary mt-5 w-full" onClick={handleUpload} disabled={uploading || !file}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>
    </div>
  );
};

export default Upload;
