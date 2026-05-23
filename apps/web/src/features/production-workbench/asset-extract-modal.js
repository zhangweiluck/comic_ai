import { escapeHtml, disabled } from "./markup.js";

export function renderAssetExtractModal({
  activeTab = "script-upload",
  show = false,
  uploadNotice = "",
  busy = false,
  submitAction = "create-project",
  submitLabel = "确认上传",
} = {}) {
  if (!show) {
    return "";
  }

  return `
    <section class="modal-backdrop" role="dialog" aria-modal="true" aria-label="上传剧本">
      <div class="script-modal upload-studio-modal">
        <div class="modal-tabs">
          ${renderTab(activeTab, "script-library", "剧本库")}
          ${renderTab(activeTab, "script-upload", "剧本上传")}
          ${renderTab(activeTab, "storyboard-upload", "分镜单上传")}
          <button class="modal-close upload-modal-close" type="button" data-action="close-script-modal" aria-label="关闭">×</button>
        </div>
        ${renderBody(activeTab)}
        <div class="modal-actions upload-modal-actions">
          <p class="modal-inline-status">${escapeHtml(uploadNotice)}</p>
          <button
            id="create-project-button"
            class="primary-action upload-confirm-button"
            type="button"
            data-action="${escapeHtml(submitAction)}"
            ${disabled(busy)}
          >
            确认上传
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderTab(activeTab, tab, label) {
  return `
    <button class="modal-tab ${activeTab === tab ? "active" : ""}" type="button" data-action="switch-script-tab" data-tab="${tab}">
      ${label}
    </button>
  `;
}

function renderBody(activeTab) {
  if (activeTab === "script-library") {
    return `
      <div class="modal-panel library-empty upload-library-panel">
        <input class="modal-search" type="search" placeholder="搜索剧本" />
        <div class="library-placeholder">
          <strong>剧本库为空</strong>
          <span>当前还没有可复用的剧本条目，可切换到上传标签继续创建。</span>
        </div>
      </div>
    `;
  }

  if (activeTab === "storyboard-upload") {
    return renderStoryboardUploadPanel();
  }

  return renderScriptUploadPanel();
}

function renderScriptUploadPanel() {
  return `
    <div class="modal-panel upload-panel-stack">
      <p class="upload-tip-line">
        <span class="upload-tip-icon" aria-hidden="true">ⓘ</span>
        请上传完整剧本，剧本里的内容需标注“第x集”，
        <button type="button" class="upload-tip-link">查看示例</button>
      </p>
      ${renderUploadZone({
        title: "点击上传或直接拖拽剧本文档至框体内",
        formats: "支持docx/txt格式",
        icon: "script",
      })}
    </div>
  `;
}

function renderStoryboardUploadPanel() {
  return `
    <div class="modal-panel storyboard-upload-shell">
      <aside class="storyboard-guide-card">
        <div class="storyboard-guide-copy">
          <h3>分镜单格式说明</h3>
          <p>分镜单需含集数、镜号、画面描述和台词等信息。上传后会严格遵循你的分镜规划；若需 AI 优化分镜，建议仍从剧本上传开始。</p>
        </div>

        <section class="storyboard-format-block">
          <div class="storyboard-format-head">
            <strong>文本样式分镜单</strong>
            <button type="button" class="secondary-action compact template-button">下载模板</button>
          </div>
          <p>以 Word 文件上传，每集分镜单前标注“第x集”，每个分镜前注明“镜号”。</p>
          <div class="storyboard-sample script" aria-hidden="true">
            <span>点击放大查看</span>
          </div>
        </section>

        <section class="storyboard-format-block">
          <div class="storyboard-format-head">
            <strong>表格样式分镜单</strong>
            <button type="button" class="secondary-action compact template-button">下载模板</button>
          </div>
          <p>以 Excel 文件上传，表格首行为字段名，并单设镜号列；每个 Sheet 代表 1 集，并以“第x集”命名。</p>
          <div class="storyboard-sample sheet" aria-hidden="true">
            <span>点击放大查看</span>
          </div>
        </section>
      </aside>

      ${renderUploadZone({
        title: "点击上传或直接拖拽分镜单文档至框体内",
        formats: "支持doc/docx/txt/xls/xlsx格式",
        icon: "storyboard",
        className: "wide",
      })}
    </div>
  `;
}

function renderUploadZone({ title, formats, icon, className = "" }) {
  const classes = ["upload-dropzone", className].filter(Boolean).join(" ");
  return `
    <button class="${classes}" type="button">
      <span class="upload-dropzone-icon ${icon}" aria-hidden="true">${renderUploadGlyph(icon)}</span>
      <strong>${title}</strong>
      <span>${formats}</span>
    </button>
  `;
}

function renderUploadGlyph(icon) {
  if (icon === "storyboard") {
    return `
      <svg viewBox="0 0 48 48" focusable="false">
        <path d="M14 10h20a4 4 0 0 1 4 4v8" />
        <path d="M14 18h20" />
        <path d="M22 10v12" />
        <path d="M14 28h8" />
        <path d="M29 26v12" />
        <path d="m24 33 5-5 5 5" />
        <path d="M10 28h12v10H10z" />
        <path d="M10 40h28" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 48 48" focusable="false">
      <path d="M15 8h11l9 9v23a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3Z" />
      <path d="M26 8v10h10" />
      <path d="M24 35V22" />
      <path d="m19 27 5-5 5 5" />
      <path d="M17 38h14" />
    </svg>
  `;
}
