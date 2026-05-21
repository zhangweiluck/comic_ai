# Frontend Worker C - Asset Library, Team, Commercial Gates, QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the supporting product surfaces that make the prototype operationally believable: personal/team asset library, team management, permission rules, pricing/credit gates, and cross-feature QA checks.

**Architecture:** Worker C owns the operational layer around the production chain. These pages do not generate content directly, but they explain where assets live, why actions are blocked, who can collaborate, and how credits/member seats constrain the workflow.

**Tech Stack:** Existing static web app in `apps/web`, vanilla ES modules, Node test runner via `npm test`, fixture-first frontend state with no real payment or member creation.

> **Mandatory front-end design reference:** Every component, page, state, modal, toast, table, form, navigation item, and template implemented by this worker must reference `design-system.html` in the project root before coding. `design-system.html` is the canonical Web UI Kit for this implementation: use its CSS variable naming, dark canvas, hairline borders, 8px cards, pill-shaped interactive controls, component states, accessibility rules, and implementation guidance. If a component must deviate, document the reason in the task notes and keep the deviation local.

---

## First-Principles Scope

Professional creative tools succeed when users trust the system around the creative act: where results are stored, who can touch them, what costs money, and why a button is unavailable. This task prevents the prototype from feeling like a toy generator by implementing operational states and guardrails.

## What And Why

The ReelMate capture shows that asset library and team pages are not side quests:

- asset library is where generated/uploaded/prompt assets are reused across projects;
- project asset extraction feeds back into角色/场景/道具;
- team permissions and seats determine whether collaboration is possible;
- credits and professional membership are visible constraints across the entire product.

Without these states, the frontend may look simpler but will mislead developers about the real product model.

## Delivery

Deliver these capabilities:

- personal asset library page with tabs: 历史创作, Agent项目, 历史上传, 我的提示词;
- official/team asset library surface with角色/场景/道具 categories and professional-membership gate;
- team page with data cards, filters, empty member table, rule explanation modal, create-member pricing gate;
- pricing/credit modal with 积分加量/兑换码 tabs and three plan cards;
- permission matrix fixture for 管理员, 组管理员, 导演, 动画师, 编剧, 剪辑师;
- QA checklist tests that assert the main chain is not broken by shell/workbench/library integration.

## Explicit Non-Goals

- Do not implement real payment, checkout, invoice, member creation, or seat expansion.
- Do not implement backend team APIs unless already available.
- Do not modify Worker A shell or Worker B production workbench except through documented final integration.
- Do not invent broad admin settings beyond what screenshots and PRD support.

## Dependencies And Preconditions

- Worker A provides navigation route for `assets` and `team`.
- Worker B provides project-level asset extraction and workbench; Worker C only owns standalone asset/team pages.
- Use `design-system.html` as the required design-system and Web UI Kit reference for all visual, component, responsive, and accessibility decisions.
- Screenshot references:
  - `07_user_asset_library_empty.png`
  - `10_team_knowledge_base_gate.png`
  - `08_team_member_management_gate.png`
  - `09_team_dashboard_gate.png`
  - `25_team_create_member_pricing_gate.png`
  - `26_team_member_rules_modal.png`
- Product principles from `PRODUCT.md`: professional, restrained, advanced through order rather than visual noise.

## Parallel Ownership Boundary

Worker C may modify:

- `apps/web/src/features/library-team/**`
- `apps/web/src/shared/commerce-fixtures.js`
- `apps/web/src/shared/permissions-fixtures.js`
- `apps/web/tests/assets-team-commercial-qa.spec.ts`

Worker C must not modify:

- `apps/web/app.html`
- `apps/web/app.js`, except one final route registration after Worker A has landed
- `apps/web/src/features/script-project-entry/**`
- `apps/web/src/features/production-workbench/**`

## Public Module Contract

Create:

`apps/web/src/features/library-team/index.js`

```js
export function renderLibraryTeam(context = {}) {
  const route = context.route ?? "assets";
  if (route === "team") {
    return renderTeamPage(context);
  }
  return renderAssetLibraryPage(context);
}
```

The module should not rely on shell-owned global IDs. It returns HTML and exposes small pure helpers for tests.

## Task 1: Personal And Team Asset Library

**Files:**

