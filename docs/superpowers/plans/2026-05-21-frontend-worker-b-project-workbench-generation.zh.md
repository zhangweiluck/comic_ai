# 前端 Worker B - 项目工作台和生成实现计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 来按任务执行此计划。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 构建项目详情和单集生产工作台，使已创建的项目能够通过资产准备、分镜管理、图像/视频生成控制和导出预览进行推进。

**架构：** Worker B 拥有产品的生产中间环节：项目详情、资产提取来源选择器、剧集工作台、分镜列表、生成参数面板、模型下拉框、验证状态和导出预览。它消费 Worker A 的外壳路由/挂载合约，并暴露一个单一的 `renderProductionWorkbench(state, actions)` 入口点。

**技术栈：** `apps/web` 中的现有静态 Web 应用、原生 ES 模块、通过 `npm test` 的 Node 测试运行器、来自 `apps/backend/src/modules/project/creator-dev-app.ts` 的模拟创作者 API。

> **前端开发必须参考：** 写任何组件、页面、状态、弹窗、Toast、表格、表单、导航项或模板之前，必须先参考项目根目录的 `design-system.html`。`design-system.html` 是本次实现的权威 Web UI Kit：必须使用其中的 CSS 变量命名、暗色画布、细线边框、8px 卡片、pill 形交互控件、组件状态、可访问性规则和开发映射。若某个组件必须偏离，需在任务记录中写明原因，并将偏离控制在局部。

---

## 第一原则范围

产品的价值不在于用户能看到一个项目。价值在于用户可以在不丢失上下文的情况下持续推进生产：资产、剧集、分镜、生成设置、错误、成本和导出就绪状态必须存在于一个连贯的工作台中。

## 做什么和为什么

捕获的 ReelMate 项目旅程展示了最强的 P0 链条：

```text
项目列表 -> 项目详情 -> AI智能提取资产 -> 剧本/分镜单来源 -> 剧集卡片 -> 单集工作台 -> 添加分镜 -> 模型选择 -> 生成验证 -> 导出
```

当前前端只有摘要卡片和按钮。它没有揭示真实的生产工作流或开发者后续需要针对真实后端工作流实现的控件。

## 交付

交付这些能力：

- 项目详情概览，包含项目元数据、资产准备卡片、AI 提取入口、剧集卡片；
- AI智能提取资产弹窗，包含标签页：剧本库, 剧本上传, 分镜单上传；
- 剧集工作台，包含分镜列表、添加分镜操作、选中分镜状态、图像/视频标签页；
- 视频生成模型下拉框，包含能力标签和积分成本；
- "立即生成"验证，当首帧图像缺失时；
- 导出预览面板，显示缺失资产和导出就绪状态；
- 围绕 `GET /api/creator/state` 的前端状态适配器，加上本地仅前端分镜详情。

## 明确的非目标

- 不实现全局外壳或项目列表；Worker A 拥有它。
- 不实现团队、定价弹窗、成员权限或独立资产库；Worker C 拥有它们。
- 在此任务中不调用真实生成提供者或上传实际文件。
- 不添加后端字段，除非没有它们前端无法测试；优先为 P0 原型保真度使用本地夹具状态。

## 依赖关系和前置条件

- Worker A 将提供 `apps/web/src/shared/app-state.js` 和挂载 ID。如果尚未存在，创建具有相同 API 的兼容本地导入，并在注释中标记为临时。
- 使用 `design-system.html` 作为所有视觉、组件、响应式和可访问性决策的强制设计系统与 Web UI Kit 参考。
- 现有开发端点：
  - `GET /api/creator/state`
  - `POST /api/creator/parse`
  - `POST /api/creator/assets/confirm-all`
  - `POST /api/creator/calibration/run`
  - `POST /api/creator/images/generate`
  - `POST /api/creator/videos/generate`
  - `POST /api/creator/export/preview`
- 原型截图参考：
  - `05_project_overview_assets_and_episodes.png`
  - `19_project_script_upload_modal_from_extract.png`
  - `20_project_script_library_empty_in_upload_modal.png`
  - `21_project_storyboard_upload_tab.png`
  - `06_episode_storyboard_editor_guided_tour.png`
  - `22_episode_video_model_dropdown.png`
  - `23_episode_generate_validation_toast.png`
  - `24_episode_add_storyboard_result.png`

