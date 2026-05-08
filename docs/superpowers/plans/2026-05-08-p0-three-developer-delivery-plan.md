# P0 三人开发交付 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 P0 从模块实施蓝图拆成三名开发人员可每天推进、每周验收、风险提前暴露、最终可稳定上线的开发任务体系。

**Architecture:** 三个人不按“前端/后端/测试”粗暴分层，而按一条真实主链路上的责任切分：A 保证系统可信，B 保证业务成立，C 保证用户可用、可验收、可上线。所有任务都围绕最小可运行闭环推进：登录 -> 创建项目 -> 解析剧本 -> 资产确认 -> 分镜/校准 -> 生图 -> 导出。

**Tech Stack:** TypeScript, Node test runner, PostgreSQL migration/repository, shared contracts under `packages/contracts`, modular backend modules, Web E2E later, M0.1 verification gates.

---

## 0. 执行总则

项目真正落地，不靠任务数量多，而靠每个任务都能回答：

```text
1. 背景是什么：开发人员知道 what 和 why。
2. 交付什么能力：不是写哪个文件，而是交付哪个可验证行为。
3. 依赖什么前提：谁阻塞我，我阻塞谁。
4. 怎么验证完成：测试、联调、验收、日志证据是什么。
5. 出错怎么处理：错误码、状态流转、重试、补偿、审计。
6. 是否推进主链路闭环：Yes/No；No 必须说明服务哪个上线 gate。
```

任务进入 `Done` 的最低要求：

- 有代码或文档产物。
- 有自动化测试或明确验收证据。
- 有异常路径处理。
- 有权限/租户边界说明。
- 有观测字段或说明不需要。
- PR 引用 verification ID 或明确说明是前置工程任务。

## 1. 三人角色与边界

| 人员 | 角色 | 主责 | 不负责 |
| --- | --- | --- | --- |
| 开发 A | Platform / Reliability Owner | M1 平台基础、DB/迁移、认证、租户、权限、幂等、Outbox/Inbox、Workflow/Task、Storage/Signed URL、Provider 安全、信用账本、支付可靠性 gate | 不绕过业务模块直接写 Project/Shot 业务规则；不做 UI 假闭环 |
| 开发 B | Creator Domain Owner | Project、Script、Asset、Shot、Calibration、Export、Mock ModelGateway、P0-A 主链路后端 | 不实现支付；不直接调用 provider；不绕过 Workflow/Task 创建长任务 |
| 开发 C | Experience / QA / Ops Owner | Web 工作台、API 联调、E2E、验收用例、错误码体验、日志/指标/发布/Runbook/Admin Lite | 不用假接口/假状态宣称闭环完成；不绕过后端权限和持久状态 |

三人共同规则：

- 状态名、operation name、event type 不能私自改。要改必须写 contract-change record。
- 所有主链路写操作必须经过 ActorContext、capability、tenant scope、idempotency。
- 每周验收只看可运行闭环和测试证据，不看“我写了很多代码”。

## 2. 交付批次和负责人

| 批次 | 目标 | A | B | C | 出口标准 |
| --- | --- | --- | --- | --- | --- |
| B0 M0.1 | 合同和执行系统就绪 | 主责 | Review | Review | Contract tests 通过，三人计划可执行 |
| B1 M1 | 真实登录、租户、权限、审计 | 主责 | 领域测试草稿 | Auth/UI/E2E 壳 | Auth/RBAC/tenant/audit tests 通过 |
| B2 M2 Skeleton | Project + Script parse workflow + 状态查询 | Workflow/Task/idempotency | Project/Script/mock parse | Project create UI/E2E | 创建项目 -> 解析 workflow -> 刷新恢复 |
| B3 M2 Closure | Asset/Shot/Calibration/Image/Export 闭环 | 支持 long task + Storage/Signed URL | 主责 | 工作台/E2E/验收 | P0-A mock provider E2E 通过 |
| B4 M3 | Provider 副作用保护 | 主责 | 接入生成链路 | 故障测试 | A-001 no-blind-retry 通过 |
| B5 M4 | Repair/Credit/Admin/Ops | 主责 | 业务状态协作 | Ops UI/runbook | Redis loss、lease、credit、manual review gates 通过 |
| B6 M5 | Commerce/Payment gate | 主责 | 消费 credit 能力 | Admin/Ops 验收 | Payment callback/credit/refund/invoice gates 通过 |
| B7 M6 | Commercial beta ready | 支持指标 | 支持业务 smoke | 主责 | staging dry-run、rollback、ops drill 通过 |

## 2.5 文件结构总览

这份计划锁定的是开发入口和边界，不是最终目录结构。实现时优先沿用现有模块风格；如果实际代码结构已有同名模块，应在原模块下补文件，不做无关重构。

| 区域 | 主要路径 | 责任边界 | 负责人 |
| --- | --- | --- | --- |
| Shared contracts | `packages/contracts/domain/*`, `packages/contracts/api/*`, `packages/contracts/events/*` | 状态名、operation name、capability、event type 的唯一来源 | A 主责，B/C review |
| DB foundation | `packages/db/migrations/0001_foundation.sql` | P0 foundation schema、约束、幂等、workflow/task、outbox/inbox | A |
| Identity / Organization | `apps/backend/src/modules/identity/*`, `apps/backend/src/modules/organization/*` | 登录、session、actor context、租户权限 | A |
| Shared reliability | `apps/backend/src/modules/shared/*`, `apps/backend/src/modules/workflow-task/*`, `apps/backend/src/modules/model-gateway/*` | 幂等、outbox/inbox、workflow/task、provider 副作用保护、repair | A |
| Storage adapter | `apps/backend/src/modules/storage/*` | 对象存储 key、metadata、signed URL、导出包对象访问的唯一基础设施边界 | A |
| Billing / Payment | `apps/backend/src/modules/credit-billing/*`, `apps/backend/src/modules/commerce-payment/*` | credit ledger、reservation、payment callback、refund/invoice gate | A |
| Creator domain | `apps/backend/src/modules/project/*`, `apps/backend/src/modules/asset/*`, `apps/backend/src/modules/shot/*`, `apps/backend/src/modules/quality-review/*`, `apps/backend/src/modules/export/*` | Project、Script、Asset、Shot、Calibration、Generation、Export 的业务事实 | B |
| Web experience | `apps/web/src/app/*`, `apps/web/src/features/*` | 真实 API 驱动的工作台、错误体验、状态恢复、用户闭环 | C |
| E2E / Ops docs | `apps/web/e2e/p0/*`, `docs/architecture/runbooks/*`, `docs/architecture/release-checklist.md` | 主链路回归、故障定位、上线/回滚证据 | C |

## 2.6 命令契约矩阵

