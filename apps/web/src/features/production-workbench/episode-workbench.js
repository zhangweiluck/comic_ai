import { renderVideoGenerationPanel } from "./video-generation-panel.js";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";

export function renderEpisodeWorkbench({
  storyboards = [],
  selectedStoryboard = null,
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
} = {}) {
  return `
    <section id="storyboard-workbench" class="storyboard-workbench" aria-label="分镜工作台">
      <aside class="shot-sidebar">
        <div class="shot-sidebar-head">
          <span>分镜(${storyboards.length})</span>
          <button class="icon-button" type="button" data-action="add-storyboard">＋</button>
        </div>
        <div class="shot-stack">
          ${renderStoryboardList(storyboards, selectedStoryboard?.id)}
        </div>
        <div class="shot-sidebar-actions">
          <button class="secondary-action compact" type="button" data-action="parse-script" ${disabled(!canParse || busy)}>AI拆分镜</button>
          <button class="timeline-button" type="button" data-action="preview-export">进入时间线</button>
        </div>
      </aside>

      <section class="shot-stage">
        <div class="shot-stage-head">
          <span>分镜描述：${escapeHtml(selectedStoryboard?.description ?? "暂无分镜")}</span>
          <button class="icon-button" type="button" aria-label="编辑描述">✎</button>
        </div>
        ${renderStoryboardStage(selectedStoryboard)}
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
      })}
      ${renderGenerationDiagnostics({ imageGenerationResult, videoGenerationResult })}
    </section>
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
      <div class="generation-diagnostics-grid">
        ${panels.join("")}
      </div>
    </section>
  `;
}

function renderGenerationPanel(label, result) {
  const platform = result?.platform;
  if (!platform) {
    return "";
  }

  const tasks = Array.isArray(platform.tasks) ? platform.tasks : [];
  return `
    <article class="generation-diagnostics-card">
      <header>
        <strong>${escapeHtml(label)}</strong>
        <span>workflow ${escapeHtml(platform.workflowId ?? "")}</span>
      </header>
      <div class="generation-diagnostics-meta">
        <span>状态：${escapeHtml(platform.workflowStatus ?? "unknown")}</span>
        <span>任务数：${tasks.length}</span>
      </div>
      <ul class="generation-diagnostics-list">
        ${tasks
          .map(
            (task) => `
              <li>
                <strong>${escapeHtml(task.shotId)}</strong>
                <span>${escapeHtml(task.taskId)}</span>
                <small>${escapeHtml(task.providerRequestId)} · ${escapeHtml(task.storageObjectKey)}</small>
              </li>
            `,
          )
          .join("")}
      </ul>
    </article>
  `;
}

function renderStoryboardList(storyboards, selectedStoryboardId) {
  return storyboards
    .map(
      (storyboard) => `
        <button class="shot-thumb ${storyboard.id === selectedStoryboardId ? "active" : ""}" type="button" data-action="select-storyboard" data-storyboard-id="${escapeAttr(storyboard.id)}">
          <span>${storyboard.index}</span>
          <strong>${escapeHtml(storyboard.status)}</strong>
          <em>${escapeHtml(`分镜(${storyboard.index})`)}</em>
        </button>
      `,
    )
    .join("");
}

function renderStoryboardStage(selectedStoryboard) {
  if (!selectedStoryboard) {
    return `
      <div class="stage-empty">
        <div class="empty-folder" aria-hidden="true"></div>
        <p>请先上传剧本并拆分镜。</p>
      </div>
    `;
  }

  if (selectedStoryboard.videoStatus === "ready") {
    return renderStageResult("分镜视频已生成", "video", selectedStoryboard.status);
  }
  if (selectedStoryboard.imageStatus === "ready") {
    return renderStageResult("分镜图片已生成", "image", selectedStoryboard.status);
  }
  return `
    <div class="stage-empty">
      <div class="empty-folder" aria-hidden="true"></div>
      <p>请在右侧先生成首帧图片，再提交分镜视频。</p>
    </div>
  `;
}

function renderStageResult(title, kind, status) {
  return `
    <article class="stage-result ${kind}">
      <div class="result-frame">
        <span>${kind === "video" ? "▶" : "▧"}</span>
      </div>
      <h3>${escapeHtml(title)}</h3>
      <p>状态：${escapeHtml(status)}</p>
    </article>
  `;
}
