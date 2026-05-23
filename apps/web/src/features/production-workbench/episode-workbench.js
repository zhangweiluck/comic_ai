import { renderVideoGenerationPanel } from "./video-generation-panel.js";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";

const MEDIA_TABS = [
  { id: "image", label: "分镜图片" },
  { id: "video", label: "分镜视频" },
];

export function renderEpisodeWorkbench({
  storyboards = [],
  selectedStoryboard = null,
  isStoryboardDescriptionModalOpen = false,
  storyboardDescriptionDraft = "",
  selectedModelId = "vidu-q3-pro",
  prompt = "",
  busy = false,
  canParse = false,
  canCalibrate = false,
  canGenerateImages = false,
  canGenerateVideos = false,
  validationMessage = "",
  calibrationSkipReason = "",
  calibrationOverrideReason = "",
  imageGenerationResult = null,
  videoGenerationResult = null,
  mediaMode = "image",
  videoMode = "first-frame",
  imageMode = "single-image",
} = {}) {
  return `
    <section id="storyboard-workbench" class="storyboard-workbench cinematic-layout" aria-label="分镜工作台">
      <button
        class="episode-workbench-back-button"
        type="button"
        data-action="back-to-episode-hub"
        aria-label="返回上一页"
      >
        <span aria-hidden="true">←</span>
        <span>返回</span>
      </button>

      <button
        class="shot-sidebar-hero"
        type="button"
        data-action="parse-script"
        ${disabled(!canParse || busy)}
      >
        <span class="shot-sidebar-hero-icon" aria-hidden="true">↳</span>
        <strong>AI拆分镜</strong>
        <em>首次免费</em>
      </button>

      <header class="episode-media-header">
        <div class="episode-media-chrome">
          <div class="episode-media-tabs" role="tablist" aria-label="媒体类型">
            ${MEDIA_TABS.map((tab) => renderMediaTab(tab, mediaMode)).join("")}
          </div>
        </div>
      </header>

      <aside class="shot-sidebar cinematic-sidebar">
        <div class="shot-sidebar-head">
          <span>分镜(${storyboards.length})</span>
        </div>
        <div class="shot-stack">
          ${renderStoryboardList(storyboards, selectedStoryboard?.id)}
        </div>
        <div class="shot-sidebar-actions">
          <button class="timeline-button" type="button" data-action="preview-export">进入时间线</button>
        </div>
      </aside>

      <section class="shot-stage cinematic-stage">
        <div class="shot-stage-head cinematic-stage-head">
          <strong>分镜描述：${escapeHtml(selectedStoryboard?.description ?? "请填写分镜描述，记录分镜对应的画面内容。")}</strong>
          <button class="icon-button" type="button" data-action="open-storyboard-description-modal" aria-label="编辑描述">✎</button>
        </div>
        ${renderStoryboardStage(selectedStoryboard, mediaMode)}
      </section>

      ${renderVideoGenerationPanel({
        selectedModelId,
        prompt,
        busy,
        selectedShot: selectedStoryboard,
        canCalibrate,
        canGenerateImages,
        canGenerateVideos,
        validationMessage,
        calibrationSkipReason,
        calibrationOverrideReason,
        imageGenerationResult,
        videoGenerationResult,
        mediaMode,
        videoMode,
        imageMode,
      })}
      ${renderGenerationDiagnostics({ imageGenerationResult, videoGenerationResult })}
      ${renderStoryboardDescriptionModal({
        show: isStoryboardDescriptionModalOpen,
        value: storyboardDescriptionDraft,
        selectedStoryboard,
      })}
    </section>
  `;
}

function renderMediaTab(tab, activeMode) {
  const active = tab.id === activeMode;
  return `
    <button
      class="episode-media-tab ${active ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${active}"
      data-action="set-episode-media-mode"
      data-mode="${escapeAttr(tab.id)}"
    >
      ${escapeHtml(tab.label)}
    </button>
  `;
}

