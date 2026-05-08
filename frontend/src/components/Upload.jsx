// @ts-nocheck
import {
  AtSign,
  CheckCircle2,
  Eye,
  Hash,
  Image as ImageIcon,
  Loader2,
  Lock,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { feedApi, mediaUrl } from "../services/api";
import { isValidPost, usePostStore } from "../store/postStore";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 120;
const uploadUrl = (value) => String(value || "").trim();
const COMPRESSED_IMAGE_MAX_SIDE = 1600;
const COMPRESSED_IMAGE_QUALITY = 0.82;

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

const compressImageFile = async (sourceFile) => {
  if (!sourceFile?.type?.startsWith("image/") || sourceFile.type === "image/gif") {
    return sourceFile;
  }

  const imageUrl = URL.createObjectURL(sourceFile);
  const image = new Image();

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = imageUrl;
    });

    const scale = Math.min(1, COMPRESSED_IMAGE_MAX_SIDE / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);

    const outputType = sourceFile.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(canvas, outputType, COMPRESSED_IMAGE_QUALITY);

    if (!blob || blob.size >= sourceFile.size) {
      return sourceFile;
    }

    const extension = outputType === "image/png" ? "png" : "jpg";
    const name = sourceFile.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([blob], `${name}.${extension}`, {
      type: outputType,
      lastModified: Date.now(),
    });
  } catch {
    return sourceFile;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

const shouldRetryUpload = (error) => {
  const status = error?.response?.status;
  return !status || status >= 500;
};

const withUploadRetry = async (operation, attempts = 2) => {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetryUpload(error)) {
        throw error;
      }
    }
  }

  throw lastError;
};

const visibilityOptions = [
  { value: "public", label: "Public", icon: Eye },
  { value: "followers", label: "Followers", icon: Users },
  { value: "private", label: "Private", icon: Lock },
];

const steps = ["Select", "Preview", "Details", "Uploading", "Complete"];