## 并行所有权边界

Worker B 可以修改：

- `apps/web/src/features/production-workbench/**`
- `apps/web/src/shared/creator-api.js`（如果尚不存在）
- `apps/web/tests/project-workbench-generation.spec.ts`

Worker B 不得修改：

- `apps/web/app.html`
- `apps/web/app.js`，除了在 Worker A 落地后的最终集成期间添加一行导入
- `apps/web/src/features/script-project-entry/**`
- `apps/web/src/features/library-team/**`

## 公共模块合约

创建：

`apps/web/src/features/production-workbench/index.js`

```js
export function renderProductionWorkbench(context = {}) {
  return renderProjectDetail(context);
}
```

返回值可以是 HTML 字符串或 DOM 节点，但测试必须记录是哪种。简单单元测试优先使用 HTML 字符串。

接受上下文：

```js
{
  state,
  onNavigate,
  onToast,
  api,
}
```

不要假设由 Worker A 拥有的全局 DOM ID，除非集成传入的挂载点。

## 任务 1：项目详情概览

**文件：**

- 创建：`apps/web/src/features/production-workbench/index.js`
- 创建：`apps/web/src/features/production-workbench/project-detail.js`
- 创建：`apps/web/src/shared/creator-api.js`
- 测试：`apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言项目详情渲染包含：

- 项目名称 `try` 或回退的当前项目名称；
- 状态 `未开始`；
- 类型 `2D/3D动漫`；
- 画面比例 `9:16`；
- 资产卡片：角色, 场景, 道具, 其他；
- 按钮 `AI智能提取资产`；
- 剧集卡片 `Try/test` 或夹具剧集。

运行：

```bash
npm test
```

预期：实现前 FAIL。

- [ ] **步骤 2：实现项目详情渲染**

后端状态存在时使用后端，否则使用本地夹具：

```js
export const projectDetailFixture = {
  project: { id: "try", name: "try", status: "未开始", type: "2D/3D动漫", aspectRatio: "9:16" },
  assets: { characters: 0, scenes: 0, props: 0, others: 0 },
  episodes: [{ id: "episode-try", title: "Try/test", status: "未定稿", storyboardCount: 2 }],
};
```

- [ ] **步骤 3：验证测试**

运行：

```bash
npm test
```

预期：项目详情断言通过。

## 任务 2：AI 资产提取来源弹窗

**文件：**

- 创建：`apps/web/src/features/production-workbench/asset-extract-modal.js`
- 修改：`apps/web/src/features/production-workbench/project-detail.js`
- 测试：`apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言弹窗包含三个标签页：

- 剧本库
- 剧本上传
- 分镜单上传

断言上传标签页包含：

- 点击或拖拽
- docx/txt
- 确认上传

断言分镜单上传标签页包含：

- 文本样式分镜单
- 表格样式分镜单
- 下载模板
- doc/docx/txt/xls/xlsx

- [ ] **步骤 2：实现弹窗 HTML 和标签页状态**

默认活跃标签页：`剧本上传`，匹配捕获的截图。

弹窗应暴露一个纯函数：

```js
export function renderAssetExtractModal({ activeTab = "script-upload" } = {}) {}
```

- [ ] **步骤 3：实现故障安全交互**

无真实文件上传。在没有文件的情况下确认时，显示提示：

```text
请先上传剧本或分镜单文件
```

在 `剧本库` 无剧本时，显示空状态和搜索输入框。

- [ ] **步骤 4：验证**

运行：

```bash
npm test
```

预期：通过。

## 任务 3：剧集工作台布局和添加分镜

**文件：**

- 创建：`apps/web/src/features/production-workbench/episode-workbench.js`
- 创建：`apps/web/src/features/production-workbench/storyboard-state.js`
- 测试：`apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言工作台包含：

- 分镜图片
- 分镜视频
- AI拆分镜
- 添加分镜
- 进入时间轴
- 分镜(2) 初始标签

断言调用添加分镜 reducer 将计数从 2 改为 3 并追加状态 `未定稿`。

- [ ] **步骤 2：实现 reducer**

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

- [ ] **步骤 3：实现工作台渲染**

布局：

- 左侧：分镜列表和添加按钮；
- 中间：选中分镜预览/空白画布；
- 右侧：生成设置面板；
- 列表行和参数控件的稳定尺寸。

- [ ] **步骤 4：验证**

运行：

```bash
npm test
```

预期：通过。手动检查：添加分镜可见地追加卡片 3。

## 任务 4：视频模型下拉框和生成验证

**文件：**

- 创建：`apps/web/src/features/production-workbench/video-generation-panel.js`
- 修改：`apps/web/src/features/production-workbench/episode-workbench.js`
- 测试：`apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言模型下拉框包含：

