import { renderAssetExtractModal } from "./asset-extract-modal.js";
import { renderEpisodeWorkbench } from "./episode-workbench.js";
import { renderExportPanel } from "./export-panel.js";
import { renderProjectCreateModal } from "./project-create-modal.js";
import { getProjectDetailState } from "./storyboard-state.js";
import { disabled, escapeHtml } from "./markup.js";

const NAV_TABS = [
  { id: "home", label: "首页", glyph: "⌂" },
  { id: "script", label: "剧本", glyph: "⌘" },
  { id: "project", label: "项目", glyph: "▣" },
  { id: "library", label: "资产库", glyph: "◇" },
  { id: "tools", label: "工具箱", glyph: "✦" },
  { id: "team", label: "团队", glyph: "◌" },
];

const GROUPS = [
  { key: "characters", group: "character", label: "角色", accent: "violet" },
  { key: "scenes", group: "scene", label: "场景", accent: "teal" },
  { key: "props", group: "prop", label: "道具", accent: "amber" },
  { key: "others", group: "other", label: "其他", accent: "slate" },
];

export function renderProjectDetail(context = {}) {
  const { state = {}, ui = {}, session = { user: { phone: "" } } } = context;
  const detailState = getProjectDetailState(state);
  const progress = getProgress(state);
  const activeNavTab = ui.activeNavTab ?? "home";

  return `
    <section class="production-workbench">
      <aside class="workbench-rail persistent" aria-label="工作台导航">
        <nav class="rail-nav" role="tablist" aria-label="主导航">
          ${NAV_TABS.map((tab) => renderRailTab(tab, activeNavTab)).join("")}
        </nav>
        <button class="rail-item rail-bottom" type="button" data-action="logout">退出</button>
      </aside>

      <section class="workbench-main ${activeNavTab === "home" ? "home-mode" : ""}">
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
  `;
}

function renderMainPanel({ state, ui, session, detailState, progress, activeNavTab }) {
  if (activeNavTab === "home") {
    return renderHomeHero({ session, detailState });
  }

  if (activeNavTab === "script") {
    return `
      ${renderWorkbenchHeader({ state, session, detailState, progress, ui })}
      <section class="script-tab-panel">
        <div class="script-tab-copy">
          <p class="section-kicker">剧本入口</p>
          <h2>脚本与分镜单</h2>
          <p>从剧本库、剧本上传或分镜单上传继续进入生产工作流。左侧菜单保持常驻，点击只切换这里的内容区。</p>
        </div>
        <div class="script-tab-actions">
          <button id="script-upload-button" class="primary-action" type="button" data-action="open-script-modal">打开上传面板</button>
          <button id="parse-script-button" class="secondary-action" type="button" data-action="parse-script" ${disabled(!state.project || ui.busy)}>AI拆分镜</button>
        </div>
      </section>
      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已连接到本地 creator API。")}</p>
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
    return renderProjectGallery({ state, session, detailState, ui });
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
        (ui.selectedStoryboard?.imageStatus === "ready") ||
          state.shots?.some((shot) => shot.currentImageAssetVersionId),
      ),
      validationMessage: ui.validationMessage ?? "",
    })}

    ${renderExportPanel({
      exportPreview: state.exportPreview,
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
        <button id="script-upload-button" class="secondary-action" type="button" data-action="open-script-modal">AI智能提取资产</button>
        <button id="parse-script-button" class="primary-action" type="button" data-action="parse-script" ${disabled(!state.project || ui.busy)}>AI拆分镜</button>
      </div>
    </header>
  `;
}

function renderHomeHero({ session, detailState }) {
  return `
    <section class="home-hero" aria-label="首页">
      <div class="hero-overlay"></div>
      <header class="hero-topbar">
        <div class="hero-topbar-spacer"></div>
        <div class="hero-chip-row">
          <div class="hero-banner">限时特惠 免排队</div>
          <button class="hero-chip" type="button">创作手册</button>
          <button class="hero-chip" type="button">商务合作</button>
          <button class="hero-chip" type="button">✦ 0</button>
          <button class="hero-avatar" type="button" aria-label="账号">${escapeHtml(session.user.phone.slice(-2) || "我")}</button>
        </div>
      </header>

      <div class="hero-content">
        <div class="hero-brand-lockup">
          <div class="hero-brand-mark">N</div>
          <div class="hero-brand-text">万兴剧厂</div>
        </div>
        <h1 class="hero-title">您的专属AI电影工作室</h1>
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

function renderProjectGallery({ state, detailState, ui }) {
  const projects = ui.projectLibrary ?? [];
  const searchQuery = String(ui.projectSearchQuery ?? "").trim();
  const filteredProjects = filterProjects(projects, searchQuery);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const currentPage = clampPage(ui.projectLibraryPage ?? 1, totalPages);
  const visibleProjects = paginateProjects(filteredProjects, currentPage, pageSize);
  const hasProject = filteredProjects.length > 0;

  return `
    <section class="project-gallery-shell">
      <header class="project-gallery-header">
        <div>
          <h1>全部项目(${filteredProjects.length})</h1>
        </div>
        <div class="project-gallery-filters">
          <button class="gallery-filter" type="button">项目状态</button>
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
          hasProject
            ? visibleProjects.map((project) => renderProjectCard(project)).join("")
            : renderEmptyProjectState(searchQuery)
        }
      </section>

      ${
        filteredProjects.length > pageSize
          ? renderProjectPagination({
              currentPage,
              totalPages,
            })
          : ""
      }

      <div class="project-gallery-footer">
        <button class="hero-cta gallery-create-button" type="button" data-action="open-create-modal">创建项目</button>
      </div>

      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已连接到本地 creator API。")}</p>
    </section>
  `;
}

function renderProjectCard(project) {
  return `
    <article class="project-gallery-card" data-action="open-project-workspace" data-project-id="${escapeHtml(project.id)}">
      <div class="project-gallery-poster">
        <div class="project-gallery-poster-mark">▶</div>
      </div>
      <div class="project-gallery-meta">
        <div>
          <h2>${escapeHtml(project.name)}</h2>
          <p>创建于：${escapeHtml(project.createdAt ?? "2026/05/21")}</p>
        </div>
        <button class="secondary-action compact" type="button" data-action="open-project-workspace" data-project-id="${escapeHtml(project.id)}">进入工作台</button>
      </div>
    </article>
  `;
}

function renderEmptyProjectState(searchQuery) {
  if (searchQuery) {
    return '<article class="project-empty-card"><strong>未找到匹配项目</strong><span>试试别的关键词，或清空搜索查看全部项目。</span></article>';
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
      <span class="rail-glyph" aria-hidden="true">${tab.glyph}</span>
      <span class="rail-label">${tab.label}</span>
    </button>
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
  const candidates =
    group.key === "others"
      ? []
      : state.assetCandidates?.[group.key] ?? [];
  const total =
    group.key === "others"
      ? detailState.assets.others
      : detailState.assets[group.key];
  const confirmed =
    group.key === "others"
      ? 0
      : candidates.filter((candidate) => candidate.confirmed).length;

  return `
    <article class="asset-card ${group.accent}">
      <div class="asset-art" aria-hidden="true"></div>
      <div class="asset-card-head">
        <h3>${escapeHtml(group.label)} ›</h3>
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
