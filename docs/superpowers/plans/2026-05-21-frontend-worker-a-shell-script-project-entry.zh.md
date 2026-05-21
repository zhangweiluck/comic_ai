# 前端 Worker A - 外壳、剧本、项目入口实现计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 来按任务执行此计划。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 构建生产级前端外壳和从登录入口到剧本创建和项目创建的第一个用户旅程。

**架构：** Worker A 拥有应用程序框架、路由/导航状态、共享 UI 原语以及剧本/项目入口界面。Worker B 和 Worker C 必须能够通过将功能模块导出到稳定的挂载合约中并行工作，这些合约此外壳后续可以导入。

**技术栈：** `apps/web` 中的现有静态 Web 应用、原生 HTML/CSS/ES 模块、通过 `npm test` 的 Node 测试运行器、来自 `apps/backend/src/modules/project/creator-dev-app.ts` 的当前模拟创作者 API。

> **前端开发必须参考：** 写任何组件、页面、状态、弹窗、Toast、表格、表单、导航项或模板之前，必须先参考项目根目录的 `design-system.html`。`design-system.html` 是本次实现的权威 Web UI Kit：必须使用其中的 CSS 变量命名、暗色画布、细线边框、8px 卡片、pill 形交互控件、组件状态、可访问性规则和开发映射。若某个组件必须偏离，需在任务记录中写明原因，并将偏离控制在局部。

---

## 第一原则范围

该产品首先不是一个仪表盘。它是一台生产机器，其主要价值是让创作者以尽可能少的模糊决策从构思/剧本进入到项目工作台。此任务拥有前门和第一个不可逆的产品决策：我们要创建什么项目，使用什么剧本来源，以及使用什么生成约束。

## 做什么和为什么

当前的 `apps/web/app.html` 是一个开发者控制面板。它证明了后端流程存在，但它与 ReelMate 原型不匹配：

- 没有 首页 / 剧本 / 项目 / 资产库 / 团队的持久化产品导航；
- 没有剧本管理旅程；
- 没有项目列表、创建项目弹窗、验证提示、卡片菜单或重命名流程；
- 没有稳定的插槽供 Worker B 和 Worker C 渲染其模块而不会产生合并冲突。

Worker A 将应用转变为其他工作者可以接入的前端基础。

## 交付

交付这些能力：

- 登录后的创作者外壳，带有左侧导航、顶部积分/成员/帮助区域和主要内容挂载区；
- 用于 `home`、`scripts`、`projects`、`project-detail`、`assets`、`team` 的内存中前端路由状态；
- 剧本管理页面，带有空列表、创建卡片、AI 原创剧本设置弹窗、禁用/启用的提交行为、集数下拉框；
- 项目列表页面，带有现有项目卡片、创建项目弹窗、空字段验证提示、卡片更多菜单、重命名弹窗；
- 共享数据适配器，调用现有创作者开发端点，并在后端数据缺失时暴露本地 UI 夹具状态；
- Worker B 和 Worker C 模块的稳定集成合约。

## 明确的非目标

- 不实现单集工作台 UI；Worker B 拥有它。
- 不实现资产库、团队仪表盘、定价弹窗或权限矩阵；Worker C 拥有它们。
- 不调用真实的付费生成、不上传文件到外部服务、不实现真实支付。
- 不像素级复制 ReelMate。保留产品结构和交互逻辑，同时遵循此仓库在 `PRODUCT.md` 中的专业、克制设计方向。

## 依赖关系和前置条件

- 使用 `artifacts/reelmate_prototype/ReelMate_AI_Comic_Drama_Prototype_Report.docx` 中的截图和报告。
- 使用 `docs/product/reelmate-core-replication-prd.md` 中的 PRD 规则。
- 使用 `design-system.html` 作为所有视觉、组件、响应式和可访问性决策的强制设计系统与 Web UI Kit 参考。
- 保留 `apps/web/login.html`、`apps/web/login.js` 和 `apps/web/tests/login-page.spec.ts` 中的当前登录流程。
- 后端开发端点已存在：
  - `GET /api/auth/session`
  - `POST /api/auth/logout`
  - `GET /api/creator/state`
  - `POST /api/creator/project/create`
  - `POST /api/creator/parse`

