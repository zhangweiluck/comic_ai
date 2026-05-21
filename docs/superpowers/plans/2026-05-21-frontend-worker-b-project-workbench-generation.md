# Frontend Worker B - Project Workbench And Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project detail and single-episode production workbench that moves a created project through asset preparation, storyboard management, image/video generation controls, and export preview.

**Architecture:** Worker B owns the production middle of the product: project detail, asset extraction source selector, episode workbench, storyboard list, generation parameter panel, model dropdown, validation states, and export preview. It consumes shell route/mount contracts from Worker A and exposes a single `renderProductionWorkbench(state, actions)` entrypoint.

**Tech Stack:** Existing static web app in `apps/web`, vanilla ES modules, Node test runner via `npm test`, mock creator APIs from `apps/backend/src/modules/project/creator-dev-app.ts`.

> **Mandatory front-end design reference:** Every component, page, state, modal, toast, table, form, navigation item, and template implemented by this worker must reference `design-system.html` in the project root before coding. `design-system.html` is the canonical Web UI Kit for this implementation: use its CSS variable naming, dark canvas, hairline borders, 8px cards, pill-shaped interactive controls, component states, accessibility rules, and implementation guidance. If a component must deviate, document the reason in the task notes and keep the deviation local.

---

## First-Principles Scope

The product's value is not that users can see a project. The value is that a user can keep moving through production without losing context: assets, episodes, storyboards, generation settings, errors, costs, and export readiness must live in one coherent workbench.

## What And Why

The captured ReelMate project journey shows the strongest P0 chain:

```text
Project list -> Project detail -> AI智能提取资产 -> 剧本/分镜单来源 -> Episode card -> Single episode workbench -> Add storyboard -> Model selection -> Generate validation -> Export
```

Current frontend only has summary cards and buttons. It does not reveal the real production workflow or the controls developers need to implement later against real backend workflows.

## Delivery

Deliver these capabilities:

- project detail overview with project metadata, asset preparation cards, AI extraction entry, episode cards;
- AI智能提取资产 modal with tabs: 剧本库, 剧本上传, 分镜单上传;
- episode workbench with storyboard list, add storyboard mutation, selected storyboard state, image/video tabs;
- video generation model dropdown with capability tags and credit cost;
- “立即生成” validation when first-frame image is missing;
- export preview panel showing missing assets and export readiness;
- front-end state adapter around `GET /api/creator/state` plus local UI-only storyboard details.

## Explicit Non-Goals

- Do not implement global shell or project list; Worker A owns that.
- Do not implement team, pricing modal, member permissions, or standalone asset library; Worker C owns that.
- Do not call real generation providers or upload actual files in this task.
- Do not add backend fields unless a frontend cannot be tested without them; prefer local fixture state for P0 prototype fidelity.

## Dependencies And Preconditions

- Worker A will provide `apps/web/src/shared/app-state.js` and mount IDs. If not present yet, create compatible local imports with the same API and mark them as temporary in comments.
- Use `design-system.html` as the required design-system and Web UI Kit reference for all visual, component, responsive, and accessibility decisions.
- Existing dev endpoints:
  - `GET /api/creator/state`
  - `POST /api/creator/parse`
  - `POST /api/creator/assets/confirm-all`
  - `POST /api/creator/calibration/run`
  - `POST /api/creator/images/generate`
  - `POST /api/creator/videos/generate`
  - `POST /api/creator/export/preview`
- Prototype screenshot references:
  - `05_project_overview_assets_and_episodes.png`
  - `19_project_script_upload_modal_from_extract.png`
  - `20_project_script_library_empty_in_upload_modal.png`
  - `21_project_storyboard_upload_tab.png`
  - `06_episode_storyboard_editor_guided_tour.png`
  - `22_episode_video_model_dropdown.png`
  - `23_episode_generate_validation_toast.png`
  - `24_episode_add_storyboard_result.png`

## Parallel Ownership Boundary

Worker B may modify:

- `apps/web/src/features/production-workbench/**`
- `apps/web/src/shared/creator-api.js` if it does not exist yet
- `apps/web/tests/project-workbench-generation.spec.ts`

Worker B must not modify:

- `apps/web/app.html`
- `apps/web/app.js`, except by adding one import line during final integration after Worker A has landed
- `apps/web/src/features/script-project-entry/**`
- `apps/web/src/features/library-team/**`

