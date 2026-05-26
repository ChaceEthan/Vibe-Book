// @ts-nocheck
import {
  AlertTriangle,
  Bell,
  Camera,
  ChevronLeft,
  Eye,
  Image as ImageIcon,
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

const CATEGORIES = ["gaming", "music", "art", "talk", "performance", "education", "lifestyle", "other"];
const PRIVACY_LEVELS = [
  { value: "public", label: "Public", icon: Eye },
  { value: "friends", label: "Friends", icon: Users },
  { value: "private", label: "Private", icon: ShieldCheck },
];
const QUALITY_OPTIONS = ["360p", "480p", "720p", "1080p"];
const BACKGROUND_THEMES = ["classic", "neon", "studio", "sunset"];
const EFFECT_PRESETS = ["none", "soft-glow", "cinematic", "creator"];

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
  const [cameraLoading, setCameraLoading] = useState(true);
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

  const { startLiveStream, loading } = useLiveStreamStore();
  const isBusy = starting || loading;

  const tags = useMemo(() => normalizeTags(tagText), [tagText]);

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
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

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
    startingRef.current = false;
    stopCamera();
    onClose?.();
  };

  const handleStart = async () => {
    if (startingRef.current) return;

    if (!form.title.trim()) {
      setError("Add a live title before starting.");
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
    if (!mountedRef.current) return;

    setStarting(false);
    startingRef.current = false;

    if (result.ok) {
      stopCamera();
      onStart?.(result.stream);
      return;
    }

    setError(result.error || "Failed to start livestream.");
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.28),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(244,63,94,0.22),transparent_30%)]" />

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

        <main className="relative z-10 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-0 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1">
          <section className="relative min-h-[46dvh] overflow-hidden bg-slate-950 lg:min-h-0">
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
                </div>
              </div>
            )}

            <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent p-4">
              <div className="flex items-center gap-2">
                <SafeAvatar user={user} className="h-10 w-10 rounded-full border-2 border-white/70 object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{user?.name || user?.username || "Creator"}</p>
                  <p className="text-[0.68rem] font-bold uppercase tracking-wide text-white/65">{cameraReady ? "Preview ready" : "Camera loading"}</p>
                </div>
              </div>
              <div className="rounded-full bg-red-600 px-3 py-1 text-[0.68rem] font-black uppercase tracking-wide shadow-[0_0_24px_rgba(220,38,38,0.7)]">
                Ready
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-4">
              <div className="mx-auto flex max-w-md items-center justify-center gap-3">
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
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-950 shadow-xl transition hover:scale-105 disabled:opacity-60"
                  onClick={() => {
                    setSelectedVideoDeviceId("");
                    setFrontCamera((current) => !current);
                  }}
                  disabled={!cameraReady || isBusy}
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-6 w-6" />
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
              </div>
            </div>
          </section>

          <aside className="relative flex max-h-[54dvh] min-h-0 flex-col overflow-hidden border-t border-white/10 bg-slate-950/95 backdrop-blur-xl lg:max-h-none lg:border-l lg:border-t-0">
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-xs font-black text-white/70 transition hover:text-white"
                  onClick={handleClose}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Upload
                </button>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-wide text-white/70">
                  {form.selectedQuality}
                </span>
              </div>

              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wide text-white/70">Live title</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/35 focus:border-blue-400"
                    value={form.title}
                    onChange={(event) => updateForm({ title: event.target.value })}
                    placeholder="What are you streaming?"
                    maxLength={120}
                    disabled={isBusy}
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wide text-white/70">Description</span>
                  <textarea
                    className="min-h-[5rem] w-full resize-none rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-blue-400"
                    value={form.description}
                    onChange={(event) => updateForm({ description: event.target.value })}
                    placeholder="Set the vibe for viewers."
                    maxLength={500}
                    disabled={isBusy}
                  />
                </label>

                <div>
                  <span className="text-xs font-black uppercase tracking-wide text-white/70">Category</span>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={`rounded-lg px-2 py-2 text-[0.72rem] font-black capitalize transition ${
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

                <div>
                  <span className="text-xs font-black uppercase tracking-wide text-white/70">Privacy</span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {PRIVACY_LEVELS.map((level) => {
                      const Icon = level.icon;
                      return (
                        <button
                          key={level.value}
                          type="button"
                          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-black transition ${
                            form.privacyLevel === level.value ? "bg-white text-slate-950" : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                          }`}
                          onClick={() => updateForm({ privacyLevel: level.value })}
                          disabled={isBusy}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{level.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wide text-white/70">Tags</span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-blue-400"
                    value={tagText}
                    onChange={(event) => setTagText(event.target.value)}
                    placeholder="music, kigali, creators"
                    disabled={isBusy}
                  />
                  {!!tags.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-[0.68rem] font-black text-white/75">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </label>

                <label className="block space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-white/70">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Cover image
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-blue-400"
                    value={form.coverImage}
                    onChange={(event) => updateForm({ coverImage: event.target.value })}
                    placeholder="Optional image URL"
                    disabled={isBusy}
                  />
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["commentsEnabled", "Comments"],
                    ["giftsEnabled", "Gifts"],
                    ["allowReactions", "Reactions"],
                  ].map(([field, label]) => (
                    <button
                      key={field}
                      type="button"
                      className={`rounded-xl px-2 py-3 text-xs font-black transition ${form[field] ? "bg-emerald-500 text-white" : "bg-white/10 text-white/55"}`}
                      onClick={() => updateForm({ [field]: !form[field] })}
                      disabled={isBusy}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <AnimatePresence initial={false}>
                  {advancedOpen && (
                    <motion.div
                      className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-3"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
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
                          <span className="text-xs font-black uppercase tracking-wide text-white/60">Beauty</span>
                          <select
                            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none"
                            value={form.beautyFilter}
                            onChange={(event) => updateForm({ beautyFilter: event.target.value })}
                            disabled={isBusy}
                          >
                            {["natural", "soft", "bright", "studio"].map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
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

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block space-y-1.5">
                          <span className="text-xs font-black uppercase tracking-wide text-white/60">Theme</span>
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

                        <label className="block space-y-1.5">
                          <span className="text-xs font-black uppercase tracking-wide text-white/60">Effects</span>
                          <select
                            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white outline-none"
                            value={form.effectsPreset}
                            onChange={(event) => updateForm({ effectsPreset: event.target.value })}
                            disabled={isBusy}
                          >
                            {EFFECT_PRESETS.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["moderationEnabled", "Moderation", ShieldCheck],
                          ["followerOnlyChat", "Follower chat", Users],
                          ["liveNotifications", "Notify fans", Bell],
                          ["pkBattleReady", "PK ready", Sparkles],
                        ].map(([field, label, Icon]) => (
                          <button
                            key={field}
                            type="button"
                            className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-black transition ${form[field] ? "bg-blue-600 text-white" : "bg-white/10 text-white/60"}`}
                            onClick={() => updateForm({ [field]: !form[field] })}
                            disabled={isBusy}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm font-bold text-red-100">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-white/10 bg-slate-950 p-4 sm:p-5">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-blue-600 px-5 py-3.5 text-sm font-black text-white shadow-[0_20px_60px_rgba(37,99,235,0.28)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleStart}
                disabled={isBusy || !cameraReady || !form.title.trim()}
              >
                {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}
                Start Live
              </button>
            </div>
          </aside>
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
