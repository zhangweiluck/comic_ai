import { renderProjectDetail } from "./project-detail.js";
import {
  addStoryboard,
  createStoryboardList,
  getSelectedStoryboard,
} from "./storyboard-state.js";
import { validateVideoGeneration } from "./video-generation-panel.js";

const DEFAULT_SCRIPT = `Episode 1: Dawn over the mechanical city.

The lead mechanist opens the tower window, sees the industrial skyline, and prepares to launch the first test frame.`;

export function renderProductionWorkbench(context = {}) {
  return renderProjectDetail(context);
}

export async function initProductionWorkbench({ root, session, api, onLogout }) {
  const workbench = {
    root,
    session,
    api,
    onLogout,
    state: null,
    ui: {
      busy: false,
      toast: "已连接到本地 creator API。",
      validationMessage: "",
      isCreateModalOpen: false,
      createProjectName: "",
      createAspectRatio: "9:16",
      createProjectType: "anime",
      createProjectNotice: "",
      projectLibrary: [],
      projectSearchQuery: "",
      projectLibraryPage: 1,
      selectedProjectCardId: null,
      isScriptModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      defaultScript: DEFAULT_SCRIPT,
      storyboards: [],
      selectedStoryboardId: null,
      activeNavTab: deriveInitialNavTab(window.location.hash),
      projectPanelMode: deriveInitialProjectPanelMode(window.location.hash),
    },
  };

  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }
    void handleAction(workbench, target);
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target?.matches?.("[data-model-choice]")) {
      workbench.ui.selectedModelId = target.value;
      workbench.ui.toast = `已选择 ${target.options[target.selectedIndex]?.text ?? target.value}。`;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[name="video-model"]')) {
      workbench.ui.selectedModelId = target.value;
      workbench.ui.toast = `已选择 ${target.value}。`;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[name="project-aspect-ratio"]')) {
      workbench.ui.createAspectRatio = target.value;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[name="project-type"]')) {
      workbench.ui.createProjectType = target.value;
      render(workbench);
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (target?.matches?.("#video-prompt-input")) {
      workbench.ui.prompt = target.value;
    }
    if (target?.matches?.("#script-input")) {
      workbench.ui.defaultScript = target.value;
    }
    if (target?.matches?.("#project-create-name-input")) {
      workbench.ui.createProjectName = target.value;
    }
    if (target?.matches?.('[data-action="search-projects"]')) {
      workbench.ui.projectSearchQuery = target.value;
      workbench.ui.projectLibraryPage = 1;
      render(workbench);
    }
  });

  await refresh(workbench);
  render(workbench);
}

async function refresh(workbench) {
  workbench.state = await workbench.api.getCreatorState();
  seedProjectLibrary(workbench);
  const nextStoryboards = syncStoryboards(
    workbench.ui.storyboards,
    createStoryboardList(workbench.state),
  );
  workbench.ui.storyboards = nextStoryboards;
  if (!workbench.ui.selectedStoryboardId && nextStoryboards.length > 0) {
    workbench.ui.selectedStoryboardId = nextStoryboards[0].id;
  }
  if (
    workbench.ui.selectedStoryboardId &&
    !nextStoryboards.some((storyboard) => storyboard.id === workbench.ui.selectedStoryboardId)
  ) {
    workbench.ui.selectedStoryboardId = nextStoryboards[0]?.id ?? null;
  }
}

function render(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    workbench.ui.storyboards,
    workbench.ui.selectedStoryboardId,
  );
  workbench.root.innerHTML = renderProductionWorkbench({
    state: workbench.state,
    session: workbench.session,
    api: workbench.api,
    ui: {
      ...workbench.ui,
      selectedStoryboard,
    },
  });
}

