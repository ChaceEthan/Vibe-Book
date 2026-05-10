// @ts-nocheck
import {
  AtSign,
  Camera,
  CheckCircle2,
  Circle,
  Crop,
  Eye,
  Gauge,
  Hash,
  Image as ImageIcon,
  Loader2,
  Lock,
  Pause,
  Play,
  RotateCw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  SwitchCamera,
  Timer,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError") {
    return false;
  }

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

const steps = ["Choose", "Edit", "Details", "Upload", "Complete"];

const defaultEditor = {
  trimStart: 0,
  trimEnd: 0,
  splitAt: 0,
  speed: 1,
  muted: false,
  rotation: 0,
  crop: "fit",
  filter: "natural",
  effect: "none",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  sharpness: 0,
  blur: 0,
  vignette: 0,
};

const filterPresets = [
  { value: "natural", label: "Natural", brightness: 100, contrast: 100, saturation: 100, sepia: 0, hue: 0, blur: 0 },
  { value: "cinematic", label: "Cinematic", brightness: 94, contrast: 116, saturation: 92, sepia: 0.08, hue: -6, blur: 0 },
  { value: "vibrant", label: "Vibrant", brightness: 105, contrast: 108, saturation: 132, sepia: 0, hue: 0, blur: 0 },
  { value: "vintage", label: "Vintage", brightness: 100, contrast: 94, saturation: 82, sepia: 0.22, hue: -8, blur: 0 },
  { value: "cool", label: "Cool", brightness: 100, contrast: 104, saturation: 106, sepia: 0, hue: -18, blur: 0 },
  { value: "warm", label: "Warm", brightness: 103, contrast: 102, saturation: 112, sepia: 0.16, hue: 10, blur: 0 },
  { value: "bw", label: "B&W", brightness: 100, contrast: 112, saturation: 0, sepia: 0, hue: 0, blur: 0 },
  { value: "neon", label: "Neon", brightness: 108, contrast: 122, saturation: 150, sepia: 0, hue: 22, blur: 0 },
  { value: "soft", label: "Soft glow", brightness: 108, contrast: 94, saturation: 108, sepia: 0.04, hue: 0, blur: 0.4 },
];

const effectOptions = [
  { value: "none", label: "Clean" },
  { value: "fade", label: "Fade" },
  { value: "zoom", label: "Zoom" },
  { value: "blur", label: "Blur edge" },
  { value: "vignette", label: "Vignette" },
  { value: "glow", label: "Glow" },
];

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));

