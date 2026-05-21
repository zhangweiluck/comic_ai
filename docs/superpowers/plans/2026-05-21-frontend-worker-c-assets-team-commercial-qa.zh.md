# 前端 Worker C - 资产库、团队、商业关卡、QA 实现计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 来按任务执行此计划。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 构建使原型在操作上可信的支撑性产品界面：个人/团队资产库、团队管理、权限规则、定价/积分关卡和跨功能 QA 检查。

**架构：** Worker C 拥有生产链周围的操作层。这些页面不直接生成内容，但它们解释了资产存储在哪里、为什么操作被阻止、谁可以协作以及积分/成员席位如何约束工作流。

**技术栈：** `apps/web` 中的现有静态 Web 应用、原生 ES 模块、通过 `npm test` 的 Node 测试运行器、夹具优先的前端状态，无真实支付或成员创建。

> **前端开发必须参考：** 写任何组件、页面、状态、弹窗、Toast、表格、表单、导航项或模板之前，必须先参考项目根目录的 `design-system.html`。`design-system.html` 是本次实现的权威 Web UI Kit：必须使用其中的 CSS 变量命名、暗色画布、细线边框、8px 卡片、pill 形交互控件、组件状态、可访问性规则和开发映射。若某个组件必须偏离，需在任务记录中写明原因，并将偏离控制在局部。

---

## 第一原则范围

当用户信任创作行为周围的系统时，专业创作工具才能成功：结果存储在哪里，谁可以触碰它们，什么需要付费，以及为什么按钮不可用。此任务通过实现操作状态和护栏，防止原型感觉像一个玩具生成器。

## 做什么和为什么

ReelMate 捕获显示资产库和团队页面并不是支线任务：

- 资产库是生成/上传/提示资产跨项目复用的地方；
- 项目资产提取反馈到角色/场景/道具中；
- 团队权限和席位决定协作是否可能；
- 积分和专业版会员是贯穿整个产品的可见约束。

没有这些状态，前端可能看起来更简单，但会误导开发者对真实产品模型的理解。

## 交付

交付这些能力：

- 个人资产库页面，包含标签页：历史创作, Agent项目, 历史上传, 我的提示词；
- 官方/团队资产库界面，包含角色/场景/道具分类和专业版会员关卡；
- 团队页面，包含数据卡片、筛选器、空成员表、规则说明弹窗、创建成员定价关卡；
- 定价/积分弹窗，包含积分加量/兑换码标签页和三个套餐卡片；
- 管理员, 组管理员, 导演, 动画师, 编剧, 剪辑师的权限矩阵夹具；
- QA 检查清单测试，断言主链未被外壳/工作台/资产库集成破坏。

## 明确的非目标

- 不实现真实支付、结账、发票、成员创建或席位扩容。
- 不实现后端团队 API，除非已可用。
- 不修改 Worker A 外壳或 Worker B 生产工作台，除非通过文档化的最终集成。
- 不发明超出截图和 PRD 支持的广泛管理员设置。

## 依赖关系和前置条件

- Worker A 为 `assets` 和 `team` 提供导航路由。
- Worker B 提供项目级资产提取和工作台；Worker C 仅拥有独立资产/团队页面。
- 使用 `design-system.html` 作为所有视觉、组件、响应式和可访问性决策的强制设计系统与 Web UI Kit 参考。
- 截图参考：
  - `07_user_asset_library_empty.png`
  - `10_team_knowledge_base_gate.png`
  - `08_team_member_management_gate.png`
  - `09_team_dashboard_gate.png`
  - `25_team_create_member_pricing_gate.png`
  - `26_team_member_rules_modal.png`
- 来自 `PRODUCT.md` 的产品原则：专业、克制、通过秩序而非视觉噪音实现高级感。

## 并行所有权边界

Worker C 可以修改：

- `apps/web/src/features/library-team/**`
- `apps/web/src/shared/commerce-fixtures.js`
- `apps/web/src/shared/permissions-fixtures.js`
- `apps/web/tests/assets-team-commercial-qa.spec.ts`

Worker C 不得修改：

- `apps/web/app.html`
- `apps/web/app.js`，除了 Worker A 落地后的一次最终路由注册
- `apps/web/src/features/script-project-entry/**`
- `apps/web/src/features/production-workbench/**`

