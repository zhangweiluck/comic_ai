# Local Runnable Integration 三人开发 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有前端和后端串成一条真实可运行的本地 creator 闭环，并同步硬化模块化单体和开发者体验。

**Architecture:** 第一版选择“主链路优先”：保留现有单进程 phone-auth dev server 和 render-function 前端，不重做框架；沿登录 -> 创建项目 -> 解析 -> 资产确认 -> 校准 -> 生成 -> 导出这条链路补齐真实 API、idempotency、状态恢复、smoke 和文档。三人按 Platform/API、Frontend Integration、DX/QA/Ops 分工，所有任务都围绕 Local Runnable Alpha 出口。

**Tech Stack:** TypeScript, JavaScript ES modules, Node test runner, PGlite, existing `runIdempotentCommand`, existing phone-auth dev server, existing creator workbench.

---

## Split Execution Docs

This master plan coordinates the three-person delivery. Day-to-day execution should happen from the owner-specific plans:

- Developer A / Platform API: [2026-05-24-local-runnable-integration-developer-a-platform-api.md](./2026-05-24-local-runnable-integration-developer-a-platform-api.md)
- Developer B / Frontend Integration: [2026-05-24-local-runnable-integration-developer-b-frontend-integration.md](./2026-05-24-local-runnable-integration-developer-b-frontend-integration.md)
- Developer C / DX QA Ops: [2026-05-24-local-runnable-integration-developer-c-dx-qa-ops.md](./2026-05-24-local-runnable-integration-developer-c-dx-qa-ops.md)

## 0. 执行总则

本计划的第一版完成标准是 **Local Runnable Alpha**，不是准生产部署，也不是商业 Beta。

我对这份任务拆分具备 **100% 执行信心**。边界是：它能支撑三人把本地前后端真实打通、把幂等/错误/状态恢复/DX gate 落到可验收任务，并防止用假状态或只跑 HTTP API 冒充产品可运行；它不承诺商业 Beta、生产部署、真实支付、真实 Provider 成本对账或强并发额度正确性。

主链路：

```text
npm run dev
  -> 登录
  -> 创建项目
  -> 解析剧本
  -> 确认资产
  -> 校准/跳过校准
  -> 生成图片/视频
  -> 导出 preview/history
  -> 刷新后状态从后端恢复
```

每张任务卡必须回答：

| 问题 | 要求 |
| --- | --- |
| 背景 | 说明为什么做，不做会造成什么断点。 |
| 交付能力 | 写成可观察行为，不写成“改某文件”。 |
| 前置依赖 | 写清楚依赖谁、阻塞谁。 |
| 验证方式 | 写清楚测试命令和期望结果。 |
| 异常处理 | 写清楚错误码、重试、幂等或回退。 |
| 主链路贡献 | Yes/No；No 必须说明服务哪个 gate。 |

共同约束：

- 不重做 UI 视觉，不换前端框架。
- 不拆微服务。
- 主链路写操作必须走真实 API。
- Idempotent creator 写操作不得在 route 层使用 `Date.now()` 生成 replay key。
- 业务事实不得靠 localStorage 恢复。
- 当前测试入口继续使用 `npm test -- <target...>`。

## 1. 三人角色和边界

| 人员 | 角色 | 主责 | 明确不负责 |
| --- | --- | --- | --- |
| 开发 A | Platform/API Owner | dev server creator routes、idempotency header protocol、application service 错误映射、后端 route tests | 不改 UI 视觉；不把所有 server 代码重构成正式生产框架 |
| 开发 B | Frontend Integration Owner | creator API client、工作台真实 API 串联、状态恢复、前端错误体验 | 不写后端业务规则；不靠 localStorage 假闭环 |
| 开发 C | DX/QA/Ops Owner | npm scripts、local smoke、文档、验收清单、三人联调 gate | 不绕过真实 dev server；不把 mock-only 测试当主链路完成 |

批次节奏：