后端 handler、前端 client、E2E fixture 都必须引用同一份 command contract。任何新增或改名都先改 `packages/contracts/api/*` 并通过 contract tests，不能在 UI 或 controller 里私自发明接口。

| 能力 | Contract | Operation name | Capability | Owner | 首个落地点 |
| --- | --- | --- | --- | --- | --- |
| 创建项目 | `packages/contracts/api/project.commands.ts#CreateProject` | `project.create` | `project:create` | B | B1 + C2 |
| 解析剧本 | `packages/contracts/api/project.commands.ts#ParseScript` | `script.parse` | `project:edit` | B | B2 + C2/C3 |
| 分镜拆分 | `packages/contracts/api/project.commands.ts#SplitShots` | `shots.split` | `project:edit` | B | B4/C5 |
| 生成校准 | `packages/contracts/api/calibration.commands.ts#GenerateCalibration` | `calibration.generate` | `generation:start` | B | B6 + C5 |
| 通过校准 | `packages/contracts/api/calibration.commands.ts#PassCalibration` | `calibration.pass` | `project:edit` | B | B6 + C5 |
| 跳过校准 | `packages/contracts/api/calibration.commands.ts#SkipCalibration` | `calibration.skip` | `project:edit` | B | B6 + C5 |
| 生成分镜图 | `packages/contracts/api/shot.commands.ts#GenerateShotImage` | `shot.image.generate` | `generation:start` | B | B7 + C6 |
| 生成分镜视频 | `packages/contracts/api/shot.commands.ts#GenerateShotVideo` | `shot.video.generate` | `generation:start` | B | B8 + C6 |
| 创建导出 | `packages/contracts/api/export.commands.ts#CreateExport` | `export.create` | `export:create` | B | B9 + C7 |
| 创建订单 | `packages/contracts/api/billing.commands.ts#CreateBillingOrder` | `billing.create_order` | `billing:purchase` | A | A9 |
| 创建支付意图 | `packages/contracts/api/billing.commands.ts#CreatePaymentIntent` | `billing.create_payment_intent` | `billing:purchase` | A | A9 |
| 申请退款 | `packages/contracts/api/billing.commands.ts#RequestRefund` | `billing.request_refund` | `billing:refund` | A | A9 |

## 2.7 幂等依赖拆分规则

避免 A5 与 B1/B2 形成循环依赖：

- M0.1 已提供 operation-scoped idempotency contract 和 shared helper，这是 B1/B2 可以开工的基础。
- B1/B2/B7/B9 在各自命令里接入 shared helper，并写对应 idempotency tests。
- A5 不是 B1 的前置阻塞项；A5 是跨模块 hardening/review 任务，负责把所有 creator command 的幂等语义统一验收。

## 2.8 全局验证命令

每个任务的局部测试在任务卡里定义；批次出口必须至少运行下列 gate 中对应部分。

```bash
pnpm test packages/contracts
```

Expected: API command contracts 和 event contracts 全部通过。

```bash
pnpm test apps/backend/src/modules/shared
```

Expected: state dictionary、idempotency、outbox/inbox shared tests 全部通过。

```bash
pnpm test apps/backend/src/modules/identity apps/backend/src/modules/organization
```

Expected: M1 auth、actor context、tenant/capability tests 全部通过。

```bash
pnpm test apps/backend/src/modules/workflow-task apps/backend/src/modules/model-gateway
```

Expected: workflow/task claim、finalization、provider no-blind-retry tests 全部通过。

```bash
pnpm test apps/backend/src/modules/project apps/backend/src/modules/asset apps/backend/src/modules/shot apps/backend/src/modules/quality-review apps/backend/src/modules/export
```

Expected: P0-A creator domain tests 全部通过。

```bash
pnpm test apps/web/e2e/p0
```

Expected: login -> create project -> parse script -> confirm assets -> calibrate -> generate image -> export 的 P0-A E2E 通过。

## 3. 依赖图

```text
B0 Contracts
  -> A1/A2/A3 平台基础
      -> B1/B2 Project + Script parse
          -> A4 Workflow/Task + A-S1 Storage + B3/B4 Asset/Shot
              -> B5 Calibration
                  -> B6 Generate Image
                      -> B7 Export
                          -> C8 P0-A E2E
                              -> A6 Provider Safety
                                  -> A7/A8 Reliability + Credit
                                      -> A9 Payment Gate
                                          -> C9 Release/Ops
```

最关键阻塞：

- B 的 Project/Shot 不能早于 A 的 ActorContext + tenant-safe query。
- C 的 E2E 不能用假状态替代后端持久状态。
- AssetVersion 和 Export 不能早于 A-S1 Storage adapter/signed URL contract。
- 真 provider 不能早于 A6 ProviderRequest pre-call persistence。
- 支付不能早于 A8 credit ledger 和官方/财税 gate。

## 4. 开发 A：Platform / Reliability 任务

### Task A1: Email-Code 登录和 Session

**背景 / Why:** 所有 P0 能力都必须在真实用户、真实 session、真实租户上下文下运行。没有这个，Project/Shot 即使写完也不能证明权限和数据隔离正确。

**交付能力:** 用户通过 email-code 登录，系统创建可撤销 server-side session。

**前置依赖:** M0.1 foundation SQL；`users`、`login_codes`、`auth_sessions` 表；Node test runner。

**推进主链路:** Yes。它是“登录 -> 创建项目”的入口。