async function handleAction(workbench, target) {
  const action = target.dataset.action;
  if (!action || workbench.ui.busy) {
    return;
  }

  if (action === "logout") {
    await runAction(workbench, "正在退出登录...", () => workbench.onLogout?.());
    return;
  }

  if (action === "set-nav-tab") {
    workbench.ui.activeNavTab = target.dataset.tab ?? "home";
    workbench.ui.projectPanelMode =
      workbench.ui.activeNavTab === "project" ? "library" : workbench.ui.projectPanelMode;
    workbench.ui.toast = `已切换到${navTabLabel(workbench.ui.activeNavTab)}。`;
    window.location.hash = workbench.ui.activeNavTab === "home" ? "home" : workbench.ui.activeNavTab;
    render(workbench);
    return;
  }

  if (action === "open-create-modal") {
    workbench.ui.isCreateModalOpen = true;
    workbench.ui.createProjectNotice = "";
    workbench.ui.createProjectName = "";
    workbench.ui.createAspectRatio = "9:16";
    workbench.ui.createProjectType = "anime";
    render(workbench);
    return;
  }

  if (action === "close-create-modal") {
    workbench.ui.isCreateModalOpen = false;
    workbench.ui.createProjectNotice = "";
    render(workbench);
    return;
  }

  if (action === "open-script-modal") {
    workbench.ui.isScriptModalOpen = true;
    workbench.ui.scriptTab = "script-upload";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "close-script-modal") {
    workbench.ui.isScriptModalOpen = false;
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "switch-script-tab") {
    workbench.ui.scriptTab = target.dataset.tab ?? "script-upload";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "select-storyboard") {
    workbench.ui.selectedStoryboardId = target.dataset.storyboardId ?? null;
    render(workbench);
    return;
  }

  if (action === "open-project-workspace") {
    const projectId = target.dataset.projectId ?? null;
    workbench.ui.selectedProjectCardId = projectId;
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.toast = "已进入项目工作台。";
    window.location.hash = "storyboard-workbench";
    render(workbench);
    return;
  }

  if (action === "add-storyboard") {
    workbench.ui.storyboards = addStoryboard(workbench.ui.storyboards);
    workbench.ui.selectedStoryboardId = workbench.ui.storyboards.at(-1)?.id ?? null;
    workbench.ui.toast = "已添加分镜 3。";
    render(workbench);
    return;
  }

  await runAction(workbench, statusForAction(action), async () => {
    if (action === "create-project") {
      const name = getInputValue(workbench.root, "#project-create-name-input", "").slice(0, 50);
      if (!name) {
        workbench.ui.createProjectNotice = "请先填写项目名称";
        render(workbench);
        return;
      }
      const aspectRatio = getCheckedValue(workbench.root, 'input[name="project-aspect-ratio"]', "9:16");
      const projectType = getCheckedValue(workbench.root, 'input[name="project-type"]', "anime");
      if (!aspectRatio) {
        workbench.ui.createProjectNotice = "请选择画面比例";
        render(workbench);
        return;
      }
      if (!projectType) {
        workbench.ui.createProjectNotice = "请选择剧目类型";
        render(workbench);
        return;
      }
      const scriptInput = buildProjectSeedScript({ name, projectType });
      await workbench.api.createProject({
        name,
        scriptInput,
        aspectRatio,
        resolution: "1080p",
      });
      const projectCard = createProjectCard({
        name,
        aspectRatio,
        projectType,
        backendProjectId: workbench.state?.project?.id,
      });
      workbench.ui.projectLibrary = [...workbench.ui.projectLibrary, projectCard];
      workbench.ui.projectLibraryPage = 1;
      workbench.ui.selectedProjectCardId = projectCard.id;
      workbench.ui.activeNavTab = "project";
      workbench.ui.projectPanelMode = "library";
      workbench.ui.isCreateModalOpen = false;
      workbench.ui.createProjectNotice = "";
      workbench.ui.createProjectName = name;
      workbench.ui.createAspectRatio = aspectRatio;
      workbench.ui.createProjectType = projectType;
      workbench.ui.isScriptModalOpen = false;
      workbench.ui.uploadNotice = "";
      window.location.hash = "project";
      return;
    }

    if (action === "parse-script") {
      await workbench.api.parseScript();
      return;
    }

    if (action === "confirm-all-assets") {
      await workbench.api.confirmAllAssets();
      return;
    }

    if (action === "confirm-asset") {
      await workbench.api.confirmAsset({
        group: target.dataset.group,
        assetKey: target.dataset.assetKey,
      });
      return;
    }

    if (action === "edit-asset") {
      const nextLabel = window.prompt("更新资产名称", target.dataset.label ?? "");
      if (!nextLabel || nextLabel.trim() === target.dataset.label) {
        return;
      }
      await workbench.api.updateAssetLabel({
        group: target.dataset.group,
        assetKey: target.dataset.assetKey,
        label: nextLabel,
      });
      return;
    }

    if (action === "run-calibration") {
      await workbench.api.runCalibration();
      return;
    }

    if (action === "generate-images") {
      await workbench.api.generateImages();
      return;
    }

    if (action === "generate-videos") {
      const validation = validateVideoGeneration({
        firstFrameUploaded: hasFirstFrame(workbench),
      });
      if (!validation.ok) {
        workbench.ui.validationMessage = validation.message;
        workbench.ui.toast = validation.message;
        render(workbench);
        return;
      }
      workbench.ui.validationMessage = "";
      await workbench.api.generateVideos();
      return;
    }

    if (action === "smart-generate") {
      const validation = validateVideoGeneration({
        firstFrameUploaded: hasFirstFrame(workbench),
      });
      if (!validation.ok) {
        workbench.ui.validationMessage = validation.message;
        workbench.ui.toast = validation.message;
        render(workbench);
        return;
      }
      workbench.ui.validationMessage = "";
      await runSmartGenerate(workbench);
      return;
    }

    if (action === "preview-export") {
      await workbench.api.previewExport();
    }
  });
}

async function runSmartGenerate(workbench) {
  if (!workbench.state?.project) {
    throw new Error("creator_project_missing");
  }
  if (!workbench.state.shots.length) {
    throw new Error("creator_shots_missing");
  }
  if (!workbench.state.assetReview?.readyForGeneration) {
    throw new Error("asset_review_not_ready");
  }
  if (!workbench.state.calibration) {
    await workbench.api.runCalibration();
  }
  if (workbench.state.shots.some((shot) => !shot.currentImageAssetVersionId)) {
    await workbench.api.generateImages();
  }
  const afterImages = await workbench.api.getCreatorState();
  if (afterImages.shots.some((shot) => !shot.currentImageAssetVersionId)) {
    throw new Error("image_assets_missing");
  }
  if (afterImages.shots.some((shot) => !shot.currentVideoAssetVersionId)) {
    await workbench.api.generateVideos();
  }
}

