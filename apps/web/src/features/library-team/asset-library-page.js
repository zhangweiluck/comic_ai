import {
  officialAssetLibraryFixture,
  personalAssetLibraryFixture,
  teamAssetGate,
} from "./asset-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";
import { renderPricingModal } from "./pricing-modal.js";

const ASSET_ACTION_MESSAGE = "请先进入项目工作台，在项目资产页上传或生成素材。";
const ASSET_FILTER_MESSAGE = "暂无资产可筛选，上传或生成后这里会开放操作。";
const ASSET_PREVIEW_MESSAGE = "当前为资产库预览分类，真实筛选待资产库接口接入。";

export function renderAssetLibraryPage(context = {}) {
  const assetScope = context.assetScope ?? "personal";

  if (assetScope === "team" || assetScope === "official") {
    return renderOfficialTeamLibrary(context);
  }

  return `
    <section class="library-team-page asset-library-page" aria-labelledby="asset-library-title">
      <div class="library-team-shell">
        <header class="library-team-page-head">
          <div>
            <p class="library-team-kicker">资产库</p>
            <h1 id="asset-library-title">资产收纳台</h1>
            <p class="library-team-subcopy">集中沉淀历史创作、Agent 项目、上传素材和常用提示词，后续生产可以直接复用。</p>
          </div>
          <div class="library-team-head-actions">
            ${renderPlaceholderButton("上传素材", ASSET_ACTION_MESSAGE)}
            ${renderPlaceholderButton("生成资产", ASSET_ACTION_MESSAGE, true)}
          </div>
        </header>
        <section class="library-team-toolbar" aria-label="资产库操作台">
          <div class="library-team-toolbar-main">
            ${renderAssetScopeTabs(assetScope)}
            <nav class="library-team-tabs compact" role="tablist" aria-label="个人资产库">
              ${personalAssetLibraryFixture.tabs.map((tab, index) => renderTab(tab, index === 0)).join("")}
            </nav>
          </div>
          <div class="library-team-filterbar" aria-label="资产筛选">
            <label class="library-team-field">
              <span>类型筛选</span>
              <select aria-label="类型筛选" disabled title="${escapeAttr(ASSET_FILTER_MESSAGE)}">
                ${personalAssetLibraryFixture.folders.map((folder) => `<option>${escapeHtml(folder)}</option>`).join("")}
              </select>
            </label>
            <label class="library-team-search">
              <span class="sr-only">搜索</span>
              <input type="search" placeholder="搜索" aria-label="搜索" disabled title="${escapeAttr(ASSET_FILTER_MESSAGE)}" />
            </label>
            <label class="library-team-check">
              <input type="checkbox" disabled title="${escapeAttr(ASSET_FILTER_MESSAGE)}" />
              <span>我的收藏</span>
            </label>
            ${renderPlaceholderButton("批量操作", ASSET_FILTER_MESSAGE)}
            ${renderPlaceholderButton("时间顺序", ASSET_FILTER_MESSAGE)}
            ${renderPlaceholderButton("文件夹", ASSET_FILTER_MESSAGE)}
          </div>
        </section>
        <div class="library-team-empty-state">
          <div class="library-team-empty-icon" aria-hidden="true">+</div>
          <div>
            <h2>还没有可复用资产</h2>
            <p>暂无资产，生成或上传后会沉淀到这里</p>
          </div>
          <div class="library-team-empty-actions">
            ${renderPlaceholderButton("上传素材", ASSET_ACTION_MESSAGE)}
            ${renderPlaceholderButton("生成资产", ASSET_ACTION_MESSAGE, true)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderOfficialTeamLibrary(context) {
  const assetScope = context.assetScope ?? "official";
  const title = assetScope === "team" ? "团队资产库" : "官方资产库";

  return `
    <section class="library-team-page official-library-page" aria-labelledby="official-library-title">
      <div class="library-team-shell">
        <header class="library-team-page-head">
          <div>
            <p class="library-team-kicker">${escapeHtml(title)}</p>
            <h1 id="official-library-title">团队资产工作区</h1>
            <p class="library-team-subcopy">从官方角色、场景、道具开始搭建团队共用素材池，减少重复生成和素材丢失。</p>
          </div>
          <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">开通专业版</button>
        </header>
        <section class="library-team-toolbar" aria-label="官方和团队资产库操作台">
          <div class="library-team-toolbar-main">
            ${renderAssetScopeTabs(assetScope)}
            <nav class="library-team-tabs compact" role="tablist" aria-label="官方和团队资产库">
              ${officialAssetLibraryFixture.scopes
                .map((scope, index) => `${renderTab(scope, index === 0)}${scope === "团队资产库" ? '<span class="library-team-badge">团队专用</span>' : ""}`)
                .join("")}
            </nav>
            <nav class="library-team-tabs compact" role="tablist" aria-label="资产分类">
              ${officialAssetLibraryFixture.categories.map((category, index) => renderTab(category, index === 0)).join("")}
            </nav>
          </div>
        </section>
        <div class="library-team-split">
          <aside class="library-team-folder-list" aria-label="文件夹">
            <h2>文件夹</h2>
            ${officialAssetLibraryFixture.folders
              .map((folder, index) => `
                <button
                  class="library-team-folder${index === 0 ? " is-active" : ""}"
                  type="button"
                  data-action="show-library-placeholder"
                  data-placeholder-message="${escapeAttr(ASSET_PREVIEW_MESSAGE)}"
                >${escapeHtml(folder)}</button>
              `)
              .join("")}
          </aside>
          <section class="library-team-asset-browser" aria-label="官方资产">
            <div class="library-team-browser-header">
              <div>
                <p class="library-team-kicker">角色素材</p>
                <h2>国内仿真人-现代都市</h2>
              </div>
              <label class="library-team-search">
                <span class="sr-only">搜索</span>
                <input type="search" placeholder="搜索" aria-label="搜索" disabled title="${escapeAttr(ASSET_PREVIEW_MESSAGE)}" />
              </label>
            </div>
            <div class="library-team-asset-grid">
              ${officialAssetLibraryFixture.assets.map(renderAssetCard).join("")}
            </div>
            <aside class="library-team-gate" aria-label="${escapeAttr(teamAssetGate.title)}">
              <div>
                <h3>${escapeHtml(teamAssetGate.title)}</h3>
                <p>${escapeHtml(teamAssetGate.message)}</p>
              </div>
              <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">${escapeHtml(teamAssetGate.cta)}</button>
            </aside>
          </section>
        </div>
      </div>
      ${renderPricingModal({ open: context.pricingOpen === true })}
    </section>
  `;
}

function renderAssetScopeTabs(assetScope) {
  return `
    <nav class="library-team-tabs" role="tablist" aria-label="资产库范围">
      ${[
        ["personal", "个人资产库"],
        ["official", "官方资产库"],
        ["team", "团队资产库"],
      ]
        .map(([scope, label]) => {
          const selected = scope === assetScope;
          return `
            <button
              class="library-team-tab${selected ? " is-active" : ""}"
              type="button"
              role="tab"
              aria-selected="${selected ? "true" : "false"}"
              data-action="set-library-asset-scope"
              data-asset-scope="${escapeAttr(scope)}"
            >${escapeHtml(label)}</button>
          `;
        })
        .join("")}
    </nav>
  `;
}

function renderTab(label, selected) {
  return `
    <button
      class="library-team-tab${selected ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${selected ? "true" : "false"}"
      data-action="show-library-placeholder"
      data-placeholder-message="${escapeAttr(ASSET_PREVIEW_MESSAGE)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderPlaceholderButton(label, message, primary = false) {
  return `
    <button
      class="library-team-button${primary ? " library-team-button-primary" : ""}"
      type="button"
      data-action="show-library-placeholder"
      data-placeholder-message="${escapeAttr(message)}"
    >${escapeHtml(label)}</button>
  `;
}

function renderAssetCard(asset) {
  return `
    <article class="library-team-asset-card">
      <div class="library-team-asset-preview" aria-hidden="true"></div>
      <h3>${escapeHtml(asset.name)}</h3>
      <p>${escapeHtml(asset.category)}</p>
    </article>
  `;
}