**Files:**
- Modify: `packages/db/migrations/0001_foundation.sql`
- Create: `apps/backend/src/modules/identity/login-code.service.ts`
- Create: `apps/backend/src/modules/identity/session.service.ts`
- Test: `apps/backend/src/modules/identity/tests/login-code.spec.ts`
- Test: `apps/backend/src/modules/identity/tests/session.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 code hash、verify、consume once、expired/revoked、resend rate limit、verify lockout、IP/email bucket、session token hash、revoke 后不可用。
- [ ] Step 2: 运行 `pnpm test apps/backend/src/modules/identity`，确认因 service 缺失失败。
- [ ] Step 3: 实现最小 login-code/session domain service。明文 code/token 不落库、不进日志。
- [ ] Step 4: 补错误码：`code_expired`、`code_consumed`、`code_invalid`、`user_disabled`。
- [ ] Step 5: 运行 `pnpm test apps/backend/src/modules/identity`，确认通过。
- [ ] Step 6: Commit: `feat: add email-code auth foundation`

**异常处理:** 错码稳定；验证码错误增加 attempt count；resend/verify 触发 rate limit 后返回稳定错误；已消费/过期 code 不能复用；disabled user 拒绝登录。

**完成标准:** 测试通过；无明文敏感信息；session 可撤销；rate limit 和 lockout 可配置；日志只允许 email hash/userId。

### Task A2: ActorContext、Capability、Tenant-Safe Query

**背景 / Why:** 多租户系统最大风险是“接口能跑但越权读写”。必须在任何业务模块前建立后端权限边界。

**交付能力:** 从 session 解析 `ActorContext`，并用 `assertCapability` 和 tenant-safe query helper 阻止越权。

**前置依赖:** A1 session；`organizations`、`workspaces`、`memberships`。

**推进主链路:** Yes。它解锁所有 Project/Script/Shot 命令。

**Files:**
- Create: `apps/backend/src/modules/organization/actor-context.service.ts`
- Create: `apps/backend/src/modules/organization/capability.service.ts`
- Create: `apps/backend/src/modules/shared/db/tenant-scope.ts`
- Test: `apps/backend/src/modules/organization/tests/actor-context.spec.ts`
- Test: `apps/backend/src/modules/organization/tests/tenant-permission.spec.ts`
- Test: `apps/backend/src/modules/shared/db/tests/tenant-scope.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 401、403、disabled user、suspended org、missing membership、无 capability、跨 org 查询。
- [ ] Step 2: 运行 `pnpm test apps/backend/src/modules/organization apps/backend/src/modules/shared/db`，确认失败。
- [ ] Step 3: 实现 `resolveActorContext`、`assertCapability`、tenant scope guard。
- [ ] Step 4: 所有 tenant-owned query helper 必须要求 `organizationId`；project-owned 还要 `projectId`。
- [ ] Step 5: 运行对应测试，确认通过。
- [ ] Step 6: Commit: `feat: add actor context and tenant scope guards`

**异常处理:** command handler 前拒绝；记录 `traceId/userId/organizationId/reason`。

**完成标准:** 所有受保护命令可以复用；跨租户测试失败即阻塞 B1/B2。

### Task A3: Audit Append Helper

**背景 / Why:** 校准 skip、导出、Admin/Ops、支付退款都需要可追责。审计不是后补功能。

**交付能力:** 追加式 audit event builder/repository contract。

**前置依赖:** A2 ActorContext。

**推进主链路:** Yes，支持校准 skip、导出和后续 Ops。

**Files:**
- Create: `apps/backend/src/modules/audit/audit.service.ts`
- Test: `apps/backend/src/modules/audit/tests/audit.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 actor/scope/target/eventType/metadata、append-only、敏感 admin action 缺 reason 拒绝。
- [ ] Step 2: 运行 `pnpm test apps/backend/src/modules/audit/tests/audit.spec.ts`，确认失败。
- [ ] Step 3: 实现 audit event builder，metadata 必须脱敏。
- [ ] Step 4: 运行测试，确认通过。
- [ ] Step 5: Commit: `feat: add audit append helper`

**异常处理:** 高风险命令审计失败不得静默成功；低风险事件可后续进入 outbox repair。

**完成标准:** 审计事件不可变；字段完整；敏感 metadata 不泄露。

### Task A-S1: Storage Adapter + Signed URL Contract

**背景 / Why:** AssetVersion 和 Export 都会引用对象存储。如果没有统一 storage adapter，开发 B 可能把对象 key、bucket、公开 URL 和权限判断散落到 Asset/Export 里，后续会变成数据泄露和迁移事故。

**交付能力:** 提供 server-only storage adapter contract，支持生成稳定 object key、写入 mock/local object metadata、读取安全 metadata、按租户权限生成短期 signed download URL。

**前置依赖:** A2 ActorContext；`asset_versions`、`exports` schema draft；本地/mock storage 配置。

**推进主链路:** Yes。它解锁 AssetVersion、shot image/video output、export package download。

**Files:**
- Create: `apps/backend/src/modules/storage/storage-adapter.contract.ts`
- Create: `apps/backend/src/modules/storage/local-storage-adapter.ts`
- Create: `apps/backend/src/modules/storage/signed-url.service.ts`
- Test: `apps/backend/src/modules/storage/tests/storage-key-scope.spec.ts`
- Test: `apps/backend/src/modules/storage/tests/signed-url-authorization.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 object key 必须含 organization/project scope、跨租户 signed URL 拒绝、过期 URL 不可刷新为永久 URL。
- [ ] Step 2: 运行 `pnpm test apps/backend/src/modules/storage`，确认因 adapter/service 缺失失败。
- [ ] Step 3: 实现最小 local/mock adapter；不引入真实云 SDK。
- [ ] Step 4: 实现 signed URL service，只接受通过 ActorContext/capability 校验的请求。
- [ ] Step 5: 运行 storage tests，确认通过。
- [ ] Step 6: Commit: `feat: add storage adapter contract`

**异常处理:** 存储写失败返回 retryable infrastructure error；metadata 不完整时禁止创建 AssetVersion；跨租户下载返回 403 并记录 audit/security log。

**完成标准:** B3/B9 只能拿 storage object reference，不能直接拼公开 URL；C7 下载入口必须经过 signed URL service。

### Task A4: Workflow/Task/Attempt 骨架

**背景 / Why:** P0 的核心复杂度不是 UI，而是长任务持久状态。BullMQ 只是调度，不是真相源。

**交付能力:** 创建 durable workflow/task/attempt，支持 claim、status query、finalization skeleton。

**前置依赖:** A2、A3、M0.1 contracts、foundation SQL。

**推进主链路:** Yes。Parse、Generate、Export 都依赖它。

**Files:**
- Create: `apps/backend/src/modules/workflow-task/workflow.service.ts`
- Create: `apps/backend/src/modules/workflow-task/task-claim.service.ts`
- Create: `apps/backend/src/modules/workflow-task/finalization.service.ts`
- Test: `apps/backend/src/modules/workflow-task/tests/task-claim-concurrency.spec.ts`
- Test: `apps/backend/src/modules/workflow-task/tests/finalization-rollback.spec.ts`
- Test: `apps/backend/src/modules/workflow-task/tests/manual-review-aggregation.spec.ts`

- [ ] Step 1: 写失败测试：两个 worker 不能 claim 同一 task；finalization 任一步失败回滚；manual_review 阻塞 parent terminal。
- [ ] Step 2: 运行 `pnpm test apps/backend/src/modules/workflow-task`，确认失败。
- [ ] Step 3: 实现最小 workflow/task/attempt domain service 和 claim 协议。
- [ ] Step 4: 接入 structured log 字段 `workflowId/taskId/attemptId`。
- [ ] Step 5: 运行测试，确认通过。
- [ ] Step 6: Commit: `feat: add workflow task execution spine`

**异常处理:** worker crash 由 lease repair 接管；finalization 失败事务回滚；result_unknown/manual_review 不可误聚合为 terminal。

**完成标准:** 状态来自 PostgreSQL/domain state；重复 claim 无副作用。

### Task A5: Operation-Scoped Idempotency 接入业务命令

**背景 / Why:** 用户刷新/双击不能创建重复项目、重复 workflow、重复生成任务。