| 批次 | 目标 | A | B | C | 出口标准 |
| --- | --- | --- | --- | --- | --- |
| R0 | 协议冻结 | 主责 | Review | Review | Creator API Contract Matrix 写入本计划并被 A/B/C 引用 |
| R1 | 后端 route 硬化 | 主责 | API 对齐 | route smoke 草稿 | creator write routes 要求真实 key |
| R2 | 前端真实串联 | 支持 | 主责 | UI smoke 支持 | 刷新后 state 从 API 恢复 |
| R3 | DX + Smoke | 支持 | 支持 | 主责 | `npm run dev` + `npm run smoke:local` 可用 |
| R4 | Browser Dogfood | 支持 | 主责 | 主责 | 真实页面主链路通过 |
| R5 | 回归验收 | Review | Review | 主责 | `npm test`、HTTP smoke、Browser dogfood 全绿 |

## 1.1 R0 Creator API Contract Matrix

R0 是三人并行前的冻结产物。实现时不得绕过此表；如果代码现实要求调整，先更新此表和对应测试，再改实现。

| Route | Method | Operation | Idempotency | Frontend call | Backend owner | Required tests |
| --- | --- | --- | --- | --- | --- | --- |
| `/api/creator/project/create` | POST | `project.create` | Required, full replay/conflict | `creatorApi.createProject` | A | HTTP missing/replay/conflict + client header + smoke replay |
| `/api/creator/parse` | POST | `script.parse` | Required, full replay/conflict | `creatorApi.parseScript` | A | HTTP missing/replay/conflict + client header + smoke replay |
| `/api/creator/images/generate` | POST | `shot.image.generate` | Required, full replay/conflict before provider work | `creatorApi.generateImages` | A | service replay + HTTP missing/replay + smoke no duplicate provider requests |
| `/api/creator/videos/generate` | POST | `shot.video.generate` | Required, full replay/conflict before provider work | `creatorApi.generateVideos` | A | service replay + HTTP missing/replay + smoke no duplicate provider requests |
| `/api/creator/export/preview` | POST | `export.create` | Required, full replay/conflict | `creatorApi.previewExport` | A | service replay + HTTP missing/replay + smoke export history unchanged on replay |
| `/api/creator/assets/confirm` | POST | project edit | Not required in Local Alpha | `creatorApi.confirmAsset` | A | HTTP happy path + smoke |
| `/api/creator/assets/confirm-all` | POST | project edit | Not required in Local Alpha | `creatorApi.confirmAllAssets` | A | HTTP happy path + smoke |
| `/api/creator/calibration/run` | POST | `calibration.generate` | Required, full replay/conflict | `creatorApi.runCalibration` | A | service + HTTP + client header |
| `/api/creator/calibration/skip` | POST | `calibration.skip` | Required, full replay/conflict with reason/audit | `creatorApi.skipCalibration` | A | reason validation + audit + client header |
| `/api/creator/calibration/override` | POST | calibration override | Required, full replay/conflict with reason/audit | `creatorApi.overrideCalibration` | A | reason validation + audit + client header |

Decision:

- Required means route rejects missing `Idempotency-Key` with `400 { error: "idempotency_key_required" }`.
- Full replay/conflict means same key + same request returns the original resource/workflow response; same key + different request returns `409 { error: "idempotency_conflict" }`.
- Provider-backed generation must create or reuse provider requests before external submission; replay must not submit external work twice.
- If implementation discovers an operation cannot be made replay-safe in this iteration, it must be explicitly downgraded in this matrix and removed from smoke idempotency assertions before merge.

## 2. 开发 A：Platform/API 任务

### A0: Creator API Contract Matrix Freeze