## 并行所有权边界

Worker A 可以修改：

- `apps/web/app.html`
- `apps/web/app.js` 仅当将其替换为引导导入时
- `apps/web/login.css` 仅用于整个应用使用的共享令牌
- `apps/web/src/shared/**`
- `apps/web/src/features/shell/**`
- `apps/web/src/features/script-project-entry/**`
- `apps/web/tests/shell-script-project-entry.spec.ts`

Worker A 不得修改：

- `apps/web/src/features/production-workbench/**` 归 Worker B 所有
- `apps/web/src/features/library-team/**` 归 Worker C 所有
- 后端合约，除非缺失的前端夹具类型无法在本地表达

## 共享模块合约

首先创建这些稳定合约，以便所有三个工作者可以立即开始。

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

如果 Worker B/C 已经创建了它们的真实模块，不要覆盖它们。

## 任务 1：创建外壳骨架和稳定挂载点

**文件：**

- 修改：`apps/web/app.html`
- 修改：`apps/web/app.js`
- 创建：`apps/web/src/shared/app-state.js`
- 创建：`apps/web/src/shared/mount-contracts.js`
- 创建：`apps/web/src/features/shell/shell.js`
- 测试：`apps/web/tests/shell-script-project-entry.spec.ts`

- [ ] **步骤 1：编写失败测试**

测试 `app.html` 包含：

- `id="creator-app"`
- `id="app-main"`
- `id="toast-region"`
- 导航标签：首页, 剧本, 项目, 资产库, 团队
- 顶部控件：创作手册, 商务合作, 积分

运行：

```bash
npm test
```

预期：实现前 FAIL，因为新的挂载 ID 和导航标签缺失。

- [ ] **步骤 2：实现最小外壳**

将当前开发仪表盘布局替换为：

- 固定左侧导航；
- 顶部产品栏；
- `<main id="app-main"></main>`；
- `<div id="toast-region" role="status" aria-live="polite"></div>`。

保留 `script type="module" src="./app.js"`。

- [ ] **步骤 3：在 `apps/web/app.js` 中实现路由切换**

`app.js` 应导入外壳函数并渲染默认的 `home` 路由。保持认证会话加载和登出功能正常。

- [ ] **步骤 4：运行测试**

运行：

```bash
npm test
```

预期：登录测试加上新外壳测试通过。

## 任务 2：剧本管理旅程

**文件：**

- 创建：`apps/web/src/features/script-project-entry/script-page.js`
- 修改：`apps/web/src/features/shell/shell.js`
- 测试：`apps/web/tests/shell-script-project-entry.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言渲染的剧本页面包含：

- 从分析开始改编小说
- 直接开始改编小说
- 从故事灵感创作剧本
- 从剧本创作衍生剧本
- 我的剧本
- 搜索和类型筛选功能

断言 AI 原创弹窗模板包含：

- 文件名称
- 剧本受众
- 题材看点
- 拆分集数
- 分卡设置
- 每集长度
- 创作灵感
- 积分详情
- 完成设定，生成规划方案

- [ ] **步骤 2：实现剧本列表和空状态**

基于截图 `01_script_manage_empty.png` 渲染页面。

- [ ] **步骤 3：实现 AI 原创设置弹窗行为**

点击"从故事灵感创作剧本"打开一个弹窗。提交按钮在以下条件满足前保持禁用：

- 文件名称非空；
- 创作灵感非空；
- 集数已选择。

集数下拉选项：

- 40集
- 50集
- 60集
- 自定义分集（1-100）

不要启动真实生成。在有效提交时，关闭弹窗并显示提示：

```text
已保存剧本规划设置。生成规划方案将在后端生成接入后启用。
```

- [ ] **步骤 4：手动和通过测试验证验证逻辑**

运行：

```bash
npm test
```

预期：通过。手动浏览器检查：集数选择前按钮禁用，选择后启用。

## 任务 3：项目列表和创建/重命名交互

**文件：**

- 创建：`apps/web/src/features/script-project-entry/project-list-page.js`
- 创建：`apps/web/src/shared/toast.js`
- 测试：`apps/web/tests/shell-script-project-entry.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言项目列表包含：

