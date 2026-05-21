# Frontend Worker A - Shell, Script, Project Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production-grade front-end shell and the first user journey from logged-in entry to script creation and project creation.

**Architecture:** Worker A owns the application frame, route/navigation state, shared UI primitives, and the script/project entry surfaces. Worker B and Worker C must be able to work in parallel by exporting feature modules into stable mount contracts that this shell can later import.

**Tech Stack:** Existing static web app in `apps/web`, vanilla HTML/CSS/ES modules, Node test runner via `npm test`, current mock creator APIs from `apps/backend/src/modules/project/creator-dev-app.ts`.

> **Mandatory front-end design reference:** Every component, page, state, modal, toast, table, form, navigation item, and template implemented by this worker must reference `design-system.html` in the project root before coding. `design-system.html` is the canonical Web UI Kit for this implementation: use its CSS variable naming, dark canvas, hairline borders, 8px cards, pill-shaped interactive controls, component states, accessibility rules, and implementation guidance. If a component must deviate, document the reason in the task notes and keep the deviation local.

---

## First-Principles Scope

The product is not a dashboard first. It is a production machine whose primary value is moving a creator from idea/script to project workbench with as few unclear decisions as possible. This task owns the front door and the first irreversible product decision: what project are we creating, from what script source, and with what generation constraints.

## What And Why

The current `apps/web/app.html` is a developer control panel. It proves the backend flow exists, but it does not match the ReelMate prototype:

- no persistent product navigation for 首页 / 剧本 / 项目 / 资产库 / 团队;
- no script management journey;
- no project list, create-project modal, validation toast, card menu, or rename flow;
- no stable slots where Worker B and Worker C can render their modules without merge conflicts.

Worker A turns the app into the front-end foundation that other workers can plug into.

## Delivery

Deliver these capabilities:

- logged-in creator shell with left navigation, top credit/member/help area, and main content mount;
- in-memory front-end route state for `home`, `scripts`, `projects`, `project-detail`, `assets`, `team`;
- script management page with empty list, creation cards, AI original script settings modal, disabled/enabled submit behavior, episode count dropdown;
- project list page with existing project card, create project modal, empty-field validation toast, card more menu, rename modal;
- shared data adapter that calls existing creator dev endpoints and exposes a local UI fixture state when backend data is missing;
- stable integration contracts for Worker B and Worker C modules.

## Explicit Non-Goals

- Do not implement the single-episode workbench UI; Worker B owns it.
- Do not implement asset library, team dashboard, pricing modal, or permission matrix; Worker C owns them.
- Do not call real paid generation, upload files to external services, or implement real payment.
- Do not pixel-copy ReelMate. Preserve product structure and interaction logic while following this repo's professional, restrained design direction in `PRODUCT.md`.

## Dependencies And Preconditions

- Use screenshots and report in `artifacts/reelmate_prototype/ReelMate_AI_Comic_Drama_Prototype_Report.docx`.
- Use PRD rules in `docs/product/reelmate-core-replication-prd.md`.
- Use `design-system.html` as the required design-system and Web UI Kit reference for all visual, component, responsive, and accessibility decisions.
- Preserve current login flow in `apps/web/login.html`, `apps/web/login.js`, and `apps/web/tests/login-page.spec.ts`.
- Backend dev endpoints already exist:
  - `GET /api/auth/session`
  - `POST /api/auth/logout`
  - `GET /api/creator/state`
  - `POST /api/creator/project/create`
  - `POST /api/creator/parse`

## Parallel Ownership Boundary

Worker A may modify:

- `apps/web/app.html`
- `apps/web/app.js` only if replacing it with a bootstrap import
- `apps/web/login.css` only for shared tokens used by the whole app
- `apps/web/src/shared/**`
- `apps/web/src/features/shell/**`
- `apps/web/src/features/script-project-entry/**`
- `apps/web/tests/shell-script-project-entry.spec.ts`

Worker A must not modify:

- `apps/web/src/features/production-workbench/**` owned by Worker B
- `apps/web/src/features/library-team/**` owned by Worker C
- backend contracts unless a missing frontend-only fixture type is impossible to express locally

## Shared Module Contract

Create these stable contracts first so all three workers can start immediately.

`apps/web/src/shared/app-state.js`

```js
export const routes = {
  home: "home",
  scripts: "scripts",
  projects: "projects",
  projectDetail: "project-detail",
  episodeWorkbench: "episode-workbench",
  assets: "assets",
  team: "team",
};

export const initialUiState = {
  route: routes.home,
  selectedProjectId: null,
  selectedEpisodeId: null,
  toast: null,
};
```

`apps/web/src/shared/mount-contracts.js`

```js
export const mountIds = {
  appRoot: "creator-app",
  main: "app-main",
  toastRegion: "toast-region",
};

export function assertMount(target, name) {
  if (!target) {
    throw new Error(`mount_missing:${name}`);
  }
  return target;
}
```

`apps/web/src/features/production-workbench/index.js`

```js
export function renderProductionWorkbench() {
  return '<section data-feature="production-workbench-placeholder"></section>';
}
```

`apps/web/src/features/library-team/index.js`

```js
export function renderLibraryTeam() {
  return '<section data-feature="library-team-placeholder"></section>';
}
```

If Worker B/C have already created their real modules, do not overwrite them.

## Task 1: Create Shell Skeleton And Stable Mounts

**Files:**

- Modify: `apps/web/app.html`
- Modify: `apps/web/app.js`
- Create: `apps/web/src/shared/app-state.js`
- Create: `apps/web/src/shared/mount-contracts.js`
- Create: `apps/web/src/features/shell/shell.js`
- Test: `apps/web/tests/shell-script-project-entry.spec.ts`

- [ ] **Step 1: Write failing tests**

