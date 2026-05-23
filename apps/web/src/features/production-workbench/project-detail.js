import { renderAssetExtractModal } from "./asset-extract-modal.js";
import { renderEpisodeWorkbench } from "./episode-workbench.js";
import { renderExportPanel } from "./export-panel.js";
import { renderProjectCreateModal } from "./project-create-modal.js";
import { getProjectDetailState } from "./storyboard-state.js";
import { disabled, escapeHtml } from "./markup.js";
import { renderLibraryTeam } from "../library-team/index.js";

const PROJECT_STATUS_OPTIONS = ["未开始", "制作中", "一稿交付", "完结"];

const NAV_TABS = [
  { id: "home", label: "首页", icon: "home" },
  { id: "script", label: "剧本", icon: "book" },
  { id: "project", label: "项目", icon: "clapperboard" },
  { id: "library", label: "资产库", icon: "archive" },
  { id: "tools", label: "工具箱", icon: "wand" },
  { id: "team", label: "团队", icon: "users" },
];

const GROUPS = [
  { key: "characters", group: "character", label: "角色", accent: "violet" },
  { key: "scenes", group: "scene", label: "场景", accent: "teal" },
  { key: "props", group: "prop", label: "道具", accent: "amber" },
  { key: "others", group: "other", label: "其它", accent: "slate" },
];

const INTERIOR_NAV_ITEMS = [
  { id: "overview", icon: "◼", label: "总览" },
  { id: "assets", icon: "◻", label: "资产" },
  { id: "episodes", icon: "▣", label: "剧集" },
  { id: "members", icon: "◎", label: "成员" },
  { id: "stats", icon: "◌", label: "统计" },
];

const ASSET_TABS = [
  { id: "character", icon: "◉", label: "角色", search: "搜索你所需要的角色" },
  { id: "scene", icon: "⌂", label: "场景", search: "搜索你所需要的场景" },
  { id: "prop", icon: "✣", label: "道具", search: "搜索你所需要的道具" },
  { id: "other", icon: "◈", label: "其它", search: "搜索你所需要的视频" },
];

const ASSET_LIBRARY_CONFIG = {
  character: {
    label: "角色",
    tone: "character",
    generateCopy: "输入提示词通过生图模型生成角色图像",
    importCopy: "手动上传出镜角色的形象素材",
    art: "portrait",
    importedCardClass: "portrait",
    emptyTitle: "角色资源库暂时还是空的",
    emptyCopy: "导入角色后会按最新时间出现在这里，保留和生成入口会一起缩到左侧。",
    importHint: "如需使用 Seedance 2.0，请将角色保存为 Seedance 2.0 主体",
    importNote: "导入如示例中的角色三视图、主视图、特写，可获得更好的后续生成效果",
    importLinkLabel: "查看素材使用须知",
    dropzoneTitle: "点击或直接拖拽图片上传",
    dropzoneCopy: "可单次批量导入至多20个素材，提升操作效率",
    dropzoneMode: "character-mode",
    presetKind: "character",
    reviewFootnote: "保存为主体后可在生成视频时优先作为参考主体使用。",
    addDescriptionLabel: "添加角色描述",
  },
  scene: {
    label: "场景",
    tone: "scene",
    generateCopy: "输入提示词通过生图模型生成场景图像",
    importCopy: "手动上传出镜场景的参考素材",
    art: "diner",
    importedCardClass: "landscape",
    emptyTitle: "场景资源库暂时还是空的",
    emptyCopy: "导入场景后会在右侧以横版卡片展示，并按最新时间排序。",
    importHint: "建议上传横版完整场景图，便于后续生成保持空间关系一致",
    importNote: "可上传街道、室内、自然环境等高质量参考图，系统会自动生成场景名称。",
    importLinkLabel: "查看场景素材建议",
    dropzoneTitle: "点击或直接拖拽场景图片上传",
    dropzoneCopy: "支持 JPG、PNG 等常见图片格式，单次最多导入20张",
    presetKind: "scene",
    reviewFootnote: "确认后场景会立即出现在资源库中，并默认按最近导入排序。",
    addDescriptionLabel: "添加场景描述",
  },
  prop: {
    label: "道具",
    tone: "prop",
    generateCopy: "输入提示词通过生图模型生成道具图像",
    importCopy: "手动上传出镜道具的参考素材",
    art: "glasses",
    importedCardClass: "square",
    emptyTitle: "道具资源库暂时还是空的",
    emptyCopy: "导入道具后会以卡片形式显示在这里，方便后续分镜直接调用。",
    importHint: "建议上传主体清晰、背景干净的道具素材，识别效果会更稳定",
    importNote: "可上传武器、摆件、设备等素材，上传后可手动调整名称并确认导入。",
    importLinkLabel: "查看道具素材建议",
    dropzoneTitle: "点击或直接拖拽道具图片上传",
    dropzoneCopy: "支持批量上传，建议使用纯色或简单背景的参考图",
    presetKind: "prop",
    reviewFootnote: "确认后道具会进入资源库，并优先展示最新导入内容。",
    addDescriptionLabel: "添加道具描述",
  },
  other: {
    label: "其它",
    importedCardClass: "other",
    reviewFootnote: "确认后主体会进入当前资源库，并保持最新时间优先展示。",
    addDescriptionLabel: "添加主体描述",
  },
};
export function renderProjectDetail(context = {}) {
  const { state = {}, ui = {}, session = { user: { phone: "" } } } = context;
  const detailState = getProjectDetailState(state);
  const progress = getProgress(state);
  const activeNavTab = ui.activeNavTab ?? "home";

  if (activeNavTab === "project" && ui.projectPanelMode === "workspace") {
    return `
      <section class="production-workbench">
        ${renderWorkbenchRail(activeNavTab)}
        <section class="workbench-main workspace-mode">
          ${renderGlobalStatusbar(session)}
          ${renderProjectInteriorShell({ state, ui, detailState })}
        </section>
      </section>
      ${renderAssetExtractModal({
        activeTab: ui.scriptTab,
        show: ui.isScriptModalOpen,
        uploadNotice: ui.uploadNotice,
        hasProject: Boolean(state.project),
        defaultScript: ui.defaultScript ?? "",
        busy: ui.busy,
        submitAction: ui.scriptSubmitAction ?? "create-project",
        submitLabel: ui.scriptSubmitLabel ?? "确认上传",
      })}
      ${renderProjectCreateModal({
        show: ui.isCreateModalOpen,
        busy: ui.busy,
        defaultName: ui.createProjectName ?? "",
        selectedAspectRatio: ui.createAspectRatio ?? "9:16",
        selectedProjectType: ui.createProjectType ?? "anime",
        notice: ui.createProjectNotice ?? "",
      })}
    `;
  }

  if (activeNavTab === "project" && ui.projectPanelMode === "episode-workbench") {
    return `
      <section class="production-workbench">
        ${renderWorkbenchRail(activeNavTab)}
        <section class="workbench-main workspace-mode">
          ${renderGlobalStatusbar(session)}
          ${renderEpisodeWorkbenchScreen({ state, ui })}
        </section>
      </section>
      ${renderAssetExtractModal({
        activeTab: ui.scriptTab,
        show: ui.isScriptModalOpen,
        uploadNotice: ui.uploadNotice,
        hasProject: Boolean(state.project),
        defaultScript: ui.defaultScript ?? "",
        busy: ui.busy,
        submitAction: ui.scriptSubmitAction ?? "create-project",
        submitLabel: ui.scriptSubmitLabel ?? "确认上传",
      })}
      ${renderProjectCreateModal({
        show: ui.isCreateModalOpen,
        busy: ui.busy,
        defaultName: ui.createProjectName ?? "",
        selectedAspectRatio: ui.createAspectRatio ?? "9:16",
        selectedProjectType: ui.createProjectType ?? "anime",
        notice: ui.createProjectNotice ?? "",
      })}
    `;
  }

  return `
    <section class="production-workbench">
      ${renderWorkbenchRail(activeNavTab)}

      <section class="workbench-main ${activeNavTab === "home" ? "home-mode" : ""}">
        ${renderGlobalStatusbar(session)}
        ${renderMainPanel({ state, ui, session, detailState, progress, activeNavTab })}
      </section>
    </section>

      ${renderAssetExtractModal({
        activeTab: ui.scriptTab,
        show: ui.isScriptModalOpen,
        uploadNotice: ui.uploadNotice,
      hasProject: Boolean(state.project),
      defaultScript: ui.defaultScript ?? "",
      busy: ui.busy,
      submitAction: ui.scriptSubmitAction ?? "create-project",
      submitLabel: ui.scriptSubmitLabel ?? "确认上传",
    })}
    ${renderProjectCreateModal({
      show: ui.isCreateModalOpen,
      busy: ui.busy,
      defaultName: ui.createProjectName ?? "",
      selectedAspectRatio: ui.createAspectRatio ?? "9:16",
      selectedProjectType: ui.createProjectType ?? "anime",
      notice: ui.createProjectNotice ?? "",
    })}
    ${renderProjectRenameModal({
      show: Boolean(ui.renameProjectId),
      value: ui.renameProjectName ?? "",
      notice: ui.renameProjectNotice ?? "",
    })}
    ${renderProjectDeleteModal({
      show: Boolean(ui.deleteProjectId),
      projectName:
        ui.projectLibrary?.find((project) => project.id === ui.deleteProjectId)?.name ?? "",
    })}
  `;
}

function renderWorkbenchRail(activeNavTab) {
  return `
    <aside class="workbench-rail persistent" aria-label="工作台导航">
      <nav class="rail-nav" role="tablist" aria-label="主导航">
        ${NAV_TABS.map((tab) => renderRailTab(tab, activeNavTab)).join("")}
      </nav>
      <button class="rail-item rail-bottom" type="button" data-action="logout">退出</button>
    </aside>
  `;
}