- 全部项目
- 创建项目
- 状态筛选
- 名为 `try` 的项目卡片
- 更多菜单项：上传封面, 重命名, 删除

断言创建弹窗包含：

- 项目名称
- 9:16
- 16:9
- 国内仿真人剧
- 海外仿真人剧
- 2D/3D动漫

- [ ] **步骤 2：实现项目列表**

渲染至少一个夹具项目卡片：

```js
{
  id: "try",
  name: "try",
  status: "未开始",
  aspectRatio: "9:16",
  type: "2D/3D动漫",
}
```

- [ ] **步骤 3：实现创建项目弹窗**

验证：

- 空项目名称或缺失画面比例显示提示：`请填写项目名称和画面比例`；
- 有效提交调用 `/api/creator/project/create`，参数为 `{ name, scriptInput, aspectRatio, resolution: "1080p" }`；
- 如果没有可用剧本，传递一个最小占位剧本并显示非阻塞提示，说明剧本上传/解析将由后续任务完善。

- [ ] **步骤 4：实现卡片更多菜单和重命名弹窗**

更多菜单项：

- 上传封面：显示提示 `封面上传将在素材上传接入后启用`；
- 重命名：打开弹窗，显示现有项目名称和 `3/50` 样式计数；
- 删除：显示确认 UI，但在 P0 前端原型中不执行删除。

- [ ] **步骤 5：验证**

运行：

```bash
npm test
```

预期：通过。手动浏览器检查：创建验证提示出现，重命名弹窗保留原始值。

## 完成验证

Worker A 完成的条件：

- `npm test` 通过；
- 登录仍然重定向到 `app.html`；
- 外壳可以在首页、剧本、项目、资产、团队路由之间切换，无 JavaScript 错误；
- 剧本页面从截图 `01`、`12`、`13`、`14` 复现了重要控件和禁用/启用状态；
- 项目列表从截图 `03`、`15`、`16`、`17`、`18` 复现了创建弹窗、验证提示、更多菜单和重命名弹窗；
- Worker B 和 Worker C 可以在不编辑 Worker A 文件的情况下导入其模块，除非最终集成导入得到同意。

## 错误处理

- 如果 `/api/auth/session` 失败，将用户路由回 `/login.html`。
- 如果 `/api/creator/project/create` 失败，保持弹窗打开并在提示区域显示后端错误。
- 如果挂载点缺失，抛出 `mount_missing:<name>` 以便测试捕获损坏的 HTML。
- 如果早期集成期间 Worker B/C 模块缺失，渲染占位符而非崩溃。

## 主链闭合

此任务通过为用户提供进入创作系统的真实入口来推进主链：

```text
登录外壳 -> 剧本意图或项目创建 -> 项目记录/上下文 -> Worker B 项目详情/工作台
```

它本身不闭合生成循环，但它创建了 Worker B 必须消费的项目上下文。

## 信心循环

初始信心风险：非 100%，因为并行工作可能在共享外壳文件中发生冲突。

修复：

- 上述硬性所有权边界；
- 首先创建共享挂载合约；
- B/C 功能模块拥有自己的文件夹；
- 如果模块缺失，外壳渲染占位符。

剩余风险：项目创建可能需要比当前开发端点支持的更丰富的后端字段。

修复：

- 保持前端字段忠实于原型；
- 仅向后端发送支持的字段；
- 将不支持的视觉字段本地存储在夹具 UI 状态中，直到合约扩展。

经过这些修复后，此任务可以安全地并行启动，因为其可变表面是隔离的，并且其集成合约是明确的。
