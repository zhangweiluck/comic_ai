import { disabled, escapeHtml } from "./markup.js";

const SCRIPT_ENTRY_CARDS = [
  {
    group: "小说改编剧本",
    title: "从分析开始改编小说",
    body: "上传或粘贴小说后，先分析世界观、角色与章节结构，再进入剧本规划。",
    action: "open-script-modal",
    tone: "warm",
  },
  {
    group: "小说改编剧本",
    title: "直接开始改编小说",
    body: "跳过预分析，从已有小说文本直接进入剧本改编草稿。",
    action: "open-script-modal",
    tone: "warm",
  },
  {
    group: "AI 创作剧本",
    title: "从故事灵感创作剧本",
    body: "填写受众、题材、集数与灵感，让系统生成规划方案。",
    action: "open-original-script-modal",
    tone: "violet",
  },
  {
    group: "AI 创作剧本",
    title: "从剧本创作衍生剧本",
    body: "基于既有剧本延展番外、续集或不同平台版本。",
    action: "open-original-script-modal",
    tone: "violet",
  },
];

export function renderScriptManagementPage({ ui = {} } = {}) {
  return `
    <section class="script-management-page" aria-label="剧本管理">
      <section class="script-entry-grid" aria-label="剧本创建入口">
        ${SCRIPT_ENTRY_CARDS.map(renderScriptEntryCard).join("")}
      </section>

      <section class="script-library-panel" aria-label="我的剧本">
        <header class="script-library-head">
          <div>
            <h1>我的剧本</h1>
            <p>共 0 个剧本。剧本会在生成规划、项目上传或资产提取后沉淀到这里。</p>
          </div>
          <div class="script-library-tools">
            <label class="script-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" placeholder="搜索剧本名称" />
            </label>
            <button class="script-filter-button" type="button">类型筛选 <span aria-hidden="true">⌄</span></button>
            <button class="script-filter-button" type="button">排序 <span aria-hidden="true">⌄</span></button>
          </div>
        </header>
        <div class="script-empty-state">
          <strong>暂无剧本</strong>
          <span>从上方选择小说改编或 AI 原创模式，完成设定后会生成规划方案。</span>
        </div>
      </section>

      <aside class="script-credit-note" aria-label="积分详情">
        <strong>积分详情</strong>
        <span>原创规划预计消耗 14 积分；真实生成接入后会按集数和后续任务动态计算。</span>
      </aside>
      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已进入剧本管理。")}</p>
    </section>
  `;
}

function renderScriptEntryCard(card) {
  return `
    <article class="script-entry-card ${card.tone}">
      <span>${escapeHtml(card.group)}</span>
      <h2>${escapeHtml(card.title)}</h2>
      <p>${escapeHtml(card.body)}</p>
      <button type="button" data-action="${escapeHtml(card.action)}">${escapeHtml(card.title)}</button>
    </article>
  `;
}

export function renderOriginalScriptModal({ show = false, draft = {}, busy = false } = {}) {
  if (!show) {
    return "";
  }

  const fileName = draft.fileName ?? "";
  const audience = draft.audience ?? "女频";
  const genre = draft.genre ?? "逆袭爽感";
  const episodeCount = draft.episodeCount ?? "";
  const cardSetting = draft.cardSetting ?? "自动分卡";
  const episodeLength = draft.episodeLength ?? "约 1 分钟";
  const inspiration = draft.inspiration ?? "";
  const canSubmit = Boolean(fileName.trim() && inspiration.trim() && episodeCount);

  return `
    <section class="modal-backdrop original-script-backdrop" role="dialog" aria-modal="true" aria-label="AI原创剧本设定">
      <div class="original-script-modal">
        <div class="original-script-head">
          <div>
            <h2>AI原创剧本设定</h2>
            <p>从故事灵感开始，先生成规划方案，再进入世界观、角色、章纲和分集剧本。</p>
          </div>
          <button class="modal-close" type="button" data-action="close-original-script-modal" aria-label="关闭">×</button>
        </div>

        <div class="original-script-form">
          <label class="control-field">
            <span>文件名称 <em>*</em></span>
            <input id="original-script-file-name" type="text" maxlength="50" value="${escapeHtml(fileName)}" placeholder="请输入剧本名称" />
            <small>${[...fileName].length}/50</small>
          </label>
          <label class="control-field">
            <span>剧本受众</span>
            <select id="original-script-audience">
              ${renderOption("女频", audience)}
              ${renderOption("男频", audience)}
              ${renderOption("全年龄", audience)}
            </select>
          </label>
          <label class="control-field">
            <span>题材看点</span>
            <select id="original-script-genre">
              ${renderOption("逆袭爽感", genre)}
              ${renderOption("都市奇幻", genre)}
              ${renderOption("悬疑反转", genre)}
              ${renderOption("情感治愈", genre)}
            </select>
          </label>
          <label class="control-field">
            <span>拆分集数 <em>*</em></span>
            <select id="original-script-episode-count">
              <option value="">请选择拆分集数</option>
              ${renderOption("40集", episodeCount)}
              ${renderOption("50集", episodeCount)}
              ${renderOption("60集", episodeCount)}
              ${renderOption("自定义分集（1-100）", episodeCount)}
            </select>
          </label>
          <label class="control-field">
            <span>分卡设置</span>
            <select id="original-script-card-setting">
              ${renderOption("自动分卡", cardSetting)}
              ${renderOption("按剧情节点分卡", cardSetting)}
            </select>
          </label>
          <label class="control-field">
            <span>每集长度</span>
            <select id="original-script-episode-length">
              ${renderOption("约 1 分钟", episodeLength)}
              ${renderOption("约 2 分钟", episodeLength)}
              ${renderOption("约 3 分钟", episodeLength)}
            </select>
          </label>
          <label class="control-field original-script-inspiration">
            <span>创作灵感 <em>*</em></span>
            <textarea id="original-script-inspiration" placeholder="写下故事设定、主角、冲突和希望观众记住的钩子">${escapeHtml(inspiration)}</textarea>
            <small>${[...inspiration].length}/460</small>
          </label>
        </div>

        <footer class="original-script-actions">
          <p><strong>积分详情</strong><span>预计消耗 14 积分</span></p>
          <button class="secondary-action" type="button" data-action="close-original-script-modal">取消</button>
          <button class="primary-action" type="button" data-action="submit-original-script-settings" ${disabled(!canSubmit || busy)}>完成设定，生成规划方案</button>
        </footer>
      </div>
    </section>
  `;
}

function renderOption(value, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`;
}