- Happy Horse
- Vidu Q3-Pro
- Vidu Q2
- 即梦3.0 Pro - Fast
- 即梦3.0 Pro
- 即梦3.5 Pro
- Hailuo 2.3 - Fast

断言选中的模型可以暴露：

- 时长/能力标签；
- 积分消耗 `23`；
- 生成按钮 `立即生成`。

断言验证函数返回：

```text
请上传完毕首帧图后提交生成任务
```

当没有首帧图像时。

- [ ] **步骤 2：实现模型目录**

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

- [ ] **步骤 3：实现验证**

```js
export function validateVideoGeneration(input) {
  if (!input.firstFrameUploaded) {
    return { ok: false, message: "请上传完毕首帧图后提交生成任务" };
  }
  return { ok: true, message: "" };
}
```

- [ ] **步骤 4：安全地接入后端操作**

仅在验证通过时调用 `/api/creator/videos/generate`。如果后端返回错误，在工作台状态区域显示错误并保留所有表单输入。

- [ ] **步骤 5：验证**

运行：

```bash
npm test
```

预期：通过。手动检查：无首帧时点击生成显示验证提示且不调用后端。

## 任务 5：导出预览面板

**文件：**

- 创建：`apps/web/src/features/production-workbench/export-panel.js`
- 测试：`apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言导出面板包含：

- 导出素材包
- 缺失资产
- 下载链接占位符
- 存在缺失资产时的不完整导出警告。

- [ ] **步骤 2：实现导出预览调用**

点击预览调用 `/api/creator/export/preview`。渲染：

- 状态；
- 项计数；
- 缺失资产计数；
- 可用时的缺失资产列表。

- [ ] **步骤 3：验证**

运行：

```bash
npm test
```

预期：通过。

## 完成验证

Worker B 完成的条件：

- `npm test` 通过；
- 可以在没有 Worker A 外壳的情况下调用 `renderProductionWorkbench()` 并返回完整的项目详情 HTML；
- 项目详情复现截图 `05`、`19`、`20`、`21`；
- 剧集工作台复现截图 `06`、`22`、`23`、`24`；
- 未触发真实付费生成或上传；
- 所有后端失败使用户保持在相同上下文中，并显示可见的恢复指导。

## 错误处理

- 缺失项目：渲染项目详情空状态，带有返回项目列表的 CTA。
- 资产提取上传确认但无文件：提示 `请先上传剧本或分镜单文件`。
- 无首帧时生成视频：阻止提交，显示 `请上传完毕首帧图后提交生成任务`。
- 后端操作失败：显示 `操作失败：<error>` 且不清除表单状态。
- 导出预览有缺失资产：列出缺失资产并保持导出 CTA 禁用，除非后续实现了明确的不完整导出。

## 主链闭合

此任务通过构建核心生产循环来推进主链：

```text
项目上下文 -> 资产来源选择 -> 剧集工作台 -> 分镜列表 -> 图像/视频生成控制 -> 导出预览
```

这是最高价值的闭合任务。如果它工作了，产品就有了一个可见的创作引擎，而不仅仅是导航。

## 信心循环

初始信心风险：非 100%，因为后端开发状态目前暴露简化的镜头而并非完整的分镜字段。

修复：

- 对真实项目/镜头状态使用后端状态；
- 保持仅前端的分镜夹具字段在本地；
- 隔离 reducer 和验证函数，以便未来的后端扩展不会重写 UI。

第二个风险：生成控件可能在无效时意外调用后端。

修复：

- 在任何 fetch 之前测试纯验证函数；
- generate 操作在验证失败时提前退出；
- 测试断言错误消息且无状态重置。

经过这些修复后，工作可以并行启动，因为 Worker B 只写入 `production-workbench` 模块并针对纯渲染函数进行测试。
