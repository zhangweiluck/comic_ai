import { renderProjectDetail } from "./project-detail.js";
import { buildProjectCreateRequest } from "./project-create-request.js";
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
      projectStatusMenuOpen: false,
      projectStatusFilters: [],
      projectCardMenuId: null,
      projectInteriorStatusMenuOpen: false,
      projectInteriorSection: "overview",
      projectAssetTab: "character",
      projectOtherAssetMediaType: "video",
      assetGeneratorModal: null,
      renameProjectId: null,
      renameProjectName: "",
      renameProjectNotice: "",
      deleteProjectId: null,
      selectedProjectCardId: null,
      isScriptModalOpen: false,
      isOriginalScriptModalOpen: false,
      originalScriptDraft: {
        fileName: "",
        audience: "女频",
        genre: "逆袭爽感",
        episodeCount: "",
        cardSetting: "自动分卡",
        episodeLength: "约 1 分钟",
        inspiration: "",
      },
      scriptTab: "script-upload",
      uploadNotice: "",
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      defaultScript: DEFAULT_SCRIPT,
      storyboards: [],
      selectedStoryboardId: null,
      calibrationSkipReason: "",
      calibrationOverrideReason: "",
      lastCalibrationResult: null,
      exportHistory: [],
      imageGenerationResult: null,
      videoGenerationResult: null,
      exportPreviewResult: null,
      activeNavTab: deriveInitialNavTab(window.location.hash),
      projectPanelMode: deriveInitialProjectPanelMode(window.location.hash),
    },
  };

  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }
    if (target.matches?.('input[data-action="upload-project-cover"]')) {
      return;
    }
    void handleAction(workbench, target);
  });

  root.addEventListener("change", async (event) => {
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
      return;
    }

    if (target?.matches?.("#original-script-audience")) {
      workbench.ui.originalScriptDraft.audience = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-genre")) {
      workbench.ui.originalScriptDraft.genre = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-episode-count")) {
      workbench.ui.originalScriptDraft.episodeCount = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-card-setting")) {
      workbench.ui.originalScriptDraft.cardSetting = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-episode-length")) {
      workbench.ui.originalScriptDraft.episodeLength = target.value;
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.('input[name="project-status-filter"]')) {
      const next = new Set(workbench.ui.projectStatusFilters ?? []);
      if (target.checked) {
        next.add(target.value);
      } else {
        next.delete(target.value);
      }
      workbench.ui.projectStatusFilters = [...next];
      workbench.ui.projectLibraryPage = 1;
      render(workbench);
      return;
    }

    if (target?.matches?.('input[data-action="upload-project-cover"]')) {
      const [file] = [...(target.files ?? [])];
      if (!file) {
        return;
      }

      const projectId = target.dataset.projectId ?? null;
      const coverImageUrl = await readFileAsDataUrl(file);
      target.value = "";
      workbench.ui.projectCardMenuId = null;
      await runAction(workbench, "正在更新项目封面...", async () => {
        await workbench.api.updateProjectCover({
          projectId,
          coverImageUrl,
        });
      });
      return;
    }
  });

  root.addEventListener("input", (event) => {
    const target = event.target;

    if (target?.matches?.("#video-prompt-input")) {
      workbench.ui.prompt = target.value;
      return;
    }

    if (target?.matches?.("#script-input")) {
      workbench.ui.defaultScript = target.value;
      return;
    }

    if (target?.matches?.("#original-script-file-name")) {
      workbench.ui.originalScriptDraft.fileName = target.value;
      const counter = target.closest(".control-field")?.querySelector("small");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#original-script-inspiration")) {
      workbench.ui.originalScriptDraft.inspiration = target.value;
      const counter = target.closest(".control-field")?.querySelector("small");
      if (counter) {
        counter.textContent = `${[...target.value].length}/460`;
      }
      updateOriginalScriptSubmitState(workbench);
      return;
    }

    if (target?.matches?.("#calibration-skip-reason-input")) {
      workbench.ui.calibrationSkipReason = target.value;
      return;
    }

    if (target?.matches?.("#calibration-override-reason-input")) {
      workbench.ui.calibrationOverrideReason = target.value;
      return;
    }

    if (target?.matches?.("#project-create-name-input")) {
      workbench.ui.createProjectName = target.value;
      return;
    }

    if (target?.matches?.("#project-rename-name-input")) {
      workbench.ui.renameProjectName = target.value;
      if (workbench.ui.renameProjectNotice) {
        workbench.ui.renameProjectNotice = "";
      }
      const counter = workbench.root.querySelector(".rename-project-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      const notice = workbench.root.querySelector(".rename-project-actions .modal-inline-status");
      if (notice) {
        notice.textContent = "";
      }
      return;
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
  await syncProjectLibraryFromApi(workbench);
  workbench.ui.exportHistory = workbench.state.project
    ? await loadExportHistory(workbench)
    : [];
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

async function loadExportHistory(workbench) {
  try {
    const payload = await workbench.api.getExportHistory();
    return Array.isArray(payload.records) ? payload.records : [];
  } catch (error) {
    if (String(error instanceof Error ? error.message : error).includes("creator_project_missing")) {
      return [];
    }
    throw error;
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
    workbench.ui.busy = true;
    workbench.ui.toast = "正在退出登录...";
    render(workbench);
    try {
      await workbench.onLogout?.();
    } catch (error) {
      workbench.ui.busy = false;
      workbench.ui.toast = `退出登录失败：${friendlyError(error)}`;
      render(workbench);
    }
    return;
  }

  if (action === "set-nav-tab") {
    workbench.ui.activeNavTab = target.dataset.tab ?? "home";
    workbench.ui.projectPanelMode =
      workbench.ui.activeNavTab === "project" ? "library" : workbench.ui.projectPanelMode;
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.toast = `已切换到 ${navTabLabel(workbench.ui.activeNavTab)}。`;
    window.location.hash = workbench.ui.activeNavTab === "home" ? "home" : workbench.ui.activeNavTab;
    if (workbench.ui.activeNavTab === "project") {
      await syncProjectLibraryFromApi(workbench);
    }
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

  if (action === "open-original-script-modal") {
    workbench.ui.isOriginalScriptModalOpen = true;
    workbench.ui.toast = "正在设置 AI 原创剧本规划。";
    render(workbench);
    return;
  }

  if (action === "close-original-script-modal") {
    workbench.ui.isOriginalScriptModalOpen = false;
    render(workbench);
    return;
  }

  if (action === "submit-original-script-settings") {
    const draft = workbench.ui.originalScriptDraft;
    if (!(draft.fileName?.trim() && draft.inspiration?.trim() && draft.episodeCount)) {
      workbench.ui.toast = "请补全文件名称、创作灵感和拆分集数";
      render(workbench);
      return;
    }

    workbench.ui.isOriginalScriptModalOpen = false;
    workbench.ui.toast = "已保存剧本规划设置。生成规划方案将在后端生成接入后启用。";
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
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.projectInteriorSection = "overview";
    workbench.ui.assetGeneratorModal = null;
    workbench.ui.toast = "已进入项目工作台。";
    window.location.hash = "storyboard-workbench";
    render(workbench);
    return;
  }

  if (action === "toggle-project-status-menu") {
    workbench.ui.projectStatusMenuOpen = !workbench.ui.projectStatusMenuOpen;
    render(workbench);
    return;
  }

  if (action === "toggle-project-interior-status-menu") {
    workbench.ui.projectInteriorStatusMenuOpen = !workbench.ui.projectInteriorStatusMenuOpen;
    render(workbench);
    return;
  }

  if (action === "set-project-interior-section") {
    workbench.ui.projectInteriorSection = target.dataset.section ?? "overview";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.assetGeneratorModal = null;
    render(workbench);
    return;
  }

  if (action === "open-project-asset-tab") {
    workbench.ui.projectInteriorSection = "assets";
    workbench.ui.projectAssetTab = target.dataset.assetKind ?? "character";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.assetGeneratorModal = null;
    render(workbench);
    return;
  }

  if (action === "set-project-asset-tab") {
    workbench.ui.projectAssetTab = target.dataset.assetTab ?? "character";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    render(workbench);
    return;
  }

  if (action === "set-project-other-asset-media") {
    workbench.ui.projectOtherAssetMediaType = target.dataset.mediaType ?? "video";
    render(workbench);
    return;
  }

  if (action === "open-asset-generator-modal") {
    workbench.ui.assetGeneratorModal = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    render(workbench);
    return;
  }

  if (action === "close-asset-generator-modal") {
    workbench.ui.assetGeneratorModal = null;
    render(workbench);
    return;
  }

  if (action === "set-project-interior-status") {
    const projectId = workbench.ui.selectedProjectCardId;
    const nextStatus = target.dataset.status ?? "制作中";
    await runAction(workbench, "正在更新项目状态...", async () => {
      await workbench.api.updateProject({
        projectId,
        phase: projectStatusToPhase(nextStatus),
      });
      workbench.ui.projectInteriorStatusMenuOpen = false;
    });
    return;
  }

  if (action === "change-project-page") {
    const nextPage = Number(target.dataset.page ?? workbench.ui.projectLibraryPage ?? 1);
    workbench.ui.projectLibraryPage = Math.max(1, nextPage);
    render(workbench);
    return;
  }

  if (action === "toggle-project-card-menu") {
    const projectId = target.dataset.projectId ?? null;
    workbench.ui.projectCardMenuId =
      workbench.ui.projectCardMenuId === projectId ? null : projectId;
    render(workbench);
    return;
  }

  if (action === "pick-project-cover") {
    const projectId = target.dataset.projectId ?? null;
    workbench.root
      .querySelector(`input[data-action="upload-project-cover"][data-project-id="${projectId}"]`)
      ?.click();
    return;
  }

  if (action === "rename-project-card") {
    const projectId = target.dataset.projectId ?? null;
    const currentProject = workbench.ui.projectLibrary.find((project) => project.id === projectId);
    workbench.ui.renameProjectId = projectId;
    workbench.ui.renameProjectName = currentProject?.name ?? "";
    workbench.ui.renameProjectNotice = "";
    workbench.ui.projectCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-rename-project-modal") {
    workbench.ui.renameProjectId = null;
    workbench.ui.renameProjectName = "";
    workbench.ui.renameProjectNotice = "";
    render(workbench);
    return;
  }

  if (action === "confirm-rename-project-card") {
    const projectId = workbench.ui.renameProjectId;
    const nextName = workbench.ui.renameProjectName.trim();
    if (!nextName) {
      workbench.ui.renameProjectNotice = "请输入项目名称";
      render(workbench);
      return;
    }
    await runAction(workbench, "正在重命名项目...", async () => {
      await workbench.api.updateProject({
        projectId,
        name: nextName,
      });
      workbench.ui.renameProjectId = null;
      workbench.ui.renameProjectName = "";
      workbench.ui.renameProjectNotice = "";
    });
    return;
  }

  if (action === "delete-project-card") {
    workbench.ui.deleteProjectId = target.dataset.projectId ?? null;
    workbench.ui.projectCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-delete-project-modal") {
    workbench.ui.deleteProjectId = null;
    render(workbench);
    return;
  }

  if (action === "confirm-delete-project-card") {
    const projectId = workbench.ui.deleteProjectId;
    await runAction(workbench, "正在删除项目...", async () => {
      await workbench.api.deleteProject({ projectId });
      workbench.ui.deleteProjectId = null;
      if (workbench.ui.selectedProjectCardId === projectId) {
        workbench.ui.selectedProjectCardId = null;
        workbench.ui.projectPanelMode = "library";
      }
    });
    return;
  }

  if (action === "add-storyboard") {
    workbench.ui.storyboards = addStoryboard(workbench.ui.storyboards);
    workbench.ui.selectedStoryboardId = workbench.ui.storyboards.at(-1)?.id ?? null;
    workbench.ui.toast = "已新增分镜 3。";
    render(workbench);
    return;
  }

  if (action === "skip-calibration" || action === "override-calibration") {
    const isSkip = action === "skip-calibration";
    const reason = (isSkip
      ? workbench.ui.calibrationSkipReason
      : workbench.ui.calibrationOverrideReason
    ).trim();
    if (!reason) {
      workbench.ui.validationMessage = isSkip
        ? "请先填写跳过校准原因"
        : "请先填写覆盖校准原因";
      workbench.ui.toast = workbench.ui.validationMessage;
      render(workbench);
      return;
    }
    await runAction(
      workbench,
      isSkip ? "正在跳过校准..." : "正在覆盖校准...",
      async () => {
        workbench.ui.validationMessage = "";
        if (isSkip) {
          await workbench.api.skipCalibration({ reason });
        } else {
          await workbench.api.overrideCalibration({ reason });
        }
      },
    );
    return;
  }

  if (action === "create-project") {
    const name = getInputValue(workbench.root, "#project-create-name-input", "").trim();
    const aspectRatio = getCheckedValue(workbench.root, "input[name=\"project-aspect-ratio\"]", "");
    const projectType = getCheckedValue(workbench.root, "input[name=\"project-type\"]", "anime");
    if (!name || !aspectRatio) {
      const message = "请填写项目名称和画面比例";
      workbench.ui.createProjectNotice = message;
      workbench.ui.toast = message;
      render(workbench);
      return;
    }
    if (!projectType) {
      const message = "请选择剧目类型";
      workbench.ui.createProjectNotice = message;
      workbench.ui.toast = message;
      render(workbench);
      return;
    }

    await runAction(workbench, statusForAction(action), async () => {
      await workbench.api.createProject(buildProjectCreateRequest({
        name,
        aspectRatio,
        projectType,
      }));
      workbench.ui.projectLibraryPage = 1;
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
    });
    return;
  }

  await runAction(workbench, statusForAction(action), async () => {
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
    const result = await workbench.api.runCalibration();
    workbench.ui.lastCalibrationResult = result;
    return;
  }

  if (action === "generate-images") {
    workbench.ui.imageGenerationResult = await workbench.api.generateImages();
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
      workbench.ui.videoGenerationResult = await workbench.api.generateVideos();
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
      workbench.ui.exportPreviewResult = await workbench.api.previewExport();
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
    workbench.ui.lastCalibrationResult = await workbench.api.runCalibration();
  }
  if (workbench.state.shots.some((shot) => !shot.currentImageAssetVersionId)) {
    workbench.ui.imageGenerationResult = await workbench.api.generateImages();
  }
  const afterImages = await workbench.api.getCreatorState();
  if (afterImages.shots.some((shot) => !shot.currentImageAssetVersionId)) {
    throw new Error("image_assets_missing");
  }
  if (afterImages.shots.some((shot) => !shot.currentVideoAssetVersionId)) {
    workbench.ui.videoGenerationResult = await workbench.api.generateVideos();
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

function updateOriginalScriptSubmitState(workbench) {
  const draft = workbench.ui.originalScriptDraft;
  const submit = workbench.root.querySelector('[data-action="submit-original-script-settings"]');
  if (!submit) {
    return;
  }

  submit.disabled = !(
    draft.fileName?.trim() &&
    draft.inspiration?.trim() &&
    draft.episodeCount
  );
}

function deriveInitialNavTab(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (!token) {
    return "project";
  }
  if (token === "home") {
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

async function syncProjectLibraryFromApi(workbench) {
  const payload = await workbench.api.getProjects();
  const projects = Array.isArray(payload.projects)
    ? payload.projects.map((project) => mapProjectRecordToCard(project))
    : [];
  workbench.ui.projectLibrary = projects;
  syncSelectedProjectCard(workbench, projects);
}

function syncSelectedProjectCard(workbench, projects) {
  const selectedProjectId = workbench.ui.selectedProjectCardId;
  if (selectedProjectId && projects.some((project) => project.id === selectedProjectId)) {
    return;
  }

  const activeProjectId = workbench.state?.project?.id ?? null;
  if (activeProjectId && projects.some((project) => project.id === activeProjectId)) {
    workbench.ui.selectedProjectCardId = activeProjectId;
    return;
  }

  workbench.ui.selectedProjectCardId = projects[0]?.id ?? null;
}

function mapProjectRecordToCard(project) {
  const createdAtValue = project.createdAt ? new Date(project.createdAt) : new Date();
  const createdAtTimestamp = Number.isFinite(createdAtValue.getTime())
    ? createdAtValue.getTime()
    : Date.now();

  return {
    id: project.id,
    name: project.name ?? "未命名项目",
    aspectRatio: project.aspectRatio ?? "9:16",
    projectType: inferProjectType(project),
    status: phaseToProjectStatus(project.phase),
    coverImageUrl: project.coverImageUrl ?? "",
    createdAtTimestamp,
    createdAt: formatProjectDate(createdAtValue),
  };
}

function phaseToProjectStatus(phase) {
  if (phase === "export") {
    return "一稿交付";
  }
  if (phase === "shot_generation" || phase === "asset_review") {
    return "制作中";
  }
  return "未开始";
}

function projectStatusToPhase(status) {
  if (status === "一稿交付" || status === "完结") {
    return "export";
  }
  if (status === "制作中") {
    return "shot_generation";
  }
  return "script_input";
}

function inferProjectType(project) {
  const name = String(project.name ?? "").toLocaleLowerCase();
  if (name.includes("live") || name.includes("真人")) {
    return "domestic-live";
  }
  return "anime";
}

function formatProjectDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("cover_read_failed"));
    reader.readAsDataURL(file);
  });
}