- Create: `apps/web/src/features/library-team/asset-library-page.js`
- Create: `apps/web/src/features/library-team/asset-fixtures.js`
- Test: `apps/web/tests/assets-team-commercial-qa.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert personal asset library includes:

- 历史创作
- Agent项目
- 历史上传
- 我的提示词
- 类型筛选
- 搜索
- 我的收藏
- 批量操作
- 文件夹
- empty state text

Assert official/team library includes:

- 官方资产库
- 团队资产库
- 角色
- 场景
- 道具
- 专业版会员权益

- [ ] **Step 2: Implement personal asset library**

Use fixture:

```js
export const personalAssetLibraryFixture = {
  tabs: ["历史创作", "Agent项目", "历史上传", "我的提示词"],
  filters: ["类型筛选", "我的收藏", "批量操作", "时间顺序"],
  folders: ["全部", "角色", "场景", "道具", "未归档"],
  assets: [],
};
```

Empty state should be explicit: `暂无资产，生成或上传后会沉淀到这里`.

- [ ] **Step 3: Implement official/team library gate**

Team tab shows professional membership message:

```text
团队资产库为专业版会员权益，开通后使用该功能。
```

Button: `去开通`, which opens pricing modal from Task 3.

- [ ] **Step 4: Verify**

Run:

```bash
npm test
```

Expected: PASS.

## Task 2: Team Page And Member Filters

**Files:**

- Create: `apps/web/src/features/library-team/team-page.js`
- Create: `apps/web/src/features/library-team/team-fixtures.js`
- Test: `apps/web/tests/assets-team-commercial-qa.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert team page includes:

- 团队资产库为专业版会员权益
- 数据管理
- 刷新
- 查看详细数据看板
- 团队项目
- 团队席位
- 单账号任务并发
- 团队消耗积分
- 团队剩余积分
- 团队剩余可分配积分
- 成员管理
- 规则说明
- 创建成员账号

Assert filters include:

- 账号
- 成员名称
- 角色
- 项目
- 状态
- 备注
- 搜索
- 重置

- [ ] **Step 2: Implement team page**

Fixture:

```js
export const teamFixture = {
  metrics: {
    projects: 0,
    seats: "0/0",
    concurrency: 0,
    consumedCredits: 0,
    remainingCredits: 0,
    distributableCredits: 0,
  },
  members: [],
};
```

Render an empty table with columns:

- 账号
- 成员名称
- 角色
- 项目
- 成员组
- 状态
- 积分
- 备注
- 操作

Empty row CTA: `创建成员开始团队协作`.

- [ ] **Step 3: Add dashboard surface**

For `team-dashboard` local route or panel, render:

- 成员创作与消耗
- 项目资产与成本
- 排行榜
- date shortcuts: 今天, 昨天, 本周, 本月, 上月, 今年
- 导出

No backend needed. This is a high-fidelity operational placeholder.

- [ ] **Step 4: Verify**

Run:

```bash
npm test
```

Expected: PASS.

## Task 3: Pricing/Credit Gate Modal

**Files:**

- Create: `apps/web/src/features/library-team/pricing-modal.js`
- Create: `apps/web/src/shared/commerce-fixtures.js`
- Modify: `apps/web/src/features/library-team/asset-library-page.js`
- Modify: `apps/web/src/features/library-team/team-page.js`
- Test: `apps/web/tests/assets-team-commercial-qa.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert pricing modal includes:

- 积分加量
- 兑换码
- 体验版
- 专业版
- 企业版
- ¥100
- ¥5000
- 联系商务

- [ ] **Step 2: Implement modal**

Fixture:

```js
export const pricingPlans = [
  { id: "trial", name: "体验版", price: "¥100", credits: "1000积分" },
  { id: "pro", name: "专业版", price: "¥5000", credits: "51000积分" },
  { id: "enterprise", name: "企业版", price: "联系商务", credits: "定制" },
];
```

Open modal from:

- team asset library `去开通`;
- team page `创建成员账号`;
- metrics `扩容` or `加量`.

Do not process payment. Button action shows toast:

```text
支付与兑换码仅为原型占位，暂未接入真实交易。
```

- [ ] **Step 3: Verify**

Run:

```bash
npm test
```

Expected: PASS.

## Task 4: Member Rules And Permission Matrix

**Files:**

- Create: `apps/web/src/features/library-team/member-rules-modal.js`
- Create: `apps/web/src/shared/permissions-fixtures.js`
- Modify: `apps/web/src/features/library-team/team-page.js`
- Test: `apps/web/tests/assets-team-commercial-qa.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert rules modal includes:

- 成员管理规则说明
- 基础规则
- 成员角色权限管理
- 角色权限对照表
- 成员组管理
- 积分管理机制
- 账号与安全管理

