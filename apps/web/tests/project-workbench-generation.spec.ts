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

describe("asset generator and imported asset modals", () => {
  function buildModalState() {
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
        characters: [],
        scenes: [],
        props: [],
      },
      calibration: null,
      shots: [],
      exportPreview: null,
    };
  }

  function buildModalUi(overrides = {}) {
    const state = buildModalState();
    const storyboards = createStoryboardList(state);
    return {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "workspace",
      projectInteriorSection: "assets",
      projectAssetTab: "character",
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
      importedAssets: {
        character: [],
        scene: [],
        prop: [],
        other: { image: [], video: [] },
      },
      ...overrides,
    };
  }

  it("renders the character generator modal with chips and preview groups", () => {
    const state = buildModalState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildModalUi({
        assetGeneratorModal: "character",
        assetGeneratorName: "银面骑士2(1)",
        importedAssets: {
          character: [
            {
              id: "character-1",
              kind: "character",
              name: "银面骑士2(1)",
              preview: "data:image/svg+xml;charset=UTF-8,character-preview",
            },
          ],
          scene: [],
          prop: [],
          other: { image: [], video: [] },
        },
      }),
    });

    assert.match(html, /生成角色/);
    assert.match(html, /id="asset-generator-name-input"/);
    assert.match(html, /添加角色描述/);
    assert.match(html, /末世玄幻/);
    assert.match(html, /主视图/);
    assert.match(html, /定稿图片 \(1\)/);
    assert.match(html, /全部素材 \(1\)/);
    assert.match(html, /character-preview/);
  });

  it("renders the asset generator modal in edit mode", () => {
    const state = buildModalState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildModalUi({
        assetGeneratorModal: "character",
        assetGeneratorMode: "edit",
        assetGeneratorEditingAsset: {
          id: "character-1",
          kind: "character",
          name: "银面骑士2(1)",
          preview: "data:image/svg+xml;charset=UTF-8,edit-character-preview",
        },
        assetGeneratorName: "银面骑士2(1)",
      }),
    });

    assert.match(html, /编辑角色/);
    assert.match(html, />保存</);
    assert.match(html, /edit-character-preview/);
  });

  it("renders imported asset rename and delete confirmation modals", () => {
    const state = buildModalState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: buildModalUi({
        renameImportedAsset: {
          assetId: "character-1",
          assetKind: "character",
          mediaType: "image",
          name: "银面骑士2(1)",
        },
        renameImportedAssetName: "银面骑士2(1)",
        deleteImportedAsset: {
          assetId: "character-1",
          assetKind: "character",
          mediaType: "image",
          name: "银面骑士2(1)",
        },
      }),
    });

    assert.match(html, /aria-label="重命名素材"/);
    assert.match(html, /id="asset-rename-name-input"/);
    assert.match(html, /aria-label="确认删除素材"/);
    assert.match(html, /确定删除“银面骑士2\(1\)”/);
    assert.match(html, /data-action="confirm-delete-imported-asset"/);
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

  it.skip("renders generation controls and export history in the episodes section", () => {
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

  it("renders the episode hub with created episodes and preserved create flows", () => {
    const state = buildProjectState();
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
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

    assert.match(html, /剧集 \(1\)/);
    assert.match(html, /AI\s*批量创建分集/);
    assert.match(html, /单集创建/);
    assert.match(html, /data-action="open-batch-episode-flow"/);
    assert.match(html, /data-action="open-single-episode-flow"/);
    assert.match(html, /剧一/);
    assert.match(html, /创建于：2026\/05\/22/);
    assert.match(html, /未定稿/);
    assert.match(html, /data-action="open-episode-workbench"/);
    assert.match(html, /data-action="toggle-episode-card-menu"/);
  });

  it("renders the episode workbench when an episode card is opened", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };
    const storyboards = addStoryboard([]);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "episode-workbench",
          projectInteriorSection: "episodes",
          selectedEpisodeId: "episode-new",
          storyboards,
          selectedStoryboard: storyboards[0],
          customEpisodes: [
            {
              id: "episode-new",
              title: "鏂板缓鍓ч泦",
              status: "Draft",
              createdAt: "2026/05/22",
              createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
              storyboardCount: 1,
            },
          ],
        }),
      },
    });

    assert.match(html, /data-action="back-to-episode-hub"/);
    assert.match(html, /episode-workbench-screen/);
    assert.match(html, /鏂板缓鍓ч泦/);
    assert.match(html, /data-action="add-storyboard"/);
    assert.match(html, /data-action="select-storyboard"/);
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
    assert.match(
      overviewHtml,
      /class="asset-card-summary"[\s\S]*?class="asset-card-count">1<\/span>[\s\S]*?class="asset-card-label">角色/,
    );

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

  it("renders the character empty state with the centered intake layout", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "assets",
          projectAssetTab: "character",
          storyboards,
          selectedStoryboard: storyboards[0],
          importedAssets: {
            character: [],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
        }),
      },
    });

    assert.match(html, /asset-library-empty-showcase/);
    assert.match(html, /data-action="open-asset-import-modal"/);
    assert.match(html, /data-asset-kind="character"/);
  });
 
  it("renders imported assets in the library after import", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "assets",
          projectAssetTab: "character",
          storyboards,
          selectedStoryboard: storyboards[0],
          importedAssets: {
            character: [
              {
                id: "imported-character-1",
                name: "asset-character-a",
                preview: "data:image/svg+xml;charset=UTF-8,test-character",
                source: "local",
              },
            ],
            scene: [],
            prop: [],
            other: { image: [], video: [] },
          },
        }),
      },
    });

    assert.match(html, /imported-asset-card/);
    assert.match(html, /test-character/);
    assert.doesNotMatch(html, /asset-library-empty-card/);
  });

  it("renders selectable official assets in the import modal", () => {
    const state = buildProjectState();
    const storyboards = createStoryboardList(state);
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "assets",
          projectAssetTab: "character",
          storyboards,
          selectedStoryboard: storyboards[0],
          assetImportModal: "character",
          assetImportModalTab: "official",
          assetImportCategory: "domestic-modern-city",
          assetImportSelection: ["official-character-1"],
          assetImportOfficialAssets: [
            {
              id: "official-character-1",
              name: "official-character-a",
              preview: "data:image/svg+xml;charset=UTF-8,official-character",
            },
          ],
        }),
      },
    });

    assert.match(html, /data-action="toggle-official-asset-import"/);
    assert.match(html, /data-asset-id="official-character-1"/);
    assert.match(html, /official-character/);
    assert.match(html, /data-action="confirm-asset-import"/);
  });

  it("renders 剧一 with both creation entry points in the overview", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };

    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "overview",
          storyboards: [],
          selectedStoryboard: null,
        }),
      },
    });

    assert.match(
      html,
      /data-action="set-project-interior-section"[\s\S]*?data-section="episodes"[\s\S]*?剧一/,
    );
    assert.match(html, /剧集创作/);
    assert.match(html, /剧一/);
    assert.match(html, /data-action="open-single-episode-flow"/);
    assert.match(html, /data-action="open-batch-episode-flow"/);
  });

  it("renders the episode creation hub when there are no episodes yet", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };

    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "episodes",
          storyboards: [],
          selectedStoryboard: null,
        }),
      },
    });

    assert.match(html, /aria-label="剧集菜单"/);
    assert.match(html, /AI\s*批量创建/);
    assert.match(html, /单集创建/);
    assert.match(html, /data-action="open-batch-episode-flow"/);
    assert.match(html, /data-action="open-single-episode-flow"/);
  });

  it.skip("renders a naming modal for single creation and upload modal for batch creation", () => {
    const state = {
      ...buildProjectState(),
      shots: [],
    };

    const singleEpisodeHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "episodes",
          storyboards: [],
          selectedStoryboard: null,
          isSingleEpisodeModalOpen: true,
          singleEpisodeName: "阿达",
        }),
      },
    });

    assert.match(storyboardUploadHtml, /aria-label="上传剧本"/);
    assert.match(storyboardUploadHtml, /分镜单上传/);
    assert.match(storyboardUploadHtml, /分镜单格式说明/);
    assert.match(storyboardUploadHtml, /支持doc\/docx\/txt\/xls\/xlsx格式/);

    const batchEpisodeHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...buildProjectUi({
          projectPanelMode: "workspace",
          projectInteriorSection: "episodes",
          storyboards: [],
          selectedStoryboard: null,
          isScriptModalOpen: true,
          scriptTab: "script-upload",
        }),
      },
    });

    assert.match(batchEpisodeHtml, /aria-label="上传剧本"/);
    assert.match(batchEpisodeHtml, /剧本上传/);
    assert.match(batchEpisodeHtml, /请上传完整剧本/);
    assert.match(batchEpisodeHtml, /支持docx\/txt格式/);
  });
});