## Public Module Contract

Create:

`apps/web/src/features/production-workbench/index.js`

```js
export function renderProductionWorkbench(context = {}) {
  return renderProjectDetail(context);
}
```

The returned value may be an HTML string or a DOM node, but tests must document which. Prefer HTML string for simple unit tests.

Accept context:

```js
{
  state,
  onNavigate,
  onToast,
  api,
}
```

Do not assume global DOM IDs owned by Worker A except the mount passed by integration.

## Task 1: Project Detail Overview

**Files:**

- Create: `apps/web/src/features/production-workbench/index.js`
- Create: `apps/web/src/features/production-workbench/project-detail.js`
- Create: `apps/web/src/shared/creator-api.js`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert project detail render includes:

- project name `try` or fallback current project name;
- status `未开始`;
- type `2D/3D动漫`;
- aspect ratio `9:16`;
- asset cards: 角色, 场景, 道具, 其他;
- button `AI智能提取资产`;
- episode card `Try/test` or fixture episode.

Run:

```bash
npm test
```

Expected: FAIL before implementation.

- [ ] **Step 2: Implement project detail render**

Use backend state when present, else local fixture:

```js
export const projectDetailFixture = {
  project: { id: "try", name: "try", status: "未开始", type: "2D/3D动漫", aspectRatio: "9:16" },
  assets: { characters: 0, scenes: 0, props: 0, others: 0 },
  episodes: [{ id: "episode-try", title: "Try/test", status: "未定稿", storyboardCount: 2 }],
};
```

- [ ] **Step 3: Verify tests**

Run:

```bash
npm test
```

Expected: PASS for project detail assertions.

## Task 2: AI Asset Extraction Source Modal

**Files:**

- Create: `apps/web/src/features/production-workbench/asset-extract-modal.js`
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert modal includes three tabs:

- 剧本库
- 剧本上传
- 分镜单上传

Assert upload tab includes:

- 点击或拖拽
- docx/txt
- 确认上传

Assert storyboard upload tab includes:

- 文本样式分镜单
- 表格样式分镜单
- 下载模板
- doc/docx/txt/xls/xlsx

- [ ] **Step 2: Implement modal HTML and tab state**

Default active tab: `剧本上传`, matching captured screenshot.

The modal should expose a pure function:

```js
export function renderAssetExtractModal({ activeTab = "script-upload" } = {}) {}
```

- [ ] **Step 3: Implement failure-safe interactions**

No real file upload. On confirm without file, show toast:

```text
请先上传剧本或分镜单文件
```

On `剧本库` with no scripts, show empty state and search input.

- [ ] **Step 4: Verify**

Run:

```bash
npm test
```

Expected: PASS.

## Task 3: Episode Workbench Layout And Add Storyboard

**Files:**

- Create: `apps/web/src/features/production-workbench/episode-workbench.js`
- Create: `apps/web/src/features/production-workbench/storyboard-state.js`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert workbench includes:

- 分镜图片
- 分镜视频
- AI拆分镜
- 添加分镜
- 进入时间轴
- 分镜(2) initial label

Assert calling add storyboard reducer changes count from 2 to 3 and appends status `未定稿`.

- [ ] **Step 2: Implement reducer**

```js
export function addStoryboard(storyboards) {
  const nextIndex = storyboards.length + 1;
  return [
    ...storyboards,
    {
      id: `storyboard-${nextIndex}`,
      index: nextIndex,
      title: `${nextIndex}`,
      status: "未定稿",
      imageStatus: "empty",
      videoStatus: "empty",
    },
  ];
}
```

- [ ] **Step 3: Implement workbench render**

Layout:

- left: storyboard list and add button;
- center: selected storyboard preview/empty canvas;
- right: generation settings panel;
- stable dimensions for list rows and parameter controls.

- [ ] **Step 4: Verify**

Run:

```bash
npm test
```

Expected: PASS. Manual check: add storyboard visibly appends card 3.

## Task 4: Video Model Dropdown And Generate Validation

**Files:**

- Create: `apps/web/src/features/production-workbench/video-generation-panel.js`
- Modify: `apps/web/src/features/production-workbench/episode-workbench.js`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert model dropdown contains:

