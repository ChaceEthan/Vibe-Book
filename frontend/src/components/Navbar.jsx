// @ts-nocheck
import {
  Compass,
  Home,
  Image as ImageIcon,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  UploadCloud,
  User,
  Video,
  X,
} from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { mediaUrl, messageApi } from "../services/api";

const FREE_IMAGE_LIMIT = 3;
const FREE_VIDEO_LIMIT = 1;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const navClass = ({ isActive }) =>
  `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition ${
    isActive ? "text-brand" : "text-slate-500"
  }`;

const filePreview = (file) => ({
  name: file.name,
  type: file.type,
  url: URL.createObjectURL(file),
});

const UploadModal = ({ open, onClose }) => {
  const { user, uploadProfileImages, uploadProfileVideos } = useAuth();
  const [mode, setMode] = useState("image");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploaded, setUploaded] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const premiumActive = Boolean(user?.isPremium || user?.premiumBadge);

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setPreviews([]);
      setUploaded([]);
      setStatus("");
      setError("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const existingImages = Array.isArray(user?.images)
    ? user.images.filter((image) => image && !image.includes("default-profile.svg")).length
    : 0;
  const existingVideos = Array.isArray(user?.videos || user?.videoUrls) ? (user.videos || user.videoUrls).length : 0;
  const isImageMode = mode === "image";

  const validateFiles = (nextFiles) => {
    if (!nextFiles.length) {
      return "";
    }

    if (isImageMode) {
      if (!premiumActive && existingImages + nextFiles.length > FREE_IMAGE_LIMIT) {
        return `Free profiles can upload ${FREE_IMAGE_LIMIT} images.`;
      }

      if (nextFiles.some((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE)) {
        return "Images must be under 5MB.";
      }
    } else {
      if (!premiumActive && existingVideos + nextFiles.length > FREE_VIDEO_LIMIT) {
        return `Free profiles can upload ${FREE_VIDEO_LIMIT} video.`;
      }

      if (nextFiles.some((file) => !["video/mp4", "video/quicktime"].includes(file.type) || file.size > MAX_VIDEO_SIZE)) {
        return "Videos must be MP4 or MOV files under 50MB.";
      }
    }

    return "";
  };

  const handleSelect = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    const validationError = validateFiles(nextFiles);
    setError(validationError);
    setStatus("");
    setUploaded([]);

    previews.forEach((preview) => URL.revokeObjectURL(preview.url));

    if (validationError) {
      setFiles([]);
      setPreviews([]);
      event.target.value = "";
      return;
    }

    setFiles(nextFiles);
    setPreviews(nextFiles.map(filePreview));
  };

  const handleUpload = async () => {
    if (!files.length) {
      setError("Choose a file first.");
      return;
    }

    setUploading(true);
    setError("");
    setStatus("");

    try {
      const nextUser = isImageMode ? await uploadProfileImages(files) : await uploadProfileVideos(files);
      const nextMedia = isImageMode ? nextUser?.images || [] : nextUser?.videos || nextUser?.videoUrls || [];
      setUploaded(nextMedia.slice(-files.length));
      setFiles([]);
      setStatus(isImageMode ? "Image uploaded." : "Video uploaded.");
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
              isImageMode ? "bg-white text-navy shadow-sm" : "text-slate-500"
            }`}
            onClick={() => {
              setMode("image");
              setFiles([]);
              setPreviews([]);
              setUploaded([]);
              setError("");
              setStatus("");
            }}
          >
            <ImageIcon className="h-4 w-4" />
            Upload Image
          </button>
          <button
            type="button"
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${
              !isImageMode ? "bg-white text-navy shadow-sm" : "text-slate-500"
            }`}
            onClick={() => {
              setMode("video");
              setFiles([]);
              setPreviews([]);
              setUploaded([]);
              setError("");
              setStatus("");
            }}
          >
            <Video className="h-4 w-4" />
            Upload Video
          </button>
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {status && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{status}</div>}

        <label className="mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-brand hover:bg-brand/5">
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="mt-3 text-sm font-bold text-navy">{isImageMode ? "Choose image files" : "Choose video files"}</span>
          <input
            className="hidden"
            type="file"
            accept={isImageMode ? "image/*" : "video/mp4,video/quicktime,.mp4,.mov"}
            multiple
            onChange={handleSelect}
          />
        </label>

        {(previews.length > 0 || uploaded.length > 0) && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {previews.map((preview) => (
              <div key={preview.url} className="aspect-square overflow-hidden rounded-lg bg-slate-100">
                {preview.type.startsWith("video/") ? (
                  <video src={preview.url} className="h-full w-full object-cover" muted controls />
                ) : (
                  <img src={preview.url} alt={preview.name} className="h-full w-full object-cover" />
                )}
              </div>
            ))}
            {uploaded.map((item) => (
              <div key={item} className="aspect-square overflow-hidden rounded-lg bg-slate-100 ring-2 ring-brand/40">
                {isImageMode ? (
                  <img src={mediaUrl(item)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <video src={mediaUrl(item)} className="h-full w-full object-cover" controls />
                )}
              </div>
            ))}
          </div>
        )}

        <button type="button" className="btn-primary mt-5 w-full" onClick={handleUpload} disabled={uploading || !files.length}>
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>
    </div>
  );
};

const Navbar = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { isAuthenticated, logout, user } = useAuth();
  const { language, languages, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const navItems = useMemo(
    () => [
      { to: "/", label: "Home", icon: Home },
      { to: "/search", label: "Explore", icon: Compass },
      { to: isAuthenticated ? "/inbox" : "/login", label: "Chat", icon: MessageCircle, badge: unreadCount },
      { to: isAuthenticated ? "/dashboard" : "/login", label: "Profile", icon: User },
    ],
    [isAuthenticated, unreadCount]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return undefined;
    }

    let active = true;
    const loadUnreadCount = async () => {
      try {
        const { data } = await messageApi.getUnreadCount();
        if (active) {
          setUnreadCount(Number(data?.unreadCount || 0));
        }
      } catch {
        if (active) {
          setUnreadCount(0);
        }
      }
    };

    loadUnreadCount();
    const timer = setInterval(loadUnreadCount, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isAuthenticated]);

  const openUpload = () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    setUploadOpen(true);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="container-page flex min-h-16 items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="VibeBook logo" className="h-10 w-10 rounded-lg object-cover" />
            <span className="truncate text-lg font-black text-navy">VibeBook</span>
          </Link>

          <div className="flex items-center gap-2">
            <select
              className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 sm:block"
              aria-label="Language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            {isAuthenticated ? (
              <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={handleLogout} aria-label="Logout">
                <LogOut className="h-5 w-5" />
              </button>
            ) : (
              <Link to="/login" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Login">
                <LogIn className="h-5 w-5" />
              </Link>
            )}
          </div>
        </nav>
      </header>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end gap-1">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass}>
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            className="-mt-8 flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold text-navy"
            onClick={openUpload}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-navy shadow-lg ring-4 ring-white">
              <Plus className="h-8 w-8" />
            </span>
            <span>Upload</span>
          </button>

          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.label} to={item.to} className={navClass}>
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {item.badge ? (
                    <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-red-500 px-1 text-[10px] leading-4 text-white">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default Navbar;