function renderStoryboardList(storyboards, selectedStoryboardId) {
  const storyboardCards = storyboards.length
    ? storyboards
        .map((storyboard) => {
          const active = storyboard.id === selectedStoryboardId;
          const previewSource = storyboard.previewImageUrl ?? storyboard.previewVideo ?? storyboard.previewUrl ?? "";
          const previewIsVideo = Boolean(storyboard.previewVideo ?? storyboard.previewUrl?.match?.(/\.(mp4|mov|webm|m4v)(\?|$)/i));
          const previewClass = previewSource ? (previewIsVideo ? "has-video-preview" : "has-image-preview") : "empty-preview";
          return `
            <button
              class="shot-thumb cinematic-thumb ${previewClass} ${active ? "active" : ""}"
              type="button"
              data-action="select-storyboard"
              data-storyboard-id="${escapeAttr(storyboard.id)}"
            >
              <span>${escapeHtml(String(storyboard.index ?? ""))}</span>
              <strong>${escapeHtml(storyboard.status ?? "未定稿")}</strong>
              <em aria-hidden="true">${escapeHtml(storyboard.title ?? `分镜 ${storyboard.index ?? ""}`)}</em>
              <div class="shot-thumb-preview" aria-hidden="true">
                ${
                  previewSource
                    ? previewIsVideo
                      ? `<video src="${escapeAttr(previewSource)}" muted playsinline preload="metadata"></video><i>▶</i>`
                      : `<img src="${escapeAttr(previewSource)}" alt="" />`
                    : `<div class="shot-thumb-placeholder"><span aria-hidden="true"></span></div>`
                }
              </div>
            </button>
          `;
        })
        .join("")
    : `
      <div class="shot-thumb empty">
        <span>1</span>
        <strong>未定稿</strong>
        <em>空分镜</em>
      </div>
    `;

  return `
    ${storyboardCards}
    <button class="shot-thumb shot-add-card" type="button" data-action="add-storyboard">
      <span aria-hidden="true">+</span>
      <strong>添加分镜</strong>
    </button>
  `;
}

function renderStoryboardStage(selectedStoryboard, mediaMode) {
  if (!selectedStoryboard) {
    return `
      <div class="stage-empty cinematic-stage-empty">
        <div class="empty-folder" aria-hidden="true"></div>
        <p>请先创建或选择分镜。</p>
      </div>
    `;
  }

  if (mediaMode === "video") {
    return renderVideoUploadWorkspace(selectedStoryboard);
  }

  if (selectedStoryboard.imageStatus === "ready") {
    return renderStageResult("分镜图片已生成", "image", selectedStoryboard.status);
  }

  return `
    <div class="stage-empty cinematic-stage-empty">
      <div class="empty-folder cinematic-folder" aria-hidden="true"></div>
      <p>请在右侧填写分镜信息生成分镜图。</p>
      <button class="stage-inline-link" type="button">本地上传分镜图</button>
    </div>
  `;
}

function renderVideoUploadWorkspace(selectedStoryboard) {
  const uploadedVideos = Array.isArray(selectedStoryboard.uploadedVideos) ? selectedStoryboard.uploadedVideos : [];
  if (!uploadedVideos.length) {
    return `
      <div class="stage-empty cinematic-stage-empty cinematic-video-empty">
        <div class="empty-folder cinematic-folder" aria-hidden="true"></div>
        <p>请在右侧输入视频提示词生成分镜视频。</p>
        <div class="stage-empty-actions">
          <span>或</span>
          <button
            class="stage-inline-link stage-inline-link-button"
            type="button"
            data-action="pick-local-video-upload"
            data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
          >
            本地上传视频
          </button>
        </div>
        <input
          class="local-video-upload-input"
          type="file"
          accept="video/*"
          multiple
          data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
          hidden
        />
      </div>
    `;
  }

  return `
    <section class="stage-video-library" aria-label="本地视频库">
      ${renderVideoSectionHeader("分镜视频", uploadedVideos.length, selectedStoryboard.id)}
      <section class="stage-video-group">
        <header class="stage-video-group-head">
          <strong>定稿视频 (${selectedStoryboard.selectedUploadedVideoId ? 1 : 0})</strong>
          <button
            class="stage-upload-trigger"
            type="button"
            data-action="pick-local-video-upload"
            data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
          >
            本地上传
          </button>
        </header>
        ${
          selectedStoryboard.selectedUploadedVideoId
            ? renderPinnedVideo(
                uploadedVideos.find((item) => item.id === selectedStoryboard.selectedUploadedVideoId) ?? null,
                selectedStoryboard.id,
              )
            : `<div class="stage-video-empty compact"><p>定稿素材支持单独导出、加入至时间线</p></div>`
        }
      </section>
      <section class="stage-video-group">
        <header class="stage-video-group-head">
          <strong>全部视频 (${uploadedVideos.length})</strong>
        </header>
        ${renderVideoGrid(uploadedVideos, selectedStoryboard.selectedUploadedVideoId)}
      </section>
      <input
        class="local-video-upload-input"
        type="file"
        accept="video/*"
        multiple
        data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
        hidden
      />
    </section>
  `;
}

function renderVideoSectionHeader(label, count) {
  return `
    <header class="stage-video-group-head stage-video-upload-head">
      <strong>${escapeHtml(label)}</strong>
      <span>${count}</span>
    </header>
  `;
}

function renderVideoGrid(items, selectedVideoId) {
  return `
    <div class="stage-video-grid">
      ${items.map((item) => renderUploadedVideoCard(item, item.id === selectedVideoId)).join("")}
    </div>
  `;
}

