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
  it("renders a persistent left rail and home hero tab", () => {
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
        toast: "已连接到本地 creator API。",
        isScriptModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /首页/);
    assert.match(html, /剧本/);
    assert.match(html, /项目/);
    assert.match(html, /资产库/);
    assert.match(html, /工具箱/);
    assert.match(html, /团队/);
    assert.match(html, /您的专属AI电影工作室/);
    assert.match(html, /创建项目/);
    assert.match(html, /data-action="set-nav-tab"/);
  });
});

describe("production workbench project tab", () => {
  it("renders the project gallery shell", () => {
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
        characters: [{ assetKey: "hero", label: "主角", required: true, confirmed: false }],
        scenes: [{ assetKey: "city", label: "都市", required: true, confirmed: false }],
        props: [{ assetKey: "sword", label: "长剑", required: false, confirmed: false }],
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
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        projectPanelMode: "library",
        projectLibrary: [
          {
            id: "project-card-1",
            name: "项目一",
            createdAt: "2026/05/21",
          },
          {
            id: "project-card-2",
            name: "项目二",
            createdAt: "2026/05/21",
          },
        ],
        validationMessage: "",
        toast: "已连接到本地 creator API。",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /全部项目\(2\)/);
    assert.match(html, /项目状态/);
    assert.match(html, /项目一/);
    assert.match(html, /项目二/);
    assert.match(html, /进入工作台/);
    assert.match(html, /创建项目/);
  });

  it("renders project workspace detail when projectPanelMode is workspace", () => {
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
        characters: [{ assetKey: "hero", label: "主角", required: true, confirmed: false }],
        scenes: [{ assetKey: "city", label: "都市", required: true, confirmed: false }],
        props: [{ assetKey: "sword", label: "长剑", required: false, confirmed: false }],
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
    const html = renderProductionWorkbench({
      state,
      session: { user: { phone: "+86 13800138000" } },
      ui: {
        activeNavTab: "project",
        projectPanelMode: "workspace",
        storyboards,
        selectedStoryboard: storyboards[0],
        selectedModelId: "vidu-q3-pro",
        prompt: "",
        busy: false,
        validationMessage: "",
        toast: "已连接到本地 creator API。",
        isScriptModalOpen: false,
        isCreateModalOpen: false,
        scriptTab: "script-upload",
        uploadNotice: "",
        defaultScript: "Episode 1",
      },
    });

    assert.match(html, /项目资产/);
    assert.match(html, /AI智能提取资产/);
    assert.match(html, /分镜工作台/);
    assert.match(html, /AI拆分镜/);
    assert.match(html, /导出素材包/);
  });
});

describe("storyboard state", () => {
  it("adds storyboard 3 with draft status", () => {
    const next = addStoryboard([
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "未定稿",
        imageStatus: "empty",
        videoStatus: "empty",
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        status: "未定稿",
        imageStatus: "empty",
        videoStatus: "empty",
      },
    ]);

    assert.equal(next.length, 3);
    assert.equal(next[2].id, "storyboard-3");
    assert.equal(next[2].status, "未定稿");
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
    assert.equal(result.message, "请上传完毕首帧图后提交生成任务");
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

    assert.match(html, /项目名称 <em>\*<\/em>/);
    assert.match(html, /画面比例 <em>\*<\/em>/);
    assert.match(html, /剧目类型 <em>\*<\/em>/);
    assert.match(html, /0\/50/);
    assert.match(html, /name="project-aspect-ratio" value="9:16" checked/);
    assert.match(html, /name="project-type" value="anime" checked/);
  });
});
