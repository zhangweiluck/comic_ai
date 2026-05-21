/**
 * @typedef {"character" | "scene" | "prop"} AssetCandidateGroup
 *
 * @typedef {object} CreatorState
 * @property {object | null} project
 * @property {object | null} script
 * @property {object | null} assetReview
 * @property {object | null} assetCandidates
 * @property {object | null} calibration
 * @property {Array<object>} shots
 * @property {object | null} exportPreview
 */

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error ?? `request_failed:${response.status}`);
  }

  return payload;
}

function postJson(url, body) {
  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export const creatorApi = {
  getSession() {
    return fetchJson("/api/auth/session");
  },

  logout() {
    return postJson("/api/auth/logout");
  },

  getCreatorState() {
    return fetchJson("/api/creator/state");
  },

  createProject(input) {
    return postJson("/api/creator/project/create", input);
  },

  parseScript() {
    return postJson("/api/creator/parse");
  },

  confirmAsset(input) {
    return postJson("/api/creator/assets/confirm", input);
  },

  confirmAllAssets() {
    return postJson("/api/creator/assets/confirm-all");
  },

  updateAssetLabel(input) {
    return postJson("/api/creator/assets/update-label", input);
  },

  runCalibration() {
    return postJson("/api/creator/calibration/run");
  },

  generateImages() {
    return postJson("/api/creator/images/generate");
  },

  generateVideos() {
    return postJson("/api/creator/videos/generate");
  },

  previewExport() {
    return postJson("/api/creator/export/preview");
  },
};
