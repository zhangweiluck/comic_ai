import { disabled, escapeAttr, escapeHtml } from "./markup.js";

export function renderExportPanel({
  exportPreview = null,
  exportHistory = [],
  exportPreviewResult = null,
  busy = false,
  canPreview = false,
} = {}) {
  const missingAssets = exportPreview?.missingAssets ?? [];
  const statusLabel = exportPreview?.status ?? "Not generated";
  const platform = exportPreviewResult?.platform ?? null;
  const exportRecord = exportPreviewResult?.exportRecord ?? platform?.exportRecord ?? null;

  return `
    <section class="export-panel" aria-label="导出预览">
      <div class="export-panel-head">
        <div>
          <p class="section-kicker">交付</p>
          <h2>导出素材包</h2>
        </div>
        <div class="export-summary">
          <span>${escapeHtml(statusLabel)}</span>
          <span>${exportPreview?.items?.length ?? 0} items</span>
          <span>${missingAssets.length} missing</span>
        </div>
      </div>
      <div class="export-detail">
        <p class="download-placeholder">下载链接会在预览完成后显示。</p>
        ${renderExportDelivery({ platform, exportRecord })}
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
                <p>当前仍有镜头缺少成片图片，暂不允许不完整导出。</p>
              </div>
            `
            : ""
        }
      </div>
      <div class="export-history">
        <div class="export-history-head">
          <strong>导出历史</strong>
          <span>${exportHistory.length} records</span>
        </div>
        ${
          exportHistory.length
            ? `
              <ul class="export-history-list">
                ${exportHistory
                  .map(
                    (record) => `
                      <li class="export-history-item">
                        <div>
                          <strong>${escapeHtml(record.manifestStatus ?? "unknown")}</strong>
                          <span>${escapeHtml(formatExportHistoryMeta(record))}</span>
                        </div>
                        <small>${escapeHtml(formatExportHistoryTime(record))}</small>
                      </li>
                    `,
                  )
                  .join("")}
              </ul>
            `
            : '<p class="export-history-empty">暂无导出记录</p>'
        }
      </div>
      <button id="preview-export-button" class="primary-action compact" type="button" data-action="preview-export" ${disabled(!canPreview || busy)}>
        导出预览
      </button>
    </section>
  `;
}

function renderExportDelivery({ platform, exportRecord }) {
  if (!platform && !exportRecord) {
    return "";
  }

  const signedUrl = platform?.signedUrl ?? "";
  const expiresAt = platform?.expiresAt ?? exportRecord?.latestSignedUrlExpiresAt ?? "";

  return `
    <section class="export-delivery-card" aria-label="导出交付详情">
      <header>
        <strong>交付详情</strong>
        <span>${escapeHtml(platform?.workflowStatus ?? exportRecord?.manifestStatus ?? "unknown")}</span>
      </header>
      ${
        signedUrl
          ? `<a class="export-download-link" href="${escapeAttr(signedUrl)}" target="_blank" rel="noreferrer">打开签名下载链接</a>`
          : '<span class="export-download-muted">暂无签名下载链接</span>'
      }
      <dl class="export-delivery-grid">
        ${renderDeliveryRow("工作流", platform?.workflowId ?? exportRecord?.workflowId)}
        ${renderDeliveryRow("任务", platform?.taskId)}
        ${renderDeliveryRow("存储对象", platform?.storageObjectId ?? exportRecord?.storageObjectId)}
        ${renderDeliveryRow("对象 Key", platform?.storageObjectKey)}
        ${renderDeliveryRow("导出记录", exportRecord?.id)}
        ${renderDeliveryRow("过期时间", expiresAt ? formatExportDate(expiresAt) : "")}
      </dl>
    </section>
  `;
}

function renderDeliveryRow(label, value) {
  if (!value) {
    return "";
  }

  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function formatExportHistoryMeta(record) {
  const items = Number(record.itemCount ?? 0);
  const missing = Number(record.missingAssetCount ?? 0);
  const expires = record.latestSignedUrlExpiresAt
    ? ` · 过期 ${formatExportDate(record.latestSignedUrlExpiresAt)}`
    : "";
  return `${items} items · ${missing} missing${expires}`;
}

function formatExportHistoryTime(record) {
  const value = record.createdAt ?? record.updatedAt ?? "";
  if (!value) {
    return "";
  }
  return formatExportDate(value);
}

function formatExportDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