Assert role names include:

- 管理员
- 组管理员
- 导演
- 动画师
- 编剧
- 剪辑师

- [ ] **Step 2: Implement permission fixtures**

Represent permissions as data, not hardcoded prose:

```js
export const teamRoles = [
  "管理员",
  "组管理员",
  "导演（可下载删除）",
  "动画师（可下载删除）",
  "导演",
  "动画师",
  "编剧",
  "剪辑师",
];

export const permissionRows = [
  { category: "创作生产类权限", capability: "参与项目", values: ["默认参与团队全部项目", "默认参与成员组内全部项目", "指定项目", "指定项目", "指定项目", "指定项目", "指定项目", "指定项目"] },
  { category: "创作生产类权限", capability: "小说改编剧本", values: ["✔", "✔", "✔", "✖", "✖", "✖", "✔", "✖"] },
  { category: "团队管理类权限", capability: "新建成员组", values: ["✔", "✖", "✖", "✖", "✖", "✖", "✖", "✖"] },
];
```

Add enough rows to make the modal credible, but do not attempt a complete legal permission model in P0.

- [ ] **Step 3: Implement rules modal**

Use accessible dialog markup:

- title;
- close button;
- confirm button;
- scrollable content;
- table with role headers.

- [ ] **Step 4: Verify**

Run:

```bash
npm test
```

Expected: PASS.

## Task 5: Cross-Feature QA Guardrails

**Files:**

- Modify: `apps/web/tests/assets-team-commercial-qa.spec.ts`
- Optional create: `docs/frontend/reelmate-frontend-qa-checklist.md`

- [ ] **Step 1: Add contract tests**

Assert no feature module exports are missing:

```js
import { renderLibraryTeam } from "../src/features/library-team/index.js";
import { pricingPlans } from "../src/shared/commerce-fixtures.js";
import { teamRoles } from "../src/shared/permissions-fixtures.js";
```

Expected: imports succeed.

- [ ] **Step 2: Add route smoke expectations**

Tests should ensure Worker C modules render without requiring Worker A's DOM:

- `renderLibraryTeam({ route: "assets" })`
- `renderLibraryTeam({ route: "team" })`
- `renderLibraryTeam({ route: "team-dashboard" })`

- [ ] **Step 3: Add manual QA checklist**

If creating checklist, include:

- route switching does not reset modal state unexpectedly;
- pricing modal can be opened and closed from three entry points;
- team rules modal scrolls and remains readable;
- asset empty state is distinct from permission gate;
- no payment/member creation call is made.

- [ ] **Step 4: Verify**

Run:

```bash
npm test
```

Expected: PASS.

## Completion Verification

Worker C is done when:

- `npm test` passes;
- every new UI component and page can be traced back to `design-system.html` tokens, component states, accessibility rules, or page templates;
- asset library reproduces screenshots `07` and `10`;
- team page reproduces screenshots `08`, `09`, `25`, `26`;
- pricing/member gates are visible and do not perform real transactions;
- permission rules are data-driven enough to support future backend role mapping;
- modules render independently of Worker A/B.

## Error Handling

- Opening team asset library without professional entitlement shows gate, not a blank list.
- Clicking payment actions shows placeholder toast and records no transaction.
- Clicking create member with zero seats opens pricing gate, not member form.
- Empty asset/member tables show explicit empty states and recovery actions.
- If permission fixture is missing, render a concise error panel: `权限矩阵加载失败，请刷新后重试`.

## Main Chain Closure

This task advances the main chain by making production results and collaboration constraints visible:

```text
Generated/uploaded assets -> Asset library reuse -> Team permission and credit gates -> Operational trust
```

It does not create shots, but it protects the long-term product model: assets, teams, credits, and permissions must be first-class from the beginning.

## Confidence Loop

Initial confidence risk: not 100%, because team/member/payment behavior is commercially sensitive and backend APIs are not present.

Repair:

- implement all commercial actions as explicit gates, not fake success states;
- use fixtures and placeholder toasts;
- do not create members, payments, or credit mutations.

Second risk: asset library could be mistaken for Worker B's project asset extraction.

Repair:

- Worker C owns standalone library and team asset browsing;
- Worker B owns project extraction modal and project asset preparation;
- both share vocabulary: 角色, 场景, 道具, but not files.

After these repairs, Worker C can start immediately because the work is fixture-first, independently testable, and isolated from shell/workbench ownership.
