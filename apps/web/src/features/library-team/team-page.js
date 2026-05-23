import { commercePrototypeNotice } from "../../shared/commerce-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";
import { renderMemberRulesModal } from "./member-rules-modal.js";
import { renderPricingModal } from "./pricing-modal.js";
import {
  dashboardDateShortcuts,
  memberFilters,
  memberTableColumns,
  teamFixture,
} from "./team-fixtures.js";

const MEMBER_FILTER_MESSAGE = "成员筛选仍为原型视图，真实成员接口接入后可查询。";
const DASHBOARD_PLACEHOLDER_MESSAGE = "团队数据看板仍为原型视图，真实统计接口接入后可切换。";
const DASHBOARD_EXPORT_MESSAGE = "导出仍为原型占位，真实团队数据接入后可下载报表。";

export function renderTeamPage(context = {}) {
  const metrics = context.team?.metrics ?? teamFixture.metrics;

  return `
    <section class="library-team-page team-page" aria-labelledby="team-page-title">
      <div class="library-team-shell">
        <header class="library-team-page-head">
          <div>
            <p class="library-team-kicker">团队</p>
            <h1 id="team-page-title">团队协作台</h1>
            <p class="library-team-subcopy">用成员、项目范围和积分额度管理多人漫剧生产，保证资产沉淀在团队空间。</p>
          </div>
          <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">创建成员账号</button>
        </header>
        <div class="library-team-top-grid">
          <section class="library-team-upgrade-gate" aria-label="团队资产库专业版关卡">
            <div>
              <p class="library-team-kicker">团队额度</p>
              <h2>团队资产库为专业版会员权益</h2>
              <p>团队资产库为专业版会员权益，开通后使用该功能。</p>
            </div>
            <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">开通专业版</button>
          </section>
          <section class="library-team-metrics" aria-labelledby="team-metrics-title">
            <header>
              <div>
                <p class="library-team-kicker">最近 30 天</p>
                <h2 id="team-metrics-title">数据管理</h2>
              </div>
              <div class="library-team-section-actions">
                <button class="library-team-icon-button library-team-refresh-icon" type="button" aria-label="刷新团队数据" data-action="refresh-team">刷新</button>
                <button class="library-team-button" type="button" data-action="open-team-dashboard">查看详细数据看板</button>
              </div>
            </header>
            <dl class="library-team-metric-grid">
              ${renderMetric("团队项目", metrics.projects)}
              ${renderMetric("团队席位", metrics.seats, "扩容")}
              ${renderMetric("单账号任务并发", metrics.concurrency, "扩容")}
              ${renderMetric("团队消耗积分", metrics.consumedCredits)}
              ${renderMetric("团队剩余积分", metrics.remainingCredits)}
              ${renderMetric("团队剩余可分配积分", metrics.distributableCredits, "加量")}
            </dl>
          </section>
        </div>
        <section class="library-team-card team-member-section" aria-labelledby="member-management-title">
          <header class="library-team-section-header">
            <div>
              <p class="library-team-kicker">成员与权限</p>
              <h2 id="member-management-title">成员管理</h2>
            </div>
            <div class="library-team-section-actions">
              <button class="library-team-link-button" type="button" data-action="open-member-rules">规则说明</button>
              <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">创建成员账号</button>
            </div>
          </header>
          <form class="library-team-filterbar" aria-label="成员筛选器">
            ${memberFilters.map(renderMemberFilter).join("")}
            <button
              class="library-team-button library-team-button-primary"
              type="button"
              data-action="show-library-placeholder"
              data-placeholder-message="${escapeAttr(MEMBER_FILTER_MESSAGE)}"
            >搜索</button>
            <button class="library-team-button" type="reset">重置</button>
          </form>
          <div class="library-team-table-wrap">
            <table>
              <thead>
                <tr>${memberTableColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="${memberTableColumns.length}">
                    <div class="library-team-empty-state">
                      <div class="library-team-empty-icon" aria-hidden="true">+</div>
                      <div>
                        <h3>创建成员开始团队协作</h3>
                        <p>邀请成员后，这里会显示账号、角色、项目范围与积分额度。</p>
                      </div>
                      <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">创建成员账号</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <p class="library-team-commerce-notice">${escapeHtml(commercePrototypeNotice)}</p>
        ${renderPricingModal({ open: context.pricingOpen === true })}
        ${renderMemberRulesModal({ open: context.rulesOpen === true })}
      </div>
    </section>
  `;
}

