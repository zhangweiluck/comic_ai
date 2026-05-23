import { disabled, escapeAttr, escapeHtml } from "./markup.js";

export const videoModels = [
  { id: "happy-horse", name: "Happy Horse", tags: ["Fast", "Lite"], credits: 12 },
  {
    id: "vidu-q3-pro",
    name: "Vidu Q3-Pro",
    tags: ["首尾帧", "音频生成", "口型同步"],
    credits: 23,
  },
  { id: "vidu-q2", name: "Vidu Q2", tags: ["首帧", "稳定"], credits: 18 },
  { id: "jimeng-3-pro-fast", name: "即梦3.0 Pro - Fast", tags: ["Fast"], credits: 16 },
  { id: "jimeng-3-pro", name: "即梦3.0 Pro", tags: ["高质量"], credits: 22 },
  { id: "jimeng-3-5-pro", name: "即梦3.5 Pro", tags: ["高质量", "新模型"], credits: 28 },
  { id: "hailuo-2-3-fast", name: "Hailuo 2.3 - Fast", tags: ["Fast"], credits: 15 },
];

const VIDEO_MODE_TABS = [
  { id: "first-frame", label: "首帧生视频", modelId: "vidu-q3-pro", credits: 23 },
  { id: "first-last-frame", label: "首尾帧生视频", modelId: "hailuo-2-3-fast", credits: 24 },
  { id: "reference-video", label: "参考生视频", modelId: "jimeng-3-pro-fast", credits: 47 },
  { id: "edit-video", label: "AI改视频", modelId: "happy-horse", credits: 18 },
];

const IMAGE_MODE_TABS = [
  { id: "single-image", label: "新增图片", modelId: "jimeng-3-5-pro", credits: 3 },
  { id: "multi-image", label: "多视图生成", modelId: "jimeng-3-pro", credits: 18 },
];

export function validateVideoGeneration(input) {
  if (!input.firstFrameUploaded) {
    return { ok: false, message: "请先上传首帧图后再提交视频生成任务" };
  }
  return { ok: true, message: "" };
}

export function renderVideoGenerationPanel({
  selectedModelId = "vidu-q3-pro",
  prompt = "",
  busy = false,
  selectedShot = null,
  canGenerateImages = false,
  canGenerateVideos = false,
  validationMessage = "",
  mediaMode = "image",
  videoMode = "first-frame",
  imageMode = "single-image",
} = {}) {
  const activeVideoMode =
    VIDEO_MODE_TABS.find((mode) => mode.id === videoMode) ?? VIDEO_MODE_TABS[0];
  const activeImageMode =
    IMAGE_MODE_TABS.find((mode) => mode.id === imageMode) ?? IMAGE_MODE_TABS[0];
  const activeMode = mediaMode === "video" ? activeVideoMode : activeImageMode;
  const selectedModel =
    videoModels.find((model) => model.id === selectedModelId) ??
    videoModels.find((model) => model.id === activeMode.modelId) ??
    videoModels[0];

  return `
    <aside id="generation-console" class="generation-console director-console" aria-label="生成控制台">
      <div class="console-panel-header">
        <div class="console-tabs" role="tablist" aria-label="生成方式">
          ${
            mediaMode === "video"
              ? VIDEO_MODE_TABS.map((mode) =>
                  renderSubTab(mode, "set-video-generation-mode", activeVideoMode.id),
                ).join("")
              : IMAGE_MODE_TABS.map((mode) =>
                  renderSubTab(mode, "set-image-generation-mode", activeImageMode.id),
                ).join("")
          }
        </div>
        <button class="console-menu-button" type="button" aria-label="更多">☰</button>
      </div>

      <section class="console-scroll">
        ${renderModelField(selectedModel)}
        ${
          mediaMode === "video"
            ? renderVideoModePanel(activeVideoMode, prompt, selectedShot)
            : renderImageModePanel(activeImageMode, prompt)
        }
      </section>

      <footer class="console-footer">
        <div class="console-credit-row">
          <span>积分消耗: ✦ ${activeMode.credits}</span>
          <span aria-hidden="true">⌄</span>
        </div>
        <p class="validation-copy">${escapeHtml(validationMessage)}</p>
        <button
          class="generate-now"
          type="button"
          data-action="${mediaMode === "video" ? "generate-videos" : "generate-images"}"
          ${disabled(busy || (mediaMode === "video" ? !canGenerateVideos : !canGenerateImages))}
        >
          立即生成
        </button>
        <small class="console-disclaimer">内容由 AI 生成，请仔细甄别</small>
      </footer>
    </aside>
  `;
}

