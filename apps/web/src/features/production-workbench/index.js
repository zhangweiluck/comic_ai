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
    uploadTasks: new Map(),
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
      projectDetail: null,
      assetImportModal: null,
      assetImportModalTab: "local",
      assetImportCategory: "domestic-modern-city",
      assetImportDrafts: [],
      assetImportSelection: [],
      assetCardMenuId: null,
      importedAssets: {
        character: [],
        scene: [],
        prop: [],
        other: {
          image: [],
          video: [],
        },
      },
      assetGeneratorModal: null,
      assetGeneratorMode: "generate",
      assetGeneratorEditingAsset: null,
      assetGeneratorName: "银面骑士2(1)",
      assetGeneratorPrompt: "",
      assetGeneratorCharacterType: "human",
      assetGeneratorStyleValue: "无风格, 末世玄幻",
      assetGeneratorStyleCategory: "official",
      assetGeneratorStyleOption: "none",
      assetGeneratorMaterialCategory: "official",
      assetGeneratorMaterialOption: "fantasy-doomsday",
      assetGeneratorImageType: "main",
      assetGeneratorModel: "即梦4.0",
      assetGeneratorResolution: "2K",
      assetGeneratorCount: 1,
      renameImportedAsset: null,
      renameImportedAssetName: "",
      renameImportedAssetNotice: "",
      deleteImportedAsset: null,
      customEpisodes: [],
      selectedEpisodeId: null,
      episodeStoryboardMap: {},
      episodeMediaMode: "image",
      videoGenerationMode: "first-frame",
      imageGenerationMode: "single-image",
      isSingleEpisodeModalOpen: false,
      singleEpisodeName: "",
      singleEpisodeNotice: "",
      renameProjectId: null,
      renameProjectName: "",
      renameProjectNotice: "",
      deleteProjectId: null,
      selectedProjectCardId: null,
      isScriptModalOpen: false,
      scriptTab: "script-upload",
      scriptSubmitAction: "create-project",
      scriptSubmitLabel: "确认上传",
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
      isStoryboardDescriptionModalOpen: false,
      storyboardDescriptionDraft: "",
      episodeCardMenuId: null,
      activeNavTab: deriveInitialNavTab(window.location.hash),
      projectPanelMode: deriveInitialProjectPanelMode(window.location.hash),
      libraryTeamRoute: deriveInitialLibraryTeamRoute(window.location.hash),
      libraryTeamAssetScope: "personal",
      isLibraryPricingModalOpen: false,
      isMemberRulesModalOpen: false,
    },
  };

  root.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      if (workbench.ui.assetCardMenuId || workbench.ui.episodeCardMenuId || workbench.ui.projectCardMenuId) {
        workbench.ui.assetCardMenuId = null;
        workbench.ui.episodeCardMenuId = null;
        workbench.ui.projectCardMenuId = null;
        render(workbench);
      }
      return;
    }
    if (
      actionTarget.matches?.('input[data-action="upload-project-cover"]') ||
      actionTarget.matches?.(".asset-import-file-input")
    ) {
      return;
    }
    void handleAction(workbench, actionTarget);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (
      !workbench.ui.assetCardMenuId &&
      !workbench.ui.episodeCardMenuId &&
      !workbench.ui.projectCardMenuId &&
      !workbench.ui.isLibraryPricingModalOpen &&
      !workbench.ui.isMemberRulesModalOpen
    ) {
      return;
    }
    workbench.ui.assetCardMenuId = null;
    workbench.ui.episodeCardMenuId = null;
    workbench.ui.projectCardMenuId = null;
    workbench.ui.isLibraryPricingModalOpen = false;
    workbench.ui.isMemberRulesModalOpen = false;
    render(workbench);
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

    if (target?.matches?.(".asset-import-file-input")) {
      const files = [...(target.files ?? [])];
      target.value = "";
      if (!files.length) {
        return;
      }
      await handleAssetImportFiles(workbench, files);
      return;
    }

    if (target?.matches?.(".local-video-upload-input")) {
      const files = [...(target.files ?? [])];
      const storyboardId = target.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? null;
      target.value = "";
      if (!files.length || !storyboardId) {
        return;
      }
      await handleLocalStoryboardVideoFiles(workbench, storyboardId, files);
    }
  });

  root.addEventListener("dragover", (event) => {
    const zone = event.target?.closest?.('[data-dropzone="asset-import"]');
    if (!zone) {
      return;
    }
    event.preventDefault();
    zone.classList.add("is-dragging");
  });

  root.addEventListener("dragleave", (event) => {
    const zone = event.target?.closest?.('[data-dropzone="asset-import"]');
    if (!zone) {
      return;
    }
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && zone.contains(nextTarget)) {
      return;
    }
    zone.classList.remove("is-dragging");
  });

  root.addEventListener("drop", async (event) => {
    const zone = event.target?.closest?.('[data-dropzone="asset-import"]');
    if (!zone) {
      return;
    }
    event.preventDefault();
    zone.classList.remove("is-dragging");
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) {
      return;
    }
    await handleAssetImportFiles(workbench, files);
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
        counter.textContent = `${[...target.value].length}`;
      }
      const notice = workbench.root.querySelector(".rename-project-actions .modal-inline-status");
      if (notice) {
        notice.textContent = "";
      }
      return;
    }

    if (target?.matches?.("#single-episode-name-input")) {
      workbench.ui.singleEpisodeName = target.value;
      if (workbench.ui.singleEpisodeNotice) {
        workbench.ui.singleEpisodeNotice = "";
      }
      const counter = workbench.root.querySelector(".single-episode-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      const notice = workbench.root.querySelector(".single-episode-actions .modal-inline-status");
      if (notice) {
        notice.textContent = "";
      }
      return;
    }

    if (target?.matches?.(".asset-import-name-input")) {
      const draftId = target.dataset.draftId ?? null;
      workbench.ui.assetImportDrafts = (workbench.ui.assetImportDrafts ?? []).map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              name: target.value,
            }
          : draft,
      );
      return;
    }

    if (target?.matches?.("#asset-generator-name-input")) {
      workbench.ui.assetGeneratorName = target.value;
      const counter = workbench.root.querySelector(".asset-generator-name-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      return;
    }

    if (target?.matches?.("#asset-generator-prompt-input")) {
      workbench.ui.assetGeneratorPrompt = target.value;
      const counter = workbench.root.querySelector(".asset-generator-prompt-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/460`;
      }
      return;
    }

    if (target?.matches?.("#asset-rename-name-input")) {
      workbench.ui.renameImportedAssetName = target.value;
      workbench.ui.renameImportedAssetNotice = "";
      const counter = workbench.root.querySelector(".rename-project-count.asset-rename-count");
      if (counter) {
        counter.textContent = `${[...target.value].length}/50`;
      }
      return;
    }

    if (target?.matches?.("#storyboard-description-input")) {
      workbench.ui.storyboardDescriptionDraft = target.value;
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
  if (workbench.state?.project?.id) {
    try {
      applyProjectDetail(workbench, await workbench.api.getProjectDetail(workbench.state.project.id));
    } catch (error) {
      if (!String(error instanceof Error ? error.message : error).includes("project_not_found")) {
        throw error;
      }
    }
  }
  await syncProjectLibraryFromApi(workbench);
  workbench.ui.exportHistory = workbench.state.project
    ? await loadExportHistory(workbench)
    : [];
  const nextStoryboards = syncStoryboards(
    workbench.ui.storyboards,
    createStoryboardList(workbench.state),
  );
  workbench.ui.storyboards = nextStoryboards;
  workbench.ui.episodeStoryboardMap = syncEpisodeStoryboardMap(
    workbench.ui.episodeStoryboardMap,
    nextStoryboards,
    workbench.ui.customEpisodes,
  );
  syncSelectedStoryboardId(workbench, getActiveStoryboards(workbench, nextStoryboards));
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
  const activeStoryboards = getActiveStoryboards(workbench);
  const selectedStoryboard = getSelectedStoryboard(
    activeStoryboards,
    workbench.ui.selectedStoryboardId,
  );
  workbench.root.innerHTML = renderProductionWorkbench({
    state: workbench.state,
    session: workbench.session,
    api: workbench.api,
    ui: {
      ...workbench.ui,
      storyboards: activeStoryboards,
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

  if (action === "open-pricing") {
    workbench.ui.isLibraryPricingModalOpen = true;
    render(workbench);
    return;
  }

  if (action === "close-pricing") {
    workbench.ui.isLibraryPricingModalOpen = false;
    render(workbench);
    return;
  }

  if (action === "show-commerce-placeholder") {
    workbench.ui.toast = "支付与兑换码仅为原型占位，暂未接入真实交易。";
    render(workbench);
    return;
  }

  if (action === "show-library-placeholder") {
    workbench.ui.toast =
      target.dataset.placeholderMessage ?? "该功能仍为原型占位，暂未接入真实数据。";
    render(workbench);
    return;
  }

  if (action === "set-library-asset-scope") {
    workbench.ui.activeNavTab = "library";
    workbench.ui.libraryTeamAssetScope = target.dataset.assetScope ?? "personal";
    workbench.ui.isLibraryPricingModalOpen = false;
    workbench.ui.toast = `已切换到 ${libraryAssetScopeLabel(workbench.ui.libraryTeamAssetScope)}。`;
    window.location.hash = "library";
    render(workbench);
    return;
  }

  if (action === "refresh-team") {
    workbench.ui.toast = "团队数据仍为原型视图，真实刷新待团队接口接入。";
    render(workbench);
    return;
  }

  if (action === "open-member-rules") {
    workbench.ui.isMemberRulesModalOpen = true;
    render(workbench);
    return;
  }

  if (action === "close-member-rules") {
    workbench.ui.isMemberRulesModalOpen = false;
    render(workbench);
    return;
  }

  if (action === "open-team-dashboard") {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = "team-dashboard";
    workbench.ui.isLibraryPricingModalOpen = false;
    workbench.ui.isMemberRulesModalOpen = false;
    workbench.ui.toast = "已打开团队数据看板。";
    window.location.hash = "team-dashboard";
    render(workbench);
    return;
  }

  if (action === "back-to-team-page") {
    workbench.ui.activeNavTab = "team";
    workbench.ui.libraryTeamRoute = "team";
    workbench.ui.toast = "已返回团队管理。";
    window.location.hash = "team";
    render(workbench);
    return;
  }

  if (action === "set-nav-tab") {
    workbench.ui.activeNavTab = target.dataset.tab ?? "home";
    workbench.ui.projectPanelMode =
      workbench.ui.activeNavTab === "project" ? "library" : workbench.ui.projectPanelMode;
    if (workbench.ui.activeNavTab === "team") {
      workbench.ui.libraryTeamRoute = "team";
    }
    if (workbench.ui.activeNavTab === "library") {
      workbench.ui.libraryTeamRoute = "assets";
    }
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
    workbench.ui.scriptSubmitAction = "create-project";
    workbench.ui.scriptSubmitLabel = "确认上传";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "close-script-modal") {
    workbench.ui.isScriptModalOpen = false;
    workbench.ui.scriptSubmitAction = "create-project";
    workbench.ui.scriptSubmitLabel = "确认上传";
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

  if (action === "confirm-batch-episode") {
    await runAction(workbench, "正在创建剧集...", async () => {
      await workbench.api.createEpisode({
        projectId: workbench.ui.selectedProjectCardId,
        title: getNextEpisodeTitle(getDetailEpisodes(workbench.state)),
      });
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.isScriptModalOpen = false;
      workbench.ui.scriptSubmitAction = "create-project";
      workbench.ui.scriptSubmitLabel = "确认上传";
      workbench.ui.uploadNotice = "";
      workbench.ui.episodeCardMenuId = null;
    });
    return;
  }

  if (action === "select-storyboard") {
    workbench.ui.selectedStoryboardId = target.dataset.storyboardId ?? null;
    workbench.ui.isStoryboardDescriptionModalOpen = false;
    render(workbench);
    return;
  }

  if (action === "open-storyboard-description-modal") {
    const selectedStoryboard = getSelectedStoryboard(
      getActiveStoryboards(workbench),
      workbench.ui.selectedStoryboardId,
    );
    workbench.ui.isStoryboardDescriptionModalOpen = true;
    workbench.ui.storyboardDescriptionDraft = selectedStoryboard?.description ?? "";
    render(workbench);
    return;
  }

  if (action === "close-storyboard-description-modal") {
    workbench.ui.isStoryboardDescriptionModalOpen = false;
    workbench.ui.storyboardDescriptionDraft = "";
    render(workbench);
    return;
  }

  if (action === "save-storyboard-description") {
    const storyboards = getActiveStoryboards(workbench);
    const selectedStoryboard = getSelectedStoryboard(storyboards, workbench.ui.selectedStoryboardId);
    if (!selectedStoryboard) {
      workbench.ui.isStoryboardDescriptionModalOpen = false;
      workbench.ui.storyboardDescriptionDraft = "";
      render(workbench);
      return;
    }

    const nextDescription =
      workbench.ui.storyboardDescriptionDraft.trim() || "请填写分镜描述，记录分镜对应的画面内容";
    const nextStoryboards = storyboards.map((storyboard) =>
      storyboard.id === selectedStoryboard.id
        ? {
            ...storyboard,
            description: nextDescription,
          }
        : storyboard,
    );
    replaceActiveStoryboards(workbench, nextStoryboards);
    workbench.ui.isStoryboardDescriptionModalOpen = false;
    workbench.ui.storyboardDescriptionDraft = "";
    workbench.ui.toast = `已更新分镜 ${selectedStoryboard.index} 的描述。`;
    render(workbench);
    return;
  }

  if (action === "set-episode-media-mode") {
    workbench.ui.episodeMediaMode = target.dataset.mode ?? "image";
    render(workbench);
    return;
  }

  if (action === "set-video-generation-mode") {
    workbench.ui.episodeMediaMode = "video";
    workbench.ui.videoGenerationMode = target.dataset.mode ?? "first-frame";
    render(workbench);
    return;
  }

  if (action === "set-image-generation-mode") {
    workbench.ui.episodeMediaMode = "image";
    workbench.ui.imageGenerationMode = target.dataset.mode ?? "single-image";
    render(workbench);
    return;
  }

  if (action === "open-project-workspace") {
    const projectId = target.dataset.projectId ?? null;
    workbench.ui.selectedProjectCardId = projectId;
    workbench.ui.selectedEpisodeId = null;
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.projectInteriorSection = target.dataset.section ?? "overview";
    workbench.ui.assetGeneratorModal = null;
    workbench.ui.toast = "正在加载项目详情...";
    window.location.hash = "storyboard-workbench";
    render(workbench);
    try {
      const detail = await workbench.api.selectProject({ projectId });
      applyProjectDetail(workbench, detail);
      const nextStoryboards = syncStoryboards(
        workbench.ui.storyboards,
        createStoryboardList(workbench.state),
      );
      workbench.ui.storyboards = nextStoryboards;
      workbench.ui.episodeStoryboardMap = syncEpisodeStoryboardMap(
        workbench.ui.episodeStoryboardMap,
        nextStoryboards,
        getDetailEpisodes(workbench.state),
      );
      syncSelectedStoryboardId(workbench, getActiveStoryboards(workbench, nextStoryboards));
      await syncProjectLibraryFromApi(workbench);
      workbench.ui.toast = "已进入项目工作台。";
    } catch (error) {
      workbench.ui.projectPanelMode = "library";
      workbench.ui.toast = `加载项目详情失败：${friendlyError(error)}`;
    }
    render(workbench);
    return;
  }

  if (action === "open-episode-workbench") {
    const episodeId = target.dataset.episodeId ?? "episode-primary";
    const storyboards = ensureEpisodeStoryboards(workbench, episodeId);
    workbench.ui.selectedEpisodeId = episodeId;
    workbench.ui.activeNavTab = "project";
    workbench.ui.projectPanelMode = "episode-workbench";
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.projectInteriorStatusMenuOpen = false;
    workbench.ui.episodeCardMenuId = null;
    workbench.ui.selectedStoryboardId = storyboards[0]?.id ?? null;
    workbench.ui.toast = "已进入剧集工作台。";
    window.location.hash = "episode-workbench";
    render(workbench);
    return;
  }

  if (action === "back-to-episode-hub") {
    workbench.ui.selectedEpisodeId = null;
    workbench.ui.projectPanelMode = "workspace";
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.episodeCardMenuId = null;
    workbench.ui.toast = "已返回剧集列表。";
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

  if (action === "__legacy-open-single-episode-flow") {
    openSingleEpisodeFlow(workbench);
    return;
  }

  if (action === "__legacy-open-batch-episode-flow") {
    openBatchEpisodeFlow(workbench);
    return;
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.isScriptModalOpen = true;
    workbench.ui.scriptTab = "script-upload";
    workbench.ui.scriptSubmitAction = "confirm-batch-episode";
    workbench.ui.scriptSubmitLabel = "确认创建";
    workbench.ui.uploadNotice = "";
    render(workbench);
    return;
  }

  if (action === "close-single-episode-modal") {
    workbench.ui.isSingleEpisodeModalOpen = false;
    workbench.ui.singleEpisodeName = "";
    workbench.ui.singleEpisodeNotice = "";
    render(workbench);
    return;
  }

  if (action === "confirm-single-episode") {
    const nextName = workbench.ui.singleEpisodeName.trim();
    if (!nextName) {
      workbench.ui.singleEpisodeNotice = "请输入剧集名称。";
      render(workbench);
      return;
    }
    await runAction(workbench, "正在创建剧集...", async () => {
      await workbench.api.createEpisode({
        projectId: workbench.ui.selectedProjectCardId,
        title: nextName,
      });
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.isSingleEpisodeModalOpen = false;
      workbench.ui.singleEpisodeName = "";
      workbench.ui.singleEpisodeNotice = "";
      workbench.ui.episodeCardMenuId = null;
    });
    return;
  }

  if (action === "open-single-episode-flow") {
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.isScriptModalOpen = true;
    workbench.ui.scriptTab = "storyboard-upload";
    workbench.ui.uploadNotice = "";
    workbench.ui.toast = "已打开分镜单上传。";
    render(workbench);
    return;
  }

  if (action === "open-batch-episode-flow") {
    workbench.ui.projectInteriorSection = "episodes";
    workbench.ui.isScriptModalOpen = true;
    workbench.ui.scriptTab = "script-upload";
    workbench.ui.uploadNotice = "";
    workbench.ui.toast = "已打开剧本上传。";
    render(workbench);
    return;
  }

  if (action === "toggle-episode-card-menu") {
    const episodeId = target.dataset.episodeId ?? null;
    workbench.ui.episodeCardMenuId =
      workbench.ui.episodeCardMenuId === episodeId ? null : episodeId;
    workbench.ui.assetCardMenuId = null;
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
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "set-project-other-asset-media") {
    workbench.ui.projectOtherAssetMediaType = target.dataset.mediaType ?? "video";
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "toggle-asset-card-menu") {
    const assetMenuId = target.dataset.assetMenuId ?? null;
    workbench.ui.assetCardMenuId =
      workbench.ui.assetCardMenuId === assetMenuId ? null : assetMenuId;
    workbench.ui.projectCardMenuId = null;
    workbench.ui.episodeCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "edit-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    workbench.ui.assetGeneratorModal = assetKind;
    workbench.ui.assetGeneratorMode = "edit";
    workbench.ui.assetGeneratorEditingAsset = asset
      ? { ...asset, assetKind, mediaType }
      : null;
    workbench.ui.assetGeneratorName = asset?.name ?? "";
    workbench.ui.assetGeneratorPrompt = "";
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "rename-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    workbench.ui.renameImportedAsset = { assetId, assetKind, mediaType, name: asset?.name ?? "" };
    workbench.ui.renameImportedAssetName = asset?.name ?? "";
    workbench.ui.renameImportedAssetNotice = "";
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-rename-imported-asset-modal") {
    workbench.ui.renameImportedAsset = null;
    workbench.ui.renameImportedAssetName = "";
    workbench.ui.renameImportedAssetNotice = "";
    render(workbench);
    return;
  }

  if (action === "confirm-rename-imported-asset") {
    const draft = workbench.ui.renameImportedAsset;
    const normalizedName = workbench.ui.renameImportedAssetName.trim();
    if (!normalizedName) {
      workbench.ui.renameImportedAssetNotice = "请输入素材名称";
      render(workbench);
      return;
    }
    if (draft) {
      workbench.ui.importedAssets = mapImportedAssets(
        workbench.ui.importedAssets,
        draft.assetKind,
        draft.mediaType,
        (item) => (item.id === draft.assetId ? { ...item, name: normalizedName } : item),
      );
      workbench.ui.toast = `已重命名为 ${normalizedName}`;
    }
    workbench.ui.renameImportedAsset = null;
    workbench.ui.renameImportedAssetName = "";
    workbench.ui.renameImportedAssetNotice = "";
    render(workbench);
    return;
  }

  if (action === "download-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    if (!asset?.preview) {
      workbench.ui.toast = "???????????";
      workbench.ui.assetCardMenuId = null;
      render(workbench);
      return;
    }
    triggerAssetDownload(asset.preview, asset.name, mediaType === "video" ? "mp4" : "png");
    workbench.ui.assetCardMenuId = null;
    workbench.ui.toast = `????? ${asset.name}`;
    render(workbench);
    return;
  }

  if (action === "delete-imported-asset") {
    const assetId = target.dataset.assetId ?? "";
    const assetKind = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    const mediaType = target.dataset.mediaType ?? workbench.ui.projectOtherAssetMediaType ?? "video";
    const asset = findImportedAsset(workbench.ui.importedAssets, assetKind, mediaType, assetId);
    workbench.ui.deleteImportedAsset = { assetId, assetKind, mediaType, name: asset?.name ?? "" };
    workbench.ui.assetCardMenuId = null;
    render(workbench);
    return;
  }

  if (action === "close-delete-imported-asset-modal") {
    workbench.ui.deleteImportedAsset = null;
    render(workbench);
    return;
  }

  if (action === "confirm-delete-imported-asset") {
    const draft = workbench.ui.deleteImportedAsset;
    if (!draft) {
      return;
    }
    const nextAssets = cloneImportedAssets(workbench.ui.importedAssets);
    assignImportedAssets(
      nextAssets,
      draft.assetKind,
      draft.mediaType,
      getImportedAssetBucket(nextAssets, draft.assetKind, draft.mediaType).filter((item) => item.id !== draft.assetId),
    );
    workbench.ui.importedAssets = nextAssets;
    workbench.ui.deleteImportedAsset = null;
    workbench.ui.toast = draft.name ? `已删除 ${draft.name}` : "已删除素材";
    render(workbench);
    return;
  }

  if (action === "open-asset-import-modal") {
    workbench.ui.assetImportModal = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    workbench.ui.assetImportModalTab = "local";
    workbench.ui.assetImportCategory = "domestic-modern-city";
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = [];
    render(workbench);
    return;
  }

  if (action === "close-asset-import-modal") {
    workbench.ui.assetImportModal = null;
    workbench.ui.assetImportDrafts = [];
    workbench.ui.assetImportSelection = [];
    render(workbench);
    return;
  }

  if (action === "switch-asset-import-tab") {
    workbench.ui.assetImportModalTab = target.dataset.tab ?? "local";
    render(workbench);
    return;
  }

  if (action === "select-asset-import-category") {
    workbench.ui.assetImportCategory = target.dataset.category ?? workbench.ui.assetImportCategory;
    render(workbench);
    return;
  }

  if (action === "toggle-asset-import-draft") {
    const draftId = target.dataset.draftId ?? "";
    workbench.ui.assetImportSelection = toggleSelection(
      workbench.ui.assetImportSelection ?? [],
      draftId,
    );
    render(workbench);
    return;
  }

  if (action === "toggle-official-asset-import") {
    const assetId = target.dataset.assetId ?? "";
    workbench.ui.assetImportSelection = toggleSelection(
      workbench.ui.assetImportSelection ?? [],
      assetId,
    );
    render(workbench);
    return;
  }

  if (action === "confirm-asset-import") {
    const assetKind = workbench.ui.assetImportModal ?? workbench.ui.projectAssetTab ?? "character";
    const selectedIds = new Set(workbench.ui.assetImportSelection ?? []);
    const importKind = assetKind === "other" ? workbench.ui.projectOtherAssetMediaType : assetKind;
    const importRecords = [];

    if (workbench.ui.assetImportModalTab === "official") {
      importRecords.push(...getOfficialAssetRecords(assetKind, workbench.ui.assetImportCategory)
        .filter((asset) => selectedIds.has(asset.id))
        .map((asset) => ({
          name: asset.name,
          storageObjectKey: asset.preview,
          mimeType: "image/svg+xml",
          width: 240,
          height: 240,
        })));
    } else {
      importRecords.push(...(workbench.ui.assetImportDrafts ?? [])
        .filter((draft) => selectedIds.has(draft.id))
        .map((draft) => ({
          name: draft.name?.trim() || "未命名资产",
          storageObjectKey: draft.preview,
          mimeType: inferMimeTypeFromDataUrl(draft.preview),
          width: 1024,
          height: 1024,
        })));
    }

    if (!importRecords.length) {
      workbench.ui.toast = "请选择要导入的素材。";
      render(workbench);
      return;
    }

    await runAction(workbench, "正在导入资产...", async () => {
      for (const record of importRecords) {
        await workbench.api.importAsset({
          kind: importKind,
          ...record,
        });
      }
      if (workbench.ui.selectedProjectCardId) {
        applyProjectDetail(
          workbench,
          await workbench.api.getProjectDetail(workbench.ui.selectedProjectCardId),
        );
      }
      workbench.ui.assetImportModal = null;
      workbench.ui.assetImportDrafts = [];
      workbench.ui.assetImportSelection = [];
    });
    render(workbench);
    return;
  }

  if (action === "open-asset-generator-modal") {
    workbench.ui.assetGeneratorModal = target.dataset.assetKind ?? workbench.ui.projectAssetTab ?? "character";
    workbench.ui.assetGeneratorMode = "generate";
    workbench.ui.assetGeneratorEditingAsset = null;
    workbench.ui.assetGeneratorCharacterType = "human";
    workbench.ui.assetGeneratorStyleValue = "无风格, 末世玄幻";
    workbench.ui.assetGeneratorStyleCategory = "official";
    workbench.ui.assetGeneratorStyleOption = "none";
    workbench.ui.assetGeneratorMaterialCategory = "official";
    workbench.ui.assetGeneratorMaterialOption = "fantasy-doomsday";
    workbench.ui.assetGeneratorImageType = "main";
    workbench.ui.assetGeneratorModel = "即梦4.0";
    workbench.ui.assetGeneratorResolution = "2K";
    workbench.ui.assetGeneratorCount = 1;
    render(workbench);
    return;
  }

  if (action === "close-asset-generator-modal") {
    workbench.ui.assetGeneratorModal = null;
    workbench.ui.assetGeneratorMode = "generate";
    workbench.ui.assetGeneratorEditingAsset = null;
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
    workbench.ui.assetCardMenuId = null;
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

  if (action === "pick-asset-import-files") {
    target.querySelector(".asset-import-file-input")?.click();
    return;
  }

  if (action === "pick-local-video-upload") {
    const storyboardId = target.dataset.storyboardId ?? workbench.ui.selectedStoryboardId ?? "";
    workbench.root
      .querySelector(`.local-video-upload-input[data-storyboard-id="${storyboardId}"]`)
      ?.click();
    return;
  }

  if (action === "cancel-local-video-upload") {
    cancelStoryboardVideoUpload(workbench, target.dataset.videoId ?? "");
    render(workbench);
    return;
  }

  if (action === "select-uploaded-video") {
    const videoId = target.dataset.videoId ?? "";
    if (!videoId) {
      return;
    }
    selectStoryboardUploadedVideo(workbench, videoId);
    render(workbench);
    return;
  }

  if (action === "clear-selected-uploaded-video") {
    clearStoryboardUploadedVideoSelection(workbench);
    render(workbench);
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
      workbench.ui.renameProjectNotice = "请输入项目名称。";
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
    const episodeId =
      workbench.ui.projectPanelMode === "episode-workbench"
        ? workbench.ui.selectedEpisodeId ?? "episode-primary"
        : "episode-primary";
    const nextStoryboards = addStoryboard(getEpisodeStoryboards(workbench, episodeId));
    workbench.ui.storyboards =
      episodeId === "episode-primary" ? nextStoryboards : workbench.ui.storyboards;
    workbench.ui.episodeStoryboardMap = {
      ...workbench.ui.episodeStoryboardMap,
      [episodeId]: nextStoryboards,
    };
    workbench.ui.selectedStoryboardId = nextStoryboards.at(-1)?.id ?? null;
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
        ? "璇峰厛濉啓璺宠繃鏍″噯鍘熷洜"
        : "璇峰厛濉啓瑕嗙洊鏍″噯鍘熷洜";
      workbench.ui.toast = workbench.ui.validationMessage;
      render(workbench);
      return;
    }
    await runAction(
      workbench,
      isSkip ? "姝ｅ湪璺宠繃鏍″噯..." : "姝ｅ湪瑕嗙洊鏍″噯...",
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

  await runAction(workbench, statusForAction(action), async () => {
    if (action === "create-project") {
      const name = getInputValue(workbench.root, "#project-create-name-input", "").trim();
      if (!name) {
        workbench.ui.createProjectNotice = "请先填写项目名称";
        render(workbench);
        return;
      }

      const aspectRatio = getCheckedValue(workbench.root, "input[name=\"project-aspect-ratio\"]", "9:16");
      const projectType = getCheckedValue(workbench.root, "input[name=\"project-type\"]", "anime");
      if (!aspectRatio) {
        workbench.ui.createProjectNotice = "璇烽€夋嫨鐢婚潰姣斾緥";
        render(workbench);
        return;
      }
      if (!projectType) {
        workbench.ui.createProjectNotice = "璇烽€夋嫨鍓х洰绫诲瀷";
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

function openSingleEpisodeFlow(workbench) {
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.isSingleEpisodeModalOpen = true;
  workbench.ui.isScriptModalOpen = false;
  workbench.ui.singleEpisodeName = "";
  workbench.ui.singleEpisodeNotice = "";
  workbench.ui.uploadNotice = "";
  render(workbench);
}

function openBatchEpisodeFlow(workbench) {
  workbench.ui.projectInteriorSection = "episodes";
  workbench.ui.isSingleEpisodeModalOpen = false;
  workbench.ui.isScriptModalOpen = true;
  workbench.ui.scriptTab = "script-upload";
  workbench.ui.scriptSubmitAction = "confirm-batch-episode";
  workbench.ui.scriptSubmitLabel = "纭鍒涘缓";
  workbench.ui.singleEpisodeNotice = "";
  workbench.ui.uploadNotice = "";
  render(workbench);
}

function hasFirstFrame(workbench) {
  const selectedStoryboard = getSelectedStoryboard(
    getActiveStoryboards(workbench),
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
    const synced = nextByShotId.get(storyboard.linkedShotId);
    if (!synced) {
      return storyboard;
    }
    return {
      ...storyboard,
      ...synced,
      uploadedVideos: storyboard.uploadedVideos ?? [],
      selectedUploadedVideoId: storyboard.selectedUploadedVideoId ?? null,
    };
  });
}

function syncEpisodeStoryboardMap(currentMap, primaryStoryboards, customEpisodes = []) {
  const nextMap = {
    ...(currentMap ?? {}),
    "episode-primary": primaryStoryboards,
  };

  for (const episode of customEpisodes) {
    if (!Array.isArray(nextMap[episode.id]) || nextMap[episode.id].length === 0) {
      nextMap[episode.id] = addStoryboard([]);
    }
  }

  return nextMap;
}

function getActiveStoryboards(workbench, primaryStoryboards = workbench.ui.storyboards) {
  if (workbench.ui.projectPanelMode !== "episode-workbench") {
    return primaryStoryboards;
  }

  return getEpisodeStoryboards(workbench, workbench.ui.selectedEpisodeId, primaryStoryboards);
}

function getEpisodeStoryboards(
  workbench,
  episodeId = workbench.ui.selectedEpisodeId,
  primaryStoryboards = workbench.ui.storyboards,
) {
  if (!episodeId || episodeId === "episode-primary") {
    return primaryStoryboards;
  }

  return workbench.ui.episodeStoryboardMap?.[episodeId] ?? [];
}

function ensureEpisodeStoryboards(workbench, episodeId) {
  const existing = getEpisodeStoryboards(workbench, episodeId);
  if (Array.isArray(existing) && existing.length > 0) {
    return existing;
  }

  const seeded = addStoryboard([]);
  workbench.ui.episodeStoryboardMap = {
    ...workbench.ui.episodeStoryboardMap,
    [episodeId]: seeded,
  };
  return seeded;
}

function replaceActiveStoryboards(workbench, nextStoryboards) {
  if (workbench.ui.projectPanelMode !== "episode-workbench") {
    workbench.ui.storyboards = nextStoryboards;
    return;
  }

  const episodeId = workbench.ui.selectedEpisodeId;
  if (!episodeId || episodeId === "episode-primary") {
    workbench.ui.storyboards = nextStoryboards;
    return;
  }

  workbench.ui.episodeStoryboardMap = {
    ...workbench.ui.episodeStoryboardMap,
    [episodeId]: nextStoryboards,
  };
}

function syncSelectedStoryboardId(workbench, storyboards) {
  if (!workbench.ui.selectedStoryboardId && storyboards.length > 0) {
    workbench.ui.selectedStoryboardId = storyboards[0].id;
    return;
  }

  if (
    workbench.ui.selectedStoryboardId &&
    !storyboards.some((storyboard) => storyboard.id === workbench.ui.selectedStoryboardId)
  ) {
    workbench.ui.selectedStoryboardId = storyboards[0]?.id ?? null;
  }
}

async function handleAssetImportFiles(workbench, files) {
  const assetKind = workbench.ui.assetImportModal ?? workbench.ui.projectAssetTab ?? "character";
  const existingDrafts = workbench.ui.assetImportDrafts ?? [];
  const slotsLeft = Math.max(20 - existingDrafts.length, 0);
  const acceptedFiles = files.slice(0, slotsLeft);

  if (!acceptedFiles.length) {
    workbench.ui.toast = "本地导入最多支持 20 个素材。";
    render(workbench);
    return;
  }

  const nextDrafts = await Promise.all(
    acceptedFiles.map((file, index) =>
      buildAssetImportDraftFromFile(assetKind, existingDrafts.length + index, file),
    ),
  );

  workbench.ui.assetImportDrafts = [...existingDrafts, ...nextDrafts];
  workbench.ui.assetImportSelection = createAssetSelectionList([
    ...(workbench.ui.assetImportSelection ?? []),
    ...nextDrafts.map((draft) => draft.id),
  ]);
  workbench.ui.toast =
    files.length > acceptedFiles.length
      ? `已导入 ${acceptedFiles.length} 个素材，超出部分未加入。`
      : `已加入 ${acceptedFiles.length} 个待导入素材。`;
  render(workbench);
}

async function handleLocalStoryboardVideoFiles(workbench, storyboardId, files) {
  const acceptedFiles = files.filter((file) => String(file.type || "").startsWith("video/"));
  if (!acceptedFiles.length) {
    workbench.ui.toast = "请选择可上传的视频文件。";
    render(workbench);
    return;
  }

  for (const file of acceptedFiles) {
    await startStoryboardVideoUpload(workbench, storyboardId, file);
  }

  workbench.ui.toast = `已加入 ${acceptedFiles.length} 个本地视频上传任务。`;
  render(workbench);
}

async function startStoryboardVideoUpload(workbench, storyboardId, file) {
  const videoId = `local-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const src = URL.createObjectURL(file);
  const draft = {
    id: videoId,
    fileName: file.name,
    src,
    progress: 100,
    status: "ready",
    durationLabel: "00:10",
    createdAt: Date.now(),
  };

  updateStoryboardById(workbench, storyboardId, (storyboard) => {
    const uploadedVideos = [...(storyboard.uploadedVideos ?? []), draft];
    const selectedUploadedVideoId = storyboard.selectedUploadedVideoId ?? videoId;
    const selectedVideo = uploadedVideos.find((video) => video.id === selectedUploadedVideoId) ?? draft;
    return {
      ...storyboard,
      uploadedVideos,
      selectedUploadedVideoId,
      videoStatus: "ready",
      previewVideo: selectedVideo.src,
      previewUrl: selectedVideo.src,
    };
  });

  hydrateVideoDurationLabel(workbench, storyboardId, videoId, src);
}

function cancelStoryboardVideoUpload(workbench, videoId) {
  if (!videoId) {
    return;
  }

  const task = workbench.uploadTasks.get(videoId);
  if (task) {
    window.clearInterval(task.intervalId);
    if (task.src) {
      URL.revokeObjectURL(task.src);
    }
    workbench.uploadTasks.delete(videoId);
  }

  updateStoryboards(workbench, (storyboard) => {
    const uploadedVideos = (storyboard.uploadedVideos ?? []).filter((video) => video.id !== videoId);
    if (uploadedVideos.length === (storyboard.uploadedVideos ?? []).length) {
      return storyboard;
    }
    return {
      ...storyboard,
      uploadedVideos,
      selectedUploadedVideoId:
        storyboard.selectedUploadedVideoId === videoId
          ? uploadedVideos.find((video) => video.status === "ready")?.id ?? uploadedVideos[0]?.id ?? null
          : storyboard.selectedUploadedVideoId,
      videoStatus: uploadedVideos.some((video) => video.status === "ready") ? "ready" : "empty",
      previewVideo:
        storyboard.selectedUploadedVideoId === videoId
          ? uploadedVideos.find((video) => video.status === "ready")?.src ?? uploadedVideos[0]?.src ?? null
          : storyboard.previewVideo,
      previewUrl:
        storyboard.selectedUploadedVideoId === videoId
          ? uploadedVideos.find((video) => video.status === "ready")?.src ?? uploadedVideos[0]?.src ?? null
          : storyboard.previewUrl,
    };
  });
}

function selectStoryboardUploadedVideo(workbench, videoId) {
  updateStoryboards(workbench, (storyboard) => {
    const selectedVideo = (storyboard.uploadedVideos ?? []).find((video) => video.id === videoId);
    if (!selectedVideo) {
      return storyboard;
    }
    return {
      ...storyboard,
      selectedUploadedVideoId: videoId,
      previewVideo: selectedVideo.src,
      previewUrl: selectedVideo.src,
    };
  });
}

function clearStoryboardUploadedVideoSelection(workbench) {
  const storyboardId = getSelectedStoryboard(
    getActiveStoryboards(workbench),
    workbench.ui.selectedStoryboardId,
  )?.id;
  updateStoryboards(workbench, (storyboard) => {
    if (storyboard.id !== storyboardId) {
      return storyboard;
    }
    if (!storyboard.selectedUploadedVideoId) {
      return storyboard;
    }
    return {
      ...storyboard,
      selectedUploadedVideoId: null,
      previewVideo: null,
      previewUrl: null,
    };
  });
}

function updateStoryboardById(workbench, storyboardId, updater) {
  updateStoryboards(workbench, (storyboard) =>
    storyboard.id === storyboardId ? updater(storyboard) : storyboard,
  );
}

function updateStoryboardVideoById(workbench, storyboardId, videoId, updater) {
  updateStoryboardById(workbench, storyboardId, (storyboard) => ({
    ...storyboard,
    uploadedVideos: (storyboard.uploadedVideos ?? []).map((video) =>
      video.id === videoId ? updater(video) : video,
    ),
    selectedUploadedVideoId: storyboard.selectedUploadedVideoId ?? videoId,
  }));
}

function updateStoryboards(workbench, updater) {
  workbench.ui.storyboards = (workbench.ui.storyboards ?? []).map(updater);
  workbench.ui.episodeStoryboardMap = Object.fromEntries(
    Object.entries(workbench.ui.episodeStoryboardMap ?? {}).map(([episodeId, storyboards]) => [
      episodeId,
      Array.isArray(storyboards) ? storyboards.map(updater) : storyboards,
    ]),
  );
}

function hydrateVideoDurationLabel(workbench, storyboardId, videoId, src) {
  const probe = document.createElement("video");
  probe.preload = "metadata";
  probe.src = src;
  probe.muted = true;
  probe.onloadedmetadata = () => {
    updateStoryboardVideoById(workbench, storyboardId, videoId, (video) => ({
      ...video,
      durationLabel: formatDurationLabel(probe.duration),
    }));
    render(workbench);
  };
}

function formatDurationLabel(value) {
  const safeSeconds = Math.max(0, Math.round(Number.isFinite(value) ? value : 10));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function buildAssetImportDraft(assetKind, index) {
  const createdAt = Date.now() + index;
  const labelMap = {
    character: "银面骑士",
    scene: "现代都市",
    prop: "骑士长剑",
    other: "Seedance 2.0 主体",
  };
  const previewMap = {
    character:
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' rx='24' fill='%23282636'/%3E%3Crect x='56' y='24' width='44' height='188' rx='20' fill='%23f2f4fa'/%3E%3Crect x='118' y='28' width='56' height='180' rx='24' fill='%23d8dce7'/%3E%3Ccircle cx='150' cy='56' r='22' fill='%23171920'/%3E%3Crect x='126' y='80' width='50' height='64' rx='18' fill='%2322262f'/%3E%3Crect x='58' y='40' width='36' height='44' rx='18' fill='%23181b23'/%3E%3C/svg%3E",
    scene:
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' rx='24' fill='%23181922'/%3E%3Crect x='0' y='110' width='240' height='130' fill='%23222531'/%3E%3Cpath d='M0 120 72 58l44 36 26-18 38 28 60-52v188H0Z' fill='%2344495d'/%3E%3Ccircle cx='170' cy='64' r='18' fill='%23d5d8ef'/%3E%3C/svg%3E",
    prop:
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' rx='24' fill='%23efeff2'/%3E%3Cpath d='m40 156 54-64 64-22 40 22-20 60-56 44Z' fill='%23191b22'/%3E%3Cpath d='m58 150 44-50 52-18 30 16-14 42-48 36Z' fill='none' stroke='%23ff4f4f' stroke-width='8' stroke-linecap='round'/%3E%3C/svg%3E",
    other:
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' rx='24' fill='%23191922'/%3E%3Crect x='32' y='44' width='176' height='124' rx='18' fill='%232d3141'/%3E%3Cpolygon points='98,88 160,120 98,152' fill='%23ffffff'/%3E%3C/svg%3E",
  };

  return {
    id: `asset-draft-${assetKind}-${createdAt}`,
    name: labelMap[assetKind] ?? "新资产",
    preview: previewMap[assetKind] ?? previewMap.character,
    description: "",
    createdAt,
  };
}

async function buildAssetImportDraftFromFile(assetKind, index, file) {
  const createdAt = Date.now() + index;
  return {
    id: `asset-draft-${assetKind}-${createdAt}`,
    name: normalizeAssetImportName(file.name),
    preview: await readFileAsDataUrl(file),
    description: "",
    createdAt,
    fileName: file.name,
  };
}

function normalizeAssetImportName(fileName) {
  const rawName = String(fileName ?? "").replace(/\.[^.]+$/, "").trim();
  return rawName || "未命名资产";
}
function toggleSelection(current, value) {
  const selection = new Set(current);
  if (selection.has(value)) {
    selection.delete(value);
  } else {
    selection.add(value);
  }
  return createAssetSelectionList([...selection]);
}

function createAssetSelectionList(values) {
  return [...new Set(values)].filter(Boolean);
}

function findImportedAsset(importedAssets, assetKind, mediaType, assetId) {
  return getImportedAssetBucket(importedAssets, assetKind, mediaType).find((item) => item.id === assetId) ?? null;
}

function cloneImportedAssets(importedAssets) {
  return {
    character: [...(importedAssets?.character ?? [])],
    scene: [...(importedAssets?.scene ?? [])],
    prop: [...(importedAssets?.prop ?? [])],
    other: {
      image: [...(importedAssets?.other?.image ?? [])],
      video: [...(importedAssets?.other?.video ?? [])],
    },
  };
}

function getImportedAssetBucket(importedAssets, assetKind, otherMediaType = "video") {
  if (assetKind === "other") {
    return importedAssets?.other?.[otherMediaType] ?? [];
  }
  return importedAssets?.[assetKind] ?? [];
}

function assignImportedAssets(importedAssets, assetKind, otherMediaType, items) {
  if (assetKind === "other") {
    importedAssets.other[otherMediaType] = items;
    return;
  }
  importedAssets[assetKind] = items;
}

function mapImportedAssets(importedAssets, assetKind, otherMediaType, mapper) {
  const nextAssets = cloneImportedAssets(importedAssets);
  assignImportedAssets(
    nextAssets,
    assetKind,
    otherMediaType,
    getImportedAssetBucket(nextAssets, assetKind, otherMediaType).map(mapper),
  );
  return nextAssets;
}

function triggerAssetDownload(url, fileName, extension) {
  const link = document.createElement("a");
  const safeName = String(fileName ?? "asset").trim() || "asset";
  link.href = url;
  link.download = `${safeName}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function createImportedAssetFromDraft(assetKind, draft) {
  return {
    id: `imported-${draft.id}`,
    name: draft.name?.trim() || "未命名资产",
    preview: draft.preview,
    kind: assetKind,
    source: "local",
  };
}

function createImportedAssetFromRecord(assetKind, asset) {
  return {
    id: `imported-${asset.id}`,
    name: asset.name,
    preview: asset.preview,
    description: asset.description ?? "",
    kind: assetKind,
    source: "official",
  };
}

function getOfficialAssetRecords(assetKind, category = "domestic-modern-city") {
  const assetCatalog = {
    character: [
      { id: "official-character-1", name: "银面骑士", preview: buildColorAssetPreview("#f2f3f8", "#11161f") },
      { id: "official-character-2", name: "王蛇", preview: buildColorAssetPreview("#efe5d8", "#26262e") },
      { id: "official-character-3", name: "医师", preview: buildColorAssetPreview("#dde5f2", "#49526a") },
      { id: "official-character-4", name: "前台", preview: buildColorAssetPreview("#f3f2f7", "#6a617f") },
    ],
    scene: [
      { id: "official-scene-1", name: "现代都市", preview: buildScenePreview("#263141", "#5a6d93") },
      { id: "official-scene-2", name: "办公区", preview: buildScenePreview("#2c3038", "#858ca0") },
      { id: "official-scene-3", name: "会客厅", preview: buildScenePreview("#2f2a28", "#8f7358") },
      { id: "official-scene-4", name: "天台夜景", preview: buildScenePreview("#161c30", "#4b76bf") },
    ],
    prop: [
      { id: "official-prop-1", name: "骑士长剑", preview: buildPropPreview("#f0f1f4", "#1a1d24") },
      { id: "official-prop-2", name: "银色短刀", preview: buildPropPreview("#eff1f6", "#6a7480") },
      { id: "official-prop-3", name: "识别终端", preview: buildPropPreview("#1d2431", "#68bbff") },
      { id: "official-prop-4", name: "数据芯片", preview: buildPropPreview("#17191f", "#8e5bff") },
    ],
    other: [
      { id: `official-other-${category}-1`, name: "Seedance 2.0 主体", preview: buildVideoPreview("#242635", "#ffffff") },
      { id: `official-other-${category}-2`, name: "视频素材片段", preview: buildVideoPreview("#202433", "#d8dff5") },
      { id: `official-other-${category}-3`, name: "参考图像", preview: buildColorAssetPreview("#f6f6f9", "#35384a") },
      { id: `official-other-${category}-4`, name: "环境素材", preview: buildScenePreview("#27303f", "#64758d") },
    ],
  };

  return assetCatalog[assetKind] ?? assetCatalog.character;
}
function buildColorAssetPreview(background, accent) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="24" fill="${background}"/>
      <circle cx="118" cy="58" r="24" fill="${accent}"/>
      <rect x="88" y="86" width="60" height="88" rx="24" fill="${accent}"/>
      <rect x="56" y="90" width="28" height="78" rx="14" fill="${accent}" opacity="0.88"/>
      <rect x="154" y="90" width="28" height="78" rx="14" fill="${accent}" opacity="0.88"/>
    </svg>
  `)}`;
}

function buildScenePreview(top, bottom) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="24" fill="${top}"/>
      <rect y="110" width="240" height="130" fill="${bottom}"/>
      <path d="M0 132 58 82l40 22 34-14 40 34 68-52v168H0Z" fill="rgba(255,255,255,0.18)"/>
    </svg>
  `)}`;
}

function buildPropPreview(background, accent) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="24" fill="${background}"/>
      <path d="m38 156 62-72 66-20 36 28-20 56-50 42Z" fill="${accent}"/>
      <path d="m54 148 42-46 58-20 26 20-12 28-42 30Z" fill="none" stroke="rgba(255,80,80,0.85)" stroke-width="7" stroke-linecap="round"/>
    </svg>
  `)}`;
}

function buildVideoPreview(background, accent) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="24" fill="${background}"/>
      <rect x="30" y="44" width="180" height="124" rx="18" fill="rgba(255,255,255,0.08)"/>
      <polygon points="102,86 158,118 102,150" fill="${accent}"/>
    </svg>
  `)}`;
}

function buildCustomEpisode(title) {
  const createdAtMs = Date.now();
  return {
    id: `episode-${createdAtMs}`,
    title,
    status: "未定稿",
    createdAt: formatEpisodeDate(createdAtMs),
    createdAtMs,
    storyboardCount: 0,
  };
}

function createEpisodeEntryList(episodes) {
  return [...episodes].sort(
    (left, right) => getEpisodeTimestamp(right) - getEpisodeTimestamp(left),
  );
}

function getEpisodeTimestamp(episode) {
  if (typeof episode?.createdAtMs === "number" && Number.isFinite(episode.createdAtMs)) {
    return episode.createdAtMs;
  }
  const parsed = Date.parse(String(episode?.createdAt ?? "").replace(/\./g, "/"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNextEpisodeTitle(episodes) {
  const nextIndex = (Array.isArray(episodes) ? episodes.length : 0) + 1;
  return nextIndex === 1 ? "剧一" : `剧集 ${nextIndex}`;
}

function formatEpisodeDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function statusForAction(action) {
  return (
    {
      "create-project": "正在创建项目...",
      "parse-script": "正在拆解剧本...",
      "confirm-all-assets": "正在确认全部资产...",
      "confirm-asset": "正在确认资产...",
      "edit-asset": "正在更新资产名称...",
      "run-calibration": "正在校准分镜...",
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
      creator_shots_missing: "请先拆分分镜。",
      asset_review_not_ready: "请先确认必需资产。",
      image_assets_missing: "仍有分镜缺少图片资产。",
      script_not_ready: "剧本还没准备好，先上传或保存剧本，再执行解析或生成。",
      script_not_parsed: "剧本还没解析完成，请先完成分镜拆分。",
      project_not_editable: "当前项目状态还不能继续生成，请先完成前置步骤。",
      project_not_found: "当前项目不存在或已被删除，请刷新页面后重试。",
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
  if (!token) {
    return "project";
  }
  if (token === "home") {
    return "home";
  }
  if (
    token === "asset-prep-section" ||
    token === "storyboard-workbench" ||
    token === "episode-workbench" ||
    token === "project"
  ) {
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
  if (token === "team" || token === "team-dashboard") {
    return "team";
  }
  return "project";
}

function deriveInitialLibraryTeamRoute(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (token === "team-dashboard") {
    return "team-dashboard";
  }
  if (token === "team") {
    return "team";
  }
  return "assets";
}

function deriveInitialProjectPanelMode(hash) {
  const token = String(hash || "").replace(/^#/, "");
  if (token === "episode-workbench") {
    return "episode-workbench";
  }
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

function libraryAssetScopeLabel(scope) {
  return (
    {
      personal: "个人资产库",
      official: "官方资产库",
      team: "团队资产库",
    }[scope] ?? "资产库"
  );
}

function buildProjectSeedScript({ name, projectType }) {
  const typeLabel =
    {
      "domestic-live": "国内真人剧",
      "overseas-live": "海外真人剧",
      anime: "2D/3D 动漫",
    }[projectType] ?? "2D/3D 动漫";

  return `${name}

项目类型：${typeLabel}
第一集：请根据项目名称和剧目类型生成一版可继续拆分分镜的初始故事梗概。`;
}

function applyProjectDetail(workbench, detail) {
  if (!detail?.project) {
    return;
  }
  workbench.state = {
    ...(workbench.state ?? {}),
    project: detail.project,
    script: detail.script ?? null,
    shots: detail.shots ?? [],
    projectDetail: detail,
  };
  workbench.ui.projectDetail = detail;
  workbench.ui.exportHistory = detail.exportHistory ?? workbench.ui.exportHistory ?? [];
  workbench.ui.importedAssets = mapProjectDetailAssets(detail.assetsByType);
  workbench.ui.customEpisodes = getDetailEpisodes(workbench.state);
}

function mapProjectDetailAssets(assetsByType = {}) {
  return {
    character: mapBackendAssets(assetsByType.character, "character"),
    scene: mapBackendAssets(assetsByType.scene, "scene"),
    prop: mapBackendAssets(assetsByType.prop, "prop"),
    other: {
      image: mapBackendAssets(assetsByType.other?.image, "other"),
      video: mapBackendAssets(assetsByType.other?.video, "other"),
    },
  };
}

function mapBackendAssets(assets = [], kind) {
  return [...assets].map((asset) => ({
    id: asset.id,
    name: asset.label ?? asset.assetKey ?? "未命名资产",
    preview: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
    description: asset.assetKey ?? "",
    kind,
    source: "backend",
  }));
}

function getDetailEpisodes(state) {
  return (state?.projectDetail?.episodes ?? []).map((episode) => ({
    id: episode.id,
    title: episode.title,
    status: episode.status === "ready" ? "已定稿" : "未定稿",
    createdAt: formatProjectDate(new Date(episode.createdAt ?? Date.now())),
    createdAtMs: Date.parse(episode.createdAt ?? ""),
    storyboardCount: episode.storyboardCount ?? 0,
    previewUrl: episode.previewUrl ?? null,
  }));
}

function inferMimeTypeFromDataUrl(value) {
  const match = /^data:([^;,]+)/.exec(String(value ?? ""));
  return match?.[1] ?? "image/png";
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



