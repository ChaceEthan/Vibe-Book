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
  Users,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { feedApi, mediaUrl } from "../services/api";
import { isRenderableMediaUrl, isValidPost, normalizePost, stablePostUrl, usePostStore } from "../store/postStore";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 120;
const uploadUrl = (value) => String(value || "").trim();
const COMPRESSED_IMAGE_MAX_SIDE = 1600;
const COMPRESSED_IMAGE_QUALITY = 0.82;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);
const VALID_VISIBILITIES = new Set(["public", "followers", "private"]);
const VIDEO_FILE_ACCEPT = "video/mp4,video/quicktime,video/webm,video/*";
const IMAGE_FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/*";
const MIME_BY_EXTENSION = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mov: "video/quicktime",
  mp4: "video/mp4",
  png: "image/png",
  webm: "video/webm",
  webp: "image/webp",
};

const extensionForMime = (mimeType = "") => {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/mp4") return "mp4";
  return mimeType.startsWith("image/") ? "jpg" : "mp4";
};

const extensionFromName = (name = "") => String(name).split(".").pop()?.toLowerCase() || "";

const inferMimeType = (file, forcedType = "") => {
  const declaredType = String(file?.type || "").toLowerCase();
  if (declaredType && !GENERIC_MIME_TYPES.has(declaredType)) {
    return declaredType;
  }

  const extensionType = MIME_BY_EXTENSION[extensionFromName(file?.name)];
  if (extensionType) {
    return extensionType;
  }

  if (forcedType === "image") return "image/jpeg";
  if (forcedType === "video") return "video/mp4";
  return "";
};

const normalizeUploadFile = (sourceFile, forcedType = "") => {
  if (!sourceFile) {
    return null;
  }

  const mimeType = inferMimeType(sourceFile, forcedType);
  const declaredType = String(sourceFile.type || "").toLowerCase();
  const needsMimePatch = !declaredType || GENERIC_MIME_TYPES.has(declaredType);

  if (!needsMimePatch || !mimeType) {
    return sourceFile;
  }

  const fallbackName = `vibebook-upload-${Date.now()}.${extensionForMime(mimeType)}`;
  const fileName = sourceFile.name?.includes(".") ? sourceFile.name : fallbackName;

  try {
    return new File([sourceFile], fileName, {
      type: mimeType,
      lastModified: sourceFile.lastModified || Date.now(),
    });
  } catch {
    return sourceFile;
  }
};

const appendFile = (formData, field, sourceFile, fallbackType) => {
  const fileName = sourceFile?.name?.trim?.() || `vibebook-upload-${Date.now()}.${extensionForMime(inferMimeType(sourceFile, fallbackType))}`;
  formData.append(field, sourceFile, fileName);
};

const serializeTags = (value = "") =>
  Array.from(
    new Set(
      String(value)
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#+/, "").toLowerCase())
        .filter(Boolean)
    )
  )
    .slice(0, 10)
    .join(",");

const serializeMentions = (value = "") =>
  Array.from(
    new Set(
      String(value)
        .split(/[,\s]+/)
        .map((mention) => mention.trim().replace(/^@+/, "").toLowerCase())
        .filter(Boolean)
    )
  )
    .slice(0, 20)
    .join(",");

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

const withUploadRetry = async (operation, attempts = 1) => {
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
  const { deleteMedia, uploadMedia } = useAuth();
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
  const uploadInFlightRef = useRef(false);
  const closeTimerRef = useRef(null);
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
  const [cameraPreparing, setCameraPreparing] = useState(false);
  const [activeEditorPanel, setActiveEditorPanel] = useState("filters");
  const [previewError, setPreviewError] = useState("");
  const [previewMuted, setPreviewMuted] = useState(true);
  const [mobileRecorderAvailable, setMobileRecorderAvailable] = useState(false);

  const isProfile = false;
  const isImage = type === "image";
  const success = Boolean(uploadedUrl && status);
  const activeStep = success ? 4 : uploading ? 3 : file ? 2 : 0;
  const previewSrc = uploadedUrl ? mediaUrl(uploadedUrl) : preview;
  const editorFilter = useMemo(() => buildEditorFilter(editor), [editor]);
  const previewObjectFit = editor.crop === "fill" ? "cover" : "contain";
  const previewTransform = `rotate(${editor.rotation}deg) scale(${editor.effect === "zoom" ? 1.05 : 1})`;
  const selectedLabel = file ? `${file.name} - ${(file.size / (1024 * 1024)).toFixed(1)}MB` : "Choose a file or record in the app.";
  const canPost = Boolean(file && !uploading && !success && !previewError && !(type === "video" && duration > MAX_VIDEO_SECONDS));
  const trimMax = Math.max(1, Math.round(duration || MAX_VIDEO_SECONDS));
  const editorToolTabs = useMemo(
    () =>
      [
        { value: "filters", label: "Filters", icon: Wand2 },
        { value: "effects", label: "Effects", icon: Sparkles },
        ...(type === "video" ? [{ value: "trim", label: "Trim", icon: Scissors }] : []),
        { value: "adjustments", label: "Adjust", icon: SlidersHorizontal },
        { value: "crop", label: "Crop", icon: Crop },
        { value: "speed", label: "Speed", icon: Gauge },
        { value: "audio", label: "Audio", icon: Volume2 },
      ],
    [type]
  );
  const editorPanelClass = (panel) => (activeEditorPanel === panel ? "block" : "hidden lg:block");

  const helperCopy = useMemo(() => {
    if (type === "video") {
      return "Record in the app or upload a video. Portrait is preferred, but every ratio stays safe.";
    }

    return "Upload photos with lightweight editing, clean details, and the same reliable upload path.";
  }, [type]);

  const attachCameraStream = async (stream = mediaStreamRef.current) => {
    const video = cameraVideoRef.current;

    if (!video || !stream) {
      return;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    try {
      await video.play?.();
    } catch {
      // The user can still start recording once the browser allows playback.
    }
  };

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
    setCameraPreparing(false);
  };

  const resetSelectedMedia = () => {
    setFile(null);
    setUploadedUrl("");
    setUploadedPath("");
    setDetectedOrientation("");
    setDuration(0);
    setStatus("");
    setError("");
    setPreviewError("");
    setPreviewMuted(true);
    setProgress(0);
    setEditor(defaultEditor);
    setActiveEditorPanel("filters");
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
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    abortControllerRef.current?.abort?.();
    abortControllerRef.current = null;
    uploadInFlightRef.current = false;
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
    setPreviewError("");
    setPreviewMuted(true);
    setProgress(0);
    setUploading(false);
    setEditor(defaultEditor);
    setActiveEditorPanel("filters");
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
    return () => {
      abortControllerRef.current?.abort?.();
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const query = "(max-width: 1024px), (pointer: coarse)";
    const mediaQuery = window.matchMedia?.(query);
    const update = () => setMobileRecorderAvailable(Boolean(mediaQuery?.matches));

    update();
    mediaQuery?.addEventListener?.("change", update);
    return () => mediaQuery?.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (cameraOpen) {
      attachCameraStream();
    }
  }, [cameraOpen]);

  useEffect(() => {
    if (open) {
      setType(initialType === "video" ? "video" : "image");
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
    video.muted = Boolean(previewMuted);
    if (previewSrc && type === "video" && !previewError) {
      video.play().catch(() => null);
    }
  }, [editor.speed, previewMuted, previewSrc, previewError, type]);

  useEffect(() => {
    if (!recording) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setRecordSeconds((current) => {
        const next = current + 1;
        if (next >= MAX_VIDEO_SECONDS) {
          window.setTimeout(() => stopRecording(), 0);
        }
        return next;
      });
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
    setPreviewError("");
    setPreviewMuted(true);
    setUploadedUrl("");
    setUploadedPath("");
    setProgress(0);
    setDetectedOrientation("");
    setDuration(0);

    if (!selectedFile) {
      resetSelectedMedia();
      return;
    }

    const sourceMimeType = inferMimeType(selectedFile, forcedType);
    const nextType = forcedType === "video" || sourceMimeType.startsWith("video/") ? "video" : "image";
    const nextIsImage = nextType === "image";
    const normalizedFile = normalizeUploadFile(selectedFile, nextType);
    const mimeType = inferMimeType(normalizedFile, nextType);

    if (!normalizedFile?.size) {
      setError("Choose a valid media file.");
      addToast("Choose a valid media file.", "error");
      return;
    }

    if (nextIsImage && (!IMAGE_MIME_TYPES.has(mimeType) || normalizedFile.size > MAX_IMAGE_SIZE)) {
      setError("Choose an image under 5MB.");
      addToast("Choose an image under 5MB.", "error");
      return;
    }

    if (!nextIsImage && (!VIDEO_MIME_TYPES.has(mimeType) || normalizedFile.size > MAX_VIDEO_SIZE)) {
      setError("Choose a video under 50MB.");
      addToast("Choose a video under 50MB.", "error");
      return;
    }

    if (nextType !== type) {
      setType(nextType);
    }

    const nextPreview = URL.createObjectURL(normalizedFile);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextPreview;
    });
    setFile(normalizedFile);
    setEditor(defaultEditor);
    setActiveEditorPanel("filters");

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

  const handlePreviewDragOver = (event) => {
    event.preventDefault();
    if (!uploading) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handlePreviewDrop = (event) => {
    event.preventDefault();
    if (uploading) {
      return;
    }

    setCaptureMode("gallery");
    acceptSelectedFile(event.dataTransfer.files?.[0]);
  };

  const startCamera = async (preferredFacing = cameraFacing) => {
    if (!mobileRecorderAvailable) {
      setCameraError("Camera recording is available on mobile and tablet devices.");
      return;
    }

    setCameraError("");
    setCameraPreparing(true);
    setCaptureMode("camera");
    setType("video");
    stopCamera();
    setCameraPreparing(true);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera recording is not available in this browser.");
      addToast("Camera recording is not available in this browser.", "error");
      setCameraPreparing(false);
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
      window.requestAnimationFrame(() => attachCameraStream(stream));
    } catch {
      setCameraError("Camera permission was denied or no camera was found.");
      addToast("Camera permission was denied or no camera was found.", "error");
    } finally {
      setCameraPreparing(false);
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
    uploadInFlightRef.current = false;
    setUploading(false);
    setStatus("Upload canceled.");
    setProgress(0);
  };

  const removeSelectedMedia = () => {
    if (uploading) {
      return;
    }

    setFile(null);
    setUploadedUrl("");
    setUploadedPath("");
    setDetectedOrientation("");
    setDuration(0);
    setStatus("");
    setError("");
    setPreviewError("");
    setPreviewMuted(true);
    setProgress(0);
    setEditor(defaultEditor);
    setActiveEditorPanel("filters");
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const replayPreview = () => {
    const video = videoPreviewRef.current;
    if (!video) {
      return;
    }

    video.currentTime = 0;
    video.play().catch(() => null);
  };

  const handleUpload = async () => {
    if (uploadInFlightRef.current || uploading) {
      return;
    }

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

    uploadInFlightRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setUploading(true);
    setError("");
    setStatus("Preparing upload...");
    setProgress(4);

    try {
      const uploadType = type === "video" ? "video" : "image";
      const normalizedFile = normalizeUploadFile(file, uploadType);
      const uploadFile = uploadType === "image" ? await compressImageFile(normalizedFile) : normalizedFile;
      const uploadMimeType = inferMimeType(uploadFile, uploadType);

      if (!uploadFile?.size) {
        throw new Error("Choose a valid media file.");
      }

      if (uploadType === "video" && !VIDEO_MIME_TYPES.has(uploadMimeType)) {
        throw new Error("Use an MP4, MOV, or WEBM video.");
      }

      if (uploadType === "image" && !IMAGE_MIME_TYPES.has(uploadMimeType)) {
        throw new Error("Use a JPEG, PNG, WEBP, or GIF image.");
      }

      const formData = new FormData();

      appendFile(formData, "media", uploadFile, uploadType);
      formData.append("type", uploadType);
      formData.append("orientation", orientation === "landscape" ? "landscape" : "portrait");
      formData.append("caption", caption.trim());
      formData.append("description", caption.trim());
      formData.append("tags", serializeTags(tags));
      formData.append("mentions", serializeMentions(mentions));
      formData.append("visibility", VALID_VISIBILITIES.has(visibility) ? visibility : "public");
      formData.append("location", location.trim());
      formData.append("editor", JSON.stringify({ ...defaultEditor, ...editor, source: captureMode }));
      formData.append("muted", String(Boolean(editor.muted)));
      formData.append("playbackSpeed", String(Number(editor.speed || 1)));
      if (uploadType === "video" && duration) {
        formData.append("duration", String(Math.round(duration)));
      }

      setStatus(uploadType === "video" ? "Uploading video..." : "Uploading media...");
      setProgress((current) => Math.max(current, 8));
      const progressOptions = {
        signal: controller.signal,
        onUploadProgress: (event) => {
          if (event.total) {
            setProgress(Math.min(99, Math.max(8, Math.round((event.loaded * 100) / event.total))));
          }
        },
      };

      const data = await withUploadRetry(() => uploadMedia(formData, uploadType, progressOptions));

      const nextUrl = uploadUrl(data.url || data.feedItem?.url || data.feedItem?.mediaUrl);
      if (!isRenderableMediaUrl(nextUrl)) {
        throw new Error("Upload finished, but the media URL was not ready. Please try again.");
      }
      const nextPath = nextUrl;
      setUploadedUrl(nextUrl);
      setUploadedPath(nextPath);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      setProgress(100);
      setStatus("Upload complete");

      if (nextUrl && !data.feedItem) {
        const { data: feedData } = await feedApi.get({ page: 1, limit: 10 });
        const uploadedFeedItem = (Array.isArray(feedData?.posts) ? feedData.posts : Array.isArray(feedData?.feed) ? feedData.feed : [])
          .map(normalizePost)
          .find((post) => stablePostUrl(post) === nextUrl);

        if (uploadedFeedItem && isValidPost(uploadedFeedItem)) {
          prependPost(uploadedFeedItem);
          window.dispatchEvent(new CustomEvent("vibebook:post-created", { detail: { post: uploadedFeedItem } }));
        }
      }

      if (data.feedItem && isValidPost(data.feedItem)) {
        const uploadedPost = normalizePost({
          ...data.feedItem,
          url: uploadUrl(data.feedItem.url || data.feedItem.mediaUrl) || nextUrl,
        });
        prependPost(uploadedPost);
        window.dispatchEvent(new CustomEvent("vibebook:post-created", { detail: { post: uploadedPost } }));
      }

      addToast("Upload successful", "success");

      closeTimerRef.current = window.setTimeout(() => {
        onClose?.();
        navigate("/", { replace: false });
      }, 900);
    } catch (requestError) {
      const canceled = requestError?.code === "ERR_CANCELED" || requestError?.name === "CanceledError" || requestError?.name === "AbortError";
      const uploadMessage = canceled
        ? "Upload canceled."
        : requestError.response?.data?.error || requestError.response?.data?.message || requestError.message || "Upload failed";
      setStatus("");
      setError(uploadMessage);
      addToast(uploadMessage, canceled ? "info" : "error");
    } finally {
      abortControllerRef.current = null;
      uploadInFlightRef.current = false;
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

  const scrollToUploadDetails = () => {
    document.getElementById("upload-post-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("upload-post-details-desktop")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const scrollToUploadEditor = () => {
    document.getElementById("upload-editor-tools")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const publishButtonContent = uploading ? (
    <span className="inline-flex items-center justify-center gap-2">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>Uploading {progress}%</span>
    </span>
  ) : success ? (
    <span className="inline-flex items-center justify-center gap-2">
      <CheckCircle2 className="h-5 w-5" />
      Upload complete
    </span>
  ) : error ? (
    "Retry upload"
  ) : (
    <span className="inline-flex items-center justify-center gap-2">
      <UploadCloud className="h-5 w-5" />
      Post now
    </span>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto overflow-x-hidden bg-slate-950/80 p-0 backdrop-blur-md sm:p-3">
      <div className="flex min-h-[100dvh] w-full min-w-0 flex-col rounded-none bg-white shadow-2xl sm:my-0 sm:min-h-0 sm:max-w-5xl sm:rounded-2xl xl:max-w-6xl">
        {/* Header with step progress */}
        <div className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-sm font-black text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              onClick={handleClose}
            >
              Back
            </button>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-[0.68rem] font-bold uppercase tracking-widest text-blue-600">Create Post</p>
              <h2 className="truncate text-base font-bold text-slate-900 sm:text-xl">
                Create a VibeBook post
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {file && !isProfile && (
                <button type="button" className="hidden rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 sm:inline-flex" onClick={scrollToUploadEditor}>
                  Edit
                </button>
              )}
              <button
                type="button"
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                onClick={scrollToUploadDetails}
                disabled={!file}
              >
                Next
              </button>
            </div>
          </div>

          {/* Step progress indicator */}
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:gap-2 sm:overflow-visible sm:pb-0">
            {steps.map((step, index) => (
              <div key={step} className="flex min-w-[4.75rem] flex-1 items-center sm:min-w-0">
                <div className="relative flex flex-1 items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-semibold transition-all duration-200 ${
                      index < activeStep
                        ? "bg-green-500 text-white"
                        : index === activeStep
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {index < activeStep ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                  </div>
                  <span
                    className={`truncate text-[0.68rem] font-semibold ${
                      index <= activeStep ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {step}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`mx-1 hidden h-0.5 w-2 transition-all duration-200 sm:block ${
                      index < activeStep ? "bg-green-500" : "bg-slate-300"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-3 overflow-visible bg-surface p-3 sm:p-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-3 xl:gap-4">
          <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:col-start-1 lg:row-start-1">
            {/* Media type selector */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              {[
                { value: "image", label: "Photo", icon: ImageIcon },
                { value: "video", label: "Video", icon: Video },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all duration-200 ${
                      type === option.value
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                    onClick={() => switchType(option.value)}
                    disabled={uploading}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className={`mt-2.5 grid gap-2 ${mobileRecorderAvailable ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {mobileRecorderAvailable && (
                <button
                  type="button"
                  className="group relative flex min-h-[3.75rem] items-center gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-all duration-200 hover:border-blue-400 hover:shadow-md disabled:opacity-50"
                  onClick={() => startCamera(cameraFacing)}
                  disabled={uploading || recording || cameraPreparing}
                >
                  <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
                    {cameraPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  </span>
                  <div className="relative z-10 min-w-0 flex-1">
                    <span className="block text-[0.82rem] font-bold text-slate-900">{cameraPreparing ? "Preparing camera..." : "Record Video"}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-500">Capture in app.</span>
                  </div>
                </button>
              )}

                <label className="group relative flex min-h-[3.75rem] cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-all duration-200 hover:border-blue-400 hover:shadow-md">
                  <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
                    <UploadCloud className="h-4 w-4" />
                  </span>
                  <div className="relative z-10 min-w-0 flex-1">
                    <span className="block text-[0.82rem] font-bold text-slate-900">Upload Video</span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-500">Up to 2 minutes.</span>
                  </div>
                  <input className="hidden" type="file" accept={VIDEO_FILE_ACCEPT} onChange={(event) => handleSelect(event, "video")} disabled={uploading} />
                </label>

                <label className="group relative flex min-h-[3.75rem] cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-all duration-200 hover:border-blue-400 hover:shadow-md">
                  <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
                    <ImageIcon className="h-4 w-4" />
                  </span>
                  <div className="relative z-10 min-w-0 flex-1">
                    <span className="block text-[0.82rem] font-bold text-slate-900">Upload Photo</span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-500">Image post.</span>
                  </div>
                  <input className="hidden" type="file" accept={IMAGE_FILE_ACCEPT} onChange={(event) => handleSelect(event, "image")} disabled={uploading} />
                </label>
              </div>

            {cameraOpen && (
              <div className="mx-auto mt-3 w-full max-w-[18rem] overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-lg">
                <div className="relative aspect-[9/16] max-h-[62dvh]">
                  <video
                    ref={cameraVideoRef}
                    className="h-full w-full bg-slate-950 object-cover"
                    autoPlay
                    muted
                    playsInline
                    onLoadedMetadata={(event) => event.currentTarget.play?.().catch(() => undefined)}
                    onCanPlay={(event) => event.currentTarget.play?.().catch(() => undefined)}
                  />
                  {cameraPreparing && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 text-sm font-black text-white">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening camera...
                      </span>
                    </div>
                  )}
                  
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
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-slate-950/90 to-transparent p-4 sm:p-6">
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
                      className={`flex h-14 w-14 items-center justify-center rounded-full border-4 font-semibold shadow-lg transition-all duration-150 active:scale-95 sm:h-16 sm:w-16 ${
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
                  accept={VIDEO_FILE_ACCEPT}
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

            <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold leading-5 text-slate-500 lg:line-clamp-2">
              {helperCopy}
            </div>

            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
            {status && !success && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">{status}</div>}
          </aside>

          <main className="min-w-0 max-w-full overflow-x-hidden lg:contents">
            <div className="grid min-w-0 gap-3 lg:contents">
              <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-2">
                <div
                  className="relative mx-auto flex h-[52dvh] min-h-[20rem] w-full max-w-[20rem] items-center justify-center overflow-hidden rounded-xl bg-slate-950 shadow-2xl sm:h-[56dvh] sm:max-h-[32rem] sm:max-w-[21rem] lg:h-[min(56dvh,31rem)] lg:min-h-[24rem] lg:max-w-[21rem] xl:max-w-[22rem]"
                  onDragOver={handlePreviewDragOver}
                  onDrop={handlePreviewDrop}
                >
                  {previewSrc ? (
                    <>
                      {isImage ? (
                        <img src={previewSrc} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
                      ) : (
                        <video src={previewSrc} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl" muted playsInline preload="metadata" aria-hidden="true" />
                      )}
                      <div className="relative z-10 flex h-full max-h-full w-full items-center justify-center p-2">
                        {isImage ? (
                          <img
                            src={previewSrc}
                            alt=""
                            className="max-h-full max-w-full rounded-lg shadow-2xl"
                            style={{ filter: editorFilter, objectFit: previewObjectFit, transform: previewTransform, transition: "filter 160ms ease, transform 160ms ease" }}
                          />
                        ) : (
                          previewError ? (
                            <div className="mx-4 rounded-xl border border-red-400/40 bg-red-500/10 p-5 text-center text-white">
                              <Video className="mx-auto h-9 w-9 text-red-200" />
                              <p className="mt-3 text-sm font-black">Preview unavailable</p>
                              <p className="mt-1 text-xs font-semibold text-white/70">{previewError}</p>
                              <div className="mt-4 flex justify-center gap-2">
                                <label className="rounded-full bg-white px-4 py-2 text-xs font-black text-navy">
                                  Replace
                                  <input className="hidden" type="file" accept={VIDEO_FILE_ACCEPT} onChange={(event) => handleSelect(event, "video")} disabled={uploading} />
                                </label>
                                <button type="button" className="rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white" onClick={removeSelectedMedia}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <video
                              ref={videoPreviewRef}
                              src={previewSrc}
                              className="h-full max-h-full w-full max-w-full rounded-xl bg-slate-950 object-contain shadow-2xl"
                              style={{ filter: editorFilter, objectFit: previewObjectFit, transform: previewTransform, transition: "filter 160ms ease, transform 160ms ease" }}
                              controls
                              muted={previewMuted}
                              loop
                              autoPlay
                              playsInline
                              preload="metadata"
                              poster=""
                              onLoadedData={() => setPreviewError("")}
                              onError={() => setPreviewError("This video could not be previewed. You can replace it or try another file.")}
                            />
                          )
                        )}
                      </div>
                      {type === "video" && !previewError && (
                        <div className="absolute inset-x-3 bottom-3 z-30 flex items-center justify-between gap-2">
                          <div className="min-w-0 rounded-full bg-slate-950/60 px-3 py-1.5 text-xs font-black text-white backdrop-blur">
                            {duration ? `${Math.round(duration)}s` : "Video preview"}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-navy shadow" onClick={replayPreview} aria-label="Replay preview">
                              <Play className="h-4 w-4 fill-current" />
                            </button>
                            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-navy shadow" onClick={() => setPreviewMuted((current) => !current)} aria-label={previewMuted ? "Unmute preview" : "Mute preview"}>
                              {previewMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      )}
                      {file && (
                        <div className="absolute left-3 top-3 z-30 flex items-center gap-2">
                          <label className="rounded-full bg-white/95 px-3 py-2 text-xs font-black text-navy shadow">
                            Replace
                            <input className="hidden" type="file" accept={type === "video" ? VIDEO_FILE_ACCEPT : IMAGE_FILE_ACCEPT} onChange={(event) => handleSelect(event, type)} disabled={uploading} />
                          </label>
                          <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-600 shadow" onClick={removeSelectedMedia} disabled={uploading} aria-label="Remove selected media">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      {(editor.effect === "vignette" || editor.vignette > 0) && (
                        <div
                          className="pointer-events-none absolute inset-0 z-20"
                          style={{ boxShadow: `inset 0 0 ${80 + editor.vignette}px rgba(2,6,23,${0.28 + editor.vignette / 240})` }}
                        />
                      )}
                      {editor.effect === "fade" && <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-slate-950/25 via-transparent to-white/10" />}
                      {uploading && (
                        <div className="absolute inset-x-4 top-4 z-30 rounded-full bg-slate-950/60 p-1 backdrop-blur">
                          <div className="h-2 rounded-full bg-brand transition-all duration-300" style={{ width: `${Math.max(4, progress)}%` }} />
                        </div>
                      )}
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
                    <div className="px-6 text-center text-white/70">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
                        <Video className="h-7 w-7 text-brand" />
                      </div>
                      <h3 className="mt-4 text-lg font-black text-white">Drop media here</h3>
                      <p className="mt-2 text-sm leading-6">{selectedLabel}</p>
                    </div>
                  )}
                </div>

                {!isProfile && (
                  <div id="upload-post-details" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-brand">Post details</p>
                        <h3 className="text-base font-black text-navy">Caption and audience</h3>
                      </div>
                      <span className="text-xs font-bold text-slate-400">{caption.length}/2200</span>
                    </div>

                    <label className="mt-3 block space-y-2">
                      <span className="label">Caption</span>
                      <textarea
                        className="field min-h-20 resize-none"
                        value={caption}
                        onChange={(event) => setCaption(event.target.value)}
                        placeholder="Write a caption..."
                        disabled={uploading}
                        maxLength={2200}
                      />
                    </label>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="label">Hashtags</span>
                        <div className="relative">
                          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            className="field pl-10"
                            value={tags}
                            onChange={(event) => setTags(event.target.value)}
                            placeholder="vibebook"
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
                            placeholder="@creator"
                            disabled={uploading}
                          />
                        </div>
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                      <label className="block space-y-2">
                        <span className="label">Location</span>
                        <input
                          className="field"
                          value={location}
                          onChange={(event) => setLocation(event.target.value)}
                          placeholder="Kigali, Rwanda"
                          disabled={uploading}
                        />
                      </label>

                      <div>
                        <span className="label font-bold">Audience</span>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {visibilityOptions.map((option) => {
                            const Icon = option.icon;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-black transition-all duration-200 ${
                                  visibility === option.value
                                    ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm"
                                    : "border-slate-200 bg-white text-slate-700"
                                }`}
                                onClick={() => setVisibility(option.value)}
                                disabled={uploading}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                      <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950">
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
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-navy">{file?.name || "No media selected"}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Thumbnail preview</p>
                      </div>
                    </div>

                    {error && file && !uploading && !success && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                        <p>{error}</p>
                      </div>
                    )}

                    <div className="sticky bottom-0 -mx-3 mt-3 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur">
                      <button
                        type="button"
                        className="w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-black text-white shadow-lg transition hover:bg-blue-700 disabled:opacity-60"
                        onClick={handleUpload}
                        disabled={!canPost}
                      >
                        {publishButtonContent}
                      </button>
                    </div>
                  </div>
                )}

                {file && !isProfile && (
                  <div id="upload-editor-tools" className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-brand">Editor</p>
                        <h3 className="text-base font-black text-navy sm:text-lg">Tune before posting</h3>
                      </div>
                      <Sparkles className="h-5 w-5 text-brand" />
                    </div>

                    <div className="mb-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                      {editorToolTabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                          <button
                            key={tab.value}
                            type="button"
                            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-black transition ${
                              activeEditorPanel === tab.value ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-600"
                            }`}
                            onClick={() => setActiveEditorPanel(tab.value)}
                            disabled={uploading}
                          >
                            <Icon className="h-4 w-4" />
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className={editorPanelClass("filters")}>
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

                      <div className={editorPanelClass("effects")}>
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
                        <div className={`${editorPanelClass("trim")} rounded-lg bg-slate-50 p-3`}>
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

                      <div className={`${editorPanelClass("adjustments")} rounded-lg bg-slate-50 p-3`}>
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
                      <div className={`${editorPanelClass("crop")} rounded-lg bg-slate-50 p-3`}>
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

                      <div className={`${editorPanelClass("speed")} rounded-lg bg-slate-50 p-3`}>
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

                      <div className={`${editorPanelClass("audio")} rounded-lg bg-slate-50 p-3`}>
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
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
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
                  <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
                    <CheckCircle2 className="h-6 w-6 shrink-0 animate-bounce text-green-600" />
                    <div className="min-w-0">
                      <p className="font-bold text-green-900">Upload complete!</p>
                      <p className="mt-1 text-sm font-semibold text-green-700">Your post will appear in your feed shortly.</p>
                    </div>
                  </div>
                )}
              </div>

              <div id="upload-post-details-desktop" className="hidden min-w-0 space-y-2.5 lg:sticky lg:top-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block">
                {!isProfile && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[0.68rem] font-black uppercase tracking-wide text-brand">Post details</p>
                        <h3 className="text-sm font-black text-navy">Caption and audience</h3>
                      </div>
                      <span className="text-xs font-bold text-slate-400">{caption.length}/2200</span>
                    </div>

                    <label className="mt-2.5 block space-y-1.5">
                      <span className="text-xs font-bold text-slate-700">Caption</span>
                      <textarea
                        className="field min-h-[5.75rem] resize-none px-3 py-2.5 text-sm"
                        value={caption}
                        onChange={(event) => setCaption(event.target.value)}
                        placeholder="Write a caption..."
                        disabled={uploading}
                        maxLength={2200}
                      />
                    </label>

                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-bold text-slate-700">Hashtags</span>
                        <div className="relative">
                          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            className="field px-3 py-2.5 pl-9 text-sm"
                            value={tags}
                            onChange={(event) => setTags(event.target.value)}
                            placeholder="vibebook, comedy"
                            disabled={uploading}
                          />
                        </div>
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-bold text-slate-700">Mentions</span>
                        <div className="relative">
                          <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            className="field px-3 py-2.5 pl-9 text-sm"
                            value={mentions}
                            onChange={(event) => setMentions(event.target.value)}
                            placeholder="@creator"
                            disabled={uploading}
                          />
                        </div>
                      </label>
                    </div>

                    <div className="mt-2.5 grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-bold text-slate-700">Location</span>
                        <input
                          className="field px-3 py-2.5 text-sm"
                          value={location}
                          onChange={(event) => setLocation(event.target.value)}
                          placeholder="Kigali, Rwanda"
                          disabled={uploading}
                        />
                      </label>

                      <div>
                        <span className="text-xs font-bold text-slate-700">Audience</span>
                        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                          {visibilityOptions.map((option) => {
                            const Icon = option.icon;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-black transition-all duration-200 ${
                                  visibility === option.value
                                    ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-400"
                                }`}
                                onClick={() => setVisibility(option.value)}
                                disabled={uploading}
                              >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <span className="text-xs font-bold text-slate-700">Safe display</span>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-lg bg-surface p-1">
                        {["portrait", "landscape"].map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`rounded-lg px-3 py-1.5 text-xs font-black capitalize ${
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
                  </div>
                )}

                {error && file && !uploading && !success && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    <p>{error}</p>
                    <button type="button" className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-red-700 shadow-sm" onClick={handleUpload}>
                      Retry upload
                    </button>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-950">
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
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase text-slate-500">Thumbnail preview</p>
                      <p className="mt-1 truncate text-sm font-black text-navy">{file?.name || "No media selected"}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">Aspect ratio preserved.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg transition-all duration-200 hover:bg-blue-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 active:scale-95"
                    onClick={handleUpload}
                    disabled={!canPost}
                  >
                    {publishButtonContent}
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Upload;
