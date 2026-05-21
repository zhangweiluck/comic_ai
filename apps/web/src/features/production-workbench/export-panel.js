import { disabled, escapeHtml } from "./markup.js";

export function renderExportPanel({
  exportPreview = null,
  busy = false,
  canPreview = false,
} = {}) {
  const missingAssets = exportPreview?.missingAssets ?? [];
  return `
    <section class="export-panel" aria-label="导出预览">
      <div>
        <p class="section-kicker">交付</p>
        <h2>导出素材包</h2>
      </div>
      <div class="export-summary">
        <span>${escapeHtml(exportPreview?.status ?? "未生成")}</span>
        <span>${exportPreview?.items?.length ?? 0} 个条目</span>
        <span>${missingAssets.length} 个缺失资产</span>
      </div>
      <div class="export-detail">
        <p class="download-placeholder">下载链接将在导出完成后显示</p>
        ${
          missingAssets.length
            ? `
              <div class="export-warning">
                <strong>缺失资产</strong>
                <ul>
                  ${missingAssets
                    .map(
                      (asset) =>
                        `<li>${escapeHtml(asset.title)} · ${escapeHtml(asset.missing)}</li>`,
                    )
                    .join("")}
                </ul>
                <p>当前存在缺失资产，暂不允许不完整导出。</p>
              </div>
            `
            : ""
        }
      </div>
      <button id="preview-export-button" class="primary-action compact" type="button" data-action="preview-export" ${disabled(!canPreview || busy)}>
        导出预览
      </button>
    </section>
  `;
}