| 字段 | 内容 |
| --- | --- |
| 背景 | A/B/C 会同时改 route、client 和 smoke；没有冻结矩阵就会出现前端发送 key、后端未接、smoke 锁错行为。 |
| 交付能力 | 本计划中的 R0 Creator API Contract Matrix 与当前实现差距被确认；每个 route 的 idempotency、错误码、response、测试归属明确。 |
| 前置依赖 | 现有 contracts、dev server routes、creator API client。 |
| 验证方式 | `npm test -- packages/contracts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts apps/web/tests/project-workbench-generation.spec.ts`。 |
| 异常处理 | 发现矩阵和 contract 冲突时，以 `packages/contracts` 为准，更新矩阵并记录降级项；不允许实现者私自决定。 |
| 主链路贡献 | Yes。它是三人并行的接口地基。 |

**Files:**

- Modify: `docs/superpowers/plans/2026-05-24-local-runnable-integration-three-developer-plan.md`
- Modify if contract drift is found: `packages/contracts/api/*.ts`

- [ ] Step 1: 对照 `packages/contracts/api` 和 `phone-auth-dev-server.ts` 检查矩阵每行。
- [ ] Step 2: 标出当前缺口：create/parse route key、generation/export replay、calibration audit idempotency。
- [ ] Step 3: 确认 smoke 只断言矩阵中 `Required, full replay/conflict` 的能力。
- [ ] Step 4: 运行 contract 和现有 route/client tests，确认 baseline。

### A1: Creator Write Route Idempotency Protocol

| 字段 | 内容 |
| --- | --- |
| 背景 | 当前 billing/admin routes 已要求 `Idempotency-Key`，但 creator create/parse routes 仍由 dev server 用 `Date.now()` 生成 key。双击、刷新重试或 smoke replay 无法证明真实幂等。 |
| 交付能力 | R0 矩阵中 Required 的 creator 写操作读取 `Idempotency-Key`；缺失时返回 `400 { error: "idempotency_key_required" }`；同 key 同请求 replay 返回同一资源或 workflow。 |
| 前置依赖 | A0；现有 `runIdempotentCommand`、`createSqlProjectCommandHandler`、`createSqlParseScriptCommandHandler`。 |
| 验证方式 | `npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts apps/backend/src/modules/project/tests/sql-project.command.spec.ts`。 |
| 异常处理 | same key different body -> `409 idempotency_conflict`；processing -> `202 idempotency_processing`；缺失 header -> 400。 |
| 主链路贡献 | Yes。保护创建项目、解析剧本不重复。 |

**Files:**

- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- Modify if needed: `apps/backend/src/modules/project/creator-application.service.ts`

- [ ] Step 1: 在 HTTP 测试里新增 creator create 缺失 `Idempotency-Key` 返回 400。
- [ ] Step 2: 在 HTTP 测试里新增同一 create key replay 只产生一个 project。
- [ ] Step 3: 在 HTTP 测试里新增同一 create key 不同 body 返回 `idempotency_conflict`。
- [ ] Step 4: 对 parse route 添加同类缺失 key 和 replay 测试。
- [ ] Step 5: 修改 dev server creator create/parse routes，使用 `requiredIdempotencyKeyFromRequest`，移除 `Date.now()` key。
- [ ] Step 6: 运行目标测试，确认通过。

### A1.5: Generation, Calibration, and Export Idempotency Alignment

| 字段 | 内容 |
| --- | --- |
| 背景 | 技术方案要求 contract idempotent creator 写操作都有真实 replay/conflict。若 generation/export 只带 header 但不 replay-safe，会制造虚假的安全感。 |
| 交付能力 | image/video generation、export preview、calibration run/skip/override 按 R0 矩阵接入真实 idempotency；replay 不重复创建昂贵 workflow/provider request/export record。 |
| 前置依赖 | A0、A1；现有 workflow-task、provider-request、export-record、audit tests。 |
| 验证方式 | `npm test -- apps/backend/src/modules/project/tests/creator-application.service.spec.ts apps/backend/src/modules/project/tests/creator-platform.service.spec.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`。 |
| 异常处理 | replay 返回原 workflow/export/calibration result；different body 返回 409；provider submission 已开始时不得盲重试。 |
| 主链路贡献 | Yes。它让“前端发送 key”变成真实系统保证。 |

**Files:**

