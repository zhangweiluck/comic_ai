import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { renderLibraryTeam } from "../src/features/library-team/index.js";
import { renderProductionWorkbench } from "../src/features/production-workbench/index.js";
import { renderPricingModal } from "../src/features/library-team/pricing-modal.js";
import { renderMemberRulesModal } from "../src/features/library-team/member-rules-modal.js";
import { pricingPlans } from "../src/shared/commerce-fixtures.js";
import { permissionRows, teamRoles } from "../src/shared/permissions-fixtures.js";

function assertIncludesAll(html: string, labels: string[]) {
  for (const label of labels) {
    assert.match(html, new RegExp(escapeRegExp(label)), `Expected HTML to include ${label}`);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWorkbenchTab(activeNavTab: string, ui = {}) {
  return renderProductionWorkbench({
    state: {},
    session: { user: { phone: "13800138000" } },
    ui: {
      activeNavTab,
      busy: false,
      toast: "ready",
      exportHistory: [],
      storyboards: [],
      ...ui,
    },
  });
}

describe("Worker C asset library surfaces", () => {
  it("renders the personal asset library empty state and controls", () => {
    const html = renderLibraryTeam({ route: "assets" });

    assertIncludesAll(html, [
      "资产收纳台",
      "历史创作",
      "Agent项目",
      "历史上传",
      "我的提示词",
      "生成资产",
      "上传素材",
      "类型筛选",
      "搜索",
      "我的收藏",
      "批量操作",
      "文件夹",
      "暂无资产，生成或上传后会沉淀到这里",
    ]);
    assert.match(html, /data-action="show-library-placeholder"/);
    assert.match(html, /data-placeholder-message="[^"]*项目工作台[^"]*"/);
    assert.match(html, /<select aria-label="类型筛选" disabled/);
  });

  it("renders official and team asset library categories with the membership gate", () => {
    const html = renderLibraryTeam({ route: "assets", assetScope: "team" });

    assertIncludesAll(html, [
      "团队资产工作区",
      "官方资产库",
      "团队资产库",
      "角色",
      "场景",
      "道具",
      "专业版会员权益",
      "团队资产库为专业版会员权益，开通后使用该功能。",
      "去开通",
    ]);
  });
});

describe("Worker C production workbench integration", () => {
  it("renders the C asset library inside the production workbench library tab", () => {
    const html = renderWorkbenchTab("library");

    assert.match(html, /library-team-page/);
    assertIncludesAll(html, [
      "历史创作",
      "Agent项目",
      "历史上传",
      "暂无资产，生成或上传后会沉淀到这里",
    ]);

    const teamScopeHtml = renderWorkbenchTab("library", { libraryTeamAssetScope: "team" });

    assertIncludesAll(teamScopeHtml, [
      "官方资产库",
      "团队资产库",
      "团队资产库为专业版会员权益，开通后使用该功能。",
    ]);
  });

  it("renders the C team page and dashboard route inside the production workbench team tab", () => {
    const teamHtml = renderWorkbenchTab("team");

    assert.match(teamHtml, /library-team-page/);
    assert.match(teamHtml, /data-action="open-team-dashboard"/);
    assertIncludesAll(teamHtml, ["团队协作台", "团队额度", "数据管理", "成员管理", "创建成员账号"]);

    const dashboardHtml = renderWorkbenchTab("team", { libraryTeamRoute: "team-dashboard" });

    assertIncludesAll(dashboardHtml, ["成员创作与消耗", "项目资产与成本", "排行榜", "暂无数据"]);
    assert.match(dashboardHtml, /data-action="back-to-team-page"/);
  });

  it("loads the C library-team stylesheet from the app shell", () => {
    const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");

    assert.match(html, /src\/features\/library-team\/library-team\.css/);
  });

  it("wires Escape handling high enough to close library-team modals", () => {
    const js = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(js, /document\.addEventListener\("keydown"/);
    assert.match(js, /isLibraryPricingModalOpen = false/);
    assert.match(js, /isMemberRulesModalOpen = false/);
  });

  it("keeps project pagination labels readable when Worker C is mounted", () => {
    const projectLibrary = Array.from({ length: 9 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `项目 ${index + 1}`,
      status: "未开始",
      createdAt: `2026/05/${String(index + 1).padStart(2, "0")}`,
    }));
    const html = renderWorkbenchTab("project", {
      projectPanelMode: "library",
      projectLibrary,
      projectLibraryPage: 1,
    });

    assertIncludesAll(html, ["上一页", "第 1 / 2 页", "下一页"]);
    assert.doesNotMatch(html, /涓|绗|椤\?/);
  });
});

describe("Worker C team management surfaces", () => {
  it("renders team metrics, filters, member table, and empty member CTA", () => {
    const html = renderLibraryTeam({ route: "team" });

    assertIncludesAll(html, [
      "团队资产库为专业版会员权益",
      "开通专业版",
      "数据管理",
      "刷新",
      "查看详细数据看板",
      "团队项目",
      "团队席位",
      "单账号任务并发",
      "团队消耗积分",
      "团队剩余积分",
      "团队剩余可分配积分",
      "成员管理",
      "规则说明",
      "创建成员账号",
      "账号",
      "成员名称",
      "角色",
      "项目",
      "成员组",
      "状态",
      "积分",
      "备注",
      "操作",
      "搜索",
      "重置",
      "创建成员开始团队协作",
      "邀请成员后，这里会显示账号、角色、项目范围与积分额度。",
    ]);
    assert.match(html, /data-action="show-library-placeholder"/);
    assert.match(html, /data-placeholder-message="[^"]*成员筛选[^"]*"/);
  });

  it("renders the team dashboard route without requiring shell DOM", () => {
    const html = renderLibraryTeam({ route: "team-dashboard" });

    assertIncludesAll(html, [
      "团队数据看板",
      "成员创作与消耗",
      "项目资产与成本",
      "排行榜",
      "今天",
      "昨天",
      "本周",
      "本月",
      "上月",
      "今年",
      "导出",
      "暂无数据",
      "开始团队协作后，这里会显示成员消耗和项目成本。",
    ]);
    assert.match(html, /data-placeholder-message="[^"]*导出[^"]*"/);
  });
});

describe("Worker C commercial gates", () => {
  it("exports pricing fixtures and renders the pricing modal", () => {
    assert.deepEqual(
      pricingPlans.map((plan) => [plan.id, plan.name, plan.price, plan.credits]),
      [
        ["trial", "体验版", "¥100", "1000积分"],
        ["pro", "专业版", "¥5000", "51000积分"],
        ["enterprise", "企业版", "联系商务", "定制"],
      ],
    );

    const html = renderPricingModal({ open: true });

    assertIncludesAll(html, [
      "团队生产扩容",
      "积分加量",
      "兑换码",
      "体验版",
      "专业版",
      "企业版",
      "¥100",
      "¥5000",
      "联系商务",
      "支付与兑换码仅为原型占位，暂未接入真实交易。",
    ]);
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /data-action="show-commerce-placeholder"/);
  });
});

describe("Worker C permission rules", () => {
  it("exports data-driven permissions and renders the rules modal", () => {
    assert.ok(teamRoles.includes("管理员"));
    assert.ok(teamRoles.includes("组管理员"));
    assert.ok(teamRoles.some((role) => role.includes("导演")));
    assert.ok(teamRoles.some((role) => role.includes("动画师")));
    assert.ok(teamRoles.includes("编剧"));
    assert.ok(teamRoles.includes("剪辑师"));
    assert.ok(permissionRows.length >= 6);

    const html = renderMemberRulesModal({ open: true });

    assertIncludesAll(html, [
      "成员管理规则说明",
      "基础规则",
      "成员角色权限管理",
      "角色权限对照表",
      "成员组管理",
      "积分管理机制",
      "账号与安全管理",
      "管理员",
      "组管理员",
      "导演",
      "动画师",
      "编剧",
      "剪辑师",
    ]);
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /<table/);
  });
});

describe("Worker C design-system mapping", () => {
  it("keeps the library-team stylesheet tied to the canonical Web UI Kit tokens", () => {
    const css = readFileSync(
      new URL("../src/features/library-team/library-team.css", import.meta.url),
      "utf8",
    );

    assert.match(css, /--color-canvas/);
    assert.match(css, /--color-hairline/);
    assert.match(css, /--radius-sm/);
    assert.match(css, /--radius-pill/);
    assert.match(css, /--library-team-accent/);
    assert.match(css, /\.library-team-shell/);
    assert.match(css, /\.library-team-page-head/);
    assert.match(css, /\.library-team-empty-actions/);
    assert.match(css, /\.library-team-plan-note/);
    assert.match(css, /focus-visible/);
    assert.match(css, /@media \(max-width: 768px\)/);
    assert.match(css, /\.library-team-table-wrap/);
    assert.match(css, /\.library-team-modal[^{]*\{[^}]*overflow: auto/s);
    assert.match(css, /button:disabled/);
  });
});