**交付能力:** `CreateProject`、`ParseScript`、`GenerateShotImage`、`CreateExport` 通过 idempotency record replay/conflict。

**前置依赖:** A2、A4、B1/B2/B7/B9 对应命令；M0.1 idempotency helper 已存在。

**推进主链路:** Yes。它保护主链路不因重复操作失真。

**Files:**
- Modify: `apps/backend/src/modules/shared/idempotency/idempotency.service.ts`
- Test: `apps/backend/src/modules/project/tests/parse-script.idempotency.spec.ts`
- Test: `apps/backend/src/modules/shot/tests/generate-shot-image.idempotency.spec.ts`
- Test: `apps/backend/src/modules/export/tests/export.idempotency.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 same key/same hash replay、same key/different hash 409、running workflow replay。
- [ ] Step 2: 运行目标测试，确认失败。
- [ ] Step 3: 审查并补齐真实 command transaction 里的 idempotency helper 接入；不要阻塞 B1/B2 首轮实现。
- [ ] Step 4: 运行 IDEMP-003/004 和 R-002 相关测试，确认通过。
- [ ] Step 5: Commit: `feat: wire idempotency into creator commands`

**异常处理:** `409 idempotency_conflict`；running 返回已有 workflow/task；terminal failure 返回稳定错误和修复建议。

**完成标准:** 重复提交不会重复创建任何 expensive/external side effect。

### Task A6: ProviderRequest 副作用保护

**背景 / Why:** 真实 provider 可能扣费/产出。外部提交后崩溃不能盲目重试。

**交付能力:** provider call 前持久化 request，设置 `external_submission_started_at` 后进入保守恢复策略。

**前置依赖:** A4、B7 Mock ModelGateway 接口。

**推进主链路:** Yes。它是从 mock provider 进入真实 provider dogfood 的硬门槛。

**Files:**
- Create: `apps/backend/src/modules/model-gateway/provider-request.service.ts`
- Create: `apps/backend/src/modules/model-gateway/provider-adapter.contract.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/no-blind-retry-after-external-start.spec.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/crash-before-external-start.spec.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/crash-after-external-start.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 before external start 可安全重试、after external start 不创建第二个 provider request。
- [ ] Step 2: 运行 `pnpm test apps/backend/src/modules/model-gateway`，确认失败。
- [ ] Step 3: 实现 ProviderRequest pre-call persistence 和 policy snapshot。
- [ ] Step 4: 实现 timeout-after-accept -> `result_unknown`。
- [ ] Step 5: 运行 A-001/R-026/R-027，确认通过。
- [ ] Step 6: Commit: `feat: add provider side effect safety`

**异常处理:** before accept 安全重试；after accept lookup/manual review；payload 存储必须 redacted/hash/ref。

**完成标准:** 真实 provider dogfood 前 no-blind-retry 测试必须通过。

### Task A7: Queue/Worker Repair

**背景 / Why:** Redis/BullMQ 丢任务、worker crash、outbox 重放是 beta 前必遇问题。

**交付能力:** queued task dispatch repair、stale running lease repair、outbox dispatch repair。

**前置依赖:** A4、A6、outbox/inbox。

**推进主链路:** No direct，但它让主链路失败后可恢复，是 M4 上线 gate。

**Files:**
- Modify: `apps/backend/src/modules/workflow-task/queued-task-dispatch-repair.contract.ts`
- Create: `apps/backend/src/modules/workflow-task/stale-running-task-repair.service.ts`
- Create: `apps/backend/src/modules/shared/outbox/outbox-dispatcher.service.ts`
- Test: `apps/backend/src/modules/workflow-task/tests/redis-loss-repair.spec.ts`
- Test: `apps/backend/src/modules/workflow-task/tests/lease-repair-before-provider.spec.ts`
- Test: `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts`

- [ ] Step 1: 扩展失败测试，覆盖 Redis loss、expired lease、duplicate dispatch。
- [ ] Step 2: 实现 repair scan + idempotent action。
- [ ] Step 3: 所有 repair 使用小批量 `FOR UPDATE SKIP LOCKED` 语义或等价仓储抽象。
- [ ] Step 4: 运行 R-001/R-004/R-014/R-021，确认通过。
- [ ] Step 5: Commit: `feat: add queue and worker repair foundations`

**异常处理:** 重复 repair no-op；provider ambiguous 进入 `result_unknown`；不全表锁。

**完成标准:** Redis loss 和 worker crash 测试可复现可恢复。

### Task A8: Credit Ledger + Reservation

**背景 / Why:** P0-B 商业 beta 前，额度不能超卖、不能双结算。

**交付能力:** append-only credit ledger、reservation envelope、allocation single settlement、balance drift repair。

**前置依赖:** A4、A7、B7 generate task。

**推进主链路:** Yes for P0-B。P0-A 可以同步余额校验，P0-B 必须强一致。

