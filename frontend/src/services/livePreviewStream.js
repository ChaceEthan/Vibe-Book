const livePreviewStreams = new Map();

export const setLivePreviewStream = (streamId, mediaStream) => {
  const id = String(streamId || "").trim();
  if (!id || !mediaStream) return;

  const existing = livePreviewStreams.get(id);
  if (existing && existing !== mediaStream) {
    existing.getTracks?.().forEach((track) => track.stop());
  }

  livePreviewStreams.set(id, mediaStream);
};

export const getLivePreviewStream = (streamId) => {
  const id = String(streamId || "").trim();
  return id ? livePreviewStreams.get(id) || null : null;
};

export const releaseLivePreviewStream = (streamId) => {
  const id = String(streamId || "").trim();
  const mediaStream = id ? livePreviewStreams.get(id) : null;

  if (mediaStream) {
    mediaStream.getTracks?.().forEach((track) => track.stop());
    livePreviewStreams.delete(id);
  }
};