- Modify: `apps/backend/src/modules/project/creator-application.service.ts`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/modules/project/tests/creator-application.service.spec.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] Step 1: 为 image generation 写 replay 测试：同 key 不增加 provider_requests 数量。
- [ ] Step 2: 为 video generation 写 replay 测试：同 key 不增加 provider_requests 数量。
- [ ] Step 3: 为 export preview 写 replay 测试：同 key 返回同一 export record。
- [ ] Step 4: 为 calibration run/skip/override 写 replay/audit 测试。
- [ ] Step 5: 将 route idempotencyKey 传入 application service；缺失 key 按矩阵拒绝。
- [ ] Step 6: 运行 project + entrypoint tests。

### A2: Creator Route Error Mapping

| 字段 | 内容 |
| --- | --- |
| 背景 | 当前 dev server 顶层 catch 会把很多业务错误变成 500，前端只能显示原始 message。Local Alpha 需要稳定错误码。 |
| 交付能力 | creator API route 对 validation、auth、forbidden、idempotency、business state error 做稳定 HTTP 映射。 |
| 前置依赖 | A1。 |
| 验证方式 | `npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`。 |
| 异常处理 | 未识别错误仍为 500，但 body 保持 `{ error: "internal_error" | message }`，测试只锁定已知错误。 |
| 主链路贡献 | Yes。前端可做友好错误体验。 |

**Files:**

- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] Step 1: 新增未登录访问 creator API 返回 401 测试。
- [ ] Step 2: 新增非法 create input 返回 400 + `fieldErrors` 测试。
- [ ] Step 3: 新增 parse 在缺失 project/script 状态下返回稳定业务错误测试。
- [ ] Step 4: 抽小 helper `writeKnownError` 或等价函数，避免 route 重复 catch。
- [ ] Step 5: 运行 entrypoint 测试。

### A3: Creator Application Boundary Slimming

| 字段 | 内容 |
| --- | --- |
| 背景 | `creator-application.service.ts` 已经承担大量状态水合和 route 编排，继续堆会让后续开发变慢。 |
| 交付能力 | 在不改变 response shape 的前提下，明确拆出两个边界：state hydration helper 与 dev compatibility helper；`creator-application.service.ts` 保留 command/query 编排，不再直接承载 SQL hydration 细节。 |
| 前置依赖 | A1/A2 测试先稳定。 |
| 验证方式 | `npm test -- apps/backend/src/modules/project/tests/creator-application.service.spec.ts`。 |
| 异常处理 | 只做边界整理，不改变 response shape；任何 response shape 改动必须同步 B/C。 |
| 主链路贡献 | No direct。服务模块化单体硬化。 |

**Files:**

- Modify: `apps/backend/src/modules/project/creator-application.service.ts`
- Create: `apps/backend/src/modules/project/creator-state-hydration.service.ts`
- Create: `apps/backend/src/modules/project/creator-dev-state.service.ts`

- [ ] Step 1: 用现有 creator application tests 作为保护网。
- [ ] Step 2: 创建 `creator-state-hydration.service.ts`，移动 `hydrateStateFromSql` 及其直属 helper。
- [ ] Step 3: 创建 `creator-dev-state.service.ts`，移动 `CreatorDevApp`/SQL state bridge 相关 helper。
- [ ] Step 4: 保持 `createCreatorApplication` public API 和所有 HTTP response shape 不变。
- [ ] Step 5: 运行 project module tests。

## 3. 开发 B：Frontend Integration 任务

### B1: Idempotent Creator API Client

| 字段 | 内容 |
| --- | --- |
| 背景 | 后端要求 idempotency 后，前端必须为一次用户动作生成并携带稳定 key，否则主链路写操作会 400。 |
| 交付能力 | `creatorApi` 为 R0 矩阵中 Required 的写操作发送 `Idempotency-Key`，且测试证明 header 与 operation 对齐。 |
| 前置依赖 | A1 route 协议。可先用测试约定并行开发。 |
| 验证方式 | `npm test -- apps/web/tests/project-workbench-generation.spec.ts` 或新增 API client unit test。 |
| 异常处理 | 同一次 `runAction` 内 retry 使用同一 key；新用户动作生成新 key；缺失 crypto 时用 timestamp + random fallback。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `apps/web/src/shared/creator-api.js`
- Create or modify: `apps/web/tests/creator-api.spec.ts`