function renderSubTab(tab, action, activeId) {
  const active = tab.id === activeId;
  return `
    <button
      class="console-tab ${active ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${active}"
      data-action="${escapeAttr(action)}"
      data-mode="${escapeAttr(tab.id)}"
    >
      ${escapeHtml(tab.label)}
    </button>
  `;
}

function renderModelField(selectedModel) {
  return `
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
  `;
}

function renderVideoModePanel(activeMode, prompt, selectedShot) {
  if (activeMode.id === "first-frame") {
    return `
      <section class="console-section-stack">
        ${renderUploadBlock("首帧图", "上传/拖拽图片", "或从 分镜图 / 项目资产 中选择")}
        ${renderPromptBlock(prompt || defaultPrompt(selectedShot), "请描述想要生成的视频内容")}
        ${renderToggleRow("音画回出", "音效、音乐及口型驱动", true)}
        ${renderSplitSelectRow("时长与分辨率", ["5秒"], ["1080p"])}
        ${renderCounterStrip("视频数量", ["1", "2", "3", "4"], 0)}
      </section>
    `;
  }

  if (activeMode.id === "first-last-frame") {
    return `
      <section class="console-section-stack">
        <div class="dual-upload-grid">
          ${renderUploadCard("首帧", "上传/拖拽图片", "或从 分镜图 / 项目资产 中选择")}
          ${renderUploadCard("尾帧", "上传/拖拽图片", "或从 分镜图 / 项目资产 中选择")}
        </div>
        ${renderPromptBlock(prompt || defaultPrompt(selectedShot), "请描述想要生成的视频内容")}
        ${renderSplitSelectRow("时长与分辨率", ["6秒"], ["1080p"])}
        ${renderCounterStrip("视频数量", ["1", "2", "3", "4"], 0)}
      </section>
    `;
  }

  if (activeMode.id === "reference-video") {
    return `
      <section class="console-section-stack">
        <p class="console-note">为保证 Seedance 2.0 生成效果，请确保角色/合人物的图片均已保存为 Seedance 2.0 主体并审核成功</p>
        <p class="console-subnote">已上传素材数: 图片 0/9，视频 0/3，音频 0/3，总素材数量 0/12</p>
        <div class="asset-pick-grid triple">
          ${renderAssetPickCard("添加角色")}
          ${renderAssetPickCard("添加场景")}
          ${renderAssetPickCard("添加道具")}
        </div>
        ${renderUploadBlock("上传参考素材", "上传本地图片/视频/音频", "或从 分镜图 / 素材库 / 剧本模板库 中选择", true)}
        ${renderPromptBlock(
          prompt || "上传 1 个或多个主体、图片，涵盖每个要素及其关系，描述想要生成的视频内容",
          "上传 1 个或多个主体、图片，涵盖每个要素及其关系，描述想要生成的视频内容",
          true,
        )}
        ${renderToggleRow("音画回出", "音效、音乐及口型驱动", true)}
        ${renderSplitSelectRow("时长与分辨率", ["5秒"], ["1080p 优惠版"])}
        ${renderCounterStrip("生成数量", ["1", "2", "3", "4"], 0)}
      </section>
    `;
  }

  return `
    <section class="console-section-stack">
      ${renderUploadBlock("上传视频", "上传/拖拽视频", "视频时长 3-10 秒，格式 MP4/MOV，大小 ≤200MB，帧率 24-60fps")}
      <div class="asset-pick-grid quad">
        ${renderAssetPickCard("添加参考图")}
        ${renderAssetPickCard("添加角色")}
        ${renderAssetPickCard("添加场景")}
        ${renderAssetPickCard("添加道具")}
      </div>
      ${renderPromptBlock(
        "描述视频修改需求，或上传图片，@ 对应图片，进行修改",
        "描述视频修改需求，或上传图片，@ 对应图片，进行修改",
      )}
      ${renderSingleSelectRow("分辨率", ["1080p"])}
    </section>
  `;
}