## 公共模块合约

创建：

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

模块不应依赖外壳拥有的全局 ID。它返回 HTML 并为测试暴露小型纯辅助函数。

## 任务 1：个人和团队资产库

**文件：**

- 创建：`apps/web/src/features/library-team/asset-library-page.js`
- 创建：`apps/web/src/features/library-team/asset-fixtures.js`
- 测试：`apps/web/tests/assets-team-commercial-qa.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言个人资产库包含：

- 历史创作
- Agent项目
- 历史上传
- 我的提示词
- 类型筛选
- 搜索
- 我的收藏
- 批量操作
- 文件夹
- 空状态文本

断言官方/团队库包含：

- 官方资产库
- 团队资产库
- 角色
- 场景
- 道具
- 专业版会员权益

- [ ] **步骤 2：实现个人资产库**

使用夹具：

```js
export const personalAssetLibraryFixture = {
  tabs: ["历史创作", "Agent项目", "历史上传", "我的提示词"],
  filters: ["类型筛选", "我的收藏", "批量操作", "时间顺序"],
  folders: ["全部", "角色", "场景", "道具", "未归档"],
  assets: [],
};
```

空状态应明确：`暂无资产，生成或上传后会沉淀到这里`。

- [ ] **步骤 3：实现官方/团队库关卡**

团队标签页显示专业版会员消息：

```text
团队资产库为专业版会员权益，开通后使用该功能。
```

按钮：`去开通`，打开任务 3 中的定价弹窗。

- [ ] **步骤 4：验证**

运行：

```bash
npm test
```

预期：通过。

## 任务 2：团队页面和成员筛选器

**文件：**

- 创建：`apps/web/src/features/library-team/team-page.js`
- 创建：`apps/web/src/features/library-team/team-fixtures.js`
- 测试：`apps/web/tests/assets-team-commercial-qa.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言团队页面包含：

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

断言筛选器包含：

- 账号
- 成员名称
- 角色
- 项目
- 状态
- 备注
- 搜索
- 重置

- [ ] **步骤 2：实现团队页面**

夹具：

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

渲染一个空表，列包括：

- 账号
- 成员名称
- 角色
- 项目
- 成员组
- 状态
- 积分
- 备注
- 操作

空行 CTA：`创建成员开始团队协作`。

- [ ] **步骤 3：添加仪表盘界面**

对于 `team-dashboard` 本地路由或面板，渲染：

- 成员创作与消耗
- 项目资产与成本
- 排行榜
- 日期快捷方式：今天, 昨天, 本周, 本月, 上月, 今年
- 导出

无需后端。这是一个高保真操作占位符。

- [ ] **步骤 4：验证**

运行：

```bash
npm test
```

预期：通过。

## 任务 3：定价/积分关卡弹窗

**文件：**