const buildEditorFilter = (editor) => {
  const preset = filterPresets.find((item) => item.value === editor.filter) || filterPresets[0];
  const brightness = clampNumber((editor.brightness * preset.brightness) / 100, 50, 160);
  const contrast = clampNumber((editor.contrast * preset.contrast) / 100 + editor.sharpness * 0.12, 50, 180);
  const saturation = clampNumber((editor.saturation * preset.saturation) / 100 + editor.sharpness * 0.15, 0, 220);
  const sepia = clampNumber(preset.sepia + Math.max(0, editor.warmth) / 240, 0, 1);
  const hue = clampNumber(preset.hue + editor.warmth * 0.16, -45, 45);
  const blur = clampNumber(Number(editor.blur || 0) + Number(preset.blur || 0) + (editor.effect === "blur" ? 1.25 : 0), 0, 8);

  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${sepia}) hue-rotate(${hue}deg) blur(${blur}px)`;
};

const Upload = ({ open, initialType = "image", onClose }) => {
  const { deleteMedia, uploadMedia, uploadProfilePicture } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const prependPost = usePostStore((state) => state.prependPost);
  const videoPreviewRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraFileInputRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingCanceledRef = useRef(false);
  const abortControllerRef = useRef(null);
  const [type, setType] = useState("image");
  const [captureMode, setCaptureMode] = useState("gallery");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [uploadedPath, setUploadedPath] = useState("");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [mentions, setMentions] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [location, setLocation] = useState("");
  const [orientation, setOrientation] = useState("portrait");
  const [detectedOrientation, setDetectedOrientation] = useState("");
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editor, setEditor] = useState(defaultEditor);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraFacing, setCameraFacing] = useState("user");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const isProfile = type === "profile";
  const isImage = type === "image" || isProfile;
  const success = Boolean(uploadedUrl && status);
  const activeStep = success ? 4 : uploading ? 3 : file ? 2 : 0;
  const previewSrc = uploadedUrl ? mediaUrl(uploadedUrl) : preview;
  const editorFilter = useMemo(() => buildEditorFilter(editor), [editor]);
  const previewObjectFit = editor.crop === "fill" ? "cover" : "contain";
  const previewTransform = `rotate(${editor.rotation}deg) scale(${editor.effect === "zoom" ? 1.05 : 1})`;
  const selectedLabel = file ? `${file.name} - ${(file.size / (1024 * 1024)).toFixed(1)}MB` : "Choose a file or record in the app.";
  const trimMax = Math.max(1, Math.round(duration || MAX_VIDEO_SECONDS));

  const helperCopy = useMemo(() => {
    if (isProfile) {
      return "Update your profile picture without changing the upload pipeline.";
    }

    if (type === "video") {
      return "Record in the app or upload a video. Portrait is preferred, but every ratio stays safe.";
    }

    return "Upload photos with lightweight editing, clean details, and the same reliable upload path.";
  }, [isProfile, type]);

  const stopCamera = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        recordingCanceledRef.current = true;
        mediaRecorderRef.current.stop();
      } catch {
        // Camera cleanup should never block closing the modal.
      }
    }

    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setRecording(false);
    setRecordSeconds(0);
    setTorchEnabled(false);
  };

  const resetSelectedMedia = () => {
    setFile(null);
    setUploadedUrl("");
    setUploadedPath("");
    setDetectedOrientation("");
    setDuration(0);
    setStatus("");
    setError("");
    setProgress(0);
    setEditor(defaultEditor);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const switchType = (nextType) => {
    stopCamera();
    setType(nextType);
    setCaptureMode("gallery");
    setCaption("");
    setTags("");
    setMentions("");
    setLocation("");
    setVisibility("public");
    setOrientation("portrait");
    resetSelectedMedia();
  };

  const resetAll = () => {
    abortControllerRef.current?.abort?.();
    abortControllerRef.current = null;
    stopCamera();
    setFile(null);
    setUploadedUrl("");
    setUploadedPath("");
    setCaption("");
    setTags("");
    setMentions("");
    setLocation("");
    setVisibility("public");
    setOrientation("portrait");
    setDetectedOrientation("");
    setDuration(0);
    setStatus("");
    setError("");
    setProgress(0);
    setUploading(false);
    setEditor(defaultEditor);
    setCaptureMode("gallery");
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

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
      setCaptureMode("gallery");
    }
  }, [initialType, open]);

  useEffect(() => {
    if (!open) {
      resetAll();
    }
  }, [open]);

  useEffect(() => {
    const video = videoPreviewRef.current;

    if (!video) {
      return;
    }

    video.playbackRate = Number(editor.speed || 1);
    video.defaultPlaybackRate = Number(editor.speed || 1);
    video.muted = Boolean(editor.muted);
  }, [editor.speed, editor.muted, previewSrc]);

  useEffect(() => {
    if (!recording) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setRecordSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [recording]);

  if (!open) {
    return null;
  }

  const updateEditor = (field, value) => {
    setEditor((current) => ({ ...current, [field]: value }));
  };

  const setDetectedMediaShape = (width, height, nextDuration = 0) => {
    if (!width || !height) {
      return;
    }

    const ratio = width / height;
    const nextOrientation = ratio > 1.15 ? "landscape" : ratio < 0.9 ? "portrait" : "square";
    const normalizedDuration = Number.isFinite(nextDuration) ? nextDuration : 0;
    setDetectedOrientation(nextOrientation);
    setOrientation(nextOrientation === "landscape" ? "landscape" : "portrait");
    setDuration(normalizedDuration);
    setEditor((current) => ({
      ...current,
      trimStart: 0,
      trimEnd: normalizedDuration ? Math.round(normalizedDuration) : 0,
      splitAt: normalizedDuration ? Math.round(normalizedDuration / 2) : 0,
    }));
  };

  const acceptSelectedFile = (selectedFile, forcedType = "") => {
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

    const nextType = forcedType || (selectedFile.type.startsWith("video/") ? "video" : isProfile ? "profile" : "image");
    const nextIsImage = nextType === "image" || nextType === "profile";

    if (nextIsImage && (!selectedFile.type.startsWith("image/") || selectedFile.size > MAX_IMAGE_SIZE)) {
      setError("Choose an image under 5MB.");
      addToast("Choose an image under 5MB.", "error");
      return;
    }

    if (!nextIsImage && (!selectedFile.type.startsWith("video/") || selectedFile.size > MAX_VIDEO_SIZE)) {
      setError("Choose a video under 50MB.");
      addToast("Choose a video under 50MB.", "error");
      return;
    }

    if (nextType !== type) {
      setType(nextType);
    }

    const nextPreview = URL.createObjectURL(selectedFile);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreview;
    });
    setFile(selectedFile);
    setEditor(defaultEditor);

    if (nextIsImage) {
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

  const handleSelect = (event, forcedType = "") => {
    const selectedFile = event.target.files?.[0];
    acceptSelectedFile(selectedFile, forcedType);
    event.target.value = "";
  };

  const startCamera = async (preferredFacing = cameraFacing) => {
    setCameraError("");
    setCaptureMode("camera");
    setType("video");
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera recording is not available in this browser.");
      addToast("Camera recording is not available in this browser.", "error");
      return;
    }

    const videoConstraints = {
      facingMode: preferredFacing,
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    };

    try {
      let stream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      }

      mediaStreamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play?.().catch(() => undefined);
        }
      }, 0);
    } catch {
      setCameraError("Camera permission was denied or no camera was found.");
      addToast("Camera permission was denied or no camera was found.", "error");
    }
  };

  const switchCameraFacing = () => {
    const nextFacing = cameraFacing === "user" ? "environment" : "user";
    setCameraFacing(nextFacing);
    startCamera(nextFacing);
  };

  const toggleTorch = async () => {
    const track = mediaStreamRef.current?.getVideoTracks?.()[0];
    const capabilities = track?.getCapabilities?.();

    if (!track || !capabilities?.torch) {
      setCameraError("Flash is not available on this camera.");
      return;
    }

    try {
      await track.applyConstraints({ advanced: [{ torch: !torchEnabled }] });
      setTorchEnabled((current) => !current);
    } catch {
      setCameraError("Flash could not be changed on this device.");
    }
  };

  const startRecording = () => {
    const stream = mediaStreamRef.current;

    if (!stream || recording) {
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setCameraError("Recording is not supported by this browser. Gallery upload still works.");
      return;
    }

    try {
      const mimeType = MediaRecorder.isTypeSupported?.("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported?.("video/webm")
          ? "video/webm"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "video/webm" });

        if (!recordingCanceledRef.current && blob.size) {
          const recordedFile = new File([blob], `vibebook-recording-${Date.now()}.webm`, {
            type: blob.type || "video/webm",
            lastModified: Date.now(),
          });
          acceptSelectedFile(recordedFile, "video");
        }

        recordingCanceledRef.current = false;
        stopCamera();
      };

      recordingCanceledRef.current = false;
      setRecordSeconds(0);
      setRecording(true);
      recorder.start(250);
    } catch {
      setCameraError("Recording is not supported by this browser.");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return;
    }

    recordingCanceledRef.current = false;
    mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const cancelUpload = () => {
    abortControllerRef.current?.abort?.();
    abortControllerRef.current = null;
    setUploading(false);
    setStatus("Upload canceled.");
    setProgress(0);
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

    const controller = new AbortController();
    abortControllerRef.current = controller;
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
        formData.append("location", location.trim());
        formData.append("editor", JSON.stringify({ ...editor, source: captureMode }));
        formData.append("muted", String(Boolean(editor.muted)));
        formData.append("playbackSpeed", String(editor.speed));
        if (duration) {
          formData.append("duration", String(Math.round(duration)));
        }
      }

      const progressOptions = {
        signal: controller.signal,
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

      if (!isProfile && nextUrl && !data.feedItem) {
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
      const canceled = requestError?.code === "ERR_CANCELED" || requestError?.name === "CanceledError" || requestError?.name === "AbortError";
      const uploadMessage = canceled
        ? "Upload canceled."
        : requestError.response?.data?.error || requestError.response?.data?.message || "Upload failed";
      setStatus("");
      setError(uploadMessage);
      addToast(uploadMessage, canceled ? "info" : "error");
    } finally {
      abortControllerRef.current = null;
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

  const handleClose = () => {
    if (uploading) {
      cancelUpload();
    }

    stopCamera();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/80 p-2 backdrop-blur-md sm:items-center sm:justify-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header with step progress */}
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Create Post</p>
              <h2 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900">
                {isProfile ? "Update profile picture" : "Create a VibeBook post"}
              </h2>
            </div>
            <button
              type="button"
              className="flex-shrink-0 rounded-lg p-2 text-slate-500 transition duration-200 hover:bg-slate-100 hover:text-slate-900"
              onClick={handleClose}
              aria-label="Close upload"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Step progress indicator */}
          <div className="flex items-center gap-2">
            {steps.map((step, index) => (
              <div key={step} className="flex flex-1 items-center">
                <div className="relative flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold text-sm transition-all duration-200 ${
                      index < activeStep
                        ? "bg-green-500 text-white"
                        : index === activeStep
                          ? "bg-blue-600 text-white shadow-lg"
                          : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {index < activeStep ? "✓" : index + 1}
                  </div>
                  <span
                    className={`hidden sm:block text-xs font-semibold ${
                      index <= activeStep ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {step}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-2 transition-all duration-200 ${
                      index < activeStep ? "bg-green-500" : "bg-slate-300"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[0.86fr_1.14fr]">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            {/* Media type selector */}
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-white p-2 shadow-sm">
              {[
                { value: "profile", label: "Profile", icon: UserRound },
                { value: "image", label: "Photo", icon: ImageIcon },
                { value: "video", label: "Video", icon: Video },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs font-bold transition-all duration-200 ${
                      type === option.value
                        ? "bg-blue-600 text-white shadow-lg scale-105"
                        : "bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                    onClick={() => switchType(option.value)}
                    disabled={uploading}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>

            {!isProfile ? (
              <div className="mt-6 grid gap-3">
                <button
                  type="button"
                  className="group relative flex items-center justify-between overflow-hidden rounded-xl border-2 border-slate-200 bg-white p-4 text-left transition-all duration-200 hover:border-blue-400 hover:shadow-md disabled:opacity-50"
                  onClick={() => startCamera(cameraFacing)}
                  disabled={uploading || recording}
                >
                  <div className="relative z-10 min-w-0">
                    <span className="block text-sm font-bold text-slate-900">Record Video</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">Use your phone camera inside VibeBook.</span>
                  </div>
                  <Camera className="relative z-10 h-6 w-6 shrink-0 text-blue-600 transition-transform group-hover:scale-110" />
                </button>

                <label className="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-xl border-2 border-slate-200 bg-white p-4 text-left transition-all duration-200 hover:border-blue-400 hover:shadow-md">
                  <div className="relative z-10 min-w-0">
                    <span className="block text-sm font-bold text-slate-900">Upload Video</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">Select a video up to 2 minutes.</span>
                  </div>
                  <UploadCloud className="relative z-10 h-6 w-6 shrink-0 text-blue-600 transition-transform group-hover:scale-110" />
                  <input className="hidden" type="file" accept="video/*" onChange={(event) => handleSelect(event, "video")} disabled={uploading} />
                </label>

                <label className="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-xl border-2 border-slate-200 bg-white p-4 text-left transition-all duration-200 hover:border-blue-400 hover:shadow-md">
                  <div className="relative z-10 min-w-0">
                    <span className="block text-sm font-bold text-slate-900">Upload Photo</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">Post an image with filters and effects.</span>
                  </div>
                  <ImageIcon className="relative z-10 h-6 w-6 shrink-0 text-blue-600 transition-transform group-hover:scale-110" />
                  <input className="hidden" type="file" accept="image/*" onChange={(event) => handleSelect(event, "image")} disabled={uploading} />
                </label>
              </div>
            ) : (
              <label className="mt-5 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center transition hover:border-brand hover:bg-brand/5">
                <UserRound className="h-9 w-9 text-slate-400" />
                <span className="mt-3 text-sm font-black text-navy">Select profile picture</span>
                <span className="mt-2 max-w-xs text-xs font-semibold leading-5 text-slate-500">{selectedLabel}</span>
                <input className="hidden" type="file" accept="image/*" onChange={(event) => handleSelect(event, "profile")} disabled={uploading} />
              </label>
            )}

            {cameraOpen && (
              <div className="mt-6 overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-950 shadow-lg">
                <div className="relative aspect-[9/16] sm:aspect-[9/14]">
                  <video ref={cameraVideoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
                  
                  {/* Recording indicator */}
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-slate-950/80 to-transparent p-4">
                    <div className="flex items-center gap-2 text-white text-sm font-bold">
                      <div className={`h-3 w-3 rounded-full ${recording ? "animate-pulse bg-red-500" : "bg-white/70"}`} />
                      {recording ? `${recordSeconds}s` : "Ready"}
                    </div>
                    <span className="text-xs font-semibold text-white/90 bg-slate-950/60 px-2 py-1 rounded">
                      {cameraFacing === "user" ? "Front" : "Back"}
                    </span>
                  </div>

                  {/* Camera controls */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-slate-950/90 to-transparent p-6">
                    <button
                      type="button"
                      className="rounded-full bg-white/20 p-3 text-white backdrop-blur transition-all duration-200 hover:bg-white/30 hover:scale-110"
                      onClick={switchCameraFacing}
                      aria-label="Switch camera"
                      title="Switch camera"
                    >
                      <SwitchCamera className="h-6 w-6" />
                    </button>

                    <button
                      type="button"
                      className={`flex h-16 w-16 items-center justify-center rounded-full border-4 font-semibold shadow-lg transition-all duration-150 active:scale-95 ${
                        recording
                          ? "border-red-400 bg-red-500 text-white hover:bg-red-600"
                          : "border-white bg-white text-slate-900 hover:scale-105"
                      }`}
                      onClick={recording ? stopRecording : startRecording}
                      aria-label={recording ? "Stop recording" : "Start recording"}
                      title={recording ? "Stop recording" : "Start recording"}
                    >
                      {recording ? <Pause className="h-7 w-7 fill-white" /> : <Circle className="h-8 w-8 fill-red-500 text-red-500" />}
                    </button>

                    <button
                      type="button"
                      className={`rounded-full p-3 backdrop-blur transition-all duration-200 hover:scale-110 ${
                        torchEnabled ? "bg-yellow-400/40 text-yellow-300" : "bg-white/20 text-white hover:bg-white/30"
                      }`}
                      onClick={toggleTorch}
                      aria-label="Toggle flash"
                      title="Toggle flash"
                    >
                      <Zap className="h-6 w-6" />
                    </button>
                  </div>
                </div>
                
                <div className="bg-slate-900 px-4 py-3">
                  <button
                    type="button"
                    className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-slate-600"
                    onClick={stopCamera}
                  >
                    Close Camera
                  </button>
                </div>
              </div>
            )}

            {cameraError && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">{cameraError}</div>}
            {cameraError && !isProfile && (
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-navy shadow-sm transition hover:border-brand">
                <Camera className="h-4 w-4" />
                Use device camera picker
                <input
                  ref={cameraFileInputRef}
                  className="hidden"
                  type="file"
                  accept="video/*"
                  capture="environment"
                  onChange={(event) => handleSelect(event, "video")}
                  disabled={uploading}
                />
              </label>
            )}

            {detectedOrientation && (
              <div className="mt-3 rounded-lg bg-white p-3 text-xs font-semibold text-slate-600 shadow-sm">
                Detected {detectedOrientation}
                {type === "video" && duration ? ` - ${Math.round(duration)}s` : ""}
              </div>
            )}

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-500 shadow-sm">
              {helperCopy}
            </div>

            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
            {status && !success && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">{status}</div>}
          </aside>

          <main className="min-w-0 p-4 sm:p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(17rem,0.68fr)]">
              <div className="space-y-4">
                <div className="relative flex min-h-[22rem] items-center justify-center overflow-hidden rounded-lg bg-slate-950 sm:min-h-[34rem]">
                  {previewSrc ? (
                    <>
                      {isImage ? (
                        <img src={previewSrc} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
                      ) : null}
                      <div className="relative z-10 flex h-full max-h-[72dvh] min-h-[22rem] w-full items-center justify-center p-2 sm:min-h-[34rem]">
                        {isImage ? (
                          <img
                            src={previewSrc}
                            alt=""
                            className="max-h-full max-w-full rounded-lg shadow-2xl"
                            style={{ filter: editorFilter, objectFit: previewObjectFit, transform: previewTransform, transition: "filter 160ms ease, transform 160ms ease" }}
                          />
                        ) : (
                          <video
                            ref={videoPreviewRef}
                            src={previewSrc}
                            className="max-h-full max-w-full rounded-lg bg-slate-950 shadow-2xl"
                            style={{ filter: editorFilter, objectFit: previewObjectFit, transform: previewTransform, transition: "filter 160ms ease, transform 160ms ease" }}
                            controls
                            muted={editor.muted}
                            playsInline
                            preload="metadata"
                          />
                        )}
                      </div>
                      {(editor.effect === "vignette" || editor.vignette > 0) && (
                        <div
                          className="pointer-events-none absolute inset-0 z-20"
                          style={{ boxShadow: `inset 0 0 ${80 + editor.vignette}px rgba(2,6,23,${0.28 + editor.vignette / 240})` }}
                        />
                      )}
                      {editor.effect === "fade" && <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-slate-950/25 via-transparent to-white/10" />}
                      {uploadedUrl && (
                        <button
                          type="button"
                          className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-red-600 shadow"
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
                      <p className="mt-2 text-sm leading-6">Record, edit, or upload media while the original quality stays safe for posting.</p>
                    </div>
                  )}
                </div>

                {file && !isProfile && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-brand">Editor</p>
                        <h3 className="text-lg font-black text-navy">Tune before posting</h3>
                      </div>
                      <Sparkles className="h-5 w-5 text-brand" />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-700">
                          <Wand2 className="h-4 w-4" />
                          Filters
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {filterPresets.map((filter) => (
                            <button
                              key={filter.value}
                              type="button"
                              className={`shrink-0 rounded-lg border-2 px-4 py-2 text-xs font-bold transition-all duration-200 ${
                                editor.filter === filter.value
                                  ? "border-blue-600 bg-blue-600 text-white shadow-lg"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-400"
                              }`}
                              onClick={() => updateEditor("filter", filter.value)}
                              disabled={uploading}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-700">
                          <Sparkles className="h-4 w-4" />
                          Effects
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {effectOptions.map((effect) => (
                            <button
                              key={effect.value}
                              type="button"
                              className={`rounded-lg border-2 px-3 py-2 text-xs font-bold transition-all duration-200 ${
                                editor.effect === effect.value
                                  ? "border-blue-600 bg-blue-600 text-white shadow-lg"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-400"
                              }`}
                              onClick={() => updateEditor("effect", effect.value)}
                              disabled={uploading}
                            >
                              {effect.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      {type === "video" && (
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                            <Scissors className="h-4 w-4" />
                            Trim and split
                          </div>
                          <label className="block text-xs font-bold text-slate-600">
                            Start {Math.round(editor.trimStart)}s
                            <input
                              className="mt-2 w-full accent-brand"
                              type="range"
                              min="0"
                              max={trimMax}
                              value={editor.trimStart}
                              onChange={(event) => updateEditor("trimStart", Math.min(Number(event.target.value), editor.trimEnd || trimMax))}
                              disabled={uploading}
                            />
                          </label>
                          <label className="mt-3 block text-xs font-bold text-slate-600">
                            End {Math.round(editor.trimEnd || trimMax)}s
                            <input
                              className="mt-2 w-full accent-brand"
                              type="range"
                              min="0"
                              max={trimMax}
                              value={editor.trimEnd || trimMax}
                              onChange={(event) => updateEditor("trimEnd", Math.max(Number(event.target.value), editor.trimStart))}
                              disabled={uploading}
                            />
                          </label>
                          <label className="mt-3 block text-xs font-bold text-slate-600">
                            Split marker {Math.round(editor.splitAt)}s
                            <input
                              className="mt-2 w-full accent-brand"
                              type="range"
                              min="0"
                              max={trimMax}
                              value={editor.splitAt}
                              onChange={(event) => updateEditor("splitAt", Number(event.target.value))}
                              disabled={uploading}
                            />
                          </label>
                        </div>
                      )}

                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                          <SlidersHorizontal className="h-4 w-4" />
                          Adjustments
                        </div>
                        {[
                          ["brightness", "Brightness", 60, 140],
                          ["contrast", "Contrast", 60, 150],
                          ["saturation", "Saturation", 0, 180],
                          ["warmth", "Warmth", -80, 80],
                          ["sharpness", "Sharpness", 0, 100],
                          ["blur", "Blur", 0, 6],
                        ].map(([field, label, min, max]) => (
                          <label key={field} className="mb-2 block text-xs font-bold text-slate-600">
                            <span className="flex justify-between">
                              <span>{label}</span>
                              <span>{editor[field]}</span>
                            </span>
                            <input
                              className="mt-1 w-full accent-brand"
                              type="range"
                              min={min}
                              max={max}
                              value={editor[field]}
                              onChange={(event) => updateEditor(field, Number(event.target.value))}
                              disabled={uploading}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                          <Crop className="h-4 w-4" />
                          Crop
                        </div>
                        <div className="grid gap-2">
                          {[
                            ["fit", "Fit"],
                            ["fill", "Fill"],
                            ["square", "Square"],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={`rounded-lg px-3 py-2 text-xs font-black ${editor.crop === value ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}
                              onClick={() => updateEditor("crop", value)}
                              disabled={uploading}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                          <Gauge className="h-4 w-4" />
                          Speed
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[0.5, 1, 1.5, 2].map((speed) => (
                            <button
                              key={speed}
                              type="button"
                              className={`rounded-lg px-3 py-2 text-xs font-black ${editor.speed === speed ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}
                              onClick={() => updateEditor("speed", speed)}
                              disabled={uploading || type !== "video"}
                            >
                              {speed}x
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                          <RotateCw className="h-4 w-4" />
                          Transform
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm"
                            onClick={() => updateEditor("rotation", (Number(editor.rotation || 0) + 90) % 360)}
                            disabled={uploading}
                          >
                            Rotate
                          </button>
                          <button
                            type="button"
                            className={`rounded-lg bg-white px-3 py-2 text-xs font-black shadow-sm ${editor.muted ? "text-red-600" : "text-slate-600"}`}
                            onClick={() => updateEditor("muted", !editor.muted)}
                            disabled={uploading || type !== "video"}
                          >
                            <span className="inline-flex items-center gap-1">
                              {editor.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                              {editor.muted ? "Muted" : "Audio"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {uploading && (
                  <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5 shadow-md">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded-full bg-blue-600 animate-pulse" />
                        <span className="text-sm font-bold text-slate-900">
                          {progress >= 100 ? "Processing media..." : "Uploading..."}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-blue-600">{progress}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-blue-200 shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out shadow-lg"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <button
                      type="button"
                      className="mt-3 text-xs font-bold text-red-600 transition-colors hover:text-red-700"
                      onClick={cancelUpload}
                    >
                      Cancel upload
                    </button>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-4 rounded-xl border-2 border-green-300 bg-green-50 p-5 shadow-lg">
                    <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600 animate-bounce" />
                    <div className="min-w-0">
                      <p className="font-bold text-green-900">Upload complete!</p>
                      <p className="mt-1 text-sm font-semibold text-green-700">Your post will appear in your feed shortly.</p>
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

                    <label className="block space-y-2">
                      <span className="label">Location optional</span>
                      <input
                        className="field"
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="Kigali, Rwanda"
                        disabled={uploading}
                      />
                    </label>

                    <div>
                      <span className="label font-bold">Visibility</span>
                      <div className="mt-3 grid gap-2">
                        {visibilityOptions.map((option) => {
                          const Icon = option.icon;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`flex items-center justify-between rounded-lg border-2 px-4 py-3 text-sm font-bold transition-all duration-200 ${
                                visibility === option.value
                                  ? "border-blue-600 bg-blue-50 text-blue-900 shadow-md"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-400"
                              }`}
                              onClick={() => setVisibility(option.value)}
                              disabled={uploading}
                            >
                              <span className="inline-flex items-center gap-2">
                                <Icon className="h-5 w-5" />
                                {option.label}
                              </span>
                              <div className={`h-4 w-4 rounded-full border-2 ${visibility === option.value ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`} />
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
                          <img src={previewSrc} alt="" className="h-full w-full object-contain" style={{ filter: editorFilter }} />
                        ) : (
                          <video src={previewSrc} className="h-full w-full object-contain" muted playsInline preload="metadata" style={{ filter: editorFilter }} />
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
                  className="w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-lg transition-all duration-200 hover:bg-blue-700 hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
                  onClick={handleUpload}
                  disabled={uploading || !file || success || (type === "video" && duration > MAX_VIDEO_SECONDS)}
                >
                  {uploading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Uploading {progress}%</span>
                    </span>
                  ) : success ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      Upload complete
                    </span>
                  ) : isProfile ? (
                    "Save profile image"
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2">
                      <UploadCloud className="h-5 w-5" />
                      Post now
                    </span>
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
