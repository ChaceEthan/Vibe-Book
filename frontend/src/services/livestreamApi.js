// @ts-nocheck
import { API } from "./api";

const LIVESTREAM_REQUEST_TIMEOUT_MS = 30000;

export const livestreamApi = {
  // Start a livestream
  start: (streamData) => API.post("/livestream/start", streamData, { timeout: LIVESTREAM_REQUEST_TIMEOUT_MS }),

  // End a livestream
  end: (streamId) => API.post(`/livestream/${streamId}/end`, {}, { timeout: LIVESTREAM_REQUEST_TIMEOUT_MS }),

  // Join a livestream
  join: (streamId, viewerName) =>
    API.post(`/livestream/${streamId}/join`, { viewerName }, { timeout: LIVESTREAM_REQUEST_TIMEOUT_MS }),

  // Leave a livestream
  leave: (sessionId) => API.post(`/livestream/session/${sessionId}/leave`, {}, { timeout: LIVESTREAM_REQUEST_TIMEOUT_MS }),

  // Get active livestreams
  getActive: (limit = 20, skip = 0) =>
    API.get(`/livestream/active?limit=${limit}&skip=${skip}`, { timeout: LIVESTREAM_REQUEST_TIMEOUT_MS }),

  // Get livestreams by category
  getByCategory: (category, limit = 20, skip = 0) =>
    API.get(`/livestream/category/${category}?limit=${limit}&skip=${skip}`, { timeout: LIVESTREAM_REQUEST_TIMEOUT_MS }),

  // Get creator livestreams
  getCreatorLiveStreams: (creatorId, status = null, limit = 20, skip = 0) => {
    const statusParam = status ? `&status=${status}` : "";
    return API.get(`/livestream/creator/${creatorId}?limit=${limit}&skip=${skip}${statusParam}`, {
      timeout: LIVESTREAM_REQUEST_TIMEOUT_MS,
    });
  },

  // Get stream details
  getDetails: (streamId) => API.get(`/livestream/${streamId}`, { timeout: LIVESTREAM_REQUEST_TIMEOUT_MS }),

  // Update stream metadata
  updateMetadata: (streamId, updates) =>
    API.patch(`/livestream/${streamId}`, updates, { timeout: LIVESTREAM_REQUEST_TIMEOUT_MS }),
};