describe("storyboard state", () => {
  it("renders single-episode naming modal and sorts custom episodes newest first", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "not_started",
        aspectRatio: "9:16",
        resolution: "1080p",
        createdAt: "2026/05/20",
      },
      shots: [],
    };

    const modalHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isSingleEpisodeModalOpen: true,
        singleEpisodeName: "阿达",
      },
    });

    assert.match(modalHtml, /aria-label="新建剧集"/);
    assert.match(modalHtml, /id="single-episode-name-input"/);
    assert.match(modalHtml, /data-action="confirm-single-episode"/);
    assert.match(modalHtml, /2\/50/);

    const listHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        projectInteriorSection: "episodes",
        storyboards: [],
        selectedStoryboard: null,
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "",
        isScriptModalOpen: true,
        scriptTab: "script-upload",
        scriptSubmitAction: "confirm-batch-episode",
        customEpisodes: [
          {
            id: "episode-older",
            title: "较早剧集",
            status: "未定稿",
            createdAt: "2026/05/21",
            createdAtMs: Date.parse("2026-05-21T08:00:00.000Z"),
            storyboardCount: 0,
          },
          {
            id: "episode-newer",
            title: "最新剧集",
            status: "未定稿",
            createdAt: "2026/05/22",
            createdAtMs: Date.parse("2026-05-22T08:00:00.000Z"),
            storyboardCount: 0,
          },
        ],
      },
    });

    assert.match(listHtml, /data-action="confirm-batch-episode"/);
    assert.ok(listHtml.indexOf("最新剧集") < listHtml.indexOf("较早剧集"));
  });

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