export function renderTeamDashboardPage() {
  return `
    <section class="library-team-page team-dashboard-page" aria-labelledby="team-dashboard-title">
      <div class="library-team-shell">
        <header class="library-team-page-head library-team-dashboard-header">
          <button class="library-team-link-button" type="button" data-action="back-to-team-page">返回</button>
          <div>
            <p class="library-team-kicker">查看详细数据看板</p>
            <h1 id="team-dashboard-title">团队数据看板</h1>
            <p class="library-team-subcopy">按成员、项目和时间查看创作产出与积分消耗，方便排查成本和资源分配。</p>
          </div>
        </header>
        <nav class="library-team-tabs" role="tablist" aria-label="团队数据看板">
          ${["成员创作与消耗", "项目资产与成本", "排行榜"].map((tab, index) => `
            <button
              class="library-team-tab${index === 0 ? " is-active" : ""}"
              type="button"
              role="tab"
              aria-selected="${index === 0 ? "true" : "false"}"
              data-action="show-library-placeholder"
              data-placeholder-message="${escapeAttr(DASHBOARD_PLACEHOLDER_MESSAGE)}"
            >${escapeHtml(tab)}</button>
          `).join("")}
        </nav>
        <section class="library-team-card" aria-labelledby="dashboard-summary-title">
          <p class="library-team-kicker">总览</p>
          <h2 id="dashboard-summary-title">成员创作与消耗</h2>
          <dl class="library-team-metric-grid compact">
            ${renderMetric("成员数", 0)}
            ${renderMetric("启用成员数", 0)}
            ${renderMetric("成员总消耗积分", 0)}
            ${renderMetric("成员均消耗积分", 0)}
          </dl>
        </section>
        <section class="library-team-card" aria-labelledby="dashboard-detail-title">
          <header class="library-team-section-header">
            <div>
              <p class="library-team-kicker">明细</p>
              <h2 id="dashboard-detail-title">成员创作与消耗详情</h2>
            </div>
            <button
              class="library-team-button library-team-button-primary"
              type="button"
              data-action="show-library-placeholder"
              data-placeholder-message="${escapeAttr(DASHBOARD_EXPORT_MESSAGE)}"
            >导出</button>
          </header>
          <div class="library-team-filterbar">
            <label class="library-team-field"><span>角色</span><select><option>全部</option></select></label>
            <label class="library-team-field"><span>状态</span><select><option>全部</option></select></label>
            <div class="library-team-date-shortcuts">
              ${dashboardDateShortcuts.map((shortcut, index) => `
                <button
                  class="library-team-tab${index === 0 ? " is-active" : ""}"
                  type="button"
                  data-action="show-library-placeholder"
                  data-placeholder-message="${escapeAttr(DASHBOARD_PLACEHOLDER_MESSAGE)}"
                >${escapeHtml(shortcut)}</button>
              `).join("")}
            </div>
          </div>
          <div class="library-team-table-wrap">
            <table>
              <thead>
                <tr>${["账号", "成员名", "角色", "总消耗积分", "创作剧本数", "项目均消耗积分", "创作项目数", "项目均消耗积分", "操作"].map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="9">
                    <div class="library-team-empty-state">
                      <div class="library-team-empty-icon" aria-hidden="true">0</div>
                      <div>
                        <h3>暂无数据</h3>
                        <p>开始团队协作后，这里会显示成员消耗和项目成本。</p>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderMetric(label, value, actionLabel) {
  return `
    <div class="library-team-metric">
      <dt>${escapeHtml(label)}${actionLabel ? ` <button class="library-team-inline-action" type="button" data-action="open-pricing">${escapeHtml(actionLabel)}</button>` : ""}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderMemberFilter(label) {
  const isSelect = ["角色", "项目", "状态"].includes(label);
  return `
    <label class="library-team-field">
      <span>${escapeHtml(label)}</span>
      ${
        isSelect
          ? '<select><option>全部</option></select>'
          : `<input type="text" placeholder="请输入" aria-label="${escapeHtml(label)}" />`
      }
    </label>
  `;
}