- [ ] Step 1: 给 `postJson` 增加可选 headers/options。
- [ ] Step 2: 实现 `createIdempotencyKey(operationName)` helper。
- [ ] Step 3: 为 R0 矩阵中 Required 的 creator 写方法添加 header。
- [ ] Step 4: 新增测试断言 fetch 收到 `idempotency-key`。
- [ ] Step 5: 确保 non-idempotent 轻量操作不强行加 key，除非后端要求。

### B2: Workbench Business State Comes From API

| 字段 | 内容 |
| --- | --- |
| 背景 | 当前工作台已有 `refresh()`，但仍存在 UI-local storyboards/custom episodes/imported assets 等状态和后端事实混用。Local Alpha 需要刷新后从 API 恢复主链路事实。 |
| 交付能力 | 创建、解析、资产确认、校准、生成、导出后统一 `refresh()`；项目、资产、分镜、导出历史以 API response 为准。 |
| 前置依赖 | A1/A2 基础协议；现有 creator API。 |
| 验证方式 | `npm test -- apps/web/tests/project-workbench-generation.spec.ts apps/web/tests/assets-team-commercial-qa.spec.ts`。 |
| 异常处理 | API 404 project_not_found 时回到项目库；401 时跳登录；业务错误用中文 toast。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify if needed: `apps/web/src/features/production-workbench/storyboard-state.js`
- Modify tests under `apps/web/tests/*`

- [ ] Step 1: 标记哪些 UI state 只允许本地保存：modal、tab、filter、draft。
- [ ] Step 2: 确认 action 成功后都调用 `refresh()`，不直接伪造完成状态。
- [ ] Step 3: 删除或隔离用于业务事实恢复的 localStorage 依赖。
- [ ] Step 4: 新增刷新恢复测试：给定 API state，render 出项目、分镜、导出状态。
- [ ] Step 5: 运行 web tests。

### B3: Frontend Error Experience

| 字段 | 内容 |
| --- | --- |
| 背景 | 可运行系统不只是 happy path。研发 dogfood 时需要从 UI 上知道是未登录、权限、幂等冲突、业务状态还是服务端错误。 |
| 交付能力 | `creatorApi` 保留 machine error code；workbench 把常见错误翻译成稳定中文 toast，不暴露内部堆栈。 |
| 前置依赖 | A2 错误映射。 |
| 验证方式 | `npm test -- apps/web/tests/project-workbench-generation.spec.ts apps/web/tests/login-page.spec.ts`。 |
| 异常处理 | 401 触发回登录；409 提示重复提交/刷新；400 fieldErrors 显示到 modal notice。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify tests under `apps/web/tests/*`

- [ ] Step 1: 定义 `ApiError` 或等价 plain object，包含 `status`、`code`、`fieldErrors`。
- [ ] Step 2: 更新 `fetchJson`，失败时抛出结构化错误。
- [ ] Step 3: 更新 `friendlyError` 映射常见 creator/auth/idempotency 错误。
- [ ] Step 4: 表单类错误写入 modal notice，非表单错误写入 toast。
- [ ] Step 5: 增加测试覆盖 create project invalid input 和 idempotency conflict copy。

## 4. 开发 C：DX / QA / Ops 任务

### C1: Local Dev Scripts

| 字段 | 内容 |
| --- | --- |
| 背景 | 目前 package scripts 只有 `test` 和 `dev:phone-auth`。对新研发来说，本地启动和分组测试不够直觉。 |
| 交付能力 | 提供稳定脚本：`dev`、`test:backend`、`test:web`、`test:contracts`、`smoke:local`。 |
| 前置依赖 | 现有 test runner；C2 smoke 可先占位后补。 |
| 验证方式 | 逐个运行脚本，确认命令有效。 |
| 异常处理 | 如果端口被占用，文档说明用 `PORT=xxxx npm run dev`。 |
| 主链路贡献 | Yes。降低启动摩擦。 |