function renderEpisodeWorkbenchScreen({ state, ui }) {
  const episodes = getEpisodeHubEntries(state, ui);
  const activeEpisode =
    episodes.find((episode) => episode.id === ui.selectedEpisodeId) ??
    episodes[0] ??
    null;
  const episodeTitle = activeEpisode?.title ?? "Episode 1";
  const episodeStatus = activeEpisode?.status ?? "Draft";
  const storyboardCount = activeEpisode?.storyboardCount ?? ui.storyboards?.length ?? 0;

  return `
    <section class="episode-workbench-screen" aria-label="episode-workbench">
      ${renderEpisodeWorkbench({
        storyboards: ui.storyboards ?? [],
        selectedStoryboard: ui.selectedStoryboard,
        isStoryboardDescriptionModalOpen: Boolean(ui.isStoryboardDescriptionModalOpen),
        storyboardDescriptionDraft: ui.storyboardDescriptionDraft ?? "",
        selectedModelId: ui.selectedModelId,
        prompt: ui.prompt,
        busy: ui.busy,
        canParse: Boolean(state.project),
        canCalibrate: Boolean(state.assetReview?.readyForGeneration && ui.storyboards?.length),
        canGenerateImages: Boolean(ui.storyboards?.length),
        canGenerateVideos: Boolean(
          ui.selectedStoryboard?.imageStatus === "ready" ||
            ui.storyboards?.some((storyboard) => storyboard.imageStatus === "ready"),
        ),
        validationMessage: ui.validationMessage ?? "",
        calibrationSkipReason: ui.calibrationSkipReason ?? "",
        calibrationOverrideReason: ui.calibrationOverrideReason ?? "",
        imageGenerationResult: ui.imageGenerationResult ?? null,
        videoGenerationResult: ui.videoGenerationResult ?? null,
        mediaMode: ui.episodeMediaMode ?? "image",
        videoMode: ui.videoGenerationMode ?? "first-frame",
        imageMode: ui.imageGenerationMode ?? "single-image",
      })}
      <p id="workspace-status" class="workbench-toast interior-toast" role="status">${escapeHtml(ui.toast ?? "Entered episode workbench.")}</p>
    </section>
  `;
}

function renderProjectInteriorShell({ state, ui, detailState }) {
  const selectedProject = getSelectedProjectCard(ui);
  const projectName = selectedProject?.name || detailState.project.name || "未命名项目";
  const statusLabel = normalizeProjectStatus(
    selectedProject?.status || detailState.project.statusLabel || "未开始",
  );
  const statusTone = getStatusTone(statusLabel);
  const aspectRatio = detailState.project.aspectRatio || "16:9";
  const hasAssets = Boolean(state.assetCandidates);
  const episodeCount = detailState.episodes?.length ?? 0;
  const activeInteriorSection = ui.projectInteriorSection ?? "overview";
  const activeAssetTab = ui.projectAssetTab ?? "character";

  return `
    <section class="project-interior" aria-label="项目内部工作台">
      <header class="project-interior-topbar">
        <div class="project-switcher">
          <button class="project-back-button" type="button" data-action="set-nav-tab" data-tab="project" aria-label="返回项目列表">←</button>
          <strong>${escapeHtml(projectName)}</strong>
          <button
            class="project-status-select"
            type="button"
            data-action="toggle-project-interior-status-menu"
            aria-expanded="${ui.projectInteriorStatusMenuOpen ? "true" : "false"}"
            aria-label="项目状态"
          >
            <span class="status-dot ${statusTone}" aria-hidden="true"></span>
            ${escapeHtml(statusLabel)}
            <span aria-hidden="true">${ui.projectInteriorStatusMenuOpen ? "⌃" : "⌄"}</span>
          </button>
          ${ui.projectInteriorStatusMenuOpen ? renderProjectInteriorStatusMenu(statusLabel) : ""}
        </div>
      </header>

      <aside class="project-side-rail" aria-label="项目内导航">
        ${INTERIOR_NAV_ITEMS.map((item) =>
          renderInteriorNavItem(item, activeInteriorSection === item.id),
        ).join("")}
      </aside>

      <main class="project-interior-main">
        ${
          activeInteriorSection === "assets"
            ? renderProjectAssetLibrary({ state, ui, activeAssetTab })
            : activeInteriorSection === "episodes"
              ? renderProjectEpisodesInterior({ state, ui })
            : renderProjectOverviewInterior({
                state,
                ui,
                detailState,
                aspectRatio,
                hasAssets,
                episodeCount,
              })
        }
        <p id="workspace-status" class="workbench-toast interior-toast" role="status">${escapeHtml(ui.toast ?? "已进入项目工作台。")}</p>
      </main>
      <button class="interior-help-button" type="button" aria-label="智能助手">✦</button>
      ${ui.assetGeneratorModal ? renderAssetGeneratorModal(ui) : ""}
      ${ui.assetImportModal ? renderAssetImportModal(ui) : ""}
      ${ui.isSingleEpisodeModalOpen ? renderSingleEpisodeModal(ui) : ""}
      ${renderImportedAssetRenameModal(ui)}
      ${renderImportedAssetDeleteModal(ui)}
    </section>
  `;
}

function renderProjectEpisodesInterior({ state, ui }) {
  const episodes = getEpisodeHubEntries(state, ui);
  return renderEpisodeHub({ episodes, ui });
}

function renderProjectOverviewInterior({ state, ui, detailState, aspectRatio, hasAssets, episodeCount }) {
  const primaryEpisodeTitle = detailState.episodes?.[0]?.title || "剧一";
  return `
    <section class="project-settings-panel">
      <header class="settings-header">
        <button class="settings-title-button" type="button">设置 <span aria-hidden="true">⌄</span></button>
        <div class="settings-chips">
          <span>2D/3D 动漫</span>
          <span class="ratio-chip"><i aria-hidden="true"></i>${escapeHtml(aspectRatio)}</span>
          <span>无风格，无题材</span>
          <button type="button" data-action="open-script-modal">上传剧本/分镜单</button>
        </div>
      </header>

      <section id="asset-prep-section" class="interior-section asset-prep-section" aria-label="资产准备">
        <div class="interior-section-title">
          <h2>资产准备</h2>
          <button class="asset-ai-button" type="button" data-action="open-script-modal">
            <span class="free-ribbon">首次免费</span>
            ✦ AI 智能提取资产
          </button>
          <button class="sr-only-action" type="button" data-action="confirm-all-assets" ${disabled(!state.assetCandidates || ui.busy)}>确认全部资产</button>
        </div>
        <div class="asset-prep-grid">
          ${renderInteriorAssetCard("角色", "character", "violet", detailState.assets.characters, detailState.assets.previews?.character)}
          ${renderInteriorAssetCard("场景", "scene", "teal", detailState.assets.scenes, detailState.assets.previews?.scene)}
          ${renderInteriorAssetCard("道具", "prop", "ochre", detailState.assets.props, detailState.assets.previews?.prop)}
          ${renderInteriorAssetCard("其它", "other", "cyan", detailState.assets.others, detailState.assets.previews?.other)}
        </div>
      </section>

      <section class="interior-section episode-creation-section" aria-label="剧集创作">
        <div class="interior-section-title episode-section-header">
          <button
            class="episode-section-title"
            type="button"
            data-action="set-project-interior-section"
            data-section="episodes"
          >
            剧集创作 <span aria-hidden="true">→</span>
          </button>
          <span class="episode-section-name">${escapeHtml(primaryEpisodeTitle)}</span>
        </div>
        <div class="episode-empty-canvas">
          <div class="episode-canvas-glow"></div>
          <div class="episode-canvas-copy always-visible">
            <strong>${episodeCount > 0 ? `${primaryEpisodeTitle} 已准备就绪` : "从这里开始创建第一集"}</strong>
            <span>
              从 <button type="button" class="episode-inline-link" data-action="open-single-episode-flow">单集创建</button>
              或 <button type="button" class="episode-inline-link" data-action="open-batch-episode-flow">AI 批量创建</button>
            </span>
          </div>
        </div>
      </section>
    </section>
  `;
}

function renderEpisodeCreationHub(ui) {
  return `
    <section class="episode-hub-shell empty" aria-label="剧集菜单">
      <header class="episode-hub-header">
        <div class="episode-hub-tabs">
          <strong>剧集 (0)</strong>
          <button class="episode-history-tab" type="button">导出历史</button>
        </div>
      </header>

      <div class="episode-hub-cards">
        <article class="episode-launch-card ai">
          <div class="episode-launch-copy">
            <h2>AI 批量创建分集 <span class="launch-badge">首次免费</span></h2>
            <p>从剧本批量创建分集，快速搭建整部漫画的剧集内容。</p>
            <button class="episode-launch-button primary" type="button" data-action="open-batch-episode-flow">
              <span aria-hidden="true">✦</span>
              AI 批量创建分集
            </button>
          </div>
          <div class="episode-launch-art collage" aria-hidden="true"></div>
        </article>

        <article class="episode-launch-card single">
          <div class="episode-launch-copy">
            <h2>单集创建</h2>
            <p>手动创建单集文件，先搭建目录，再补充分镜和生成内容。</p>
            <button class="episode-launch-button" type="button" data-action="open-single-episode-flow">
              <span aria-hidden="true">⊕</span>
              单集创建
            </button>
          </div>
          <div class="episode-launch-art corridor" aria-hidden="true"></div>
        </article>
      </div>
    </section>
  `;
}