**Files:**
- Create: `apps/backend/src/modules/credit-billing/credit-ledger.service.ts`
- Create: `apps/backend/src/modules/credit-billing/reservation.service.ts`
- Modify: `apps/backend/src/modules/credit-billing/credit-balance-reconciliation.contract.ts`
- Test: `apps/backend/src/modules/credit-billing/tests/reservation-no-oversell.spec.ts`
- Test: `apps/backend/src/modules/credit-billing/tests/allocation-single-settlement.spec.ts`
- Test: `apps/backend/src/modules/credit-billing/tests/balance-drift-repair.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 concurrent reservation、consume/release race、ledger recompute。
- [ ] Step 2: 实现 ledger append 和 allocation state transition。
- [ ] Step 3: unknown/manual_review allocation 保持 reserved。
- [ ] Step 4: 运行 R-008/R-009/R-015/R-028，确认通过。
- [ ] Step 5: Commit: `feat: add credit ledger reservation semantics`

**异常处理:** single settlement 约束；read model 可从 ledger 修复；异常 provider cost 不自动扣用户。

**完成标准:** 并发不超卖；allocation 不会既 consume 又 release。

### Task A9: Commerce/Payment Gate

**背景 / Why:** 支付错误是直接资金/合规事故，不能在 credit/outbox 未稳定前开工。

**交付能力:** credit package/order/payment intent/callback/payment-to-credit/refund gate 的后端基础。

**前置依赖:** A8、官方支付字段验证、商户能力、财税流程确认。

**推进主链路:** No for P0-A；Yes for P0-B commercial loop。

**Files:**
- Create: `apps/backend/src/modules/commerce-payment/order.service.ts`
- Create: `apps/backend/src/modules/commerce-payment/payment-intent.service.ts`
- Create: `apps/backend/src/modules/commerce-payment/callback.service.ts`
- Test: `apps/backend/src/modules/commerce-payment/tests/callback-dedup.spec.ts`
- Test: `apps/backend/src/modules/commerce-payment/tests/callback-signature.spec.ts`
- Test: `apps/backend/src/modules/commerce-payment/tests/callback-mismatch.spec.ts`
- Test: `apps/backend/src/modules/credit-billing/tests/paid-without-credit-repair.spec.ts`

- [ ] Step 1: 未关闭 provider/finance gates 前，只写 mock/provider-contract tests。
- [ ] Step 2: 实现 order snapshot、payment intent、callback dedup。
- [ ] Step 3: `payment.succeeded` 通过 outbox 到 Credit/Billing grant。
- [ ] Step 4: duplicate callback one grant；frontend return no grant。
- [ ] Step 5: Commit: `feat: add commerce payment reliability gate`

**异常处理:** 签名错误/金额币种商户 mismatch -> risk/manual review；重复回调 ACK 但不重复 grant。

**完成标准:** Payment tests 通过；官方/财税 gate 未完成时不得宣称 commercial-ready。

## 5. 开发 B：Creator Domain 任务

### Task B1: Project/CreateProject + Script 存储

**背景 / Why:** 创作闭环从真实项目和真实剧本开始，不能用前端临时状态代替。

**交付能力:** 用户在工作区创建项目并持久化 script。

**前置依赖:** A2 ActorContext；M0.1 idempotency helper；project/script migration。A5 是后续跨模块 hardening，不阻塞 B1 首轮。

**推进主链路:** Yes。

**Files:**
- Create: `apps/backend/src/modules/project/project.service.ts`
- Create: `apps/backend/src/modules/project/script.service.ts`
- Test: `apps/backend/src/modules/project/tests/create-project.spec.ts`
- Test: `apps/backend/src/modules/project/tests/create-project.idempotency.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 success、invalid input、forbidden、replay、409 conflict。
- [ ] Step 2: 实现 CreateProject command handler。
- [ ] Step 3: 创建 `projects` 和 `scripts`，失败必须事务回滚。
- [ ] Step 4: 运行 TC-P0-001 create 部分。
- [ ] Step 5: Commit: `feat: add project creation with script`

**异常处理:** 无权限 403；字段错误停留表单；duplicate replay 返回同一 project。

**完成标准:** 真实 DB/repository 创建一次；状态为 `script_input`。

### Task B2: Script Parse Workflow + Mock Output

**背景 / Why:** 这是第一个长任务，必须验证 workflow/task 状态和 mock provider finalization。

**交付能力:** ParseScript 创建 workflow/task，mock provider 产出 episodes/assets/shots。

**前置依赖:** A4、B1、M0.1 idempotency helper。A5 负责后续统一验收，不阻塞 B2 首轮。

**推进主链路:** Yes。

**Files:**
- Create: `apps/backend/src/modules/project/parse-script.command.ts`
- Create: `apps/backend/src/modules/model-gateway/mock-script-provider.ts`
- Test: `apps/backend/src/modules/project/tests/script-parse-retry.spec.ts`
- Test: `apps/backend/src/modules/project/tests/parse-script.idempotency.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 queued/running/succeeded/failed、retry、refresh returns same workflow。
- [ ] Step 2: 实现 ParseScript command -> Workflow/Task。
- [ ] Step 3: mock provider 返回固定 episodes/assets/shots。
- [ ] Step 4: finalization 写入 `episodes`、candidate `assets`、draft/ready `shots`。
- [ ] Step 5: 运行 TC-P0-001/010/011。
- [ ] Step 6: Commit: `feat: add script parse workflow with mock provider`

**异常处理:** parse failed 留在 repairable state；重复 parse 返回已有 workflow；worker 失败不写半截业务数据。

**完成标准:** 页面刷新后状态来自 durable workflow/task。

### Task B3: Asset + Immutable AssetVersion

**背景 / Why:** 生成结果不可覆盖；版本历史是后续重生成、导出和审计的基础。

**交付能力:** Asset 表达业务对象，AssetVersion 表达不可变二进制/输出版本。

**前置依赖:** B2 candidate assets；A-S1 storage adapter 最小 contract。

**推进主链路:** Yes。

**Files:**
- Create: `apps/backend/src/modules/asset/asset.service.ts`
- Create: `apps/backend/src/modules/asset/asset-version.service.ts`
- Test: `apps/backend/src/modules/asset/tests/asset-versioning.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 version_number 单调递增、旧版本保留、metadata enrichment 安全。
- [ ] Step 2: 实现 asset/version domain service。
- [ ] Step 3: 后续 generated outputs 必须创建新 version，不覆盖旧 version。
- [ ] Step 4: 运行 asset tests。
- [ ] Step 5: Commit: `feat: add immutable asset versions`

**异常处理:** version 写失败回滚 finalization；storage metadata 缺失进入 retryable failure。

**完成标准:** 重生成不会覆盖旧资源。

### Task B4: Shot 状态和 Current Pointer Safety

**背景 / Why:** 分镜编辑和生成可能乱序完成，current pointer 必须由 active task/revision 保护。

**交付能力:** Shot content/image/video 状态机和 current pointer guard。

**前置依赖:** B3、A4。

**推进主链路:** Yes。

