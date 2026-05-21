import { escapeHtml, disabled } from "./markup.js";

export function renderAssetExtractModal({
  activeTab = "script-upload",
  show = false,
  uploadNotice = "",
  hasProject = false,
  defaultScript = "",
  busy = false,
} = {}) {
  if (!show) {
    return "";
  }

  return `
    <section class="modal-backdrop" role="dialog" aria-modal="true" aria-label="上传剧本">
      <div class="script-modal">
        <div class="modal-tabs">
          ${renderTab(activeTab, "script-library", "剧本库")}
          ${renderTab(activeTab, "script-upload", "剧本上传")}
          ${renderTab(activeTab, "storyboard-upload", "分镜单上传")}
          <button class="modal-close" type="button" data-action="close-script-modal" aria-label="关闭">×</button>
        </div>
        ${renderBody({ activeTab, hasProject, defaultScript })}
        <div class="modal-actions">
          <p class="modal-inline-status">${escapeHtml(uploadNotice)}</p>
          <button class="secondary-action" type="button" data-action="close-script-modal">取消</button>
          <button id="create-project-button" class="primary-action" type="button" data-action="create-project" ${disabled(busy)}>
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

function renderBody({ activeTab, hasProject, defaultScript }) {
  if (activeTab === "script-library") {
    return `
      <div class="modal-panel library-empty">
        <input class="modal-search" type="search" placeholder="搜索剧本" />
        <div class="library-placeholder">
          <strong>剧本库为空</strong>
          <span>当前没有可复用的剧本条目，可切换到剧本上传继续。</span>
        </div>
      </div>
    `;
  }

  if (activeTab === "storyboard-upload") {
    return `
      <div class="modal-panel storyboard-upload">
        <div class="format-card">
          <h3>分镜单格式说明</h3>
          <p>文本格式分镜单</p>
          <p>表格格式分镜单</p>
          <button type="button" class="secondary-action compact">下载模板</button>
        </div>
        <div class="drop-zone">
          <strong>点击或拖拽上传</strong>
          <span>doc/docx/txt/xls/xlsx</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="modal-panel upload-form">
      <p class="modal-note">请上传完整剧本，内容会创建为${hasProject ? "新的" : "当前"}项目脚本。</p>
      <label class="control-field">
        <span>项目名称</span>
        <input id="project-name-input" type="text" value="机械黎明测试片段" />
      </label>
      <label class="control-field">
        <span>剧本内容</span>
        <textarea id="script-input">${escapeHtml(defaultScript)}</textarea>
      </label>
      <div class="drop-zone">
        <strong>点击或拖拽上传</strong>
        <span>docx/txt</span>
      </div>
    </div>
  `;
}
