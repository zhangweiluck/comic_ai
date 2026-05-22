import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderProductionWorkbench } from "../src/features/production-workbench/index.js";
import {
  addStoryboard,
  createStoryboardList,
} from "../src/features/production-workbench/storyboard-state.js";
import { renderProjectCreateModal } from "../src/features/production-workbench/project-create-modal.js";
import {
  validateVideoGeneration,
  videoModels,
} from "../src/features/production-workbench/video-generation-panel.js";

describe("production workbench home shell", () => {
  it("renders the persistent left rail and home actions", () => {
    const html = renderProductionWorkbench({
      state: {},
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "home",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /data-action="set-nav-tab"/);
    assert.match(html, /data-action="open-create-modal"/);
    assert.match(html, /hero-avatar/);
  });
});

describe("production workbench project tab", () => {
  function buildProjectState() {
    return {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "9:16",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: false },
      assetCandidates: {
        characters: [{ assetKey: "hero", label: "hero", required: true, confirmed: false }],
        scenes: [{ assetKey: "city", label: "city", required: true, confirmed: false }],
        props: [{ assetKey: "sword", label: "sword", required: false, confirmed: false }],
      },
      calibration: null,
      shots: [
        {
          id: "shot-1",
          title: "Shot 001",
          currentImageAssetVersionId: null,
          currentVideoAssetVersionId: null,
        },
      ],
      exportPreview: null,
    };
  }

  function buildProjectUi(overrides = {}) {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);

    return {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "library",
      projectLibrary: [],
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
      ...overrides,
    };
  }

  it("sorts newest projects first and paginates after eight items", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectLibrary: [
          { id: "project-card-1", name: "Alpha", createdAt: "2026/05/14" },
          { id: "project-card-2", name: "Beta", createdAt: "2026/05/15" },
          { id: "project-card-3", name: "Gamma", createdAt: "2026/05/16" },
          { id: "project-card-4", name: "Delta", createdAt: "2026/05/17" },
          { id: "project-card-5", name: "Epsilon", createdAt: "2026/05/18" },
          { id: "project-card-6", name: "Zeta", createdAt: "2026/05/19" },
          { id: "project-card-7", name: "Eta", createdAt: "2026/05/20" },
          { id: "project-card-8", name: "Theta", createdAt: "2026/05/21" },
          { id: "project-card-9", name: "Iota", createdAt: "2026/05/22" },
        ],
      }),
    });

    assert.match(html, /全部项目\(9\)/);
    assert.match(html, /placeholder="请输入项目名称"/);
    assert.match(html, /data-action="change-project-page"/);
    assert.match(html, /1 \/ 2/);
    assert.ok(html.indexOf("Iota") < html.indexOf("Theta"));
    assert.ok(html.indexOf("Theta") < html.indexOf("Beta"));
    assert.doesNotMatch(html, /Alpha/);
  });

  it("filters the gallery with fuzzy name search", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectSearchQuery: "alp",
        projectLibrary: [
          { id: "project-card-1", name: "Alpha One", createdAt: "2026/05/21" },
          { id: "project-card-2", name: "Beta Two", createdAt: "2026/05/22" },
          { id: "project-card-3", name: "ALP Mission", createdAt: "2026/05/20" },
        ],
      }),
    });

    assert.match(html, /全部项目\(2\)/);
    assert.match(html, /Alpha One/);
    assert.match(html, /ALP Mission/);
    assert.doesNotMatch(html, /Beta Two/);
  });

  it("renders project card actions for cover upload, rename, and delete", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectCardMenuId: "project-card-1",
        projectLibrary: [
          {
            id: "project-card-1",
            name: "Alpha One",
            status: "制作中",
            createdAt: "2026/05/21",
            coverImageUrl: "data:image/png;base64,abc123",
          },
        ],
      }),
    });

    assert.match(html, /toggle-project-card-menu/);
    assert.match(html, /upload-project-cover/);
    assert.match(html, /替换封面/);
    assert.match(html, /重命名/);
    assert.match(html, /删除/);
    assert.match(html, /<img class="project-gallery-cover" src="data:image\/png;base64,abc123"/);
  });

  it("renders new projects with an upload-cover placeholder", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        projectLibrary: [
          {
            id: "project-card-1",
            name: "No Cover",
            status: "未开始",
            createdAt: "2026/05/22",
            coverImageUrl: "",
          },
        ],
      }),
    });

    assert.match(html, /project-gallery-poster needs-cover/);
    assert.match(html, /project-cover-placeholder/);
    assert.match(html, /data-action="pick-project-cover"/);
    assert.match(html, /type="file" accept="image\/\*"/);
  });

  it("renders the rename modal when renaming a project", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildProjectUi({
        renameProjectId: "project-card-1",
        renameProjectName: "11",
        projectLibrary: [{ id: "project-card-1", name: "11", createdAt: "2026/05/21" }],
      }),
    });

    assert.match(html, /aria-label="重命名"/);
    assert.match(html, /id="project-rename-name-input"/);
    assert.match(html, />2<\/span>/);
    assert.match(html, /data-action="confirm-rename-project-card"/);
    assert.doesNotMatch(html, /maxlength=/);
  });

  it("renders generation controls and export history in the episodes section", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        calibrationSkipReason: "Already covered by approved frames",
        calibrationOverrideReason: "Creative direction needs a deliberate override",
        imageGenerationResult: {
          platform: {
            workflowId: "workflow-image-1",
            workflowStatus: "running",
            tasks: [
              {
                shotId: "shot-1",
                taskId: "task-image-1",
                providerRequestId: "provider-image-1",
                storageObjectId: "storage-image-1",
                storageObjectKey: "shots/shot-1/image-task-image-1.png",
              },
            ],
          },
        },
        videoGenerationResult: {
          platform: {
            workflowId: "workflow-video-1",
            workflowStatus: "running",
            tasks: [
              {
                shotId: "shot-1",
                taskId: "task-video-1",
                providerRequestId: "provider-video-1",
                storageObjectId: "storage-video-1",
                storageObjectKey: "shots/shot-1/video-task-video-1.mp4",
              },
            ],
          },
        },
        exportHistory: [
          {
            manifestStatus: "ready",
            itemCount: 3,
            missingAssetCount: 0,
            createdAt: "2026-05-22T08:00:00.000Z",
            latestSignedUrlExpiresAt: "2026-05-22T09:00:00.000Z",
          },
        ],
        exportPreviewResult: {
          platform: {
            workflowId: "workflow-export-1",
            taskId: "task-export-1",
            storageObjectId: "storage-export-1",
            storageObjectKey: "exports/project-1/manifest-task-export-1.json",
            signedUrl: "https://example.com/export",
            expiresAt: "2026-05-22T09:00:00.000Z",
            workflowStatus: "completed",
          },
          exportRecord: {
            id: "export-record-1",
            workflowId: "workflow-export-1",
            storageObjectId: "storage-export-1",
            manifestStatus: "ready",
            latestSignedUrlExpiresAt: "2026-05-22T09:00:00.000Z",
            itemCount: 3,
            missingAssetCount: 0,
          },
        },
      },
    });

    assert.match(html, /data-action="parse-script"/);
    assert.match(html, /data-action="generate-images"/);
    assert.match(html, /data-action="preview-export"/);
    assert.match(html, /data-action="skip-calibration"/);
    assert.match(html, /data-action="override-calibration"/);
    assert.match(html, /id="calibration-skip-reason-input"/);
    assert.match(html, /导出历史/);
    assert.match(html, /ready/);
    assert.match(html, /workflow-image-1/);
    assert.match(html, /provider-image-1/);
    assert.match(html, /workflow-export-1/);
    assert.match(html, /打开签名下载链接/);
  });

  it("links overview asset cards to the matching asset tab", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const overviewHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "overview",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(overviewHtml, /data-action="open-project-asset-tab"/);
    assert.match(overviewHtml, /data-asset-kind="character"/);
    assert.match(overviewHtml, /data-asset-kind="scene"/);
    assert.match(overviewHtml, /data-asset-kind="prop"/);
    assert.match(overviewHtml, /data-asset-kind="other"/);

    const assetHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "assets",
        projectAssetTab: "scene",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(assetHtml, /class="interior-nav-item active"[\s\S]*?<strong>资产<\/strong>/);
    assert.match(assetHtml, /class="asset-library-tab active"[\s\S]*?场景/);
  });
});