**Files:**
- Create: `apps/backend/src/modules/shot/shot.service.ts`
- Create: `apps/backend/src/modules/shot/shot-pointer.service.ts`
- Test: `apps/backend/src/modules/shot/tests/stale-task-completion.spec.ts`
- Test: `apps/backend/src/modules/shot/tests/out-of-order-regeneration.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 stale completion 和 out-of-order regeneration。
- [ ] Step 2: 实现 content_revision、active_image_task_id、current pointer guard。
- [ ] Step 3: late success 只写历史 asset version。
- [ ] Step 4: 运行 R-011/R-012。
- [ ] Step 5: Commit: `feat: protect shot current pointers`

**异常处理:** 状态异常进入 repair/admin 可见；late result 不破坏当前图。

**完成标准:** 乱序生成不能污染 current asset。

### Task B5: Public Asset Confirm

**背景 / Why:** 资产确认是剧本解析到分镜/校准的业务门槛。

**交付能力:** 关键角色/主要场景/关键道具确认、编辑、阻塞项计算。

**前置依赖:** B2、B3、A2。

**推进主链路:** Yes。

**Files:**
- Create: `apps/backend/src/modules/asset/public-asset-review.service.ts`
- Test: `apps/backend/src/modules/asset/tests/public-asset-review.spec.ts`

- [ ] Step 1: 写失败测试：关键角色/场景未确认阻塞，关键道具提示但不阻塞校准。
- [ ] Step 2: 实现 review/confirm/edit 状态。
- [ ] Step 3: 接入 project readiness flags。
- [ ] Step 4: 运行 TC-P0-002。
- [ ] Step 5: Commit: `feat: add public asset review gate`

**异常处理:** 单卡保存失败不影响其他卡；无权限编辑 403。

**完成标准:** 后端明确返回 blockers。

### Task B6: Calibration Session + Gate

**背景 / Why:** 校准必须是 durable business fact，不能是 UI 勾选。

**交付能力:** 3 shot calibration session、pass/skip/override decision、batch generation backend gate。

**前置依赖:** B4、B5、A3 audit。

**推进主链路:** Yes。

**Files:**
- Create: `apps/backend/src/modules/quality-review/calibration.service.ts`
- Test: `apps/backend/src/modules/calibration/tests/calibration-gate.spec.ts`
- Test: `apps/backend/src/modules/quality-review/tests/calibration-quality-failure.spec.ts`

- [ ] Step 1: 写失败测试，覆盖未 pass/skip/override 阻塞 generation。
- [ ] Step 2: 实现 session/item/decision 状态。
- [ ] Step 3: skip/override 必须写 audit。
- [ ] Step 4: 运行 TC-P0-003/009、R-016/R-024。
- [ ] Step 5: Commit: `feat: add durable calibration gate`

**异常处理:** 选择数量错误拒绝；质量失败不能 pass；skip 需要 reason。

**完成标准:** Backend gate 生效。

### Task B7: GenerateShotImage with Mock ModelGateway

**背景 / Why:** 这是 P0-A 最核心能力，证明 AI 生成链路能被真实 task 驱动。

**交付能力:** 单张/批量分镜图生成、部分成功、失败可重试、asset version finalization。

**前置依赖:** A4/A5、B3/B4/B6。

**推进主链路:** Yes。

**Files:**
- Create: `apps/backend/src/modules/shot/generate-shot-image.command.ts`
- Create: `apps/backend/src/modules/model-gateway/mock-image-provider.ts`
- Test: `apps/backend/src/modules/shot/tests/batch-image-partial-success.spec.ts`
- Test: `apps/backend/src/modules/shot/tests/no-duplicate-running-generation.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 calibration missing、duplicate running、partial success。
- [ ] Step 2: 实现 GenerateShotImage -> Workflow/Task -> Mock provider。
- [ ] Step 3: 成功写 asset version/current pointer；失败写 shot/task failed。
- [ ] Step 4: 运行 TC-P0-004/012、R-002/R-016。
- [ ] Step 5: Commit: `feat: generate shot images with mock provider`

**异常处理:** 单镜失败不影响其他镜；重复点击 replay existing task；失败 3 步内可重试。

**完成标准:** mock provider 生图闭环可测。

### Task B8: GenerateShotVideo Minimum

**背景 / Why:** PRD P0 包含单镜图转视频，但优先级低于生图，可用 mock provider 做最小闭环。

**交付能力:** 当前图存在时发起 video task，完成/失败/stale 状态正确。

**前置依赖:** B7。

**推进主链路:** Yes，补全 P0 素材能力。

**Files:**
- Create: `apps/backend/src/modules/shot/generate-shot-video.command.ts`
- Create: `apps/backend/src/modules/model-gateway/mock-video-provider.ts`
- Test: `apps/backend/src/modules/shot/tests/shot-video-retry.spec.ts`

- [ ] Step 1: 写失败测试，覆盖 image missing、video failure retry、image stale -> video stale。
- [ ] Step 2: 实现 GenerateShotVideo command。
- [ ] Step 3: 失败保留重试入口；成功写 video asset version。
- [ ] Step 4: 运行 TC-P0-006。
- [ ] Step 5: Commit: `feat: add minimum shot video generation`

**异常处理:** 无 current image 拒绝；旧视频不覆盖；失败可重试。

**完成标准:** 单镜 video mock task 可运行。

### Task B9: Export Manifest

**背景 / Why:** 导出是“剧本到素材包”的闭环终点，必须显式检查缺失资产。

**交付能力:** 创建 export record/manifest，缺失资产清单明确。

**前置依赖:** B3、B7、A-S1，至少一个 completed image。

**推进主链路:** Yes。

**Files:**
- Create: `apps/backend/src/modules/export/export.service.ts`
- Test: `apps/backend/src/modules/export/tests/export-package.spec.ts`
- Test: `apps/backend/src/modules/export/tests/export-integrity.spec.ts`
- Test: `apps/web/e2e/p0/export-missing-assets.spec.ts`

- [ ] Step 1: 写失败测试，覆盖完整导出、缺失资产拦截、明确 incomplete confirmation。
- [ ] Step 2: 实现 export manifest 生成。
- [ ] Step 3: duplicate export create 使用 `export.create` idempotency。
- [ ] Step 4: 运行 TC-P0-007/014、R-017。
- [ ] Step 5: Commit: `feat: add export package manifest`

**异常处理:** 缺失资产不静默失败；导出失败可重试；下载链接过期可刷新。

**完成标准:** 素材包 manifest 可测试、可验收。

## 6. 开发 C：Experience / QA / Ops 任务

### Task C1: Web App Shell + Auth Flow UI

**背景 / Why:** 用户路径必须从真实登录开始，不能只靠 API tests。

**交付能力:** 登录 UI、验证码状态、session 恢复、未登录跳转。

**前置依赖:** A1/A2 API。

