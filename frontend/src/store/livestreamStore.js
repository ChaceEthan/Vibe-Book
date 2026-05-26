// @ts-nocheck
import { create } from "zustand";
import { livestreamApi } from "../services/livestreamApi";
import { getApiErrorMessage } from "../services/api";

const DEFAULT_LIVESTREAM = {
  id: "",
  creatorId: "",
  title: "",
  description: "",
  category: "other",
  tags: [],
  status: "live",
  privacyLevel: "public",
  thumbnail: null,
  coverImage: null,
  viewerCount: 0,
  maxViewers: 0,
  duration: 0,
  isLive: false,
  stats: {},
  settings: {
    commentsEnabled: true,
    giftsEnabled: true,
    allowReactions: true,
  },
  creator: null,
  startedAt: null,
  endedAt: null,
};

const DEFAULT_PAGINATION = { limit: 20, skip: 0, total: 0, hasMore: false };

const normalizeStream = (stream = {}) => ({
  ...DEFAULT_LIVESTREAM,
  ...stream,
  id: stream.id || stream._id || DEFAULT_LIVESTREAM.id,
  creatorId: stream.creatorId || stream.creator?._id || stream.creator?.id || DEFAULT_LIVESTREAM.creatorId,
  settings: {
    ...DEFAULT_LIVESTREAM.settings,
    ...(stream.settings || {}),
  },
});

const normalizeStreams = (streams = []) => streams.map(normalizeStream).filter((stream) => stream.id && stream.isLive !== false && stream.status !== "ended");