async function runAction(workbench, message, action) {
  workbench.ui.busy = true;
  workbench.ui.toast = message;
  render(workbench);

  try {
    await action();
    await refresh(workbench);
    workbench.ui.toast = "操作完成。";
  } catch (error) {
    workbench.ui.toast = `操作失败：${friendlyError(error)}`;
  } finally {
    workbench.ui.busy = false;
    render(workbench);
  }
}

function hasFirstFrame(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    workbench.ui.storyboards,
    workbench.ui.selectedStoryboardId,
  );
  if (selectedStoryboard?.imageStatus === "ready") {
    return true;
  }
  return workbench.state?.shots?.some((shot) => shot.currentImageAssetVersionId) ?? false;
}

function syncStoryboards(current, next) {
  if (!current.length) {
    return next;
  }

  const nextByShotId = new Map(
    next.filter((storyboard) => storyboard.linkedShotId).map((storyboard) => [storyboard.linkedShotId, storyboard]),
  );

  return current.map((storyboard) => {
    if (!storyboard.linkedShotId) {
      return storyboard;
    }
    return nextByShotId.get(storyboard.linkedShotId) ?? storyboard;
  });
}

function statusForAction(action) {
  return (
    {
      "create-project": "正在创建项目...",
      "parse-script": "正在拆解剧本...",
      "confirm-all-assets": "正在确认全部资产...",
      "confirm-asset": "正在确认资产...",
      "edit-asset": "正在更新资产名称...",
      "run-calibration": "正在校准镜头...",
      "generate-images": "正在生成图片...",
      "generate-videos": "正在生成视频...",
      "smart-generate": "正在执行生成链路...",
      "preview-export": "正在生成导出预览...",
    }[action] ?? "正在处理..."
  );
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    {
      creator_project_missing: "请先上传剧本并创建项目。",
      creator_shots_missing: "请先拆分镜。",
      asset_review_not_ready: "请先确认必需资产。",
      image_assets_missing: "仍有镜头缺少图片资产。",
    }[message] ?? message
  );
}

function getInputValue(root, selector, fallback) {
  const value = root.querySelector(selector)?.value?.trim();
  return value || fallback;
}

function getCheckedValue(root, selector, fallback) {
  return root.querySelector(`${selector}:checked`)?.value ?? fallback;
}

function deriveInitialNavTab(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (!token || token === "home") {
    return "home";
  }
  if (token === "asset-prep-section" || token === "storyboard-workbench" || token === "project") {
    return "project";
  }
  if (token === "script") {
    return "script";
  }
  if (token === "library") {
    return "library";
  }
  if (token === "tools") {
    return "tools";
  }
  if (token === "team") {
    return "team";
  }
  return "project";
}

function deriveInitialProjectPanelMode(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (token === "asset-prep-section" || token === "storyboard-workbench") {
    return "workspace";
  }
  return "library";
}

function navTabLabel(tab) {
  return (
    {
      home: "首页",
      script: "剧本",
      project: "项目",
      library: "资产库",
      tools: "工具箱",
      team: "团队",
    }[tab] ?? "工作台"
  );
}

function buildProjectSeedScript({ name, projectType }) {
  const typeLabel =
    {
      "domestic-live": "国内仿真人剧",
      "overseas-live": "海外仿真人剧",
      anime: "2D/3D动漫",
    }[projectType] ?? "2D/3D动漫";

  return `${name}

项目类型：${typeLabel}
第一集：请根据项目名称和剧目类型生成一版可继续拆分镜的初始故事草稿。`;
}

function seedProjectLibrary(workbench) {
  if (!workbench.state?.project) {
    return;
  }

  const currentName = workbench.state.project.name ?? "";
  const exists = workbench.ui.projectLibrary.some(
    (project) => project.backendProjectId === workbench.state.project.id || project.name === currentName,
  );

  if (!exists) {
    workbench.ui.projectLibrary = [
      ...workbench.ui.projectLibrary,
      createProjectCard({
        name: currentName,
        aspectRatio: workbench.state.project.aspectRatio ?? "9:16",
        projectType: "anime",
        backendProjectId: workbench.state.project.id,
      }),
    ];
  }

  if (!workbench.ui.selectedProjectCardId) {
    workbench.ui.selectedProjectCardId = workbench.ui.projectLibrary.at(-1)?.id ?? null;
  }
}

function createProjectCard({ name, aspectRatio, projectType, backendProjectId }) {
  return {
    id: `project-card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    backendProjectId: backendProjectId ?? null,
    name,
    aspectRatio,
    projectType,
    createdAt: formatProjectDate(new Date()),
  };
}

function formatProjectDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}/${month}/${day}`;
}