**推进主链路:** Yes。

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/features/auth/auth-client.ts`
- Test: `apps/web/e2e/p0/auth-flow.spec.ts`

- [ ] Step 1: 写 E2E 失败测试：未登录跳转、登录成功进入项目入口、错误码展示。
- [ ] Step 2: 实现最小 login page/client。
- [ ] Step 3: API 错误只展示稳定文案，不泄露 token/code。
- [ ] Step 4: 运行 auth E2E 或 API+UI smoke。
- [ ] Step 5: Commit: `feat: add auth flow UI`

**异常处理:** 网络失败可重试；invalid/expired code 显示明确错误。

**完成标准:** C1 不使用假 session。

### Task C2: Project Create + Script Input UI

**背景 / Why:** 这是用户进入创作的第一屏，必须真实调用 CreateProject/ParseScript。

**交付能力:** 项目创建表单、剧本输入、解析启动和 loading/queued 状态。

**前置依赖:** B1/B2 APIs、M0.1 idempotency helper、C1 auth。

**推进主链路:** Yes。

**Files:**
- Create: `apps/web/src/app/projects/new/page.tsx`
- Create: `apps/web/src/features/project/create-project-client.ts`
- Test: `apps/web/e2e/p0/create-project-parse.spec.ts`

- [ ] Step 1: 写 E2E 失败测试：填表、提交、1 秒内 queued/loading、刷新后恢复。
- [ ] Step 2: 实现 UI 和 API client。
- [ ] Step 3: 重复提交使用同一 Idempotency-Key；409 给出恢复提示。
- [ ] Step 4: 运行 TC-P0-001。
- [ ] Step 5: Commit: `feat: add project creation UI`

**异常处理:** 字段错误停留表单；duplicate replay 显示同一 workflow。

**完成标准:** 不使用假项目状态。

### Task C3: Project Workspace 状态导航

**背景 / Why:** 用户需要知道项目卡在哪一步，主 CTA 必须由后端状态驱动。

**交付能力:** project phase + readiness flags 驱动阶段导航和主 CTA。

**前置依赖:** B2 status query。

**推进主链路:** Yes。

**Files:**
- Create: `apps/web/src/app/projects/[projectId]/page.tsx`
- Create: `apps/web/src/features/workspace/project-phase-router.ts`
- Test: `apps/web/e2e/p0/project-workspace-routing.spec.ts`

- [ ] Step 1: 写 E2E 失败测试，覆盖 script_input、asset_review、shot_generation、exportable。
- [ ] Step 2: 实现 phase router。
- [ ] Step 3: CTA 只调用后端允许的 command。
- [ ] Step 4: 运行 workspace routing E2E。
- [ ] Step 5: Commit: `feat: add project workspace phase navigation`

**异常处理:** 未知状态显示可恢复错误，不猜测下一步。

**完成标准:** 主 CTA 和后端 gate 一致。

### Task C4: Public Asset Review UI

**背景 / Why:** 资产确认是主链路第一个大量人工决策点，体验必须支持批量检查和阻塞项。

**交付能力:** 角色/场景/道具 tabs、资产卡片、编辑/确认、阻塞项展示。

**前置依赖:** B5 APIs。

**推进主链路:** Yes。

**Files:**
- Create: `apps/web/src/features/assets/public-asset-review.tsx`
- Test: `apps/web/e2e/p0/confirm-assets.spec.ts`

- [ ] Step 1: 写 E2E 失败测试：未确认关键资产阻塞，确认后可继续。
- [ ] Step 2: 实现 asset tabs/cards。
- [ ] Step 3: 单卡失败不影响其他卡；权限失败禁用编辑。
- [ ] Step 4: 运行 TC-P0-002。
- [ ] Step 5: Commit: `feat: add public asset review UI`

**异常处理:** 保存失败单项提示；阻塞项明确列出。

**完成标准:** 用户可以把解析候选推进到可分镜/校准。

### Task C5: Shot List + Calibration UI

**背景 / Why:** 校准是批量生成前的质量门槛，不能让用户绕过后端 gate。

**交付能力:** 分镜列表、3 个校准槽位、生成校准、pass/skip 操作。

**前置依赖:** B4/B6 APIs。

**推进主链路:** Yes。

**Files:**
- Create: `apps/web/src/features/shots/shot-list.tsx`
- Create: `apps/web/src/features/calibration/calibration-panel.tsx`
- Test: `apps/web/e2e/p0/split-shots-calibration.spec.ts`

- [ ] Step 1: 写 E2E 失败测试：3 槽位、未 pass 禁用生成、skip 二次确认。
- [ ] Step 2: 实现 UI。
- [ ] Step 3: 后端拒绝时前端展示 gate reason。
- [ ] Step 4: 运行 TC-P0-003/009。
- [ ] Step 5: Commit: `feat: add shot list calibration UI`

**异常处理:** 校准失败显示失败项和重试入口。

**完成标准:** 前后端 gate 一致。

### Task C6: Generation Status + Retry UX

**背景 / Why:** 长任务体验是 PRD 核心，用户必须看到逐镜状态、失败和恢复路径。

**交付能力:** generating/completed/failed/stale 展示、失败编辑和重试、刷新恢复。

**前置依赖:** B7/B8 APIs、A4 task status。

**推进主链路:** Yes。

**Files:**
- Create: `apps/web/src/features/generation/generation-status-list.tsx`
- Create: `apps/web/src/features/generation/retry-panel.tsx`
- Test: `apps/web/e2e/p0/refresh-running-generation.spec.ts`
- Test: `apps/web/e2e/p0/shot-video-retry.spec.ts`

- [ ] Step 1: 写 E2E 失败测试：部分成功、刷新恢复、失败 3 步内重试、重复点击不重复创建。
- [ ] Step 2: 实现 status list/retry panel。
- [ ] Step 3: 使用 durable task IDs，不使用 local-only loading state 作为真相。
- [ ] Step 4: 运行 TC-P0-004/005/006/011/012。
- [ ] Step 5: Commit: `feat: add generation status retry UX`

**异常处理:** 单镜失败不阻塞其他镜；stale 输出保留但标记。

**完成标准:** 长任务体验可验收。

### Task C7: Export UI

**背景 / Why:** 导出是素材交付终点，缺失资产必须清晰可见。

**交付能力:** 导出模块、完整性检查、缺失项、incomplete confirmation、manifest/download 状态。

**前置依赖:** B9 Export API。

**推进主链路:** Yes。

**Files:**
- Create: `apps/web/src/features/export/export-panel.tsx`
- Test: `apps/web/e2e/p0/export-missing-assets.spec.ts`

- [ ] Step 1: 写 E2E 失败测试：完整导出、缺失资产拦截、确认 incomplete export。
- [ ] Step 2: 实现 export panel。
- [ ] Step 3: 导出失败提供重试和 traceId。
- [ ] Step 4: 运行 TC-P0-007/014。
- [ ] Step 5: Commit: `feat: add export UI`

**异常处理:** 缺失资产清单明确；下载链接过期可刷新。

**完成标准:** 主链路可交付素材包。

### Task C8: P0-A E2E/Regression Harness

**背景 / Why:** 每周验收必须自动化证明主链路，没有 E2E 就会退化成人工口头完成。

**交付能力:** 覆盖登录到导出的 P0-A E2E，以及关键异常回归。

**前置依赖:** C1-C7，A/B 提供 fixtures。

**推进主链路:** Yes。

**Files:**
- Create: `apps/web/e2e/p0/full-creator-loop.spec.ts`
- Create: `apps/web/e2e/p0/fixtures.ts`
- Modify: `docs/architecture/p0-verification-plan.md`

- [ ] Step 1: 写 full loop failing E2E。
- [ ] Step 2: 建 test fixtures，不依赖生产数据。
- [ ] Step 3: 将 TC-P0-001 至 TC-P0-014 的 P0-A 子集纳入 regression。
- [ ] Step 4: 失败输出 traceId 并关联 API/worker logs。
- [ ] Step 5: Commit: `test: add P0-A creator loop regression`

**异常处理:** flaky test 不能忽略，必须标阻塞并定位。

**完成标准:** `e2e-p0-a` gate 成为 M2 exit 证据。

### Task C9: Observability、Runbook、Release

**背景 / Why:** 能跑通不等于能上线。上线要能定位、回滚、复盘。

**交付能力:** 日志字段规范、基础 dashboard 指标、runbook、staging smoke、rollback drill。

**前置依赖:** A/B 输出 trace/log/metric IDs。

**推进主链路:** No direct；推进上线 gate。

**Files:**
- Create: `docs/architecture/runbooks/stuck-task.md`
- Create: `docs/architecture/runbooks/provider-result-unknown.md`
- Create: `docs/architecture/runbooks/export-failed.md`
- Create: `docs/architecture/release-checklist.md`
- Test/Drill: `ops-drill`

- [ ] Step 1: 列出 API/worker/provider/credit/payment/storage/DB/Redis 故障定位路径。
- [ ] Step 2: 为 stuck task、unknown provider、export failed 写 runbook。
- [ ] Step 3: 建 staging smoke checklist 和 rollback checklist。
- [ ] Step 4: 做 ops drill：5 分钟内定位故障层。
- [ ] Step 5: Commit: `docs: add ops runbooks and release checklist`

**异常处理:** 每个 runbook 必须包含检测信号、查询入口、修复命令/人工处理、回滚条件。

**完成标准:** M6 前 ops drill 通过。

### Task C10: Admin/Ops Lite Manual Intervention

**背景 / Why:** Repair 和 manual_review 如果只有后台脚本和 runbook，没有受控运营入口，线上问题会变成“知道怎么修但没人能安全执行”。P0 可以轻量，但不能没有人工介入闭环。

**交付能力:** Admin/Ops Lite 页面或最小控制台，支持查看 stuck task、`result_unknown` provider request、paid-without-credit、payment risk event，并通过后端 domain command 发起 retry/settle/disable/mark-reviewed 操作。

**前置依赖:** A3 audit；A7 repair；A8 credit ledger；A9 payment/risk gate；C9 runbook。

**推进主链路:** No direct；它推进 M4-M6 上线 gate，让主链路失败后可以被定位和修复。

**Files:**
- Create: `apps/web/src/app/admin/ops/page.tsx`
- Create: `apps/web/src/features/admin-ops/ops-queue.tsx`
- Create: `apps/web/e2e/p0/admin-ops-manual-review.spec.ts`
- Modify: `docs/architecture/runbooks/stuck-task.md`
- Modify: `docs/architecture/runbooks/provider-result-unknown.md`

- [ ] Step 1: 写 E2E 失败测试：Ops 用户可以看到 stuck/result_unknown item；普通用户 403；操作必须填写 reason。
- [ ] Step 2: 实现只读列表，数据来自后端 Admin/Ops query，不直接读业务表。
- [ ] Step 3: 接入 retry/settle/mark-reviewed domain command；所有操作写 audit。
- [ ] Step 4: 验证 paid-without-credit 和 provider result_unknown runbook 能从 UI 跳到对应 item。
- [ ] Step 5: Commit: `feat: add admin ops lite manual intervention`

**异常处理:** 操作失败必须显示 traceId；重复 settle/retry no-op 或返回稳定冲突；高风险 payment/credit 操作必须进入二次确认。

**完成标准:** manual_review 不再只是数据库状态；Ops 能在受控权限、审计和 runbook 指引下处理 M4-M6 gate。

## 7. 三人协作节奏

### 每日站会只问五个问题

1. 昨天推进了主链路哪一步？
2. 今天会交付哪个可验证能力？
3. 当前阻塞来自谁？
4. 哪个异常/测试/观测还没补？
5. 有无任务已写代码但无法验收？

### 每周验收

- A 跑 `contracts`、`unit/integration`、可靠性 gate。
- B 演示领域状态和数据归属没有漂移。
- C 演示用户主链路和 E2E 结果。
- 三人共同更新风险表。

### 看板状态

```text
待澄清 -> 待开发 -> 开发中 -> 待自测 -> 待联调 -> 待测试 -> 待验收 -> Done
阻塞中可从任意状态进入
```

进入 `待开发` 必须满足：

- 任务卡填写完整。
- 前置依赖明确。
- 验证方式明确。
- 异常处理明确。
- reviewer 明确。

进入 `Done` 必须满足：

- 测试/验收证据存在。
- 错误处理证据存在。
- 日志/trace/metric 证据存在或说明不需要。
- 文档更新或说明不需要。

## 8. 第一周建议分配

| 人员 | 主任务 | 辅助任务 | 周五验收物 |
| --- | --- | --- | --- |
| A | A1 Email-Code 登录和 Session | A2 ActorContext 测试红灯 | identity tests 通过；organization tests 至少红灯可执行 |
| B | B1 Project/CreateProject 测试草稿和 schema 对齐 | B2 Parse workflow 依赖对齐 | CreateProject task 可进入开发；ParseScript 依赖无歧义 |
| C | C1 Auth UI 壳和 E2E harness | C2 Project Create E2E 草稿 | auth-flow E2E 可启动；不使用假 session |

第一周禁止事项：

- B 不提前绕过 A2 权限实现 Project API。
- C 不用假状态伪造项目已解析。
- A 不把 code/token 明文落库或写日志。
- 三人不改 state/operation/event 名称，除非写 contract-change record。

## 9. 信心自检循环

### Loop 1: 是否按能力而不是代码层拆分？

结论：是。任务按登录、租户、项目创建、解析、资产、分镜、校准、生图、导出、可靠性、支付、上线 gate 拆分。

修复：每个任务都包含“交付能力”和“是否推进主链路”。

### Loop 2: 是否漏掉测试、联调、发布、观测？

结论：未漏掉。C9 覆盖 runbook/release，C8 覆盖 E2E，A7/A8 覆盖 repair/credit，所有任务都有测试要求。

修复：把非功能任务列为 C9/A7/A8，不放到“最后有空再说”。

### Loop 3: 是否三人能并行且不互相踩踏？

结论：可以，但 B/C 在 B1 阶段只能做测试草稿/UI 壳，不能绕过 A 的权限/租户基础。

修复：明确 B1 禁止事项和依赖门槛。

### Loop 4: 是否覆盖从 P0-A 到 P0-B/M6 的所有技术任务？

结论：覆盖为任务体系。P0-A 主链路任务完整；P0-B/M6 作为 A7-A9/C9 gate 进入计划，支付细节仍受官方/财税未决项约束。

修复：将支付实现标为 gated，不允许提前宣称可上线。

### Loop 5: 是否可以事实性 100% 自信？

结论：对“当前三人任务拆分作为执行系统”可以 100% 自信，因为它覆盖能力、依赖、验证、异常、主链路贡献和风险 gate。对“实际开发一定按期完成”不能 100% 自信，因为那取决于实现质量、外部 provider、财税/部署决策和 CI 执行结果。

修复：计划不承诺工期确定性，只承诺每个任务的完成证据和 gate。