describe("storyboard state", () => {
  it("adds storyboard 3 with draft status", () => {
    const next = addStoryboard([
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        status: "draft",
        imageStatus: "empty",
        videoStatus: "empty",
      },
    ]);

    assert.equal(next.length, 3);
    assert.equal(next[2].id, "storyboard-3");
  });
});

describe("video generation panel", () => {
  it("exposes the planned model catalog and validation", () => {
    assert.deepEqual(
      videoModels.map((model) => model.name),
      [
        "Happy Horse",
        "Vidu Q3-Pro",
        "Vidu Q2",
        "即梦3.0 Pro - Fast",
        "即梦3.0 Pro",
        "即梦3.5 Pro",
        "Hailuo 2.3 - Fast",
      ],
    );

    const result = validateVideoGeneration({ firstFrameUploaded: false });
    assert.equal(result.ok, false);
  });
});

describe("project create modal", () => {
  it("renders required inputs with defaults selected", () => {
    const html = renderProjectCreateModal({
      show: true,
      defaultName: "",
      selectedAspectRatio: "9:16",
      selectedProjectType: "anime",
    });

    assert.match(html, /id="project-create-name-input"/);
    assert.match(html, /name="project-aspect-ratio" value="9:16" checked/);
    assert.match(html, /name="project-type" value="anime" checked/);
    assert.match(html, /0\/50/);
  });
});