- Happy Horse
- Vidu Q3-Pro
- Vidu Q2
- 即梦3.0 Pro - Fast
- 即梦3.0 Pro
- 即梦3.5 Pro
- Hailuo 2.3 - Fast

Assert selected model can expose:

- duration/capability tags;
- credit cost `23`;
- generate button `立即生成`.

Assert validation function returns:

```text
请上传完毕首帧图后提交生成任务
```

when no first-frame image is present.

- [ ] **Step 2: Implement model catalog**

```js
export const videoModels = [
  { id: "happy-horse", name: "Happy Horse", tags: ["快速", "低成本"], credits: 12 },
  { id: "vidu-q3-pro", name: "Vidu Q3-Pro", tags: ["首尾帧", "音频生成", "口型同步"], credits: 23 },
  { id: "vidu-q2", name: "Vidu Q2", tags: ["首帧", "稳定"], credits: 18 },
  { id: "jimeng-3-pro-fast", name: "即梦3.0 Pro - Fast", tags: ["快速"], credits: 16 },
  { id: "jimeng-3-pro", name: "即梦3.0 Pro", tags: ["高质量"], credits: 22 },
  { id: "jimeng-3-5-pro", name: "即梦3.5 Pro", tags: ["高质量", "新模型"], credits: 28 },
  { id: "hailuo-2-3-fast", name: "Hailuo 2.3 - Fast", tags: ["快速"], credits: 15 },
];
```

- [ ] **Step 3: Implement validation**

```js
export function validateVideoGeneration(input) {
  if (!input.firstFrameUploaded) {
    return { ok: false, message: "请上传完毕首帧图后提交生成任务" };
  }
  return { ok: true, message: "" };
}
```

- [ ] **Step 4: Wire backend action safely**

Only call `/api/creator/videos/generate` when validation passes. If backend returns an error, show it in the workbench status area and preserve all form inputs.

- [ ] **Step 5: Verify**

Run:

```bash
npm test
```

Expected: PASS. Manual check: clicking generate without first frame shows validation and does not call backend.

## Task 5: Export Preview Panel

**Files:**

- Create: `apps/web/src/features/production-workbench/export-panel.js`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write failing tests**

Assert export panel includes:

- 导出素材包
- 缺失资产
- 下载链接 placeholder
- incomplete export warning when missing assets exist.

- [ ] **Step 2: Implement export preview call**

Clicking preview calls `/api/creator/export/preview`. Render:

- status;
- item count;
- missing asset count;
- missing asset list when available.

- [ ] **Step 3: Verify**

Run:

```bash
npm test
```

Expected: PASS.

## Completion Verification

Worker B is done when:

- `npm test` passes;
- every new UI component and page can be traced back to `design-system.html` tokens, component states, accessibility rules, or page templates;
- `renderProductionWorkbench()` can be called without Worker A shell and returns complete project-detail HTML;
- project detail reproduces screenshots `05`, `19`, `20`, `21`;
- episode workbench reproduces screenshots `06`, `22`, `23`, `24`;
- no real paid generation or upload is triggered;
- all backend failures keep the user in the same context with visible recovery guidance.

## Error Handling

- Missing project: render project detail empty state with CTA back to project list.
- Asset extraction upload confirm without file: toast `请先上传剧本或分镜单文件`.
- Generate video without first frame: block submission with `请上传完毕首帧图后提交生成任务`.
- Backend action failure: show `操作失败：<error>` and do not clear form state.
- Export preview with missing assets: list missing assets and keep export CTA disabled unless explicit incomplete export is later implemented.

## Main Chain Closure

This task advances the main chain by building the core production loop:

```text
Project context -> Asset source selection -> Episode workbench -> Storyboard list -> Image/video generation controls -> Export preview
```

This is the highest-value closure task. If it works, the product has a visible creation engine rather than only navigation.

## Confidence Loop

Initial confidence risk: not 100%, because backend dev state currently exposes simplified shots and not full storyboard fields.

Repair:

- use backend state for real project/shot statuses;
- keep UI-only storyboard fixture fields local;
- isolate reducers and validation functions so future backend expansion does not rewrite the UI.

Second risk: generation controls could accidentally call backend while invalid.

Repair:

- pure validation function tested before any fetch;
- generate action exits early on validation failure;
- tests assert error message and no state reset.

After these repairs, the work can start in parallel because Worker B writes only `production-workbench` modules and tests against pure render functions.