**Files:**

- Modify: `package.json`
- Modify if needed: `scripts/run-phone-auth-dev-server.mjs`
- Create: `scripts/run-local-smoke.mjs`

- [ ] Step 1: 添加 `dev` alias 到现有 dev server。
- [ ] Step 2: 添加 backend/web/contracts 分组测试脚本。
- [ ] Step 3: 添加 `smoke:local` 脚本，先指向 C2 harness。
- [ ] Step 4: 运行每个脚本，记录期望输出。

### C2: Local Runnable Smoke Harness

| 字段 | 内容 |
| --- | --- |
| 背景 | 单元测试很多，但缺一个“我真的能从登录跑到导出”的一键验收。 |
| 交付能力 | `npm run smoke:local` 启动本地 dev server 或连接指定 `SMOKE_BASE_URL`，跑完整 creator 主链路。 |
| 前置依赖 | A1/B1 协议确定；可复用 entrypoint tests 逻辑。 |
| 验证方式 | `npm run smoke:local`，期望 PASS 并打印关键步骤。 |
| 异常处理 | 任一步失败打印 status、error code、last response；结束时关闭自启动 server。 |
| 主链路贡献 | Yes。Local Alpha 的核心 gate。 |

**Files:**

- Create: `scripts/run-local-smoke.mjs`
- Modify: `package.json`
- Modify if useful: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] Step 1: 从 phone-auth dev server test 抽取或复制最小 HTTP flow。
- [ ] Step 2: 支持无 `SMOKE_BASE_URL` 时自动启动 server。
- [ ] Step 3: 支持有 `SMOKE_BASE_URL` 时连接已有 server。
- [ ] Step 4: 每个步骤输出简短 label：auth、create、parse、assets、calibration、image、video、export。
- [ ] Step 5: 最终断言 export ready、history 非空、state 可恢复。

### C2.5: Browser Dogfood Gate

| 字段 | 内容 |
| --- | --- |
| 背景 | HTTP smoke 只能证明 API 可用，不能证明真实前端事件、cookie、hash、表单和 toast 与后端串联。用户目标是整个项目真正可运行。 |
| 交付能力 | 提供一条真实页面验收路径，打开本地 URL 并在 UI 内完成登录到导出；可以先手工 checklist，优先自动化。 |
| 前置依赖 | A1/A1.5/B1/B2/C1。 |
| 验证方式 | `npm run dev` 后执行 Browser/Playwright dogfood，或按文档 checklist 记录通过步骤和截图。 |
| 异常处理 | 任一步失败记录页面、action、API response、console error；失败即不能进入 Local Alpha Done。 |
| 主链路贡献 | Yes。它证明前后端真的打通。 |

**Files:**

- Create if automated: `apps/web/e2e/local-runnable-alpha.spec.ts`
- Modify: `docs/local-dev/local-runnable-alpha.md`
- Modify: `docs/ops/p0-release-rollback-checklist.md`

- [ ] Step 1: 写 Browser dogfood checklist：登录、创建、解析、确认资产、校准、生成、导出、刷新恢复。
- [ ] Step 2: 如果使用自动化，添加最小 browser e2e；如果先手工，记录所需截图/日志。
- [ ] Step 3: 把 Browser dogfood 作为 R5 必跑 gate 写入 release checklist。
- [ ] Step 4: 执行一次 gate，记录结果。

### C3: Local Dev Documentation