export const useLiveStreamStore = create((set, get) => ({
  activeLiveStreams: [],
  currentStream: null,
  currentSession: null,
  liveStreamsByCategory: {},
  creatorLiveStreams: {},
  pagination: DEFAULT_PAGINATION,
  loading: false,
  error: "",
  requestLocks: {},

  // Start a livestream
  startLiveStream: async (streamData = {}) => {
    const { loading, requestLocks } = get();
    if (requestLocks.start) return { ok: false, error: "Stream start already in progress" };

    set({ loading: true, error: "", requestLocks: { ...requestLocks, start: true } });

    try {
      const response = await livestreamApi.start(streamData);
      const stream = normalizeStream(response?.data?.stream || response?.stream || {});

      set((state) => ({
        currentStream: stream,
        activeLiveStreams: stream.id
          ? [stream, ...state.activeLiveStreams.filter((item) => item.id !== stream.id)]
          : state.activeLiveStreams,
        loading: false,
      }));
      return { ok: true, stream };
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to start livestream");
      set({ error: message, loading: false });
      return { ok: false, error: message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, start: false } }));
    }
  },

  // End a livestream
  endLiveStream: async (streamId) => {
    const { requestLocks } = get();
    if (requestLocks.end) return { ok: false, error: "Stream end already in progress" };

    set({ loading: true, error: "", requestLocks: { ...requestLocks, end: true } });

    try {
      const response = await livestreamApi.end(streamId);
      const stream = normalizeStream(response?.data?.stream || response?.stream || {});

      set((state) => ({
        currentStream: stream,
        activeLiveStreams: state.activeLiveStreams.filter((item) => item.id !== stream.id),
        loading: false,
      }));
      return { ok: true, stream };
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to end livestream");
      set({ error: message, loading: false });
      return { ok: false, error: message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, end: false } }));
    }
  },

  // Join a livestream
  joinLiveStream: async (streamId, viewerName = "Guest") => {
    const { requestLocks } = get();
    if (requestLocks.join) return { ok: false, error: "Join already in progress" };

    set({ loading: true, error: "", requestLocks: { ...requestLocks, join: true } });

    try {
      const response = await livestreamApi.join(streamId, viewerName);
      const stream = normalizeStream(response?.data?.stream || response?.stream || {});
      const session = response?.data?.session || response?.session;

      set({ currentStream: stream, currentSession: session, loading: false });
      return { ok: true, stream, session };
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to join livestream");
      set({ error: message, loading: false });
      return { ok: false, error: message };
    } finally {
      set((state) => ({ requestLocks: { ...state.requestLocks, join: false } }));
    }
  },

  // Leave a livestream
  leaveLiveStream: async (sessionId) => {
    try {
      const response = await livestreamApi.leave(sessionId);
      set({ currentStream: null, currentSession: null });
      return { ok: true };
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to leave livestream");
      set({ error: message });
      return { ok: false, error: message };
    }
  },

  // Get active livestreams
  getActiveLiveStreams: async (limit = 20, skip = 0, options = {}) => {
    if (!options.silent) {
      set({ loading: true, error: "" });
    }

    try {
      const response = await livestreamApi.getActive(limit, skip);
      const streams = normalizeStreams(response?.data?.streams || response?.streams || []);
      const pagination = response?.data?.pagination || response?.pagination || DEFAULT_PAGINATION;

      set({ activeLiveStreams: streams, pagination, loading: false });
      return { ok: true, streams, pagination };
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to load livestreams");
      set({ error: message, loading: false });
      return { ok: false, error: message };
    }
  },

  // Get livestreams by category
  getLiveStreamsByCategory: async (category, limit = 20, skip = 0) => {
    set({ loading: true, error: "" });

    try {
      const response = await livestreamApi.getByCategory(category, limit, skip);
      const streams = normalizeStreams(response?.data?.streams || response?.streams || []);
      const pagination = response?.data?.pagination || response?.pagination || DEFAULT_PAGINATION;

      set((state) => ({
        liveStreamsByCategory: { ...state.liveStreamsByCategory, [category]: streams },
        pagination,
        loading: false,
      }));
      return { ok: true, streams, pagination };
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to load livestreams");
      set({ error: message, loading: false });
      return { ok: false, error: message };
    }
  },

  // Get stream details
  getStreamDetails: async (streamId) => {
    set({ loading: true, error: "" });

    try {
      const response = await livestreamApi.getDetails(streamId);
      const stream = normalizeStream(response?.data?.stream || response?.stream || {});
      const stats = response?.data?.stats || response?.stats || {};

      set({ currentStream: stream, loading: false });
      return { ok: true, stream, stats };
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to load stream");
      set({ error: message, loading: false });
      return { ok: false, error: message };
    }
  },

  // Update stream metadata
  updateStreamMetadata: async (streamId, updates) => {
    try {
      const response = await livestreamApi.updateMetadata(streamId, updates);
      const stream = normalizeStream(response?.data?.stream || response?.stream || {});

      set((state) => ({
        currentStream: stream,
        activeLiveStreams: stream.isLive && stream.status !== "ended"
          ? state.activeLiveStreams.map((item) => (item.id === stream.id ? stream : item))
          : state.activeLiveStreams.filter((item) => item.id !== stream.id),
      }));
      return { ok: true, stream };
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to update stream");
      set({ error: message });
      return { ok: false, error: message };
    }
  },

  // Update current stream viewer count (from socket)
  updateViewerCount: (viewerCount, maxViewers = null) => {
    set((state) => ({
      currentStream: state.currentStream
        ? {
            ...state.currentStream,
            viewerCount,
            maxViewers: maxViewers !== null ? maxViewers : state.currentStream.maxViewers,
          }
        : null,
      activeLiveStreams: state.activeLiveStreams.map((stream) => (
        stream.id === state.currentStream?.id
          ? {
              ...stream,
              viewerCount,
              maxViewers: maxViewers !== null ? maxViewers : stream.maxViewers,
            }
          : stream
      )),
    }));
  },

  applyViewerCount: (streamId, viewerCount, maxViewers = null) => {
    const id = String(streamId || "");
    if (!id) return;

    set((state) => ({
      currentStream: state.currentStream?.id === id
        ? {
            ...state.currentStream,
            viewerCount,
            maxViewers: maxViewers !== null ? maxViewers : state.currentStream.maxViewers,
          }
        : state.currentStream,
      activeLiveStreams: state.activeLiveStreams.map((stream) => (
        stream.id === id
          ? {
              ...stream,
              viewerCount,
              maxViewers: maxViewers !== null ? maxViewers : stream.maxViewers,
            }
          : stream
      )),
    }));
  },

  upsertLiveStream: (stream) => {
    const nextStream = normalizeStream(stream);
    if (!nextStream.id) return;

    set((state) => ({
      activeLiveStreams: nextStream.isLive && nextStream.status !== "ended"
        ? [nextStream, ...state.activeLiveStreams.filter((item) => item.id !== nextStream.id)]
        : state.activeLiveStreams.filter((item) => item.id !== nextStream.id),
      currentStream: state.currentStream?.id === nextStream.id ? nextStream : state.currentStream,
    }));
  },

  removeLiveStream: (streamId) => {
    const id = String(streamId || "");
    if (!id) return;

    set((state) => ({
      activeLiveStreams: state.activeLiveStreams.filter((stream) => stream.id !== id),
      currentStream: state.currentStream?.id === id ? { ...state.currentStream, isLive: false, status: "ended" } : state.currentStream,
    }));
  },

  // Clear current stream
  clearCurrentStream: () => {
    set({ currentStream: null, currentSession: null });
  },

  // Clear error
  clearError: () => {
    set({ error: "" });
  },
}));