function renderImageModePanel(activeMode, prompt) {
  if (activeMode.id === "single-image") {
    return `
      <section class="console-section-stack">
        <p class="console-subnote">可上传素材数: 10</p>
        <div class="asset-pick-grid triple">
          ${renderAssetPickCard("添加角色")}
          ${renderAssetPickCard("添加场景")}
          ${renderAssetPickCard("添加道具")}
        </div>
        ${renderUploadBlock("上传参考图", "上传/拖拽图片", "或使用 构图模板库")}
        ${renderPromptBlock(
          prompt || "通过 @ 上传素材和参考图，描述图片合成要求，涵盖每个要素及其关系",
          "通过 @ 上传素材和参考图，描述图片合成要求，涵盖每个要素及其关系",
        )}
        ${renderCounterStrip("图片数量", ["1", "2", "3", "4"], 0)}
        ${renderSplitSelectRow("分辨率与比例", ["2K"], ["16:9"])}
      </section>
    `;
  }

  return `
    <section class="console-section-stack">
      ${renderUploadBlock("分镜图", "上传/拖拽图片", "或从 项目资产 中选择")}
      <div class="lock-character-row">
        <span>锁定分镜角色 <small>(增强角色一致性)</small></span>
        ${renderCompactAssetCard("+角色")}
      </div>
      <div class="mode-choice-row">
        <span>模式选择</span>
        <div class="mode-choice-grid">
          <button class="mode-choice active" type="button">
            <span class="mode-dot" aria-hidden="true"></span>
            空间多视角
          </button>
          <button class="mode-choice" type="button">
            <span class="mode-ring" aria-hidden="true"></span>
            分镜叙事规划
          </button>
        </div>
      </div>
      <div class="console-pill-counter">
        <span>多视图生成数量</span>
        <div>9 张</div>
      </div>
    </section>
  `;
}

function renderUploadBlock(title, heading, detail, compact = false) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      <div class="upload-panel ${compact ? "compact" : ""}">
        <span class="upload-icon" aria-hidden="true">⊕</span>
        <strong>${escapeHtml(heading)}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
    </section>
  `;
}

function renderUploadCard(label, heading, detail) {
  return `
    <section class="upload-card">
      <span>${escapeHtml(label)}</span>
      <div class="upload-card-body">
        <span class="upload-icon" aria-hidden="true">⊕</span>
        <strong>${escapeHtml(heading)}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
    </section>
  `;
}

function renderPromptBlock(value, placeholder, withPreset = false) {
  return `
    <section class="console-block">
      <div class="console-block-title prompt-title-row">
        <span>提示词</span>
        ${withPreset ? '<button class="prompt-preset" type="button">预设模板: 无</button>' : ""}
      </div>
      <label class="control-field prompt-field">
        <textarea id="video-prompt-input" placeholder="${escapeAttr(placeholder)}">${escapeHtml(value)}</textarea>
        <button class="prompt-magic-button" type="button" aria-label="提示词助手">✦</button>
      </label>
    </section>
  `;
}

function renderToggleRow(title, label, checked) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      <label class="sync-toggle polished-toggle">
        <span>${escapeHtml(label)} <small>NEW</small></span>
        <input type="checkbox" ${checked ? "checked" : ""} />
      </label>
    </section>
  `;
}

function renderSplitSelectRow(title, leftOptions, rightOptions) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      <div class="dual-select-row">
        ${renderSelectField(leftOptions)}
        ${renderSelectField(rightOptions)}
      </div>
    </section>
  `;
}

function renderSingleSelectRow(title, options) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      ${renderSelectField(options)}
    </section>
  `;
}

function renderSelectField(options) {
  return `
    <label class="control-field">
      <select>
        ${options.map((option) => `<option>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderCounterStrip(title, values, activeIndex) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      <div class="count-strip">
        ${values
          .map(
            (value, index) => `
              <button class="count-pill ${index === activeIndex ? "active" : ""}" type="button">
                ${escapeHtml(value)}
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderAssetPickCard(label) {
  return `
    <button class="asset-pick-card" type="button">
      <span class="asset-pick-icon" aria-hidden="true">⊕</span>
      <strong>${escapeHtml(label)}</strong>
    </button>
  `;
}

function renderCompactAssetCard(label) {
  return `
    <button class="asset-lock-card" type="button">
      <span class="asset-pick-icon" aria-hidden="true">⊕</span>
      <strong>${escapeHtml(label)}</strong>
    </button>
  `;
}

function defaultPrompt(selectedShot) {
  if (!selectedShot) {
    return "";
  }
  return `${selectedShot.description ?? selectedShot.title}，保持都市玄幻漫画质感，镜头运动平稳。`;
}