function renderPinnedVideo(item, storyboardId) {
  if (!item) {
    return `<div class="stage-video-empty compact"><p>请选择一个视频作为定稿视频</p></div>`;
  }

  return `
    <article class="uploaded-video-card active pinned">
      <div class="uploaded-video-card-inner media">
        ${item.src ? `<video src="${escapeAttr(item.src)}" muted playsinline preload="metadata"></video>` : ""}
        <span class="uploaded-video-duration">${escapeHtml(item.durationLabel ?? "00:10")}</span>
        <span class="uploaded-video-badge">定稿</span>
        <button
          class="uploaded-video-select"
          type="button"
          data-action="select-uploaded-video"
          data-video-id="${escapeAttr(item.id)}"
          aria-label="选择定稿视频"
        ></button>
      </div>
      <button
        class="uploaded-video-primary-action"
        type="button"
        data-action="clear-selected-uploaded-video"
        data-storyboard-id="${escapeAttr(storyboardId)}"
      >
        取消定稿
      </button>
    </article>
  `;
}

function renderUploadedVideoCard(item, active) {
  return `
    <article class="uploaded-video-card ${active ? "active" : ""}">
      <div class="uploaded-video-card-inner media">
        ${item.src ? `<video src="${escapeAttr(item.src)}" muted playsinline preload="metadata"></video>` : ""}
        <span class="uploaded-video-duration">${escapeHtml(item.durationLabel ?? "00:10")}</span>
        ${active ? `<span class="uploaded-video-badge">定稿</span>` : ""}
        <button
          class="uploaded-video-select"
          type="button"
          data-action="select-uploaded-video"
          data-video-id="${escapeAttr(item.id)}"
          aria-label="选择视频"
        ></button>
      </div>
    </article>
  `;
}

function renderStageResult(title, kind, status) {
  return `
    <article class="stage-result ${kind}">
      <div class="result-frame">
        <span>${kind === "video" ? "▶" : "◀"}</span>
      </div>
      <h3>${escapeHtml(title)}</h3>
      <p>状态：${escapeHtml(status)}</p>
    </article>
  `;
}

function renderGenerationDiagnostics({ imageGenerationResult, videoGenerationResult }) {
  const panels = [
    renderGenerationPanel("图片工作流", imageGenerationResult),
    renderGenerationPanel("视频工作流", videoGenerationResult),
  ].filter(Boolean);

  if (!panels.length) {
    return "";
  }

  return `
    <section class="generation-diagnostics" aria-label="Generation diagnostics">
      <header class="generation-diagnostics-head">
        <strong>工作流详情</strong>
        <span>任务、供应商和存储追踪</span>
      </header>
      <div class="generation-diagnostics-grid">${panels.join("")}</div>
    </section>
  `;
}

function renderGenerationPanel(label, result) {
  const platform = result?.platform;
  if (!platform) return "";
  const tasks = Array.isArray(platform.tasks) ? platform.tasks : [];
  return `
    <article class="generation-diagnostics-card">
      <header><strong>${escapeHtml(label)}</strong><span>workflow ${escapeHtml(platform.workflowId ?? "")}</span></header>
      <div class="generation-diagnostics-meta">
        <span>状态：${escapeHtml(platform.workflowStatus ?? "unknown")}</span>
        <span>任务数：${tasks.length}</span>
      </div>
      <ul class="generation-diagnostics-list">
        ${tasks
          .map(
            (task) => `
              <li>
                <strong>${escapeHtml(task.shotId ?? "")}</strong>
                <span>${escapeHtml(task.taskId ?? "")}</span>
                <small>${escapeHtml(task.providerRequestId ?? "")} / ${escapeHtml(task.storageObjectKey ?? "")}</small>
              </li>
            `,
          )
          .join("")}
      </ul>
    </article>
  `;
}

function renderStoryboardDescriptionModal({ show, value, selectedStoryboard }) {
  if (!show || !selectedStoryboard) return "";
  return `
    <section
      class="modal-backdrop storyboard-description-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="storyboard-description-dialog"
    >
      <button
        class="modal-backdrop-hit"
        type="button"
        data-action="close-storyboard-description-modal"
        aria-label="关闭分镜描述弹窗"
      ></button>
      <div class="single-episode-modal storyboard-description-modal">
        <div class="single-episode-modal-head storyboard-description-head">
          <h2>分镜描述</h2>
          <button
            class="modal-close"
            type="button"
            data-action="close-storyboard-description-modal"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <label class="single-episode-field storyboard-description-field">
          <textarea
            id="storyboard-description-input"
            placeholder="请填写分镜描述，记录分镜对应的画面内容"
          >${escapeHtml(value ?? "")}</textarea>
        </label>
        <div class="single-episode-actions storyboard-description-actions">
          <button
            class="secondary-action compact"
            type="button"
            data-action="close-storyboard-description-modal"
          >
            取消
          </button>
          <button
            class="primary-action compact"
            type="button"
            data-action="save-storyboard-description"
          >
            确认修改
          </button>
        </div>
      </div>
    </section>
  `;
}