function renderEpisodeHub({ episodes = [], ui }) {
  if (!episodes.length) {
    return renderEpisodeCreationHub(ui);
  }

  return `
    <section class="episode-hub-shell populated" aria-label="剧集菜单">
      <header class="episode-hub-header">
        <div class="episode-hub-tabs">
          <strong>剧集 (${episodes.length})</strong>
          <button class="episode-history-tab" type="button">导出历史</button>
        </div>
      </header>

      <div class="episode-hub-layout">
        <div class="episode-hub-launches">
          <article class="episode-launch-card ai">
            <div class="episode-launch-copy">
              <h2>AI 批量创建分集 <span class="launch-badge">首次免费</span></h2>
              <p>从剧本批量创建分集，快速搭建整部漫画的剧集内容。</p>
              <button class="episode-launch-button primary" type="button" data-action="open-batch-episode-flow">
                <span aria-hidden="true">✦</span>
                AI 批量创建分集
              </button>
            </div>
            <div class="episode-launch-art collage" aria-hidden="true"></div>
          </article>

          <article class="episode-launch-card single">
            <div class="episode-launch-copy">
              <h2>单集创建</h2>
              <p>手动创建单集文件，先搭建目录，再补充分镜和生成内容。</p>
              <button class="episode-launch-button" type="button" data-action="open-single-episode-flow">
                <span aria-hidden="true">⊕</span>
                单集创建
              </button>
            </div>
            <div class="episode-launch-art corridor" aria-hidden="true"></div>
          </article>
        </div>

        <div class="episode-hub-list" aria-label="剧集列表">
          ${episodes.map((episode) => renderEpisodeHubCard(episode, ui)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderEpisodeHubCard(episode, ui) {
  const isMenuOpen = ui.episodeCardMenuId === episode.id;
  return `
    <article class="episode-card episode-library-card" data-action="open-episode-workbench" data-episode-id="${escapeHtml(episode.id)}">
      <div class="episode-card-preview" aria-hidden="true">
        ${episode.previewUrl ? `<img src="${escapeHtml(episode.previewUrl)}" alt="" />` : "<span>剧</span>"}
      </div>
      <div class="episode-card-body">
        <div class="episode-card-copy">
          <h3>${escapeHtml(episode.title)}</h3>
          <p>创建于：${escapeHtml(episode.createdAt ?? "2026/05/22")}</p>
          <strong>${escapeHtml(episode.status)} · ${episode.storyboardCount} 个分镜</strong>
        </div>
        <div class="episode-card-actions">
          <button
            class="episode-card-menu-button"
            type="button"
            data-action="toggle-episode-card-menu"
            data-episode-id="${escapeHtml(episode.id)}"
            aria-expanded="${isMenuOpen ? "true" : "false"}"
            aria-label="剧集菜单"
          >
            ⋯          </button>
          ${isMenuOpen ? renderEpisodeHubMenu() : ""}
        </div>
      </div>
    </article>
  `;
}

function renderEpisodeHubMenu() {
  return `
    <div class="episode-card-menu" role="menu" aria-label="剧集操作">
      <button class="episode-card-menu-item" type="button">积分明细</button>
      <button class="episode-card-menu-item" type="button">重命名</button>
      <button class="episode-card-menu-item danger" type="button">删除</button>
    </div>
  `;
}

function renderSingleEpisodeModal(ui) {
  return `
    <section class="modal-backdrop" role="dialog" aria-modal="true" aria-label="新建剧集">
      <div class="single-episode-modal">
        <div class="single-episode-modal-head">
          <h2>新建剧集</h2>
          <button class="modal-close" type="button" data-action="close-single-episode-modal" aria-label="关闭">×</button>
        </div>
        <label class="single-episode-field">
          <input
            id="single-episode-name-input"
            type="text"
            value="${escapeHtml(ui.singleEpisodeName ?? "")}"
            placeholder="请输入剧集名称"
          />
          <span class="single-episode-count">${[...(ui.singleEpisodeName ?? "")].length}/50</span>
        </label>
        <div class="single-episode-actions">
          <p class="modal-inline-status">${escapeHtml(ui.singleEpisodeNotice ?? "")}</p>
          <button class="secondary-action" type="button" data-action="close-single-episode-modal">取消</button>
          <button class="primary-action" type="button" data-action="confirm-single-episode">确认</button>
        </div>
      </div>
    </section>
  `;
}

function getEpisodeHubEntries(state, ui) {
  if (Array.isArray(state?.projectDetail?.episodes)) {
    return state.projectDetail.episodes.map((episode) => ({
      id: episode.id,
      title: episode.title,
      status: episode.status === "ready" ? "已定稿" : "未定稿",
      createdAt: episode.createdAt ?? "2026/05/22",
      createdAtMs: getEpisodeCreatedAtValue(episode.createdAt),
      storyboardCount: episode.storyboardCount ?? 0,
      previewUrl: episode.previewUrl ?? null,
    }));
  }
  const derivedEpisodes = state?.shots?.length
    ? [
        {
          id: "episode-primary",
          title: "剧一",
          status: "未定稿",
          createdAt: "2026/05/22",
          createdAtMs: getEpisodeCreatedAtValue("2026/05/22"),
          storyboardCount: state.shots.length,
        },
      ]
    : [];
  const customEpisodes = Array.isArray(ui.customEpisodes) ? ui.customEpisodes : [];

  return [...customEpisodes, ...derivedEpisodes].sort(
    (left, right) =>
      getEpisodeCreatedAtValue(right.createdAtMs ?? right.createdAt) -
      getEpisodeCreatedAtValue(left.createdAtMs ?? left.createdAt),
  );
}

function getEpisodeCreatedAtValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value.replace(/\./g, "/"));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function renderInteriorNavItem(item, active = false) {
  return `
    <button
      class="interior-nav-item ${active ? "active" : ""}"
      type="button"
      data-action="set-project-interior-section"
      data-section="${escapeHtml(item.id)}"
    >
      <span aria-hidden="true">${item.icon}</span>
      <strong>${escapeHtml(item.label)}</strong>
    </button>
  `;
}

function renderProjectInteriorStatusMenu(currentStatus) {
  return `
    <div class="project-interior-status-menu" role="menu" aria-label="修改项目制作状态">
      <p>修改项目制作状态</p>
      ${["制作中", "一稿交付", "完结"]
        .map((status) => {
          const isActive = normalizeProjectStatus(status) === currentStatus;
          return `
            <button
              class="project-interior-status-option ${isActive ? "active" : ""}"
              type="button"
              data-action="set-project-interior-status"
              data-status="${escapeHtml(status)}"
            >
              <span class="status-dot ${getStatusTone(status)}" aria-hidden="true"></span>
              ${escapeHtml(status)}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderProjectAssetLibrary({ state, ui, activeAssetTab }) {
  const tab = ASSET_TABS.find((item) => item.id === activeAssetTab) ?? ASSET_TABS[0];
  const isOther = tab.id === "other";
  const mediaType = ui.projectOtherAssetMediaType ?? "video";
  const importedAssets = getImportedAssetEntries(state, ui, tab.id, mediaType);
  const mediaLabel = mediaType === "image" ? "图片" : "视频";

  return `
    <section class="project-asset-library" aria-label="资产">
      <header class="asset-library-head">
        <h1>资产</h1>
        <div class="asset-library-tabs" role="tablist" aria-label="资产类型">
          ${ASSET_TABS.map((item) => renderProjectAssetTab(item, item.id === tab.id)).join("")}
        </div>
        ${isOther ? renderOtherAssetSubtabs(mediaType) : ""}
        <div class="asset-library-tools">
          <button class="asset-sort-button" type="button">时间倒序 <span aria-hidden="true">⌄</span></button>
          ${
            isOther
              ? ""
              : '<button class="asset-filter-button" type="button">全部 <span aria-hidden="true">⌄</span></button><label class="asset-main-check"><input type="checkbox" />主体</label>'
          }
          <label class="asset-search-field">
            <span aria-hidden="true">⌕</span>
            <input type="search" placeholder="${escapeHtml(isOther ? ('搜索你所需要的' + mediaLabel) : tab.search)}" />
          </label>
          ${
            isOther
              ? ""
              : '<div class="asset-view-toggle"><button class="active" type="button">▦</button><button type="button">☰</button></div>'
          }
        </div>
      </header>

      <div class="asset-library-stage ${isOther ? "other-mode" : ""}">
        ${
          isOther
            ? renderOtherAssetLibrary(mediaType, importedAssets, ui)
            : renderAssetLibraryCollection(tab, importedAssets, ui)
        }
      </div>
    </section>
  `;
}

function renderProjectAssetTab(tab, active) {
  return `
    <button
      class="asset-library-tab ${active ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${active ? "true" : "false"}"
      data-action="set-project-asset-tab"
      data-asset-tab="${escapeHtml(tab.id)}"
    >
      <span class="asset-library-tab-icon" aria-hidden="true">${tab.icon}</span>
      ${escapeHtml(tab.label)}
    </button>
  `;
}

function renderOtherAssetSubtabs(mediaType) {
  return `
    <div class="other-media-tabs" role="tablist" aria-label="其它资产媒体类型">
      ${["video", "image"]
        .map((type) => {
          const label = type === "video" ? "视频" : "图片";
          return `
            <button
              class="${mediaType === type ? "active" : ""}"
              type="button"
              data-action="set-project-other-asset-media"
              data-media-type="${type}"
            >
              ${label}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAssetCreationCards(tab) {
  const data = ASSET_LIBRARY_CONFIG[tab.id];
  const label = data.label;

  return `
    <section class="asset-intake-hero" role="button" tabindex="0" data-action="open-script-modal">
      <span class="asset-intake-badge">首次免费</span>
      <div class="asset-intake-copy">
        <strong>AI 智能提取资产</strong>
      </div>
    </section>
    <section class="asset-action-grid">
      <button
        class="asset-generate-card ${data.tone}"
        type="button"
        data-action="open-asset-generator-modal"
        data-asset-kind="${tab.id}"
      >
        <span class="asset-card-visual ${data.art}" aria-hidden="true">✦</span>
        <strong>生成${label}</strong>
      </button>
      <button
        class="asset-import-card"
        type="button"
        data-action="open-asset-import-modal"
        data-asset-kind="${tab.id}"
      >
        <span class="asset-card-visual import-mark" aria-hidden="true">⇩</span>
        <strong>导入${label}</strong>
      </button>
    </section>
  `;
}

function renderAssetLibraryCollection(tab, importedAssets, ui) {
  if (!importedAssets.length) {
    return renderAssetEmptyLibrary(tab);
  }

  return `
    <section class="asset-library-collection">
      <div class="asset-library-actions-column">
        ${renderAssetCreationCards(tab)}
      </div>
      <div class="asset-library-content-grid">
        ${
          importedAssets.length
            ? importedAssets.map((asset) => renderImportedAssetCard(asset, ui)).join("")
            : '<article class="asset-library-empty-card"><strong>还没有已导入资产</strong><span>可以先从左侧导入，完成后会在这里按卡片形式展示。</span></article>'
        }
      </div>
    </section>
  `;
}

function renderAssetEmptyLibrary(tab) {
  const data = ASSET_LIBRARY_CONFIG[tab.id];
  return `
    <section class="asset-library-empty-showcase">
      <div class="asset-library-empty-showcase-inner">
        ${renderAssetCreationCards(tab)}
        <article class="asset-library-empty-card empty-showcase-card">
          <strong>${escapeHtml(data.emptyTitle)}</strong>
          <span>${escapeHtml(data.emptyCopy)}</span>
        </article>
      </div>
    </section>
  `;
}

function renderOtherAssetLibrary(mediaType, importedAssets, ui) {
  const label = mediaType === "image" ? "图片" : "视频";
  return `
    <section class="other-asset-library">
      <button class="seedance-import-card" type="button" data-action="open-asset-import-modal" data-asset-kind="other">
        <span aria-hidden="true">✦</span>
        导入 Seedance 2.0${label}主体
      </button>
      ${
        importedAssets.length
          ? importedAssets.map((asset) => renderOtherImportedAssetCard(asset, mediaType, ui)).join("")
          : `
            <div class="seedance-library-empty">
              <strong>该资源库为 Seedance 2.0 专享资源库</strong>
              <p>暂无${label}，立即上传一个${label === "图片" ? "图片" : "视频"}主体吧。</p>
            </div>
          `
      }
    </section>
  `;
}

function renderImportedAssetCard(asset, ui) {
  const preview = asset.preview || asset.previewUrl || asset.latestVersion?.previewUrl || "";
  const menuId = `asset-menu-${asset.id}`;
  const isMenuOpen = ui.assetCardMenuId === menuId;
  return `
    <article class="imported-asset-card ${escapeHtml(ASSET_LIBRARY_CONFIG[asset.kind]?.importedCardClass ?? "portrait")}">
      <div class="imported-asset-preview">
        ${preview ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(asset.name)}" />` : '<span class="asset-preview-placeholder" aria-hidden="true">✦</span>'}
      </div>
      <div class="imported-asset-meta asset-card-meta-row">
        <strong>${escapeHtml(asset.name)}</strong>
        <button
          class="asset-card-menu-button"
          type="button"
          data-action="toggle-asset-card-menu"
          data-asset-menu-id="${escapeHtml(menuId)}"
          aria-haspopup="menu"
          aria-expanded="${isMenuOpen ? "true" : "false"}"
          aria-label="更多操作"
        >⋮</button>
      </div>
      ${isMenuOpen ? renderImportedAssetMenu(asset, asset.kind, "image") : ""}
    </article>
  `;
}

function renderOtherImportedAssetCard(asset, mediaType, ui) {
  const preview = asset.preview || asset.previewUrl || asset.latestVersion?.previewUrl || "";
  const menuId = `asset-menu-${asset.id}`;
  const isMenuOpen = ui.assetCardMenuId === menuId;
  return `
    <article class="other-imported-card ${mediaType}">
      <div class="other-imported-preview">
        ${preview ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(asset.name)}" />` : '<span class="asset-preview-placeholder" aria-hidden="true">✦</span>'}
        ${mediaType === "video" ? '<span class="other-imported-play" aria-hidden="true">▶</span>' : ""}
        <span class="other-imported-badge">审核中</span>
      </div>
      <div class="asset-card-meta-row">
        <strong>${escapeHtml(asset.name)}</strong>
        <button
          class="asset-card-menu-button"
          type="button"
          data-action="toggle-asset-card-menu"
          data-asset-menu-id="${escapeHtml(menuId)}"
          aria-haspopup="menu"
          aria-expanded="${isMenuOpen ? "true" : "false"}"
          aria-label="更多操作"
        >⋮</button>
      </div>
      ${isMenuOpen ? renderImportedAssetMenu(asset, "other", mediaType) : ""}
    </article>
  `;
}

function renderImportedAssetMenu(asset, assetKind, mediaType) {
  return `
    <div class="asset-card-menu" role="menu" aria-label="资产操作">
      <button class="asset-card-menu-item" type="button" data-action="edit-imported-asset" data-asset-id="${escapeHtml(asset.id)}" data-asset-kind="${escapeHtml(assetKind)}" data-media-type="${escapeHtml(mediaType)}"><span aria-hidden="true">✎</span>编辑</button>
      <button class="asset-card-menu-item" type="button" data-action="rename-imported-asset" data-asset-id="${escapeHtml(asset.id)}" data-asset-kind="${escapeHtml(assetKind)}" data-media-type="${escapeHtml(mediaType)}"><span aria-hidden="true">⌁</span>重命名</button>
      <button class="asset-card-menu-item" type="button" data-action="download-imported-asset" data-asset-id="${escapeHtml(asset.id)}" data-asset-kind="${escapeHtml(assetKind)}" data-media-type="${escapeHtml(mediaType)}"><span aria-hidden="true">⇩</span>下载</button>
      <button class="asset-card-menu-item danger" type="button" data-action="delete-imported-asset" data-asset-id="${escapeHtml(asset.id)}" data-asset-kind="${escapeHtml(assetKind)}" data-media-type="${escapeHtml(mediaType)}"><span aria-hidden="true">⌦</span>删除</button>
    </div>
  `;
}

function renderAssetImportModal(ui) {
  const activeTab = ui.assetImportModalTab ?? "local";
  const assetKind = ui.assetImportModal ?? "character";
  const assetLabel = getAssetModalLabel(assetKind, ui.projectOtherAssetMediaType ?? "video");

  return `
    <section class="asset-import-backdrop modal-backdrop" role="dialog" aria-modal="true" aria-label="import-asset-dialog">
      <div class="asset-import-modal ${assetKind === "character" ? "character-import-flow" : ""} ${assetKind === "other" ? "other-import-flow" : ""}">
        <button class="asset-modal-close" type="button" data-action="close-asset-import-modal" aria-label="关闭">×</button>
        <header class="asset-import-header">
          <h2>导入${escapeHtml(assetLabel)}</h2>
          <nav class="asset-import-tabs" aria-label="导入来源">
            ${renderAssetImportTab(activeTab, "local", "本地导入")}
            ${renderAssetImportTab(activeTab, "team", "团队资产库")}
            ${renderAssetImportTab(activeTab, "official", "官方资产库")}
          </nav>
        </header>
        ${renderAssetImportBody(ui, activeTab, assetKind)}
      </div>
    </section>
  `;
}

function renderAssetImportTab(activeTab, tab, label) {
  return `
    <button class="asset-import-tab ${activeTab === tab ? "active" : ""}" type="button" data-action="switch-asset-import-tab" data-tab="${tab}">
      ${label}
    </button>
  `;
}

function renderAssetImportBody(ui, activeTab, assetKind) {
  if (activeTab === "team") {
    return `
      <section class="asset-import-empty-state">
        <div class="asset-import-lock" aria-hidden="true">✦</div>
        <p>团队资产库暂未开放，开通后可同步管理共享素材。</p>
        <button type="button" class="asset-import-upgrade">立即开通</button>
      </section>
    `;
  }

  if (activeTab === "official") {
    const categories = [
      ["domestic-modern-city", "国内真人 · 现代都市"],
      ["domestic-ancient", "国内真人 · 古风"],
      ["three-d-modern", "3D · 现代都市"],
      ["three-d-fantasy", "3D · 东方幻想"],
      ["two-d-modern", "2D · 现代都市"],
      ["two-d-fantasy", "2D · 东方幻想"],
    ];
    const officialAssets = ui.assetImportOfficialAssets ?? [];
    const selection = ui.assetImportSelection ?? [];

    return `
      <section class="asset-import-library">
        <aside class="asset-import-sidebar" aria-label="官方分类">
          ${categories
            .map(
              ([id, label]) => `
                <button class="asset-import-category ${ui.assetImportCategory === id ? "active" : ""}" type="button" data-action="select-asset-import-category" data-category="${id}">
                  <span aria-hidden="true">•</span>
                  ${label}
                </button>
              `,
            )
            .join("")}
        </aside>
        <div class="asset-import-library-main">
          <div class="asset-import-library-head">
            <h3>官方${escapeHtml(getAssetLabel(assetKind))}</h3>
            <label class="asset-import-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" placeholder="搜索素材" />
            </label>
          </div>
          <div class="asset-import-grid">
            ${officialAssets
              .map(
                (asset) => `
                  <button type="button" class="asset-import-card-item ${selection.includes(asset.id) ? "selected" : ""}" data-action="toggle-official-asset-import" data-asset-id="${asset.id}">
                    <span class="asset-import-check ${selection.includes(asset.id) ? "selected" : ""}" aria-hidden="true">${selection.includes(asset.id) ? "✓" : ""}</span>
                    <span class="asset-import-thumb" aria-hidden="true"><img src="${escapeHtml(asset.preview)}" alt="${escapeHtml(asset.name)}" /></span>
                    <strong>${escapeHtml(asset.name)}</strong>
                  </button>
                `,
              )
              .join("")}
          </div>
          <footer class="asset-import-footer">
            <button type="button" class="asset-import-confirm-button" data-action="confirm-asset-import" ${disabled(!selection.length)}>确认导入</button>
          </footer>
        </div>
      </section>
    `;
  }

  if (ui.assetImportDrafts?.length) {
    return renderAssetImportReview(ui, assetKind);
  }

  const config = ASSET_LIBRARY_CONFIG[assetKind] ?? ASSET_LIBRARY_CONFIG.character;
  const mediaType = ui.projectOtherAssetMediaType ?? "video";
  const presetKind = assetKind === "other" ? `other-${mediaType}` : config.presetKind;
  const noteLink =
    assetKind === "other"
      ? ""
      : ` <a href="#" onclick="return false;">${escapeHtml(config.importLinkLabel)}</a>`;

  return `
    <section class="asset-import-local">
      <div class="asset-import-banner ${assetKind === "other" ? "other-tone" : ""}">
        <span class="asset-import-banner-icon" aria-hidden="true">✦</span>
        <strong>${escapeHtml(getAssetImportHint(assetKind, mediaType))}</strong>
        <button type="button" class="asset-import-banner-action">我知道了</button>
      </div>
      <div class="asset-import-presets">
        ${getAssetImportPresets(presetKind)
          .map(
            ([label, kind]) => `
              <article class="asset-import-preset">
                <div class="asset-import-preset-visual ${kind}" aria-hidden="true"></div>
                <footer>${label}</footer>
              </article>
            `,
          )
          .join("")}
      </div>
      <p class="asset-import-note">${escapeHtml(getAssetImportNote(assetKind, mediaType))}${noteLink}</p>
      <button
        class="asset-import-dropzone ${escapeHtml(config.dropzoneMode ?? "")}"
        type="button"
        data-action="pick-asset-import-files"
        data-dropzone="asset-import"
      >
        <input
          class="asset-import-file-input"
          type="file"
          accept="${escapeHtml(getAssetImportAccept(assetKind, ui.projectOtherAssetMediaType ?? "video"))}"
          multiple
        />
        <span class="asset-import-upload-icon" aria-hidden="true">⇪</span>
        <strong>${escapeHtml(getAssetDropzoneTitle(assetKind, mediaType))}</strong>
        <span>${escapeHtml(getAssetDropzoneCopy(assetKind, mediaType))}</span>
      </button>
    </section>
  `;
}

function renderOtherAssetEmpty(mediaType) {
  const label = mediaType === "image" ? "图片" : "视频";
  return `
    <section class="other-asset-empty">
      <button class="seedance-import-card" type="button">
        <span aria-hidden="true">✦</span>
        导入 Seedance 2.0${label}主体
      </button>
      <div class="seedance-library-empty">
        <strong>该资源库为 <span aria-hidden="true">🪽</span> Seedance 2.0 专享资源库</strong>
        <p>暂无${label}，立即上传一个${label === "图片" ? "图片" : "视频"}主体吧！</p>
      </div>
    </section>
  `;
}

function renderAssetImportReview(ui, assetKind) {
  const label = getAssetModalLabel(assetKind, ui.projectOtherAssetMediaType ?? "video");
  const selection = ui.assetImportSelection ?? [];
  const config = ASSET_LIBRARY_CONFIG[assetKind] ?? ASSET_LIBRARY_CONFIG.character;

  return `
    <section class="asset-import-review">
      <p class="asset-import-success-copy">本次上传成功 ${ui.assetImportDrafts.length} 个，请确认以下${escapeHtml(label)}名称:</p>
      <div class="asset-import-review-list">
        ${ui.assetImportDrafts
          .map(
            (draft, index) => `
              <article class="asset-import-review-item">
                <button
                  class="asset-import-review-check ${selection.includes(draft.id) ? "selected" : ""}"
                  type="button"
                  data-action="toggle-asset-import-draft"
                  data-draft-id="${draft.id}"
                >
                  ${selection.includes(draft.id) ? "✓" : ""}
                </button>
                <span class="asset-import-review-index">${String(index + 1).padStart(2, "0")}</span>
                <div class="asset-import-review-thumb">
                  <img src="${escapeHtml(draft.preview)}" alt="${escapeHtml(draft.name)}" />
                </div>
                <div class="asset-import-review-form">
                  <strong>${escapeHtml(label)}名称</strong>
                  <label class="asset-import-review-field">
                    <input
                      class="asset-import-name-input"
                      type="text"
                      value="${escapeHtml(draft.name)}"
                      data-draft-id="${draft.id}"
                    />
                    <span>${[...(draft.name ?? "")].length}/50</span>
                  </label>
                </div>
                <button type="button" class="asset-import-description-button">${escapeHtml(config.addDescriptionLabel)}</button>
              </article>
            `,
          )
          .join("")}
      </div>
      <footer class="asset-import-review-footer">
        <span>${escapeHtml(config.reviewFootnote)}</span>
        <div class="asset-import-review-actions">
          <button type="button" class="asset-import-secondary-button" data-action="confirm-asset-import">导入并保存为主体</button>
          <button type="button" class="asset-import-confirm-button" data-action="confirm-asset-import" ${disabled(!selection.length)}>确认导入</button>
        </div>
      </footer>
    </section>
  `;
}

function getImportedAssetEntries(state, ui, assetKind, mediaType = "video") {
  const detailAssets = state?.projectDetail?.assetsByType;
  if (detailAssets) {
    if (assetKind === "other") {
      return mapDetailAssets(detailAssets.other?.[mediaType] ?? [], "other");
    }
    return mapDetailAssets(detailAssets[assetKind] ?? [], assetKind);
  }
  if (assetKind === "other") {
    return ui.importedAssets?.other?.[mediaType] ?? [];
  }
  return ui.importedAssets?.[assetKind] ?? [];
}

function mapDetailAssets(assets, kind) {
  return assets.map((asset) => ({
    id: asset.id,
    name: asset.label ?? asset.assetKey ?? "未命名资产",
    preview: asset.previewUrl ?? asset.latestVersion?.previewUrl ?? "",
    description: asset.assetKey ?? "",
    kind,
  }));
}

function getAssetModalLabel(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image" ? "图片主体" : "视频主体";
  }
  return getAssetLabel(assetKind);
}

function getAssetLabel(assetKind) {
  return (
    {
      character: "角色",
      scene: "场景",
      prop: "道具",
      other: "其它",
    }[assetKind] ?? "资产"
  );
}

function getAssetImportAccept(assetKind, otherMediaType = "video") {
  if (assetKind === "other") {
    return otherMediaType === "image" ? "image/*" : "video/*";
  }
  return "image/*";
}

function getAssetImportHint(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image"
      ? "上传图片主体后，可在图片分镜中作为统一参考主体使用"
      : "上传视频主体后，可在视频分镜中作为统一参考主体使用";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.importHint ?? ASSET_LIBRARY_CONFIG.character.importHint;
}

function getAssetImportNote(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image"
      ? "支持上传单张图片主体，上传完成后可在确认页修改名称并导入。"
      : "支持上传视频主体素材，上传完成后可在确认页修改名称并导入。";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.importNote ?? ASSET_LIBRARY_CONFIG.character.importNote;
}

function getAssetDropzoneTitle(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image" ? "点击或直接拖拽图片主体上传" : "点击或直接拖拽视频主体上传";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.dropzoneTitle ?? ASSET_LIBRARY_CONFIG.character.dropzoneTitle;
}

function getAssetDropzoneCopy(assetKind, mediaType = "video") {
  if (assetKind === "other") {
    return mediaType === "image"
      ? "支持 PNG、JPG 等图片格式，确认后会展示在当前图片主体资源库"
      : "支持 MP4、MOV 等视频格式，确认后会展示在当前视频主体资源库";
  }
  return ASSET_LIBRARY_CONFIG[assetKind]?.dropzoneCopy ?? ASSET_LIBRARY_CONFIG.character.dropzoneCopy;
}

function getAssetImportPresets(kind) {
  const presetMap = {
    character: [
      ["主视图", "silhouette"],
      ["特写", "closeup"],
      ["特写+主视图", "pair"],
      ["三视图", "triple"],
      ["特写+三视图", "mixed"],
    ],
    scene: [
      ["街道外景", "street"],
      ["餐厅内景", "interior"],
      ["天台夜景", "roof"],
      ["办公区", "studio"],
      ["自然环境", "forest"],
    ],
    prop: [
      ["白底主体", "prop-single"],
      ["细节特写", "prop-detail"],
      ["成组展示", "prop-set"],
      ["佩戴示意", "prop-wear"],
      ["多角度", "prop-multi"],
    ],
    "other-video": [
      ["主体视频", "video-frame"],
      ["半身视频", "video-portrait"],
      ["动态样片", "video-sample"],
      ["横版样片", "video-wide"],
      ["近景素材", "video-close"],
    ],
    "other-image": [
      ["人物主体", "image-subject"],
      ["半身参考", "image-half"],
      ["正面参考", "image-front"],
      ["近景参考", "image-close"],
      ["风格参考", "image-style"],
    ],
  };

  return presetMap[kind] ?? presetMap.character;
}

function renderAssetGeneratorModal(ui) {
  const assetKind = ui.assetGeneratorModal ?? "character";
  const tab = ASSET_TABS.find((item) => item.id === assetKind) ?? ASSET_TABS[0];
  const label = tab.label;
  const isEditing = ui.assetGeneratorMode === "edit";
  const isCharacter = assetKind === "character";
  const isScene = assetKind === "scene";
  const name = ui.assetGeneratorName ?? "";
  const prompt = ui.assetGeneratorPrompt ?? "";
  const importedAssets = getImportedAssetEntries({}, ui, assetKind, ui.projectOtherAssetMediaType ?? "image");
  const editingAsset = ui.assetGeneratorEditingAsset ?? null;
  const previewAssets = editingAsset
    ? [editingAsset]
    : importedAssets.length
    ? importedAssets
    : [{
        id: `${assetKind}-preview-default`,
        name,
        preview:
          "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='228' viewBox='0 0 300 228'%3E%3Crect width='300' height='228' rx='18' fill='%2332353f'/%3E%3Crect x='16' y='16' width='268' height='140' rx='14' fill='url(%23g)'/%3E%3Crect x='16' y='172' width='144' height='16' rx='8' fill='%23434655'/%3E%3Crect x='16' y='196' width='98' height='12' rx='6' fill='%23393c48'/%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23525461'/%3E%3Cstop offset='1' stop-color='%23272831'/%3E%3C/linearGradient%3E%3C/defs%3E%3C/svg%3E",
      }];

  return `
    <section class="asset-generator-backdrop" role="dialog" aria-modal="true" aria-label="生成${escapeHtml(label)}">
      <div class="asset-generator-modal">
        <button class="asset-modal-close" type="button" data-action="close-asset-generator-modal" aria-label="关闭">×</button>
        <aside class="asset-generator-form">
          <h2>${isEditing ? "编辑" : "生成"}${escapeHtml(label)}</h2>
          <label class="asset-generator-field">
            <span>${escapeHtml(label)}名称 <b>*</b></span>
            <div class="asset-generator-name-row">
              <input id="asset-generator-name-input" type="text" value="${escapeHtml(name)}" placeholder="请输入${escapeHtml(label)}名称" />
              <button class="asset-generator-ghost-button" type="button">添加${escapeHtml(ASSET_LIBRARY_CONFIG[assetKind]?.addDescriptionLabel ?? "描述")}</button>
            </div>
            <em class="asset-generator-name-count">${[...name].length}/50</em>
          </label>
          ${isCharacter ? renderCharacterGeneratorFields(ui) : ""}
          ${isScene ? renderSceneGeneratorFields() : ""}
          ${assetKind === "prop" ? renderPropGeneratorFields() : ""}
          <label class="asset-generator-prompt">
            <span>输入提示词</span>
            <div class="asset-generator-prompt-shell">
              <button type="button" aria-label="上传参考图">✦</button>
              <textarea id="asset-generator-prompt-input" placeholder="请输入描述提示词，点击或上传添加参考图。">${escapeHtml(prompt)}</textarea>
              <small class="asset-generator-prompt-count">${[...prompt].length}/460</small>
              <footer>
                <span>${escapeHtml(ui.assetGeneratorModel ?? "即梦4.0")}</span>
                <span>${escapeHtml(ui.assetGeneratorResolution ?? "2K")}</span>
                <span>生成${escapeHtml(String(ui.assetGeneratorCount ?? 1))}张</span>
                <span>✦ 2 积分</span>
                <button type="button">${isEditing ? "保存" : "生成"}</button>
              </footer>
            </div>
          </label>
        </aside>
        <section class="asset-generator-preview">
          ${renderAssetGeneratorPreviewColumn("定稿图片", previewAssets.slice(0, 1))}
          ${renderAssetGeneratorPreviewColumn("全部素材", previewAssets)}
        </section>
      </div>
    </section>
  `;
}

function renderCharacterGeneratorFields(ui) {
  const styleOptions = [
    ["none", "无风格"],
    ["thick-paint", "2D厚涂"],
    ["two-d", "2D日漫"],
    ["three-d", "3D国风"],
    ["three-d-anime", "3D动漫"],
    ["two-d-version", "2DQ版"],
    ["three-d-version", "3DQ版"],
  ];
  const materialOptions = [
    ["none", "无题材"],
    ["fantasy-doomsday", "末世玄幻"],
    ["eastern-cultivation", "东方修仙"],
    ["eastern-fantasy", "东方玄幻"],
    ["ancient-east", "东方古代"],
    ["palace-east", "东方宫廷"],
    ["western-fantasy", "西方玄幻"],
    ["western-palace", "西方宫廷"],
    ["modern-city", "现代都市"],
    ["urban-fantasy", "都市玄幻"],
    ["urban-martial", "都市高武"],
    ["doomsday-cultivation", "末世修仙"],
    ["republic-fantasy", "民国玄幻"],
    ["suspense", "悬疑惊悚"],
    ["future", "星际未来"],
    ["urban-weird", "都市灵异"],
    ["republic-weird", "民国灵异"],
    ["village", "乡村年代"],
  ];
  const imageTypes = [
    ["main", "主视图"],
    ["closeup", "特写"],
    ["main-closeup", "特写+主视图"],
    ["triple", "三视图"],
    ["main-triple", "特写+三视图"],
    ["custom", "自定义视图"],
  ];

  return `
    <div class="asset-generator-card">
      <span>角色类型 <i class="asset-inline-tip">i</i></span>
      <div class="segmented-row">
        <button class="${ui.assetGeneratorCharacterType !== "creature" ? "active" : ""}" type="button">人形角色</button>
        <button class="${ui.assetGeneratorCharacterType === "creature" ? "active" : ""}" type="button">非人形角色</button>
      </div>
      <label class="asset-generator-select-field">创作风格
        <div class="asset-generator-select-display">${escapeHtml(ui.assetGeneratorStyleValue ?? "无风格, 末世玄幻")} <span aria-hidden="true">⌃</span></div>
      </label>
      <div class="asset-generator-picker-card">
        <div class="asset-generator-picker-tabs">
          <button class="active" type="button">官方</button>
          <button type="button">自定义</button>
        </div>
        <div class="asset-generator-chip-group">
          ${styleOptions
            .map(
              ([id, text]) => `<button class="asset-generator-chip ${ui.assetGeneratorStyleOption === id ? "active" : ""}" type="button">${text}</button>`,
            )
            .join("")}
        </div>
        <h4>题材</h4>
        <div class="asset-generator-picker-tabs">
          <button class="active" type="button">官方</button>
          <button type="button">自定义</button>
        </div>
        <div class="asset-generator-chip-group">
          ${materialOptions
            .map(
              ([id, text]) => `<button class="asset-generator-chip ${ui.assetGeneratorMaterialOption === id ? "active" : ""}" type="button">${text}</button>`,
            )
            .join("")}
        </div>
      </div>
      <label class="asset-generator-select-field">生图类型
        <div class="asset-generator-select-display">主视图 <span aria-hidden="true">⌃</span></div>
      </label>
      <div class="asset-generator-view-grid">
        ${imageTypes
          .map(
            ([id, text]) => `<button class="asset-generator-view-card ${ui.assetGeneratorImageType === id ? "active" : ""}" type="button">${text}</button>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderSceneGeneratorFields() {
  return `
    <div class="asset-generator-card">
      <div class="asset-generator-tabs">
        <button class="active" type="button">图片生成</button>
        <button type="button">空间多视角</button>
        <button type="button">多维相机调节</button>
      </div>
      <label>创作风格 ⌄ <select><option>无风格 · 无题材</option></select></label>
      <span>场景模式</span>
      <div class="segmented-row"><button class="active" type="button">● 生成模式</button><button type="button">● 360° 视界模式 <i>NEW</i></button></div>
    </div>
  `;
}

function renderPropGeneratorFields() {
  return `
    <div class="asset-generator-card">
      <label>创作风格 ⌄ <select><option>无风格 · 无题材</option></select></label>
    </div>
  `;
}

function renderAssetGeneratorPreviewColumn(title, assets) {
  return `
    <section class="asset-generator-preview-group">
      <header><span aria-hidden="true">▾</span>${title} (${assets.length})</header>
      <div class="asset-generator-preview-grid">
        ${assets.map((asset) => renderAssetGeneratorPreviewCard(asset)).join("")}
      </div>
    </section>
  `;
}

function renderAssetGeneratorPreviewCard(asset) {
  return `
    <article class="asset-generator-preview-card">
      <div class="asset-generator-preview-media">
        <img src="${escapeHtml(asset.preview || asset.previewUrl || "")}" alt="${escapeHtml(asset.name || "素材预览")}" />
      </div>
    </article>
  `;
}

function renderImportedAssetRenameModal(ui) {
  if (!ui.renameImportedAsset) {
    return "";
  }

  return `
    <section class="modal-backdrop rename-project-backdrop" role="dialog" aria-modal="true" aria-label="重命名素材">
      <div class="rename-project-modal asset-rename-modal">
        <div class="rename-project-head">
          <h2>重命名</h2>
          <button class="modal-close" type="button" data-action="close-rename-imported-asset-modal" aria-label="关闭">×</button>
        </div>
        <label class="rename-project-field">
          <input
            id="asset-rename-name-input"
            type="text"
            value="${escapeHtml(ui.renameImportedAssetName ?? "")}"
            placeholder="请输入素材名称"
          />
          <span class="rename-project-count asset-rename-count">${[...(ui.renameImportedAssetName ?? "")].length}/50</span>
        </label>
        <div class="rename-project-actions">
          <p class="modal-inline-status">${escapeHtml(ui.renameImportedAssetNotice ?? "")}</p>
          <div class="rename-project-button-row">
            <button class="secondary-action rename-cancel-button" type="button" data-action="close-rename-imported-asset-modal">取消</button>
            <button class="primary-action rename-save-button" type="button" data-action="confirm-rename-imported-asset">保存</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderImportedAssetDeleteModal(ui) {
  if (!ui.deleteImportedAsset) {
    return "";
  }

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除素材">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>所选内容将被删除，确定删除${ui.deleteImportedAsset.name ? `“${escapeHtml(ui.deleteImportedAsset.name)}”` : ""}？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-imported-asset-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-imported-asset-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-imported-asset">确定</button>
        </div>
      </div>
    </section>
  `;
}

function getSelectedProjectCard(ui) {
  const selectedId = ui.selectedProjectCardId;
  if (!selectedId) {
    return null;
  }
  return ui.projectLibrary?.find((project) => project.id === selectedId) ?? null;
}

function normalizeProjectStatus(status) {
  if (status === "asset_review" || status === "shot_generation") {
    return "制作中";
  }
  if (status === "export") {
    return "一稿交付";
  }
  return String(status || "未开始");
}

function getStatusTone(status) {
  const normalized = normalizeProjectStatus(status);
  if (normalized === "制作中") {
    return "blue";
  }
  if (normalized === "一稿交付") {
    return "mint";
  }
  if (normalized === "完结") {
    return "green";
  }
  return "muted";
}

function renderInteriorAssetCard(label, kind, accent, count, previews = []) {
  return `
    <button
      class="interior-asset-card ${accent}"
      type="button"
      data-action="open-project-asset-tab"
      data-asset-kind="${kind}"
      aria-label="查看${label}资产"
    >
      <span class="asset-card-summary">
        <span class="asset-card-count">${count}</span>
        <span class="asset-card-label">${label} <b aria-hidden="true">→</b></span>
      </span>
      ${
        previews?.length
          ? `<span class="asset-card-preview-stack" aria-hidden="true">
              ${previews
                .slice(0, 3)
                .map((preview) => `<img src="${escapeHtml(preview)}" alt="" />`)
                .join("")}
            </span>`
          : `<span class="comic-art ${kind}" aria-hidden="true"></span>`
      }
    </button>
  `;
}

function renderMainPanel({ state, ui, session, detailState, progress, activeNavTab }) {
  if (activeNavTab === "home") {
    return renderHomeHero({ detailState });
  }

  if (activeNavTab === "script") {
    return `
      ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
      <section class="script-tab-panel">
        <div class="script-tab-copy">
          <p class="section-kicker">剧本入口</p>
          <h2>脚本与分镜单</h2>
          <p>从剧本库、剧本上传或分镜单上传继续进入生产工作流。左侧菜单保持常驻，点击只切换这里的内容区域。</p>
        </div>
        <div class="script-tab-actions">
          <button id="script-upload-button" class="primary-action" type="button" data-action="open-script-modal">打开上传面板</button>
          <button id="parse-script-button" class="secondary-action" type="button" data-action="parse-script" ${disabled(!state.project || ui.busy)}>AI 拆分镜</button>
        </div>
      </section>
      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已连接到本地 creator API。")}</p>
    `;
  }

  if (activeNavTab === "library") {
    return `
      ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
      ${renderLibraryTeam({
        route: "assets",
        assetScope: ui.libraryTeamAssetScope,
        pricingOpen: Boolean(ui.isLibraryPricingModalOpen),
      })}
      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已连接到本地 creator API。")}</p>
    `;
  }

  if (activeNavTab === "tools") {
    return `
      ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
      <section class="placeholder-panel">
        <p class="section-kicker">工具箱</p>
        <h2>生产辅助工具</h2>
        <p>这里预留给批量任务、提示词模板、镜头校验和导出诊断。现在仍可通过项目页完成主要生产动作。</p>
      </section>
      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已连接到本地 creator API。")}</p>
    `;
  }

  if (activeNavTab === "team") {
    return `
      ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
      ${renderLibraryTeam({
        route: ui.libraryTeamRoute ?? "team",
        pricingOpen: Boolean(ui.isLibraryPricingModalOpen),
        rulesOpen: Boolean(ui.isMemberRulesModalOpen),
      })}
      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已连接到本地 creator API。")}</p>
    `;
  }

  if (activeNavTab === "project" && ui.projectPanelMode !== "workspace") {
    return renderProjectGallery({ ui });
  }

  return `
    ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
    <section id="overview" class="overview-strip" aria-label="项目总览">
      ${renderMetric("状态", detailState.project.statusLabel)}
      ${renderMetric("类型", detailState.project.type)}
      ${renderMetric("画幅", detailState.project.aspectRatio)}
      ${renderMetric("分辨率", detailState.project.resolution)}
    </section>
    <section class="episode-overview" aria-label="剧集概览">
      ${detailState.episodes
        .map(
          (episode) => `
            <article class="episode-card">
              <div>
                <p class="episode-title">${escapeHtml(episode.title)}</p>
                <p class="episode-meta">${escapeHtml(episode.status)} · ${episode.storyboardCount} 个分镜</p>
              </div>
              <button class="secondary-action compact" type="button" data-action="open-project-workspace">进入工作台</button>
            </article>
          `,
        ).join("")}
      <button id="confirm-assets-button" class="primary-action compact" type="button" data-action="confirm-all-assets" ${disabled(!state.assetCandidates || ui.busy)}>确认全部资产</button>
    </section>
    <section id="asset-prep-section" class="asset-section" aria-label="资产准备">
      <div class="section-heading">
        <div>
          <p class="section-kicker">资产准备</p>
          <h2>项目资产</h2>
        </div>
        <button id="confirm-assets-button" class="primary-action compact" type="button" data-action="confirm-all-assets" ${disabled(!state.assetCandidates || ui.busy)}>确认全部资产</button>
      </div>
      <div class="asset-lanes">
        ${GROUPS.map((group) => renderAssetCard(group, state, detailState, ui.busy)).join("")}
      </div>
    </section>
    ${renderEpisodeWorkbench({
      storyboards: ui.storyboards ?? [],
      selectedStoryboard: ui.selectedStoryboard,
      isStoryboardDescriptionModalOpen: Boolean(ui.isStoryboardDescriptionModalOpen),
      storyboardDescriptionDraft: ui.storyboardDescriptionDraft ?? "",
      selectedModelId: ui.selectedModelId,
      prompt: ui.prompt,
      busy: ui.busy,
      canParse: Boolean(state.project),
      canCalibrate: Boolean(state.assetReview?.readyForGeneration && state.shots?.length),
      canGenerateImages: Boolean(state.calibration && state.shots?.length),
      canGenerateVideos: Boolean(
        ui.selectedStoryboard?.imageStatus === "ready" ||
          state.shots?.some((shot) => shot.currentImageAssetVersionId),
      ),
      validationMessage: ui.validationMessage ?? "",
      calibrationSkipReason: ui.calibrationSkipReason ?? "",
      calibrationOverrideReason: ui.calibrationOverrideReason ?? "",
      imageGenerationResult: ui.imageGenerationResult ?? null,
      videoGenerationResult: ui.videoGenerationResult ?? null,
    })}
    ${renderExportPanel({
      exportPreview: state.exportPreview,
      exportHistory: ui.exportHistory ?? [],
      exportPreviewResult: ui.exportPreviewResult ?? null,
      busy: ui.busy,
      canPreview: Boolean(state.shots?.length),
    })}
    <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已连接到本地 creator API。")}</p>
  `;
}

function renderWorkbenchHeader({ state, session, detailState, progress, ui }) {
  return `
    <header class="workbench-topbar">
      <div>
        <div class="project-title-row">
          <h1>${escapeHtml(detailState.project.name)}</h1>
          <span class="phase-pill">${escapeHtml(detailState.project.statusLabel)}</span>
        </div>
        <p class="session-line">当前账号 ${escapeHtml(session.user.phone)} · ${progress.readySteps}/${progress.totalSteps} 步完成</p>
      </div>
      <div class="topbar-actions">
        <button id="script-upload-button" class="secondary-action" type="button" data-action="open-script-modal">AI 智能提取资产</button>
        <button id="parse-script-button" class="primary-action" type="button" data-action="parse-script" ${disabled(!state.project || ui.busy)}>AI 拆分镜</button>
      </div>
    </header>
  `;
}

function renderGlobalStatusbar(session) {
  return `
    <header class="global-statusbar" aria-label="全局状态栏">
      <div class="statusbar-brand" aria-label="品牌标识">
        <div class="statusbar-wondershare">
          <span class="wondershare-w" aria-hidden="true">W</span>
          <div>
            <strong>Wondershare</strong>
            <small>万兴科技</small>
          </div>
        </div>
        <span class="statusbar-divider" aria-hidden="true"></span>
        <div class="statusbar-wondershare">
          <span class="statusbar-n-mark" aria-hidden="true">N</span>
          <div>
            <strong>万兴剧厂</strong>
          </div>
        </div>
      </div>
      <div class="statusbar-actions">
        <span class="statusbar-seedance">限时特惠 免费排队 <b>SEEDANCE 2.0</b></span>
        <button class="statusbar-pill" type="button">创作手册</button>
        <button class="statusbar-pill" type="button">商务合作</button>
        <button class="statusbar-credit" type="button"><span>✦</span> 0 <span aria-hidden="true">⌄</span></button>
        <button class="statusbar-icon" type="button" aria-label="消息通知">✉</button>
        <div class="statusbar-popover-wrap">
          <button class="statusbar-icon" type="button" aria-haspopup="menu" aria-label="客服支持">◎</button>
          <div class="statusbar-popover support-popover" role="menu">
            <button class="popover-menu-item featured" type="button" role="menuitem">
              <strong>客服热线：4000-300624</strong>
            </button>
            <button class="popover-menu-item" type="button" role="menuitem">在线客服</button>
            <button class="popover-menu-item" type="button" role="menuitem">专属服务支持</button>
          </div>
        </div>
        <div class="statusbar-popover-wrap">
          <button class="statusbar-avatar hero-avatar" type="button" aria-haspopup="menu" aria-label="账号">${escapeHtml(session.user.phone.slice(-2) || "我")}</button>
          <div class="statusbar-popover account-popover" role="menu">
            <div class="account-popover-card">
              <strong>创作者 ${escapeHtml(session.user.phone.slice(-8) || "442027442")}</strong>
              <span>升级专业版，创建协作团队</span>
            </div>
            <button class="popover-menu-item" type="button" role="menuitem">我的订阅</button>
            <button class="popover-menu-item" type="button" role="menuitem">订单开票</button>
            <button class="popover-menu-item" type="button" role="menuitem">合伙人中心</button>
            <button class="popover-menu-item" type="button" role="menuitem">账号设置</button>
            <button class="popover-menu-item" type="button" role="menuitem">水印设置</button>
            <button class="popover-menu-item" type="button" role="menuitem">更新日志</button>
            <button class="popover-menu-item" type="button" role="menuitem">问题反馈</button>
            <button class="popover-menu-item" type="button" role="menuitem">政策广场</button>
            <button class="popover-menu-item" type="button" role="menuitem">专属服务支持</button>
            <button class="popover-menu-item danger" type="button" role="menuitem" data-action="logout">退出登录</button>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderHomeHero({ detailState }) {
  return `
    <section class="home-hero" aria-label="首页">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <div class="hero-brand-lockup">
          <div class="hero-brand-mark" aria-hidden="true">N</div>
          <div class="hero-brand-text">万兴剧厂</div>
        </div>
        <h1 class="hero-title">您的专属 AI 电影工作室</h1>
        <div class="hero-value-row" aria-label="核心卖点">
          <span>影视级规模化生产</span>
          <span>小成本成就大爆款</span>
        </div>
        <div class="hero-actions">
          <button class="hero-cta" type="button" data-action="open-create-modal">创建项目</button>
        </div>
        <div class="hero-status-strip">
          <span>${escapeHtml(detailState.project.statusLabel)}</span>
          <span>${escapeHtml(detailState.project.type)}</span>
          <span>${escapeHtml(detailState.project.aspectRatio)}</span>
        </div>
      </div>
    </section>
  `;
}

function renderProjectGallery({ ui }) {
  const projects = ui.projectLibrary ?? [];
  const searchQuery = String(ui.projectSearchQuery ?? "").trim();
  const statusFilters = ui.projectStatusFilters ?? [];
  const filteredProjects = filterProjects(
    filterProjectsByStatus(sortProjectsByCreatedAt(projects), statusFilters),
    searchQuery,
  );
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const currentPage = clampPage(ui.projectLibraryPage ?? 1, totalPages);
  const visibleProjects = paginateProjects(filteredProjects, currentPage, pageSize);

  return `
    <section class="project-gallery-shell">
      <header class="project-gallery-header">
        <div>
          <h1>全部项目(${filteredProjects.length})</h1>
        </div>
        <div class="project-gallery-filters">
          <div class="gallery-filter-group">
            <button
              class="gallery-filter ${ui.projectStatusMenuOpen ? "active" : ""}"
              type="button"
              data-action="toggle-project-status-menu"
              aria-expanded="${ui.projectStatusMenuOpen ? "true" : "false"}"
            >
              <span>项目状态</span>
              <span class="gallery-filter-caret">${ui.projectStatusMenuOpen ? "⌃" : "⌄"}</span>
            </button>
            ${ui.projectStatusMenuOpen ? renderProjectStatusMenu(statusFilters) : ""}
          </div>
          <label class="gallery-search">
            <input
              type="search"
                placeholder="请输入项目名称"
              value="${escapeHtml(searchQuery)}"
              data-action="search-projects"
            />
          </label>
        </div>
      </header>
      <section class="project-gallery-grid" aria-label="项目列表">
        ${
          filteredProjects.length
            ? visibleProjects.map((project) => renderProjectCard(project, ui.projectCardMenuId === project.id)).join("")
            : renderEmptyProjectState(searchQuery, statusFilters)
        }
      </section>
      ${filteredProjects.length > pageSize ? renderProjectPagination({ currentPage, totalPages }) : ""}
      <div class="project-gallery-footer">
        <button class="hero-cta gallery-create-button" type="button" data-action="open-create-modal">创建项目</button>
      </div>
      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已连接到本地 creator API。")}</p>
    </section>
  `;
}

function renderProjectStatusMenu(activeStatuses) {
  const activeSet = new Set(activeStatuses);
  return `
    <div class="project-status-menu" role="menu" aria-label="项目状态筛选">
      ${PROJECT_STATUS_OPTIONS.map(
        (status) => `
          <label class="project-status-option">
            <input
              type="checkbox"
              name="project-status-filter"
              value="${escapeHtml(status)}"
              ${activeSet.has(status) ? "checked" : ""}
            />
            <span class="project-status-box" aria-hidden="true"></span>
            <span>${escapeHtml(status)}</span>
          </label>
        `,
      ).join("")}
    </div>
  `;
}

function renderProjectCard(project, isMenuOpen) {
  const hasCover = Boolean(project.coverImageUrl);
  return `
    <article class="project-gallery-card" data-action="open-project-workspace" data-project-id="${escapeHtml(project.id)}">
      <div class="project-gallery-poster ${hasCover ? "has-cover" : "needs-cover"}">
        <button class="project-cover-placeholder" type="button" data-action="pick-project-cover" data-project-id="${escapeHtml(project.id)}">
          <span class="project-cover-placeholder-icon" aria-hidden="true">+</span>
          <strong>上传封面</strong>
        </button>
        <img class="project-gallery-cover" src="${escapeHtml(getProjectCoverSrc(project))}" alt="${escapeHtml(project.name)} 封面" />
      </div>
      <input class="project-cover-input" type="file" accept="image/*" data-action="upload-project-cover" data-project-id="${escapeHtml(project.id)}" />
      <div class="project-gallery-meta">
        <div>
          <h2>${escapeHtml(project.name)}</h2>
          <span class="project-gallery-status">${escapeHtml(project.status ?? "未开始")}</span>
          <p>创建于：${escapeHtml(project.createdAt ?? "2026/05/21")}</p>
        </div>
        <div class="project-card-actions">
          <button class="project-card-menu-button" type="button" data-action="toggle-project-card-menu" data-project-id="${escapeHtml(project.id)}" aria-expanded="${isMenuOpen ? "true" : "false"}">⋯</button>
          ${isMenuOpen ? renderProjectCardMenu(project) : ""}
        </div>
      </div>
    </article>
  `;
}

function getProjectCoverSrc(project) {
  if (project.coverImageUrl) {
    return project.coverImageUrl;
  }

  const name = String(project.name ?? "新项目");
  const seed = String(project.id ?? name);
  const hue = computeHue(seed);
  const accent = (hue + 28) % 360;
  const monogram = [...name].slice(0, 2).join("") || "项目";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="hsl(${hue} 28% 16%)"/>
          <stop offset="100%" stop-color="hsl(${accent} 36% 24%)"/>
        </linearGradient>
        <radialGradient id="glow" cx="28%" cy="22%" r="46%">
          <stop offset="0%" stop-color="hsla(${accent} 90% 72% / 0.24)"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="720" rx="48" fill="url(#bg)"/>
      <rect width="1200" height="720" rx="48" fill="url(#glow)"/>
      <text x="96" y="590" fill="rgba(255,255,255,0.9)" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="118" font-weight="700">${escapeSvg(monogram)}</text>
      <text x="102" y="650" fill="rgba(255,255,255,0.44)" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="36">${escapeSvg(name)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function computeHue(seed) {
  let total = 0;
  for (const char of seed) {
    total = (total * 31 + char.charCodeAt(0)) % 360;
  }
  return total;
}

function escapeSvg(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderProjectCardMenu(project) {
  return `
    <div class="project-card-menu" role="menu" aria-label="项目操作">
      <input class="project-cover-input" type="file" accept="image/*" data-action="upload-project-cover" data-project-id="${escapeHtml(project.id)}" />
      <button class="project-card-menu-item" type="button" data-action="pick-project-cover" data-project-id="${escapeHtml(project.id)}">替换封面</button>
      <button class="project-card-menu-item" type="button" data-action="rename-project-card" data-project-id="${escapeHtml(project.id)}">重命名</button>
      <button class="project-card-menu-item danger" type="button" data-action="delete-project-card" data-project-id="${escapeHtml(project.id)}">删除</button>
    </div>
  `;
}

function renderProjectRenameModal({ show, value, notice }) {
  if (!show) {
    return "";
  }

  return `
    <section class="modal-backdrop rename-project-backdrop" role="dialog" aria-modal="true" aria-label="重命名">
      <div class="rename-project-modal">
        <div class="rename-project-head">
          <h2>重命名</h2>
          <button class="modal-close" type="button" data-action="close-rename-project-modal" aria-label="关闭">×</button>
        </div>
        <label class="rename-project-field">
          <input
            id="project-rename-name-input"
            type="text"
            value="${escapeHtml(value)}"
            placeholder="请输入项目名称"
          />
          <span class="rename-project-count">${[...value].length}</span>
        </label>
        <div class="rename-project-actions">
          <p class="modal-inline-status">${escapeHtml(notice)}</p>
          <div class="rename-project-button-row">
            <button class="secondary-action rename-cancel-button" type="button" data-action="close-rename-project-modal">取消</button>
            <button class="primary-action rename-save-button" type="button" data-action="confirm-rename-project-card">保存</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderProjectDeleteModal({ show, projectName }) {
  if (!show) {
    return "";
  }

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除">
      <div class="delete-project-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>所选内容将被删除，确定删除${projectName ? `“${escapeHtml(projectName)}”` : ""}吗？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-project-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-project-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-project-card">确定</button>
        </div>
      </div>
    </section>
  `;
}

function renderEmptyProjectState(searchQuery, statusFilters) {
  if (searchQuery || statusFilters.length > 0) {
    return '<article class="project-empty-card"><strong>未找到匹配项目</strong><span>试试别的关键词，或者清空筛选查看全部项目。</span></article>';
  }

  return '<article class="project-empty-card"><strong>还没有项目</strong><span>从下方创建项目开始，创建后会在这里出现。</span></article>';
}

function renderProjectPagination({ currentPage, totalPages }) {
  return `
    <nav class="project-gallery-pagination" aria-label="项目分页">
      <button
        class="pagination-button"
        type="button"
        data-action="change-project-page"
        data-page="${currentPage - 1}"
        ${disabled(currentPage <= 1)}
      >
        上一页
      </button>
      <span class="pagination-status">第 ${currentPage} / ${totalPages} 页</span>
      <button
        class="pagination-button"
        type="button"
        data-action="change-project-page"
        data-page="${currentPage + 1}"
        ${disabled(currentPage >= totalPages)}
      >
        下一页
      </button>
    </nav>
  `;
}

function filterProjects(projects, searchQuery) {
  if (!searchQuery) {
    return projects;
  }

  const normalizedQuery = searchQuery.toLocaleLowerCase();
  return projects.filter((project) =>
    String(project.name ?? "").toLocaleLowerCase().includes(normalizedQuery),
  );
}

function filterProjectsByStatus(projects, statusFilters) {
  if (!statusFilters.length) {
    return projects;
  }

  const activeSet = new Set(statusFilters);
  return projects.filter((project) => activeSet.has(project.status ?? "未开始"));
}

function sortProjectsByCreatedAt(projects) {
  return [...projects]
    .map((project, index) => ({
      project,
      index,
      createdAt: getProjectCreatedAtValue(project),
    }))
    .sort((left, right) => right.createdAt - left.createdAt || right.index - left.index)
    .map(({ project }) => project);
}

function getProjectCreatedAtValue(project) {
  const candidates = [
    project.createdAtTimestamp,
    project.createdAtMs,
    project.createdAtIso,
    project.createdAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate.replace(/\./g, "/"));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

function paginateProjects(projects, currentPage, pageSize) {
  const start = (currentPage - 1) * pageSize;
  return projects.slice(start, start + pageSize);
}

function clampPage(page, totalPages) {
  return Math.min(Math.max(Number(page) || 1, 1), totalPages);
}

function renderRailTab(tab, activeNavTab) {
  return `
    <button
      class="rail-item ${tab.id === activeNavTab ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${tab.id === activeNavTab}"
      data-action="set-nav-tab"
      data-tab="${tab.id}"
    >
      <span class="rail-glyph" aria-hidden="true">${renderRailIcon(tab.icon)}</span>
      <span class="rail-label">${tab.label}</span>
    </button>
  `;
}

function renderRailIcon(icon) {
  const icons = {
    home: `
      <path d="M3.5 10.9 12 3.8l8.5 7.1" />
      <path d="M5.5 9.6v9.1a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7V9.6" />
      <path d="M9.2 20.4v-5.5a1.2 1.2 0 0 1 1.2-1.2h3.2a1.2 1.2 0 0 1 1.2 1.2v5.5" />
      <path d="M17.2 5.2v3.2" />
      <path d="M19.3 15.8h2.5" />
      <path d="M20.6 14.6v2.5" />
    `,
    book: `
      <path d="M5 4.4h7.1a3.1 3.1 0 0 1 3.1 3.1v12.1H8.1A3.1 3.1 0 0 1 5 16.5V4.4Z" />
      <path d="M15.2 7.5h3.1a1.7 1.7 0 0 1 1.7 1.7v10.4h-4.8" />
      <path d="M8.2 8h3.8" />
      <path d="M18.6 3.7v2.6" />
      <path d="M17.3 5h2.6" />
    `,
    clapperboard: `
      <path d="M4.6 8.7h14.8a1.5 1.5 0 0 1 1.5 1.5v8.7a1.5 1.5 0 0 1-1.5 1.5H4.6a1.5 1.5 0 0 1-1.5-1.5v-8.7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="m5.2 8.7 1.2-4.9 14 3.4-.4 1.5" />
      <path d="m8.2 4.2 2.3 5" />
      <path d="m13.1 5.4 2.3 5" />
      <path d="M7.1 13.1h9.8" />
      <path d="M18.4 3.7v2.4" />
      <path d="M17.2 4.9h2.4" />
    `,
    archive: `
      <path d="M5.3 5h13.4a1.4 1.4 0 0 1 1.4 1.4v2.4H3.9V6.4A1.4 1.4 0 0 1 5.3 5Z" />
      <path d="M5.1 8.8v9.8A1.4 1.4 0 0 0 6.5 20h11a1.4 1.4 0 0 0 1.4-1.4V8.8" />
      <path d="M9.1 12.2h5.8" />
      <path d="M17.9 14.9h2.7" />
      <path d="M19.25 13.55v2.7" />
    `,
    wand: `
      <path d="m4.2 19.8 9.9-9.9" />
      <path d="m10.3 7.9 5.8 5.8" />
      <path d="m13.4 4.1.4 1.7 1.7.4-1.7.5-.4 1.6-.5-1.6-1.6-.5 1.6-.4.5-1.7Z" />
      <path d="m18.8 8.4.3 1.2 1.2.3-1.2.3-.3 1.2-.3-1.2-1.2-.3 1.2-.3.3-1.2Z" />
      <path d="m7.2 5.4.3 1.2 1.2.3-1.2.3-.3 1.2-.3-1.2-1.2-.3 1.2-.3.3-1.2Z" />
    `,
    users: `
      <path d="M8.8 11.3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M3.8 20.1a5 5 0 0 1 10 0" />
      <path d="M16 11.1a2.4 2.4 0 1 0 0-4.8" />
      <path d="M15.4 15.2a4.1 4.1 0 0 1 4.8 4.9" />
    `,
  };

  return `
    <svg viewBox="0 0 24 24" focusable="false">
      ${icons[icon] ?? icons.home}
    </svg>
  `;
}

function renderMetric(label, value) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderAssetCard(group, state, detailState, busy) {
  const candidates = group.key === "others" ? [] : state.assetCandidates?.[group.key] ?? [];
  const total = group.key === "others" ? detailState.assets.others : detailState.assets[group.key];
  const confirmed = group.key === "others" ? 0 : candidates.filter((candidate) => candidate.confirmed).length;

  return `
    <article class="asset-card ${group.accent}">
      <div class="asset-art" aria-hidden="true"></div>
      <div class="asset-card-head">
        <h3>${escapeHtml(group.label)} 路</h3>
        <span>${confirmed}/${total || 0}</span>
      </div>
      <div class="asset-candidates">
        ${
          candidates.length
            ? candidates.map((candidate) => renderCandidate(group.group, candidate, busy)).join("")
            : '<p class="empty-copy">解析剧本后会显示候选资产。</p>'
        }
      </div>
    </article>
  `;
}

function renderCandidate(group, candidate, busy) {
  return `
    <div class="asset-token ${candidate.confirmed ? "confirmed" : ""}">
      <button type="button" data-action="edit-asset" data-group="${group}" data-asset-key="${candidate.assetKey}" data-label="${candidate.label}">
        ${escapeHtml(candidate.label)}
      </button>
      <button type="button" data-action="confirm-asset" data-group="${group}" data-asset-key="${candidate.assetKey}" ${disabled(candidate.confirmed || busy)}>
        ${candidate.confirmed ? "已确认" : candidate.required ? "确认" : "可选"}
      </button>
    </div>
  `;
}

function getProgress(state) {
  const steps = [
    Boolean(state.project),
    Boolean(state.shots?.length),
    Boolean(state.assetReview?.readyForGeneration),
    Boolean(state.calibration),
    Boolean(state.shots?.length && state.shots.every((shot) => shot.currentImageAssetVersionId)),
    Boolean(state.shots?.length && state.shots.every((shot) => shot.currentVideoAssetVersionId)),
    Boolean(state.exportPreview),
  ];

  return {
    readySteps: steps.filter(Boolean).length,
    totalSteps: steps.length,
  };
}


