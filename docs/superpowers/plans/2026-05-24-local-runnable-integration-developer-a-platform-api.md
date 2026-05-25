# Local Runnable Integration Developer A Platform/API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the local creator backend/API contract so frontend actions, HTTP smoke, and Browser dogfood all use real authenticated, tenant-scoped, idempotent creator routes.

**Architecture:** Keep the existing single-process phone-auth dev server for Local Runnable Alpha, but make creator write routes behave like real platform commands: stable `Idempotency-Key` protocol, predictable error mapping, and application-service boundaries. Developer A owns the backend side of the R0 Creator API Contract Matrix and must keep response shapes aligned with Developer B and smoke assertions owned by Developer C.

**Tech Stack:** TypeScript, Node test runner, PGlite, existing `runIdempotentCommand`, `createCreatorApplication`, workflow-task, provider-request, and phone-auth dev server.

---

## 0. Context and Boundaries

This plan is Developer A's slice of [Local Runnable Integration 三人开发 Implementation Plan](./2026-05-24-local-runnable-integration-three-developer-plan.md).

Local Runnable Alpha path:

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

Developer A owns:

- Dev server creator route contract.
- Required `Idempotency-Key` protocol.
- Backend replay/conflict behavior.
- Backend error mapping.
- Creator application modular boundary hardening.

Developer A does not own:

- Frontend UI copy, visual design, or browser event wiring.
- Local smoke CLI UX, except making backend behavior testable.
- Commercial Beta, real payment, production deployment, or real provider cost accounting.

Done for Developer A:

- R0 matrix is implemented on the backend side.
- Required creator write routes reject missing keys.
- Replay/conflict behavior is covered for create, parse, generation, calibration, and export.
- Known business errors no longer collapse into opaque 500s.
- Project/backend tests named in this plan pass.

## 1. R0 Creator API Contract Matrix

R0 is the shared contract. If implementation reality requires changing this table, update this table first and coordinate with Developer B/C before changing code.

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

Rules:

- Required means route rejects missing `Idempotency-Key` with `400 { error: "idempotency_key_required" }`.
- Full replay/conflict means same key + same request returns the original resource/workflow response; same key + different request returns `409 { error: "idempotency_conflict" }`.
- Provider-backed generation must create or reuse provider requests before external submission; replay must not submit external work twice.
- If a route cannot be made replay-safe in this iteration, explicitly downgrade it in the matrix and remove corresponding smoke idempotency assertions before merge.

## 2. File Map

- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts` - route header validation, known-error mapping, creator write route wiring.
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts` - HTTP contract coverage.
- Modify: `apps/backend/src/modules/project/creator-application.service.ts` - idempotency alignment and boundary extraction.
- Create: `apps/backend/src/modules/project/creator-state-hydration.service.ts` - SQL-backed creator state hydration helpers.
- Create: `apps/backend/src/modules/project/creator-dev-state.service.ts` - dev compatibility bridge and per-user dev state helpers.
- Modify: `apps/backend/src/modules/project/tests/creator-application.service.spec.ts` - replay/conflict and boundary behavior.
- Modify: `apps/backend/src/modules/project/tests/creator-platform.service.spec.ts` - provider/storage workflow safety where needed.
- Modify if drift is found: `packages/contracts/api/*.ts`.

## 3. Tasks

### Task A0: Creator API Contract Matrix Freeze

| 字段 | 内容 |
| --- | --- |
| 背景 | A/B/C 会同时改 route、client 和 smoke；没有冻结矩阵就会出现前端发送 key、后端未接、smoke 锁错行为。 |
| 交付能力 | R0 Creator API Contract Matrix 与当前实现差距被确认；每个 route 的 idempotency、错误码、response、测试归属明确。 |
| 前置依赖 | 现有 contracts、dev server routes、creator API client。 |
| 验证方式 | `npm test -- packages/contracts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts apps/web/tests/project-workbench-generation.spec.ts`。 |
| 异常处理 | 发现矩阵和 contract 冲突时，以 `packages/contracts` 为准，更新矩阵并记录降级项；不允许实现者私自决定。 |
| 主链路贡献 | Yes。它是三人并行的接口地基。 |

**Files:**

- Modify: `docs/superpowers/plans/2026-05-24-local-runnable-integration-developer-a-platform-api.md`
- Modify if contract drift is found: `packages/contracts/api/*.ts`

- [ ] Step 1: 对照 `packages/contracts/api` 和 `phone-auth-dev-server.ts` 检查矩阵每行。
- [ ] Step 2: 标出当前缺口：create/parse route key、generation/export replay、calibration audit idempotency。
- [ ] Step 3: 确认 Developer C 的 smoke 只断言矩阵中 `Required, full replay/conflict` 的能力。
- [ ] Step 4: 运行 contract 和现有 route/client tests，确认 baseline。

### Task A1: Creator Write Route Idempotency Protocol

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

### Task A1.5: Generation, Calibration, and Export Idempotency Alignment

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

### Task A2: Creator Route Error Mapping

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

### Task A3: Creator Application Boundary Slimming

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

## 4. Handoff Checks

Developer A should run these before handing work to B/C:

```bash
npm test -- packages/contracts
npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
npm test -- apps/backend/src/modules/project/tests/creator-application.service.spec.ts apps/backend/src/modules/project/tests/creator-platform.service.spec.ts
```

Expected: all pass.

Developer A must also provide this short handoff note:

```text
Backend R0 matrix status:
- Required idempotent routes implemented:
- Any downgraded routes:
- Known response-shape changes:
- Tests run:
```
