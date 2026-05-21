import { disabled, escapeHtml } from "./markup.js";

const PROJECT_TYPES = [
  {
    value: "domestic-live",
    label: "国内仿真人剧",
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
  },
  {
    value: "overseas-live",
    label: "海外仿真人剧",
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  },
  {
    value: "anime",
    label: "2D/3D动漫",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80",
  },
];

export function renderProjectCreateModal({
  show = false,
  busy = false,
  defaultName = "",
  selectedAspectRatio = "9:16",
  selectedProjectType = "anime",
  notice = "",
} = {}) {
  if (!show) {
    return "";
  }

  return `
    <section class="modal-backdrop create-project-backdrop" role="dialog" aria-modal="true" aria-label="新建项目">
      <div class="create-project-modal">
        <div class="create-modal-head">
          <h2>新建项目</h2>
          <button class="modal-close" type="button" data-action="close-create-modal" aria-label="关闭">×</button>
        </div>

        <div class="create-modal-body">
          <label class="control-field project-name-field">
            <span>项目名称 <em>*</em></span>
            <input
              id="project-create-name-input"
              type="text"
              maxlength="50"
              value="${escapeHtml(defaultName)}"
              placeholder="请输入项目名称"
            />
            <small class="field-count">${defaultName.length}/50</small>
          </label>

          <fieldset class="create-fieldset">
            <legend>画面比例 <em>*</em></legend>
            <p class="create-field-note">比例选择会影响后续剧集分镜生成，确认后建议保持一致。</p>
            <div class="aspect-ratio-grid">
              ${renderAspectChoice("9:16", "9:16 竖屏", selectedAspectRatio)}
              ${renderAspectChoice("16:9", "16:9 横屏", selectedAspectRatio)}
            </div>
          </fieldset>

          <fieldset class="create-fieldset">
            <legend>剧目类型 <em>*</em></legend>
            <div class="project-type-grid">
              ${PROJECT_TYPES.map((type) => renderProjectType(type, selectedProjectType)).join("")}
            </div>
          </fieldset>
        </div>

        <div class="create-modal-actions">
          <p class="modal-inline-status">${escapeHtml(notice)}</p>
          <button id="create-project-button" class="primary-action create-confirm-button" type="button" data-action="create-project" ${disabled(busy)}>
            确认
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderAspectChoice(value, label, selectedValue) {
  return `
    <label class="choice-tile ${value === selectedValue ? "selected" : ""}">
      <input type="radio" name="project-aspect-ratio" value="${value}" ${value === selectedValue ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function renderProjectType(type, selectedValue) {
  return `
    <label class="project-type-card ${type.value === selectedValue ? "selected" : ""}">
      <input type="radio" name="project-type" value="${type.value}" ${type.value === selectedValue ? "checked" : ""} />
      <img src="${type.image}" alt="${type.label}" />
      <span>${type.label}</span>
    </label>
  `;
}