const Upload = ({ open, initialType = "image", onClose }) => {
  const { deleteMedia, uploadMedia, uploadProfilePicture } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const prependPost = usePostStore((state) => state.prependPost);
  const [type, setType] = useState("image");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [uploadedPath, setUploadedPath] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [mentions, setMentions] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [orientation, setOrientation] = useState("portrait");
  const [detectedOrientation, setDetectedOrientation] = useState("");
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const isProfile = type === "profile";
  const isImage = type === "image" || isProfile;
  const success = Boolean(uploadedUrl && status);
  const activeStep = success ? 4 : uploading ? 3 : file ? (isProfile ? 1 : 2) : 0;

  const helperCopy = useMemo(() => {
    if (isProfile) {
      return "Update your profile picture without changing the upload pipeline.";
    }

    if (type === "video") {
      return "Portrait is preferred, but landscape and square videos stay fully visible.";
    }

    return "Share an image, add context, and publish it to the feed.";
  }, [isProfile, type]);

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
      setMentions("");
      setVisibility("public");
      setOrientation("portrait");
      setDetectedOrientation("");
      setDuration(0);
      setStatus("");
      setError("");
      setProgress(0);
      setUploading(false);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const resetSelectedMedia = () => {
    setFile(null);
    setUploadedUrl("");
    setUploadedPath("");
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

  const switchType = (nextType) => {
    setType(nextType);
    setCaption("");
    setTags("");
    setMentions("");
    setVisibility("public");
    setOrientation("portrait");
    resetSelectedMedia();
  };

  const setDetectedMediaShape = (width, height, nextDuration = 0) => {
    if (!width || !height) {
      return;
    }

    const ratio = width / height;
    const nextOrientation = ratio > 1.15 ? "landscape" : ratio < 0.9 ? "portrait" : "square";
    setDetectedOrientation(nextOrientation);
    setOrientation(nextOrientation === "landscape" ? "landscape" : "portrait");
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
      resetSelectedMedia();
      return;
    }

    if (isImage && (!selectedFile.type.startsWith("image/") || selectedFile.size > MAX_IMAGE_SIZE)) {
      setError("Choose an image under 5MB.");
      addToast("Choose an image under 5MB.", "error");
      event.target.value = "";
      return;
    }

    if (!isImage && (!selectedFile.type.startsWith("video/") || selectedFile.size > MAX_VIDEO_SIZE)) {
      setError("Choose a video under 50MB.");
      addToast("Choose a video under 50MB.", "error");
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
        addToast("Videos must be 2 minutes or shorter.", "error");
      }
    };
    video.src = nextPreview;
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Choose a file first.");
      addToast("Choose a file first.", "error");
      return;
    }

    if (type === "video" && duration > MAX_VIDEO_SECONDS) {
      setError("Videos must be 2 minutes or shorter.");
      addToast("Videos must be 2 minutes or shorter.", "error");
      return;
    }

    setUploading(true);
    setError("");
    setStatus(type === "video" ? "Processing video..." : "Uploading media...");
    setProgress(0);

    try {
      const uploadFile = isImage ? await compressImageFile(file) : file;
      const formData = new FormData();
      if (isProfile) {
        formData.append("image", uploadFile);
      } else {
        formData.append("media", uploadFile);
        formData.append("type", type);
        formData.append("orientation", orientation);
        formData.append("caption", caption.trim());
        formData.append("description", caption.trim());
        formData.append("tags", tags);
        formData.append("mentions", mentions);
        formData.append("visibility", visibility);
        if (duration) {
          formData.append("duration", String(Math.round(duration)));
        }
      }

      const progressOptions = {
        onUploadProgress: (event) => {
          if (event.total) {
            setProgress(Math.min(99, Math.round((event.loaded * 100) / event.total)));
          }
        },
      };

      const data = isProfile
        ? await withUploadRetry(() => uploadProfilePicture(formData, progressOptions))
        : await withUploadRetry(() => uploadMedia(formData, type, progressOptions));

      const nextUrl = uploadUrl(data.url) || uploadUrl(data.user?.profilePicture);
      const nextPath = nextUrl;
      setUploadedUrl(nextUrl);
      setUploadedPath(nextPath);
      setProgress(100);
      setStatus("Upload complete");

      if (!isProfile && nextUrl) {
        const { data: feedData } = await feedApi.get({ page: 1, limit: 10 });
        const uploadedFeedItem = (Array.isArray(feedData?.posts) ? feedData.posts : Array.isArray(feedData?.feed) ? feedData.feed : [])
          .find((post) => post?.url === nextUrl);

        if (uploadedFeedItem && isValidPost(uploadedFeedItem)) {
          prependPost(uploadedFeedItem);
          window.dispatchEvent(new CustomEvent("vibebook:post-created", { detail: { post: uploadedFeedItem } }));
        }
      }

      if (data.feedItem && isValidPost(data.feedItem)) {
        const uploadedPost = {
          ...data.feedItem,
          url: uploadUrl(data.feedItem.url) || nextUrl,
        };
        prependPost(uploadedPost);
        window.dispatchEvent(new CustomEvent("vibebook:post-created", { detail: { post: uploadedPost } }));
      }

      addToast(isProfile ? "Profile image updated" : "Upload successful", "success");

      window.setTimeout(() => {
        onClose?.();
        navigate(isProfile ? "/settings" : "/", { replace: false });
      }, 900);
    } catch (requestError) {
      console.error("UPLOAD FAILED:", requestError.response?.data);
      const uploadMessage = requestError.response?.data?.error || requestError.response?.data?.message || "Upload failed";
      setStatus("");
      setError(uploadMessage);
      addToast(uploadMessage, "error");
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
      addToast("Media deleted", "success");
    } catch (requestError) {
      const message = requestError.response?.data?.message || "Unable to delete media.";
      setError(message);
      addToast(message, "error");
    }
  };

  const previewSrc = uploadedUrl ? mediaUrl(uploadedUrl) : preview;
  const selectedLabel = file ? `${file.name} - ${(file.size / (1024 * 1024)).toFixed(1)}MB` : helperCopy;

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/70 p-2 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-brand">Create</p>
            <h2 className="truncate text-xl font-black text-navy">Share to VibeBook</h2>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close upload">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-white p-1 shadow-sm">
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
                    className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-black transition sm:text-sm ${
                      type === option.value ? "bg-brand text-navy shadow-sm" : "text-slate-500 hover:bg-slate-50"
                    }`}
                    onClick={() => switchType(option.value)}
                    disabled={uploading}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid grid-cols-5 gap-1">
              {steps.map((step, index) => (
                <div key={step} className="min-w-0">
                  <div className={`h-1.5 rounded-full ${index <= activeStep ? "bg-brand" : "bg-slate-200"}`} />
                  <p className={`mt-2 truncate text-[10px] font-black uppercase ${index === activeStep ? "text-navy" : "text-slate-400"}`}>{step}</p>
                </div>
              ))}
            </div>

            <label className="mt-5 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center transition hover:border-brand hover:bg-brand/5">
              <UploadCloud className="h-9 w-9 text-slate-400" />
              <span className="mt-3 text-sm font-black text-navy">
                {file ? "Choose a different file" : isProfile ? "Select profile picture" : isImage ? "Select image" : "Select video"}
              </span>
              <span className="mt-2 max-w-xs text-xs font-semibold leading-5 text-slate-500">{selectedLabel}</span>
              <input className="hidden" type="file" accept={isImage ? "image/*" : "video/*"} onChange={handleSelect} disabled={uploading} />
            </label>

            {detectedOrientation && (
              <div className="mt-3 rounded-lg bg-white p-3 text-xs font-semibold text-slate-600 shadow-sm">
                Detected {detectedOrientation}
                {type === "video" && duration ? ` - ${Math.round(duration)}s` : ""}
              </div>
            )}

            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
            {status && !success && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">{status}</div>}
          </aside>

          <main className="min-w-0 p-4 sm:p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(17rem,0.7fr)]">
              <div>
                <div className="relative flex min-h-[22rem] items-center justify-center overflow-hidden rounded-lg bg-slate-950 sm:min-h-[34rem]">
                  {previewSrc ? (
                    <>
                      {isImage ? (
                        <img src={previewSrc} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-2xl scale-110" />
                      ) : null}
                      <div className="relative z-10 flex h-full max-h-[72dvh] min-h-[22rem] w-full items-center justify-center p-2 sm:min-h-[34rem]">
                        {isImage ? (
                          <img src={previewSrc} alt="" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
                        ) : (
                          <video
                            src={previewSrc}
                            className="max-h-full max-w-full rounded-lg bg-slate-950 object-contain shadow-2xl"
                            controls
                            muted
                            playsInline
                            preload="metadata"
                          />
                        )}
                      </div>
                      {uploadedUrl && (
                        <button
                          type="button"
                          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-red-600 shadow"
                          onClick={handleDeleteUploaded}
                          aria-label="Delete upload"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="px-8 text-center text-white/70">
                      <Video className="mx-auto h-10 w-10 text-brand" />
                      <h3 className="mt-4 text-xl font-black text-white">Preview appears here</h3>
                      <p className="mt-2 text-sm leading-6">Your media stays contained, centered, and uncropped across portrait, landscape, and square formats.</p>
                    </div>
                  )}
                </div>

                {uploading && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between text-xs font-black uppercase text-slate-500">
                      <span>{progress >= 100 ? "Processing video..." : "Uploading..."}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {success && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
                    <CheckCircle2 className="h-6 w-6 shrink-0 animate-bounce" />
                    <div className="min-w-0">
                      <p className="font-black">Upload complete</p>
                      <p className="text-sm font-semibold">Refreshing the feed now.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {!isProfile && (
                  <>
                    <label className="block space-y-2">
                      <span className="label">Caption</span>
                      <textarea
                        className="field min-h-28 resize-y"
                        value={caption}
                        onChange={(event) => setCaption(event.target.value)}
                        placeholder="Write a caption..."
                        disabled={uploading}
                        maxLength={2200}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="label">Hashtags</span>
                      <div className="relative">
                        <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          className="field pl-10"
                          value={tags}
                          onChange={(event) => setTags(event.target.value)}
                          placeholder="vibebook, comedy, kigali"
                          disabled={uploading}
                        />
                      </div>
                    </label>

                    <label className="block space-y-2">
                      <span className="label">Mentions</span>
                      <div className="relative">
                        <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          className="field pl-10"
                          value={mentions}
                          onChange={(event) => setMentions(event.target.value)}
                          placeholder="@creator, @friend"
                          disabled={uploading}
                        />
                      </div>
                    </label>

                    <div>
                      <span className="label">Visibility</span>
                      <div className="mt-2 grid gap-2">
                        {visibilityOptions.map((option) => {
                          const Icon = option.icon;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`flex items-center justify-between rounded-lg border px-3 py-3 text-sm font-black transition ${
                                visibility === option.value ? "border-brand bg-brand/10 text-navy" : "border-slate-200 bg-white text-slate-600 hover:border-brand/60"
                              }`}
                              onClick={() => setVisibility(option.value)}
                              disabled={uploading}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                {option.label}
                              </span>
                              <span className={`h-3 w-3 rounded-full ${visibility === option.value ? "bg-brand" : "bg-slate-200"}`} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <span className="label">Safe display</span>
                      <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-surface p-1">
                        {["portrait", "landscape"].map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`rounded-lg px-3 py-2 text-sm font-black capitalize ${
                              orientation === option ? "bg-white text-navy shadow-sm" : "text-slate-500"
                            }`}
                            onClick={() => setOrientation(option)}
                            disabled={uploading}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase text-slate-500">Thumbnail preview</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950">
                      {previewSrc ? (
                        isImage ? (
                          <img src={previewSrc} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <video src={previewSrc} className="h-full w-full object-contain" muted playsInline preload="metadata" />
                        )
                      ) : (
                        <ImageIcon className="h-5 w-5 text-white/60" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-navy">{file?.name || "No media selected"}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">Aspect ratio is preserved in preview and feed.</p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-primary w-full"
                  onClick={handleUpload}
                  disabled={uploading || !file || success || (type === "video" && duration > MAX_VIDEO_SECONDS)}
                >
                  {uploading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading {progress}%
                    </span>
                  ) : success ? (
                    "Upload complete"
                  ) : (
                    "Post now"
                  )}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Upload;