- 创建：`apps/web/src/features/library-team/pricing-modal.js`
- 创建：`apps/web/src/shared/commerce-fixtures.js`
- 修改：`apps/web/src/features/library-team/asset-library-page.js`
- 修改：`apps/web/src/features/library-team/team-page.js`
- 测试：`apps/web/tests/assets-team-commercial-qa.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言定价弹窗包含：

- 积分加量
- 兑换码
- 体验版
- 专业版
- 企业版
- ¥100
- ¥5000
- 联系商务

- [ ] **步骤 2：实现弹窗**

夹具：

```js
export const pricingPlans = [
  { id: "trial", name: "体验版", price: "¥100", credits: "1000积分" },
  { id: "pro", name: "专业版", price: "¥5000", credits: "51000积分" },
  { id: "enterprise", name: "企业版", price: "联系商务", credits: "定制" },
];
```

从以下位置打开弹窗：

- 团队资产库的 `去开通`；
- 团队页面的 `创建成员账号`；
- 指标区域的 `扩容` 或 `加量`。

不处理支付。按钮操作显示提示：

```text
支付与兑换码仅为原型占位，暂未接入真实交易。
```

- [ ] **步骤 3：验证**

运行：

```bash
npm test
```

预期：通过。

## 任务 4：成员规则和权限矩阵

**文件：**

- 创建：`apps/web/src/features/library-team/member-rules-modal.js`
- 创建：`apps/web/src/shared/permissions-fixtures.js`
- 修改：`apps/web/src/features/library-team/team-page.js`
- 测试：`apps/web/tests/assets-team-commercial-qa.spec.ts`

- [ ] **步骤 1：编写失败测试**

断言规则弹窗包含：

- 成员管理规则说明
- 基础规则
- 成员角色权限管理
- 角色权限对照表
- 成员组管理
- 积分管理机制
- 账号与安全管理

断言角色名称包含：

- 管理员
- 组管理员
- 导演
- 动画师
- 编剧
- 剪辑师

- [ ] **步骤 2：实现权限夹具**

将权限表示为数据，而非硬编码散文：

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

添加足够多的行使弹窗可信，但不要在 P0 中尝试完整的法律权限模型。

- [ ] **步骤 3：实现规则弹窗**

使用无障碍对话框标记：

- 标题；
- 关闭按钮；
- 确认按钮；
- 可滚动内容；
- 带有角色表头的表格。

- [ ] **步骤 4：验证**

运行：

```bash
npm test
```

预期：通过。

## 任务 5：跨功能 QA 护栏

**文件：**

- 修改：`apps/web/tests/assets-team-commercial-qa.spec.ts`
- 可选创建：`docs/frontend/reelmate-frontend-qa-checklist.md`

- [ ] **步骤 1：添加合约测试**

断言没有功能模块导出缺失：

```js
import { renderLibraryTeam } from "../src/features/library-team/index.js";
import { pricingPlans } from "../src/shared/commerce-fixtures.js";
import { teamRoles } from "../src/shared/permissions-fixtures.js";
```

预期：导入成功。

- [ ] **步骤 2：添加路由冒烟期望**

测试应确保 Worker C 模块无需 Worker A 的 DOM 即可渲染：

- `renderLibraryTeam({ route: "assets" })`
- `renderLibraryTeam({ route: "team" })`
- `renderLibraryTeam({ route: "team-dashboard" })`

- [ ] **步骤 3：添加手动 QA 检查清单**

如果创建检查清单，应包括：

- 路由切换不会意外重置弹窗状态；
- 定价弹窗可以从三个入口点打开和关闭；
- 团队规则弹窗可滚动且保持可读；
- 资产空状态与权限关卡的显示不同；
- 没有发起支付/成员创建调用。

- [ ] **步骤 4：验证**

运行：

```bash
npm test
```

预期：通过。

## 完成验证

Worker C 完成的条件：

- `npm test` 通过；
- 资产库复现截图 `07` 和 `10`；
- 团队页面复现截图 `08`、`09`、`25`、`26`；
- 定价/成员关卡可见且不执行真实交易；
- 权限规则是数据驱动的，足以支持未来的后端角色映射；
- 模块独立于 Worker A/B 渲染。

## 错误处理

- 打开团队资产库但无专业版权益：显示关卡，而非空白列表。
- 点击支付操作：显示占位提示且不记录交易。
- 零席位时点击创建成员：打开定价关卡，而非成员表单。
- 空资产/成员表：显示明确的空状态和恢复操作。
- 权限夹具缺失：渲染简洁的错误面板：`权限矩阵加载失败，请刷新后重试`。

## 主链闭合

此任务通过使生产结果和协作约束可见来推进主链：

```text
生成/上传的资产 -> 资产库复用 -> 团队权限和积分关卡 -> 操作信任
```

它不创建镜头，但它保护了长期产品模型：资产、团队、积分和权限必须从一开始就是一等公民。

## 信心循环

初始信心风险：非 100%，因为团队/成员/支付行为在商业上敏感且后端 API 不存在。

修复：

- 将所有商业操作实现为明确的关卡，而非虚假成功状态；
- 使用夹具和占位提示；
- 不创建成员、支付或积分变更。

第二个风险：资产库可能被误认为是 Worker B 的项目资产提取。

修复：

- Worker C 拥有独立库和团队资产浏览；
- Worker B 拥有项目提取弹窗和项目资产准备；
- 两者共享词汇：角色, 场景, 道具，但不共享文件。

经过这些修复后，Worker C 可以立即开始，因为工作是夹具优先、可独立测试且与外壳/工作台所有权隔离的。
