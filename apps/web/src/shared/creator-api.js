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

function patchJson(url, body) {
  return fetchJson(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function deleteJson(url, body) {
  return fetchJson(url, {
    method: "DELETE",
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

  getProjects() {
    return fetchJson("/api/creator/projects");
  },

  updateProject(input) {
    return patchJson("/api/creator/project", input);
  },

  deleteProject(input) {
    return deleteJson("/api/creator/project", input);
  },

  updateProjectCover(input) {
    return postJson("/api/creator/project/cover", input);
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

  getAssetLibrary() {
    return fetchJson("/api/creator/assets/library");
  },

  importAsset(input) {
    return postJson("/api/creator/assets/import", input);
  },

  generateAsset(input) {
    return postJson("/api/creator/assets/generate", input);
  },

  getAssetVersions(assetId) {
    return fetchJson(`/api/creator/assets/versions/${encodeURIComponent(assetId)}`);
  },

  createShot(input) {
    return postJson("/api/creator/shots", input);
  },

  updateShot(input) {
    return patchJson("/api/creator/shots", input);
  },

  deleteShot(input) {
    return deleteJson("/api/creator/shots", input);
  },

  reorderShots(input) {
    return postJson("/api/creator/shots/reorder", input);
  },

  runCalibration() {
    return postJson("/api/creator/calibration/run");
  },

  skipCalibration(input) {
    return postJson("/api/creator/calibration/skip", input);
  },

  overrideCalibration(input) {
    return postJson("/api/creator/calibration/override", input);
  },

  generateImages(input) {
    return postJson("/api/creator/images/generate", input);
  },

  generateVideos(input) {
    return postJson("/api/creator/videos/generate", input);
  },

  previewExport() {
    return postJson("/api/creator/export/preview");
  },

  getExportHistory() {
    return fetchJson("/api/creator/export/history");
  },
};
