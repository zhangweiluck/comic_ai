import { disabled, escapeAttr, escapeHtml } from "./markup.js";

export const videoModels = [
  { id: "happy-horse", name: "Happy Horse", tags: ["快速", "低成本"], credits: 12 },
  {
    id: "vidu-q3-pro",
    name: "Vidu Q3-Pro",
    tags: ["首尾帧", "音频生成", "口型同步"],
    credits: 23,
  },
  { id: "vidu-q2", name: "Vidu Q2", tags: ["首帧", "稳定"], credits: 18 },
  { id: "jimeng-3-pro-fast", name: "即梦3.0 Pro - Fast", tags: ["快速"], credits: 16 },
  { id: "jimeng-3-pro", name: "即梦3.0 Pro", tags: ["高质量"], credits: 22 },
  { id: "jimeng-3-5-pro", name: "即梦3.5 Pro", tags: ["高质量", "新模型"], credits: 28 },
  { id: "hailuo-2-3-fast", name: "Hailuo 2.3 - Fast", tags: ["快速"], credits: 15 },
];

export function validateVideoGeneration(input) {
  if (!input.firstFrameUploaded) {
    return { ok: false, message: "请上传完毕首帧图后提交生成任务" };
  }
  return { ok: true, message: "" };
}

export function renderVideoGenerationPanel({
  selectedModelId = "vidu-q3-pro",
  prompt = "",
  busy = false,
  selectedShot = null,
  canCalibrate = false,
  canGenerateImages = false,
  canGenerateVideos = false,
  validationMessage = "",
} = {}) {
  const selectedModel =
    videoModels.find((model) => model.id === selectedModelId) ?? videoModels[1];

  return `
    <aside id="generation-console" class="generation-console" aria-label="生成控制台">
      <div class="console-tabs">
        <button class="console-tab" type="button">分镜图片</button>
        <button class="console-tab active" type="button">分镜视频</button>
      </div>
      <label class="control-field">
        <span>模型</span>
        <select data-model-choice>
          ${videoModels
            .map(
              (model) =>
                `<option value="${escapeAttr(model.id)}" ${model.id === selectedModel.id ? "selected" : ""}>${escapeHtml(model.name)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <div class="model-list">
        ${videoModels.map((model) => renderModelOption(model, selectedModel.id)).join("")}
      </div>
      <div class="model-meta">
        <span>能力标签：${selectedModel.tags.map(escapeHtml).join(" / ")}</span>
        <span>积分消耗：${selectedModel.credits}</span>
      </div>
      <label class="control-field">
        <span>提示词</span>
        <textarea id="video-prompt-input" placeholder="请描述想要生成的视频内容">${escapeHtml(prompt || defaultPrompt(selectedShot))}</textarea>
      </label>
      <label class="sync-toggle">
        <span>音效、音乐及口型驱动</span>
        <input type="checkbox" checked />
      </label>
      <div class="console-actions">
        <button id="run-calibration-button" class="secondary-action" type="button" data-action="run-calibration" ${disabled(!canCalibrate || busy)}>校准</button>
        <button id="generate-images-button" class="secondary-action" type="button" data-action="generate-images" ${disabled(!canGenerateImages || busy)}>生成图片</button>
        <button id="generate-videos-button" class="secondary-action" type="button" data-action="generate-videos" ${disabled(!canGenerateVideos || busy)}>生成视频</button>
      </div>
      <p class="validation-copy">${escapeHtml(validationMessage)}</p>
      <button class="generate-now" type="button" data-action="smart-generate" ${disabled(busy)}>
        立即生成
      </button>
    </aside>
  `;
}

function renderModelOption(model, selectedModelId) {
  return `
    <label class="model-option ${model.id === selectedModelId ? "selected" : ""}">
      <input type="radio" name="video-model" value="${escapeAttr(model.id)}" ${model.id === selectedModelId ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(model.name)}</strong>
        <em>${escapeHtml(model.tags.join(" / "))} · ${model.credits}</em>
      </span>
    </label>
  `;
}

function defaultPrompt(selectedShot) {
  if (!selectedShot) {
    return "";
  }
  return `${selectedShot.description ?? selectedShot.title}，保持都市玄幻漫画质感，镜头运动平稳。`;
}