| 字段 | 内容 |
| --- | --- |
| 背景 | DX 的核心是让后来的人少猜。当前 runtime 文档已有 provider/storage 配置，但缺一份从 0 到跑通的 local alpha 指南。 |
| 交付能力 | 文档说明启动、登录、验证码 debug、脚本、smoke、常见错误、provider/storage 模式。 |
| 前置依赖 | C1/C2 脚本命名稳定。 |
| 验证方式 | `npm test -- apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts` 或新增 docs spec。 |
| 异常处理 | 文档必须说明端口占用、401、idempotency_key_required、provider mode 缺 env 的处理。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `docs/local-dev/creator-platform-runtime.md`
- Create if useful: `docs/local-dev/local-runnable-alpha.md`
- Modify: `apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts`

- [ ] Step 1: 写 local runnable alpha 指南。
- [ ] Step 2: 补脚本表和 smoke 期望输出。
- [ ] Step 3: 补常见错误表。
- [ ] Step 4: 写 docs readiness test，确保关键命令不会从文档消失。

### C4: Integration Gate and Release Checklist Update

| 字段 | 内容 |
| --- | --- |
| 背景 | 三人并行容易出现“我这里通过了，但主链路坏了”。需要一个合并前共同 gate。 |
| 交付能力 | 更新 P0 release/rollback checklist，把 Local Runnable Alpha gate 纳入合并检查。 |
| 前置依赖 | C1/C2/C3。 |
| 验证方式 | `npm test -- apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts`。 |
| 异常处理 | smoke 失败不能进入 Done；允许跳过真实 provider/payment gate，但必须注明不在本次范围。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `docs/ops/p0-release-rollback-checklist.md`
- Modify: `docs/ops/p0-creator-ops-runbook.md`
- Modify: `apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts`

- [ ] Step 1: 在 release checklist 增加 Local Runnable Alpha section。
- [ ] Step 2: 写合并前命令：`npm test`、`npm run smoke:local`。
- [ ] Step 3: 写失败处理：回滚本次改动、保留日志、记录失败步骤。
- [ ] Step 4: 更新 docs readiness test。

## 5. 联调顺序

```text
R0 协议冻结
  A1 route header contract
  B1 client key contract
  C2 smoke request contract

R1 后端先绿
  A1 + A2 tests pass

R2 前端接入
  B1 + B2 + B3 tests pass

R3 DX/Smoke
  C1 + C2 + C3 pass

R4 Browser Dogfood
  C2.5 real page gate passes

R5 全量验收
  npm test
  npm run smoke:local
  browser dogfood evidence
```

并行建议：

- A 做 A1 时，B 可以先写 `creator-api` header tests，C 可以先搭 smoke harness skeleton。
- A2 未完成前，B 不要锁定错误 copy，只做结构化错误承载。
- C2 smoke 的最终断言等 A/B 协议稳定后再锁。

## 6. 全局验收命令

```bash
npm test
```

Expected: 全部通过；允许既有 skipped tests 保持 skipped，但不得新增无说明 skipped。

```bash
npm run dev
```

Expected: 启动本地 server，输出 `http://127.0.0.1:<port>`，浏览器打开可登录。

```bash
npm run smoke:local
```

Expected: 完整打印 auth/create/parse/assets/calibration/image/video/export PASS，最终退出码 0。

```bash
npm run dev
# then run browser dogfood gate from docs/local-dev/local-runnable-alpha.md
```

Expected: 真实页面完成登录到导出，并在刷新后恢复项目状态。

```bash
npm run test:backend
npm run test:web
npm run test:contracts
```

Expected: 分组测试均通过。

## 7. Assumptions and Defaults

- 本次默认使用现有 PGlite memory DB；每次 dev server 重启会重置数据，这是 Local Alpha 可接受行为。
- 本次默认 provider/storage 使用 `.env.example` 中的 dev mode。
- 本次不要求 browser E2E；`smoke:local` 先用 Node fetch 覆盖真实 HTTP 主链路。
- 本次要求 Browser dogfood gate；可以先手工 checklist，后续再自动化。
- 本次不要求支付和 Admin/Ops 页面进入主链路。
- 本次不提交真实 API key、不新增生产部署配置。
- 本次不改变视觉设计，只做行为、错误体验和可运行性改进。