Test that `app.html` contains:

- `id="creator-app"`
- `id="app-main"`
- `id="toast-region"`
- navigation labels: 首页, 剧本, 项目, 资产库, 团队
- top controls: 创作手册, 商务合作, 积分

Run:

```bash
npm test
```

Expected: FAIL before implementation because the new mount IDs and navigation labels are missing.

- [ ] **Step 2: Implement minimal shell**

Replace the current dev-dashboard layout with:

- fixed left navigation;
- top product bar;
- `<main id="app-main"></main>`;
- `<div id="toast-region" role="status" aria-live="polite"></div>`.

Keep `script type="module" src="./app.js"`.

- [ ] **Step 3: Implement route switching in `apps/web/app.js`**

`app.js` should import shell functions and render the default `home` route. Keep auth session loading and logout working.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS for login tests plus new shell tests.

## Task 2: Script Management Journey

**Files:**

- Create: `apps/web/src/features/script-project-entry/script-page.js`
- Modify: `apps/web/src/features/shell/shell.js`
- Test: `apps/web/tests/shell-script-project-entry.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert rendered script page includes:

- 从分析开始改编小说
- 直接开始改编小说
- 从故事灵感创作剧本
- 从剧本创作衍生剧本
- 我的剧本
- 搜索 and 类型筛选 affordances

Assert AI original modal template includes:

- 文件名称
- 剧本受众
- 题材看点
- 拆分集数
- 分卡设置
- 每集长度
- 创作灵感
- 积分详情
- 完成设定，生成规划方案

- [ ] **Step 2: Implement script list and empty state**

Render the page based on screenshot `01_script_manage_empty.png`.

- [ ] **Step 3: Implement AI original settings modal behavior**

Clicking “从故事灵感创作剧本” opens a modal. The submit button is disabled until:

- file name is non-empty;
- creation inspiration is non-empty;
- episode count is selected.

Episode dropdown options:

- 40集
- 50集
- 60集
- 自定义分集（1-100）

Do not start real generation. On valid submit, close modal and show toast:

```text
已保存剧本规划设置。生成规划方案将在后端生成接入后启用。
```

- [ ] **Step 4: Verify validation manually and with tests**

Run:

```bash
npm test
```

Expected: PASS. Manual browser check: button is disabled before episode count selection and enabled after selection.

## Task 3: Project List And Create/Rename Interactions

**Files:**

- Create: `apps/web/src/features/script-project-entry/project-list-page.js`
- Create: `apps/web/src/shared/toast.js`
- Test: `apps/web/tests/shell-script-project-entry.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert project list includes:

- 全部项目
- 创建项目
- 状态筛选
- project card named `try`
- more menu items: 上传封面, 重命名, 删除

Assert create modal includes:

- 项目名称
- 9:16
- 16:9
- 国内仿真人剧
- 海外仿真人剧
- 2D/3D动漫

- [ ] **Step 2: Implement project list**

Render at least one fixture project card:

```js
{
  id: "try",
  name: "try",
  status: "未开始",
  aspectRatio: "9:16",
  type: "2D/3D动漫",
}
```

- [ ] **Step 3: Implement create project modal**

Validation:

- empty project name or missing aspect ratio shows toast: `请填写项目名称和画面比例`;
- valid submit calls `/api/creator/project/create` with `{ name, scriptInput, aspectRatio, resolution: "1080p" }`;
- if no script is available, pass a minimal placeholder script and show a non-blocking note that script upload/parser will be refined by later tasks.

- [ ] **Step 4: Implement card more menu and rename modal**

More menu items:

- 上传封面: show toast `封面上传将在素材上传接入后启用`;
- 重命名: open modal with existing project name and `3/50` style count;
- 删除: show confirmation UI but do not delete in P0 frontend prototype.

- [ ] **Step 5: Verify**

Run:

```bash
npm test
```

Expected: PASS. Manual browser check: create validation toast appears and rename modal preserves original value.

## Completion Verification

Worker A is done when:

- `npm test` passes;
- every new UI component and page can be traced back to `design-system.html` tokens, component states, accessibility rules, or page templates;
- login still redirects to `app.html`;
- shell can switch between Home, Script, Project, Assets, Team routes without JavaScript errors;
- Script page reproduces the important controls and disabled/enabled states from screenshots `01`, `12`, `13`, `14`;
- Project list reproduces create modal, validation toast, more menu, and rename modal from screenshots `03`, `15`, `16`, `17`, `18`;
- Worker B and Worker C can import their modules without editing Worker A files, except for a final integration import if agreed.

## Error Handling

- If `/api/auth/session` fails, route user back to `/login.html`.
- If `/api/creator/project/create` fails, keep modal open and show the backend error in the toast region.
- If a mount is missing, throw `mount_missing:<name>` so tests catch broken HTML.
- If Worker B/C modules are absent during early integration, render placeholders rather than crashing.

## Main Chain Closure

This task advances the main chain by giving users a real entry into the creation system:

```text
Logged-in shell -> Script intention or Project creation -> Project record/context -> Worker B project detail/workbench
```

It does not close generation by itself, but it creates the project context that Worker B must consume.

## Confidence Loop

Initial confidence risk: not 100%, because parallel work can collide in shared shell files.

Repair:

- hard ownership boundaries above;
- shared mount contracts created first;
- B/C feature modules own their own folders;
- shell renders placeholders if modules are absent.

Remaining risk: project creation may need richer backend fields than the current dev endpoint supports.

Repair:

- keep frontend fields faithful to the prototype;
- send only supported fields to backend;
- store unsupported visual fields locally in fixture UI state until contracts expand.

After these repairs, this task is safe for parallel start because its mutable surface is isolated and its integration contract is explicit.
