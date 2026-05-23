import { renderAssetExtractModal } from "./asset-extract-modal.js";
import { renderEpisodeWorkbench } from "./episode-workbench.js";
import { renderExportPanel } from "./export-panel.js";
import { renderProjectCreateModal } from "./project-create-modal.js";
import {
  renderOriginalScriptModal,
  renderScriptManagementPage,
} from "./script-page.js";
import { getProjectDetailState } from "./storyboard-state.js";
import { disabled, escapeHtml } from "./markup.js";

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
  { key: "others", group: "other", label: "其他", accent: "slate" },
];

const INTERIOR_NAV_ITEMS = [
  { id: "overview", icon: "◴", label: "总览" },
  { id: "assets", icon: "▱", label: "资产" },
  { id: "episodes", icon: "▤", label: "剧集" },
  { id: "members", icon: "♙", label: "成员" },
  { id: "stats", icon: "⌁", label: "统计" },
];

const ASSET_TABS = [
  { id: "character", icon: "◉", label: "角色", search: "搜索你所需要的角色" },
  { id: "scene", icon: "♙", label: "场景", search: "搜索你所需要的场景" },
  { id: "prop", icon: "⚔", label: "道具", search: "搜索你所需要的道具" },
  { id: "other", icon: "♨", label: "其他", search: "搜索你所需要的视频" },
];

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
      <aside class="workbench-rail persistent" aria-label="工作台导航">
        <nav class="rail-nav" role="tablist" aria-label="主导航">
          ${NAV_TABS.map((tab) => renderRailTab(tab, activeNavTab)).join("")}
        </nav>
        <button class="rail-item rail-bottom" type="button" data-action="logout">退出</button>
      </aside>

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
    })}
    ${renderProjectCreateModal({
      show: ui.isCreateModalOpen,
      busy: ui.busy,
      defaultName: ui.createProjectName ?? "",
      selectedAspectRatio: ui.createAspectRatio ?? "9:16",
      selectedProjectType: ui.createProjectType ?? "anime",
      notice: ui.createProjectNotice ?? "",
    })}
    ${renderOriginalScriptModal({
      show: ui.isOriginalScriptModalOpen,
      draft: ui.originalScriptDraft,
      busy: ui.busy,
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
    </aside>
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
  const episodeCount = detailState.episodes?.length || 1;
  const activeInteriorSection = ui.projectInteriorSection ?? "overview";
  const activeAssetTab = ui.projectAssetTab ?? "character";

  return `
    <section class="project-interior" aria-label="项目内部工作台">
      <header class="project-interior-topbar">
        <div class="project-switcher">
          <button class="project-back-button" type="button" data-action="set-nav-tab" data-tab="project" aria-label="返回项目列表">‹</button>
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
            ? renderProjectAssetLibrary({ ui, activeAssetTab })
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
      <button class="interior-help-button" type="button" aria-label="智能助手">☷</button>
      ${ui.assetGeneratorModal ? renderAssetGeneratorModal(ui.assetGeneratorModal) : ""}
    </section>
  `;
}

function renderProjectEpisodesInterior({ state, ui }) {
  return `
    <section class="project-episodes-panel" aria-label="剧集生成">
      ${renderEpisodeWorkbench({
        storyboards: ui.storyboards ?? [],
        selectedStoryboard: ui.selectedStoryboard,
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
    </section>
  `;
}

function renderProjectOverviewInterior({ state, ui, detailState, aspectRatio, hasAssets, episodeCount }) {
  return `
    <section class="project-settings-panel">
      <header class="settings-header">
        <button class="settings-title-button" type="button">设置 <span aria-hidden="true">⌄</span></button>
        <div class="settings-chips">
          <span>2D/3D动漫</span>
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
            ▱ AI智能提取资产
          </button>
          <button class="sr-only-action" type="button" data-action="confirm-all-assets" ${disabled(!state.assetCandidates || ui.busy)}>确认全部资产</button>
        </div>
        <div class="asset-prep-grid">
          ${renderInteriorAssetCard("角色", "character", "violet", hasAssets ? detailState.assets.characters : 0)}
          ${renderInteriorAssetCard("场景", "scene", "teal", hasAssets ? detailState.assets.scenes : 0)}
          ${renderInteriorAssetCard("道具", "prop", "ochre", hasAssets ? detailState.assets.props : 0)}
          ${renderInteriorAssetCard("其他", "other", "cyan", hasAssets ? detailState.assets.others : 0)}
        </div>
      </section>

      <section class="interior-section episode-creation-section" aria-label="剧集创作">
        <button class="episode-section-title" type="button" data-action="parse-script">
          剧集创作 <span aria-hidden="true">›</span>
        </button>
        <div class="episode-empty-canvas">
          <div class="episode-canvas-glow"></div>
          <div class="episode-canvas-copy">
            <strong>${episodeCount > 0 ? `${episodeCount} 个剧集空间已就绪` : "剧集空间"}</strong>
            <span>上传剧本或分镜单后，可继续拆分镜、生成画面与视频。</span>
          </div>
        </div>
      </section>
    </section>
  `;
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

function renderProjectAssetLibrary({ ui, activeAssetTab }) {
  const tab = ASSET_TABS.find((item) => item.id === activeAssetTab) ?? ASSET_TABS[0];
  const isOther = tab.id === "other";
  const mediaType = ui.projectOtherAssetMediaType ?? "video";
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
          <button class="asset-sort-button" type="button">☷ 时间倒序 <span aria-hidden="true">⌄</span></button>
          ${isOther ? "" : '<button class="asset-filter-button" type="button">全部 <span aria-hidden="true">⌄</span></button><label class="asset-main-check"><input type="checkbox" />主体</label>'}
          <label class="asset-search-field">
            <span aria-hidden="true">⌕</span>
            <input type="search" placeholder="${escapeHtml(isOther ? `搜索你所需要的${mediaLabel}` : tab.search)}" />
          </label>
          ${isOther ? "" : '<div class="asset-view-toggle"><button class="active" type="button">▦</button><button type="button">☷</button></div>'}
        </div>
      </header>

      <div class="asset-library-stage ${isOther ? "other-mode" : ""}">
        ${
          isOther
            ? renderOtherAssetEmpty(mediaType)
            : renderAssetCreationCards(tab)
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
      <span aria-hidden="true">${tab.icon}</span>
      ${escapeHtml(tab.label)}
    </button>
  `;
}

function renderOtherAssetSubtabs(mediaType) {
  return `
    <div class="other-media-tabs" role="tablist" aria-label="其他资产媒体类型">
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
  const data = {
    character: {
      label: "角色",
      tone: "character",
      generateCopy: "输入提示词通过生图模型生成角色图像",
      importCopy: "手动上传出镜该剧本的角色形象",
      art: "portrait",
    },
    scene: {
      label: "场景",
      tone: "scene",
      generateCopy: "输入提示词通过生图模型生成场景图像",
      importCopy: "手动上传出镜该剧本的场景",
      art: "diner",
    },
    prop: {
      label: "道具",
      tone: "prop",
      generateCopy: "输入提示词通过生图模型生成道具图像",
      importCopy: "手动上传出镜该剧本的道具",
      art: "glasses",
    },
  }[tab.id];

  return `
    <section class="asset-intake-hero">
      <div>
        <h2>AI 智能提取资产 <span>首次免费</span></h2>
        <p>AI分析剧本，提取出镜的角色/场景/道具，并生成出镜资产提示词</p>
        <button type="button" data-action="open-script-modal">▱ AI智能提取资产</button>
      </div>
      <div class="asset-intake-art" aria-hidden="true"></div>
    </section>
    <section class="asset-action-grid">
      <article class="asset-generate-card ${data.tone}">
        <div>
          <h2>生成${data.label}</h2>
          <p>${data.generateCopy}</p>
          <button type="button" data-action="open-asset-generator-modal" data-asset-kind="${tab.id}">✦ 生成${data.label}</button>
        </div>
        <div class="asset-card-visual ${data.art}" aria-hidden="true"></div>
      </article>
      <article class="asset-import-card">
        <h2>导入${data.label}</h2>
        <p>${data.importCopy}</p>
        <button type="button">⌄ 导入${data.label}</button>
      </article>
    </section>
  `;
}

function renderOtherAssetEmpty(mediaType) {
  const label = mediaType === "image" ? "图片" : "视频";
  return `
    <section class="other-asset-empty">
      <button class="seedance-import-card" type="button">
        <span aria-hidden="true">⌄</span>
        导入Seedance 2.0${label}主体
      </button>
      <div class="seedance-library-empty">
        <strong>该资源库为 <span aria-hidden="true">🪽</span> Seedance 2.0 专享资源库</strong>
        <p>暂无${label}，立即上传一${mediaType === "image" ? "张图片" : "个视频"}吧！</p>
      </div>
    </section>
  `;
}

function renderAssetGeneratorModal(assetKind) {
  const tab = ASSET_TABS.find((item) => item.id === assetKind) ?? ASSET_TABS[0];
  const label = tab.label;
  const isCharacter = assetKind === "character";
  const isScene = assetKind === "scene";

  return `
    <section class="asset-generator-backdrop" role="dialog" aria-modal="true" aria-label="生成${escapeHtml(label)}">
      <div class="asset-generator-modal">
        <button class="asset-modal-close" type="button" data-action="close-asset-generator-modal" aria-label="关闭">×</button>
        <aside class="asset-generator-form">
          <h2>生成${escapeHtml(label)}</h2>
          <label class="asset-generator-field">
            <span>${escapeHtml(label)}名称 <b>*</b></span>
            <input type="text" placeholder="请输入${escapeHtml(label)}名称" />
            <em>0/50</em>
          </label>
          ${isCharacter ? renderCharacterGeneratorFields() : ""}
          ${isScene ? renderSceneGeneratorFields() : ""}
          ${assetKind === "prop" ? renderPropGeneratorFields() : ""}
          <label class="asset-generator-prompt">
            <span>输入提示词</span>
            <div>
              <button type="button" aria-label="上传参考图">▧</button>
              <p>请输入描述提示词，点击或上传添加参考图。</p>
              <small>0/460</small>
              <footer>
                <span>🪽 即梦4.0</span>
                <span>16:9 · 2K</span>
                <span>生成1张</span>
                <span>✦ 2⌄</span>
                <button type="button">生成</button>
              </footer>
            </div>
          </label>
        </aside>
        <section class="asset-generator-preview">
          <div aria-hidden="true">▧</div>
          <p>请在左侧输入信息生成素材图</p>
        </section>
      </div>
    </section>
  `;
}

function renderCharacterGeneratorFields() {
  return `
    <div class="asset-generator-card">
      <span>角色类型 ⓘ</span>
      <div class="segmented-row">
        <button class="active" type="button">● 人形角色</button>
        <button type="button">○ 非人形角色</button>
      </div>
      <label>创作风格 ⓘ<select><option>无风格, 无题材</option></select></label>
      <label>生图类型 ⓘ<select><option>主视图</option></select></label>
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
      <label>创作风格 ⓘ<select><option>无风格, 无题材</option></select></label>
      <span>场景模式</span>
      <div class="segmented-row"><button class="active" type="button">● 生成模式</button><button type="button">○ 360° 视界模式 <i>NEW</i></button></div>
    </div>
  `;
}

function renderPropGeneratorFields() {
  return `
    <div class="asset-generator-card">
      <label>创作风格 ⓘ<select><option>无风格, 无题材</option></select></label>
    </div>
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

function renderInteriorAssetCard(label, kind, accent, count) {
  return `
    <button
      class="interior-asset-card ${accent}"
      type="button"
      data-action="open-project-asset-tab"
      data-asset-kind="${kind}"
      aria-label="查看${label}资产"
    >
      <span class="asset-card-label">${label} <b aria-hidden="true">›</b></span>
      <span class="asset-card-count">${count}</span>
      <span class="comic-art ${kind}" aria-hidden="true"></span>
    </button>
  `;
}

function renderMainPanel({ state, ui, session, detailState, progress, activeNavTab }) {
  if (activeNavTab === "home") {
    return renderHomeHero({ detailState });
  }

  if (activeNavTab === "script") {
    return `
      ${renderScriptManagementPage({ ui })}
    `;
  }

  if (activeNavTab === "library") {
    return `
      ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
      <section class="placeholder-panel">
        <p class="section-kicker">资产库</p>
        <h2>统一资产空间</h2>
        <p>这里保留给后续的角色、场景、道具和风格参考图管理。当前版本继续通过项目资产卡和脚本提取推进主流程。</p>
      </section>
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
      <section class="placeholder-panel">
        <p class="section-kicker">团队</p>
        <h2>协作空间</h2>
        <p>团队设置和成员权限会放在这里。当前页面先维持单人可用的创作工作台，不让左侧导航在切换时消失。</p>
      </section>
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
        )
        .join("")}
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
      <div class="statusbar-brand" aria-label="万兴剧厂">
        <div class="statusbar-wondershare" aria-hidden="true">
          <span class="wondershare-w">W</span>
          <span>wondershare<br><small>万兴科技</small></span>
        </div>
        <span class="statusbar-divider" aria-hidden="true"></span>
        <span class="statusbar-n-mark" aria-hidden="true">N</span>
        <strong>万兴剧厂</strong>
      </div>
      <div class="statusbar-actions">
        <span class="statusbar-seedance">限时特惠 免费排队 <b>SEEDANCE 2.0</b></span>
        <button class="statusbar-pill" type="button">▱ 创作手册</button>
        <button class="statusbar-pill" type="button">商务合作</button>
        <button class="statusbar-credit" type="button"><span>✦</span> 0 <span aria-hidden="true">⌁</span></button>
        <button class="statusbar-icon" type="button" aria-label="消息通知">♧</button>
        <div class="statusbar-popover-wrap">
          <button class="statusbar-icon" type="button" aria-haspopup="menu" aria-label="客服支持">◕</button>
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
              <strong>创作者${escapeHtml(session.user.phone.slice(-8) || "442027442")}</strong>
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
          <div class="hero-brand-mark">N</div>
          <div class="hero-brand-text">万兴剧厂</div>
        </div>
        <h1 class="hero-title">您的专属 AI 电影工作室</h1>
        <div class="hero-value-row">
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
          <button class="project-card-menu-button" type="button" data-action="toggle-project-card-menu" data-project-id="${escapeHtml(project.id)}" aria-expanded="${isMenuOpen ? "true" : "false"}">⋮</button>
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
      <button class="project-card-menu-item" type="button" data-action="pick-project-cover" data-project-id="${escapeHtml(project.id)}">上传封面</button>
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
            maxlength="50"
            value="${escapeHtml(value)}"
            placeholder="请输入项目名称"
          />
          <span class="rename-project-count">${[...value].length}/50</span>
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
            <p>所选内容将被删除，确定删除${projectName ? `“${escapeHtml(projectName)}”` : ""}？</p>
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
        <h3>${escapeHtml(group.label)} ·</h3>
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