describe("asset import modal", () => {
  it("renders a real local upload intake and in-modal review state", () => {
    const state = {
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
    const storyboards = createStoryboardList(state);
    const baseUi = {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "workspace",
      projectInteriorSection: "assets",
      projectAssetTab: "character",
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
    };

    const localImportHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        assetImportModal: "character",
        assetImportModalTab: "local",
      },
    });

    assert.match(localImportHtml, /data-dropzone="asset-import"/);
    assert.match(localImportHtml, /data-action="pick-asset-import-files"/);
    assert.match(localImportHtml, /class="asset-import-file-input"/);
    assert.match(localImportHtml, /type="file"/);

    const reviewHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        assetImportModal: "character",
        assetImportModalTab: "local",
        assetImportSelection: ["asset-draft-character-1"],
        assetImportDrafts: [
          {
            id: "asset-draft-character-1",
            name: "王蛇",
            preview: "data:image/png;base64,test-preview",
          },
        ],
      },
    });

    assert.match(reviewHtml, /本次上传成功 1 个/);
    assert.match(reviewHtml, /data-action="toggle-asset-import-draft"/);
    assert.match(reviewHtml, /test-preview/);
  });

  it("renders scene and prop asset flows with type-specific copy and ratios", () => {
    const state = {
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
      shots: [],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);
    const baseUi = {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "workspace",
      projectInteriorSection: "assets",
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
      importedAssets: {
        character: [],
        scene: [],
        prop: [],
        other: { image: [], video: [] },
      },
    };

    const sceneEmptyHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        projectAssetTab: "scene",
      },
    });

    assert.match(sceneEmptyHtml, /场景资源库暂时还是空的/);
    assert.match(sceneEmptyHtml, /生成场景/);
    assert.match(sceneEmptyHtml, /导入场景/);

    const propFilledHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        ...baseUi,
        projectAssetTab: "prop",
        importedAssets: {
          ...baseUi.importedAssets,
          prop: [
            {
              id: "imported-prop-1",
              kind: "prop",
              name: "识别终端",
              preview: "data:image/svg+xml;charset=UTF-8,prop-preview",
            },
          ],
        },
      },
    });

    assert.match(propFilledHtml, /imported-asset-card square/);
    assert.match(propFilledHtml, /prop-preview/);
  });

  it("renders other image import flow and imported badge state", () => {
    const state = {
      project: {
        id: "project-1",
        name: "try",
        phase: "asset_review",
        aspectRatio: "9:16",
        resolution: "1080p",
      },
      assetReview: { readyForGeneration: false },
      assetCandidates: {
        characters: [],
        scenes: [],
        props: [],
      },
      calibration: null,
      shots: [],
      exportPreview: null,
    };
    const storyboards = createStoryboardList(state);

    const modalHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        projectPanelMode: "workspace",
        projectInteriorSection: "assets",
        projectAssetTab: "other",
        projectOtherAssetMediaType: "image",
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        assetImportModal: "other",
        assetImportModalTab: "local",
      },
    });

    assert.match(modalHtml, /导入图片主体/);
    assert.match(modalHtml, /点击或直接拖拽图片主体上传/);

    const importedHtml = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        projectPanelMode: "workspace",
        projectInteriorSection: "assets",
        projectAssetTab: "other",
        projectOtherAssetMediaType: "image",
        validationMessage: "",
        toast: "",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
        importedAssets: {
          character: [],
          scene: [],
          prop: [],
          other: {
            image: [
              {
                id: "imported-other-1",
                name: "主角图片主体",
                preview: "data:image/svg+xml;charset=UTF-8,other-image",
              },
            ],
            video: [],
          },
        },
      },
    });

    assert.match(importedHtml, /other-imported-badge/);
    assert.match(importedHtml, /审核中/);
    assert.match(importedHtml, /other-image/);
  });
});
