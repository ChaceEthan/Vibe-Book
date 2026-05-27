// @ts-nocheck
import {
  AlertTriangle,
  ChevronLeft,
  Eye,
  Loader2,
  Mic,
  MicOff,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  SwitchCamera,
  Users,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveStreamStore } from "../store/livestreamStore";
import { useAuth } from "../context/AuthContext.jsx";
import SafeAvatar from "./SafeAvatar.jsx";
import { setLivePreviewStream } from "../services/livePreviewStream";

const CATEGORIES = ["gaming", "music", "art", "talk", "performance", "education", "lifestyle", "other"];
const PRIVACY_LEVELS = [
  { value: "public", label: "Public", icon: Eye },
  { value: "friends", label: "Friends", icon: Users },
  { value: "private", label: "Private", icon: ShieldCheck },
];
const QUALITY_OPTIONS = ["360p", "480p", "720p", "1080p"];
const BACKGROUND_THEMES = ["classic", "neon", "studio", "sunset"];
const EFFECT_PRESETS = ["none", "soft-glow", "cinematic", "creator"];
const SETUP_STEPS = ["Title", "Details", "Settings", "Preview"];

const normalizeTags = (value = "") =>
  Array.from(
    new Set(
      String(value)
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#+/, "").toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 5);

const LiveStreamSetup = ({ onStart, onClose }) => {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const countdownTimerRef = useRef(null);
  const countdownResolveRef = useRef(null);
  const startingRef = useRef(false);
  const micMutedRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingStreamRef = useRef(null);
  const handoffStreamRef = useRef(false);
  const titleInputRef = useRef(null);
  const descriptionInputRef = useRef(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "lifestyle",
    privacyLevel: "public",
    coverImage: "",
    commentsEnabled: true,
    giftsEnabled: true,
    allowReactions: true,
    selectedQuality: "720p",
    followerOnlyChat: false,
    moderationEnabled: true,
    liveNotifications: true,
    beautyFilter: "natural",
    backgroundTheme: "classic",
    effectsPreset: "none",
    pkBattleReady: false,
  });
  const [tagText, setTagText] = useState("");
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [frontCamera, setFrontCamera] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState("");
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [starting, setStarting] = useState(false);
  const [setupStep, setSetupStep] = useState(0);

  const { endLiveStream, startLiveStream, loading } = useLiveStreamStore();
  const isBusy = starting || loading;

  const tags = useMemo(() => normalizeTags(tagText), [tagText]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (setupStep === 0) {
        titleInputRef.current?.focus?.();
      } else if (setupStep === 1) {
        descriptionInputRef.current?.focus?.();
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [setupStep]);

  const updateForm = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setError("");
  };

  const stopCurrentStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    stopCurrentStream();
    setCameraReady(false);
    setCameraLoading(false);
    setFlashOn(false);
    setFlashSupported(false);
  }, [stopCurrentStream]);

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((device) => device.kind === "videoinput"));
      setAudioDevices(devices.filter((device) => device.kind === "audioinput"));
    } catch {
      // Device labels can be unavailable before permission; the preview still works.
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not available in this browser.");
      setCameraLoading(false);
      return;
    }

    const requestId = cameraRequestRef.current + 1;
    cameraRequestRef.current = requestId;
    stopCurrentStream();
    setCameraLoading(true);
    setCameraReady(false);
    setFlashOn(false);
    setFlashSupported(false);

    const videoConstraint = selectedVideoDeviceId
      ? { deviceId: { exact: selectedVideoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: { ideal: frontCamera ? "user" : "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } };

    const audioConstraint = selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: audioConstraint,
      });

      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      stream.getAudioTracks().forEach((track) => {
        track.enabled = !micMutedRef.current;
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play?.().catch(() => null);
      }

      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.();
      setFlashSupported(Boolean(capabilities?.torch));
      setCameraReady(true);
      setCameraLoading(false);
      setError("");
      loadDevices();
    } catch (requestError) {
      if (cameraRequestRef.current !== requestId) {
        return;
      }
      setCameraLoading(false);
      setCameraReady(false);
      setError(requestError?.name === "NotAllowedError" ? "Camera permission was denied." : "Camera preview could not start.");
    }
  }, [frontCamera, loadDevices, selectedAudioDeviceId, selectedVideoDeviceId, stopCurrentStream]);

  useEffect(() => {
    if (setupStep !== 3) {
      setCameraLoading(false);
      return undefined;
    }

    startCamera();
    return () => {
      if (handoffStreamRef.current) {
        cameraRequestRef.current += 1;
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        streamRef.current = null;
        return;
      }

      stopCamera();
    };
  }, [setupStep, startCamera, stopCamera]);

  useEffect(() => {
    micMutedRef.current = micMuted;
    streamRef.current?.getAudioTracks?.().forEach((track) => {
      track.enabled = !micMuted;
    });
  }, [micMuted]);

  useEffect(() => () => {
    mountedRef.current = false;
    window.clearInterval(countdownTimerRef.current);
    countdownResolveRef.current?.({ canceled: true });

    if (handoffStreamRef.current) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      streamRef.current = null;
      return;
    }

    stopCurrentStream();
  }, [stopCurrentStream]);

  const cancelCountdown = useCallback(() => {
    window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setCountdown(null);
    countdownResolveRef.current?.({ canceled: true });
    countdownResolveRef.current = null;
  }, []);

  const runCountdown = () =>
    new Promise((resolve) => {
      let nextValue = 5;
      countdownResolveRef.current = resolve;
      setCountdown(nextValue);
      navigator.vibrate?.(25);

      countdownTimerRef.current = window.setInterval(() => {
        nextValue -= 1;

        if (nextValue <= 0) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          countdownResolveRef.current = null;
          setCountdown(null);
          resolve({ canceled: false });
          return;
        }

        navigator.vibrate?.(18);
        setCountdown(nextValue);
      }, 850);
    });

  const toggleFlash = async () => {
    const videoTrack = streamRef.current?.getVideoTracks?.()[0];

    if (!videoTrack?.applyConstraints || !flashSupported) {
      setError("Flash is not supported on this camera.");
      return;
    }

    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: !flashOn }] });
      setFlashOn((current) => !current);
    } catch {
      setError("Flash could not be toggled on this device.");
    }
  };

  const handleClose = () => {
    cancelCountdown();
    const pendingStream = pendingStreamRef.current;
    if (pendingStream?.id) {
      endLiveStream(pendingStream.id).catch(() => null);
      pendingStreamRef.current = null;
    }
    startingRef.current = false;
    stopCamera();
    onClose?.();
  };

  const handleStart = async () => {
    if (startingRef.current) return;

    if (setupStep < 3) {
      setSetupStep(3);
      return;
    }

    if (!form.title.trim()) {
      setError("Add a live title before starting.");
      setSetupStep(0);
      return;
    }

    if (!cameraReady) {
      setError("Camera preview is still loading.");
      return;
    }

    startingRef.current = true;
    setStarting(true);
    setError("");

    const countdownResult = await runCountdown();
    if (!mountedRef.current) return;

    if (countdownResult?.canceled) {
      setStarting(false);
      startingRef.current = false;
      return;
    }

    const result = await startLiveStream({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      coverImage: form.coverImage.trim() || null,
      tags,
      qualityOptions: [form.selectedQuality],
      metadata: {
        client: "web",
        cameraFacing: frontCamera ? "front" : "back",
        micMuted,
      },
    });
    if (!mountedRef.current) {
      if (result.ok && result.stream?.id) {
        endLiveStream(result.stream.id).catch(() => null);
      }
      return;
    }

    if (!result.ok) {
      setStarting(false);
      startingRef.current = false;
      setError(result.error || "Failed to start livestream.");
      return;
    }

    if (result.stream?.id && streamRef.current) {
      handoffStreamRef.current = true;
      setLivePreviewStream(result.stream.id, streamRef.current);
    }

    setStarting(false);
    startingRef.current = false;
    pendingStreamRef.current = null;
    onStart?.(result.stream);
  };

  const goNextStep = () => {
    if (setupStep === 0 && !form.title.trim()) {
      setError("Add a live title before continuing.");
      return;
    }

    setError("");
    setSetupStep((current) => Math.min(3, current + 1));
  };

  const goPreviousStep = () => {
    setError("");
    setSetupStep((current) => Math.max(0, current - 1));
  };

  const renderSetupStep = () => {
    if (setupStep === 0) {
      return (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-red-200">Go Live</p>
            <h1 className="mt-2 text-4xl font-black leading-tight text-white sm:text-5xl">Name your live</h1>
          </div>
          <input
            ref={titleInputRef}
            className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-xl font-black text-white outline-none transition placeholder:text-white/35 focus:border-red-300"
            value={form.title}
            onChange={(event) => updateForm({ title: event.target.value })}
            placeholder="What are you streaming?"
            maxLength={120}
            disabled={isBusy}
          />
        </div>
      );
    }

    if (setupStep === 1) {
      return (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-blue-200">Details</p>
            <h1 className="mt-2 text-4xl font-black leading-tight text-white sm:text-5xl">Set the vibe</h1>
          </div>
          <textarea
            ref={descriptionInputRef}
            className="min-h-[10rem] w-full resize-none rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-base font-semibold leading-7 text-white outline-none transition placeholder:text-white/35 focus:border-blue-300"
            value={form.description}
            onChange={(event) => updateForm({ description: event.target.value })}
            placeholder="Tell viewers what is happening."
            maxLength={500}
            disabled={isBusy}
          />
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-wide text-white/65">Tags</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-blue-300"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              placeholder="music, kigali, creators"
              disabled={isBusy}
            />
          </label>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-200">Settings</p>
          <h1 className="mt-2 text-4xl font-black leading-tight text-white sm:text-5xl">Tune the room</h1>
        </div>

        <div>
          <span className="text-xs font-black uppercase tracking-wide text-white/65">Category</span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`rounded-xl px-3 py-3 text-xs font-black capitalize transition ${
                  form.category === category ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25" : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                }`}
                onClick={() => updateForm({ category })}
                disabled={isBusy}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-wide text-white/65">Audience</span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none"
              value={form.privacyLevel}
              onChange={(event) => updateForm({ privacyLevel: event.target.value })}
              disabled={isBusy}
            >
              {PRIVACY_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-wide text-white/65">Quality</span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none"
              value={form.selectedQuality}
              onChange={(event) => updateForm({ selectedQuality: event.target.value })}
              disabled={isBusy}
            >
              {QUALITY_OPTIONS.map((quality) => (
                <option key={quality} value={quality}>{quality}</option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="text-xs font-black uppercase tracking-wide text-white/65">Live background</span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BACKGROUND_THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                className={`rounded-xl px-3 py-3 text-xs font-black capitalize transition ${
                  form.backgroundTheme === theme ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20" : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                }`}
                onClick={() => updateForm({ backgroundTheme: theme })}
                disabled={isBusy}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ["commentsEnabled", "Comments"],
            ["giftsEnabled", "Gifts"],
            ["allowReactions", "Reactions"],
            ["followerOnlyChat", "Followers"],
            ["liveNotifications", "Notify"],
            ["moderationEnabled", "Moderate"],
          ].map(([field, label]) => (
            <button
              key={field}
              type="button"
              className={`rounded-2xl px-3 py-3 text-xs font-black transition ${form[field] ? "bg-white text-slate-950" : "bg-white/10 text-white/55"}`}
              onClick={() => updateForm({ [field]: !form[field] })}
              disabled={isBusy}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0 bg-slate-950" />

        <header className="relative z-20 flex shrink-0 items-center justify-between px-3 py-3 sm:px-5">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            onClick={handleClose}
            aria-label="Close livestream setup"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_16px_rgba(239,68,68,0.9)]" />
            Live setup
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
            onClick={() => setAdvancedOpen((current) => !current)}
            aria-label="Toggle livestream settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </header>

        <AnimatePresence initial={false}>
          {setupStep < 3 && (
            <motion.div
              className="absolute inset-x-0 bottom-0 top-[4.25rem] z-40 overflow-y-auto bg-slate-950/98 px-4 py-5 backdrop-blur-xl sm:px-6"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-8 py-5">
                <div className="flex items-center gap-2">
                  {SETUP_STEPS.map((step, index) => (
                    <button
                      key={step}
                      type="button"
                      className={`h-2 flex-1 rounded-full transition ${index <= setupStep ? "bg-red-500" : "bg-white/12"}`}
                      onClick={() => {
                        if (index < setupStep || (index > setupStep && form.title.trim())) {
                          setSetupStep(index);
                        }
                      }}
                      aria-label={step}
                      disabled={isBusy}
                    />
                  ))}
                </div>

                <motion.div
                  key={setupStep}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderSetupStep()}
                </motion.div>

                {error && (
                  <div className="flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm font-bold text-red-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-45"
                    onClick={goPreviousStep}
                    disabled={setupStep === 0 || isBusy}
                    aria-label="Previous setup step"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-center rounded-full bg-white px-5 py-3.5 text-sm font-black text-slate-950 shadow-xl transition hover:scale-[1.01] disabled:opacity-60"
                    onClick={goNextStep}
                    disabled={isBusy}
                  >
                    {setupStep === 2 ? "Open Camera Preview" : "Next"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="relative z-10 min-h-0 flex-1">
          <section className="relative h-full min-h-0 overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${frontCamera && !selectedVideoDeviceId ? "-scale-x-100" : ""}`}
              onCanPlay={(event) => event.currentTarget.play?.().catch(() => null)}
            />

            {(cameraLoading || !cameraReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-center backdrop-blur">
                  {error ? (
                    <AlertTriangle className="mx-auto h-7 w-7 text-red-300" />
                  ) : (
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-white" />
                  )}
                  <p className="mt-2 text-sm font-bold text-white">{error || "Opening camera..."}</p>
                  {error && (
                    <button
                      type="button"
                      className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-950"
                      onClick={startCamera}
                    >
                      Retry camera
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-black/10 to-black/90" />

            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 pt-16 sm:p-5 sm:pt-20">
              <div className="flex min-w-0 items-center gap-2">
                <SafeAvatar user={user} className="h-11 w-11 rounded-full border-2 border-white/70 object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{user?.name || user?.username || "Creator"}</p>
                  <p className="text-[0.68rem] font-black uppercase tracking-wide text-white/65">{cameraReady ? "Live ready" : "Camera loading"}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-black/45 px-3 py-1 text-[0.68rem] font-black uppercase tracking-wide text-white/80 backdrop-blur">
                  {form.selectedQuality}
                </span>
                <span className="rounded-full bg-red-600 px-3 py-1 text-[0.68rem] font-black uppercase tracking-wide shadow-[0_0_24px_rgba(220,38,38,0.7)]">
                  Live ready
                </span>
              </div>
            </div>

            <div className="absolute bottom-[9.75rem] left-4 right-24 max-w-xl sm:bottom-36 sm:left-6">
              <p className="line-clamp-2 text-2xl font-black leading-tight text-white sm:text-4xl">{form.title || "Your live title"}</p>
              {!!form.description && <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-white/72">{form.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/12 px-3 py-1 text-[0.68rem] font-black uppercase tracking-wide text-white/75 backdrop-blur">{form.category}</span>
                <span className="rounded-full bg-white/12 px-3 py-1 text-[0.68rem] font-black uppercase tracking-wide text-white/75 backdrop-blur">{form.privacyLevel}</span>
                {tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-white/12 px-3 py-1 text-[0.68rem] font-black text-white/75 backdrop-blur">#{tag}</span>
                ))}
              </div>
            </div>

            <div className="absolute bottom-[9.25rem] right-3 flex flex-col items-center gap-3 sm:bottom-32 sm:right-5">
              <button
                type="button"
                className={`inline-flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition ${micMuted ? "bg-red-600 text-white" : "bg-white/15 text-white hover:bg-white/25"}`}
                onClick={() => setMicMuted((current) => !current)}
                disabled={!cameraReady}
                aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-60"
                onClick={() => {
                  setSelectedVideoDeviceId("");
                  setFrontCamera((current) => !current);
                }}
                disabled={!cameraReady || isBusy}
                aria-label="Switch camera"
              >
                <SwitchCamera className="h-5 w-5" />
              </button>
              <button
                type="button"
                className={`inline-flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition ${flashOn ? "bg-yellow-400 text-slate-950" : "bg-white/15 text-white hover:bg-white/25"}`}
                onClick={toggleFlash}
                disabled={!cameraReady || !flashSupported}
                aria-label="Toggle flash"
              >
                <Zap className="h-5 w-5" />
              </button>
              <button
                type="button"
                className={`inline-flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition ${form.beautyFilter === "natural" ? "bg-white/15 text-white hover:bg-white/25" : "bg-pink-500 text-white"}`}
                onClick={() => updateForm({ beautyFilter: form.beautyFilter === "natural" ? "soft" : "natural" })}
                disabled={isBusy}
                aria-label="Toggle beauty filter"
              >
                <Wand2 className="h-5 w-5" />
              </button>
              <button
                type="button"
                className={`inline-flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition ${form.effectsPreset === "none" ? "bg-white/15 text-white hover:bg-white/25" : "bg-blue-500 text-white"}`}
                onClick={() => {
                  const currentIndex = EFFECT_PRESETS.indexOf(form.effectsPreset);
                  updateForm({ effectsPreset: EFFECT_PRESETS[(currentIndex + 1) % EFFECT_PRESETS.length] });
                }}
                disabled={isBusy}
                aria-label="Cycle filters"
              >
                <Sparkles className="h-5 w-5" />
              </button>
            </div>

            <AnimatePresence>
              {advancedOpen && (
                <motion.div
                  className="absolute inset-x-3 bottom-28 z-20 rounded-2xl border border-white/10 bg-black/78 p-3 backdrop-blur-xl sm:inset-x-auto sm:right-20 sm:w-80"
                  initial={{ opacity: 0, y: 18, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 18, scale: 0.96 }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-black uppercase tracking-wide text-white/60">Quality</span>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none"
                        value={form.selectedQuality}
                        onChange={(event) => updateForm({ selectedQuality: event.target.value })}
                        disabled={isBusy}
                      >
                        {QUALITY_OPTIONS.map((quality) => (
                          <option key={quality} value={quality}>{quality}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-black uppercase tracking-wide text-white/60">Background</span>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none"
                        value={form.backgroundTheme}
                        onChange={(event) => updateForm({ backgroundTheme: event.target.value })}
                        disabled={isBusy}
                      >
                        {BACKGROUND_THEMES.map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-black uppercase tracking-wide text-white/60">Camera</span>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none"
                        value={selectedVideoDeviceId}
                        onChange={(event) => setSelectedVideoDeviceId(event.target.value)}
                        disabled={isBusy}
                      >
                        <option value="">Auto camera</option>
                        {videoDevices.map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Camera ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-black uppercase tracking-wide text-white/60">Audio</span>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none"
                        value={selectedAudioDeviceId}
                        onChange={(event) => setSelectedAudioDeviceId(event.target.value)}
                        disabled={isBusy}
                      >
                        <option value="">Auto microphone</option>
                        {audioDevices.map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && setupStep === 3 && (
              <div className="absolute left-4 right-4 top-28 z-20 flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/15 p-3 text-sm font-bold text-red-100 backdrop-blur sm:left-6 sm:right-auto sm:max-w-md">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/72 to-transparent px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-14">
              <div className="mx-auto flex max-w-md items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-45"
                  onClick={goPreviousStep}
                  disabled={isBusy}
                  aria-label="Back to live settings"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-red-600 to-blue-600 px-5 py-4 text-sm font-black text-white shadow-[0_20px_60px_rgba(37,99,235,0.28)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleStart}
                  disabled={isBusy || !cameraReady || !form.title.trim()}
                >
                  {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}
                  {starting ? "Starting..." : "Start Live"}
                </button>
              </div>
            </div>
          </section>
        </main>

        <AnimatePresence>
          {countdown !== null && (
            <motion.div
              className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                key={countdown}
                className="relative flex h-44 w-44 items-center justify-center rounded-full border border-white/20 bg-white/10 text-7xl font-black text-white shadow-[0_0_80px_rgba(59,130,246,0.45)]"
                initial={{ scale: 0.45, opacity: 0, filter: "blur(12px)" }}
                animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                exit={{ scale: 1.45, opacity: 0, filter: "blur(10px)" }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
              >
                <span className="absolute inset-4 rounded-full border border-blue-300/35" />
                <motion.span
                  animate={{ textShadow: ["0 0 18px rgba(255,255,255,0.55)", "0 0 42px rgba(59,130,246,0.9)", "0 0 18px rgba(255,255,255,0.55)"] }}
                  transition={{ duration: 0.85 }}
                >
                  {countdown}
                </motion.span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default LiveStreamSetup;
