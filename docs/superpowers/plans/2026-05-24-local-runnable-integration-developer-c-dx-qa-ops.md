# Local Runnable Integration Developer C DX/QA/Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Local Runnable Alpha easy to start, easy to verify, and hard to falsely mark done by adding scripts, smoke tests, browser dogfood evidence, and local-dev documentation.

**Architecture:** Keep the existing dev server as the local runtime. Add a thin DX layer around it: memorable npm scripts, an HTTP smoke harness for API truth, a Browser dogfood gate for product truth, and docs/runbooks that make the expected workflow explicit.

**Tech Stack:** Node scripts, npm scripts, existing phone-auth dev server, Node test runner, local docs, optional Browser/Playwright automation.

---

## 0. Context and Boundaries

This plan is Developer C's slice of [Local Runnable Integration 三人开发 Implementation Plan](./2026-05-24-local-runnable-integration-three-developer-plan.md).

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

Developer C owns:

- `npm run dev`, grouped test scripts, and `npm run smoke:local`.
- HTTP smoke harness.
- Browser dogfood checklist/evidence or automation.
- Local runnable documentation and release checklist updates.
- Final integration gate.

Developer C does not own:

- Backend route implementation.
- Frontend API client implementation.
- Visual redesign.
- Commercial Beta, production deploy, real payment, or real provider ops.

Done for Developer C:

- A new developer can run the local stack from docs.
- HTTP smoke verifies backend/API truth.
- Browser dogfood verifies real page/product truth.
- Release/rollback docs include Local Runnable Alpha gates.
- `npm test`, `npm run smoke:local`, and Browser dogfood evidence are recorded.

## 1. Shared Gate Definitions

HTTP smoke proves:

- Dev server starts or an existing `SMOKE_BASE_URL` can be used.
- Auth cookie flow works.
- Required idempotent operations include `Idempotency-Key`.
- Backend state persists for the server lifetime.
- Export reaches `ready`.

Browser dogfood proves:

- Real login page and workbench JavaScript load.
- Real browser cookies work.
- User can click through create -> parse -> confirm assets -> calibration -> generate -> export.
- Refresh recovers project state from backend APIs.
- No blocking uncaught console error appears.

R0 routes that C may assert for idempotency:

| Route | Idempotency smoke assertion |
| --- | --- |
| `/api/creator/project/create` | same key + same request does not create a second project |
| `/api/creator/parse` | same key + same request reuses workflow |
| `/api/creator/images/generate` | same key does not create duplicate provider requests |
| `/api/creator/videos/generate` | same key does not create duplicate provider requests |
| `/api/creator/export/preview` | same key does not create duplicate export history |

If Developer A downgrades a route in the R0 matrix, remove that route from smoke idempotency assertions before merge.

## 2. File Map

- Modify: `package.json` - `dev`, grouped tests, `smoke:local`.
- Modify if needed: `scripts/run-phone-auth-dev-server.mjs` - script behavior and env loading.
- Create: `scripts/run-local-smoke.mjs` - HTTP smoke harness.
- Create if automated: `apps/web/e2e/local-runnable-alpha.spec.ts` - browser automation.
- Create: `docs/local-dev/local-runnable-alpha.md` - local workflow guide and Browser dogfood checklist.
- Modify: `docs/local-dev/creator-platform-runtime.md` - link to local alpha guide and clarify runtime modes.
- Modify: `docs/ops/p0-release-rollback-checklist.md` - add Local Runnable Alpha gate.
- Modify: `docs/ops/p0-creator-ops-runbook.md` - add smoke/debug notes if needed.
- Modify: `apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts` - docs readiness.

## 3. Tasks

### Task C1: Local Dev Scripts

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

### Task C2: Local Runnable HTTP Smoke Harness

| 字段 | 内容 |
| --- | --- |
| 背景 | 单元测试很多，但缺一个“我真的能从登录跑到导出”的一键验收。 |
| 交付能力 | `npm run smoke:local` 启动本地 dev server 或连接指定 `SMOKE_BASE_URL`，跑完整 creator 主链路。 |
| 前置依赖 | Developer A 的 R0/A1/A1.5；Developer B 的 B1 API header behavior。 |
| 验证方式 | `npm run smoke:local`，期望 PASS 并打印关键步骤。 |
| 异常处理 | 任一步失败打印 status、error code、last response；结束时关闭自启动 server。 |
| 主链路贡献 | Yes。Local Alpha 的核心 API gate。 |

**Files:**

- Create: `scripts/run-local-smoke.mjs`
- Modify: `package.json`
- Modify if useful: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] Step 1: 从 phone-auth dev server test 抽取或复制最小 HTTP flow。
- [ ] Step 2: 支持无 `SMOKE_BASE_URL` 时自动启动 server。
- [ ] Step 3: 支持有 `SMOKE_BASE_URL` 时连接已有 server。
- [ ] Step 4: 每个步骤输出简短 label：auth、create、parse、assets、calibration、image、video、export。
- [ ] Step 5: 最终断言 export ready、history 非空、state 可恢复。
- [ ] Step 6: 对 R0 中 full replay/conflict 的 route 加 smoke idempotency assertion。

### Task C2.5: Browser Dogfood Gate

| 字段 | 内容 |
| --- | --- |
| 背景 | HTTP smoke 只能证明 API 可用，不能证明真实前端事件、cookie、hash、表单和 toast 与后端串联。用户目标是整个项目真正可运行。 |
| 交付能力 | 提供一条真实页面验收路径，打开本地 URL 并在 UI 内完成登录到导出；可以先手工 checklist，优先自动化。 |
| 前置依赖 | Developer A A1/A1.5；Developer B B1/B2；C1。 |
| 验证方式 | `npm run dev` 后执行 Browser/Playwright dogfood，或按文档 checklist 记录通过步骤和截图。 |
| 异常处理 | 任一步失败记录页面、action、API response、console error；失败即不能进入 Local Alpha Done。 |
| 主链路贡献 | Yes。它证明前后端真的打通。 |

**Files:**

- Create if automated: `apps/web/e2e/local-runnable-alpha.spec.ts`
- Create: `docs/local-dev/local-runnable-alpha.md`
- Modify: `docs/ops/p0-release-rollback-checklist.md`

- [ ] Step 1: 写 Browser dogfood checklist：登录、创建、解析、确认资产、校准、生成、导出、刷新恢复。
- [ ] Step 2: 如果使用自动化，添加最小 browser e2e；如果先手工，记录所需截图/日志。
- [ ] Step 3: 把 Browser dogfood 作为 R5 必跑 gate 写入 release checklist。
- [ ] Step 4: 执行一次 gate，记录结果。

### Task C3: Local Dev Documentation

| 字段 | 内容 |
| --- | --- |
| 背景 | DX 的核心是让后来的人少猜。当前 runtime 文档已有 provider/storage 配置，但缺一份从 0 到跑通的 local alpha 指南。 |
| 交付能力 | 文档说明启动、登录、验证码 debug、脚本、smoke、Browser dogfood、常见错误、provider/storage 模式。 |
| 前置依赖 | C1/C2 脚本命名稳定。 |
| 验证方式 | `npm test -- apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts` 或新增 docs spec。 |
| 异常处理 | 文档必须说明端口占用、401、idempotency_key_required、provider mode 缺 env 的处理。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `docs/local-dev/creator-platform-runtime.md`
- Create: `docs/local-dev/local-runnable-alpha.md`
- Modify: `apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts`

- [ ] Step 1: 写 local runnable alpha 指南。
- [ ] Step 2: 补脚本表和 smoke 期望输出。
- [ ] Step 3: 补 Browser dogfood checklist 和证据要求。
- [ ] Step 4: 补常见错误表。
- [ ] Step 5: 写 docs readiness test，确保关键命令不会从文档消失。

### Task C4: Integration Gate and Release Checklist Update

| 字段 | 内容 |
| --- | --- |
| 背景 | 三人并行容易出现“我这里通过了，但主链路坏了”。需要一个合并前共同 gate。 |
| 交付能力 | 更新 P0 release/rollback checklist，把 Local Runnable Alpha gate 纳入合并检查。 |
| 前置依赖 | C1/C2/C2.5/C3。 |
| 验证方式 | `npm test -- apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts`。 |
| 异常处理 | smoke 或 Browser dogfood 失败不能进入 Done；允许跳过真实 provider/payment gate，但必须注明不在本次范围。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `docs/ops/p0-release-rollback-checklist.md`
- Modify: `docs/ops/p0-creator-ops-runbook.md`
- Modify: `apps/backend/src/entrypoints/tests/ops-readiness-docs.spec.ts`

- [ ] Step 1: 在 release checklist 增加 Local Runnable Alpha section。
- [ ] Step 2: 写合并前命令：`npm test`、`npm run smoke:local`、Browser dogfood gate。
- [ ] Step 3: 写失败处理：回滚本次改动、保留日志、记录失败步骤。
- [ ] Step 4: 更新 docs readiness test。

## 4. Handoff Checks

Developer C owns final Local Runnable Alpha gate:

```bash
npm test
npm run smoke:local
npm run dev
# then complete Browser dogfood from docs/local-dev/local-runnable-alpha.md
```

Expected:

- `npm test` passes.
- `npm run smoke:local` exits 0 and prints auth/create/parse/assets/calibration/image/video/export PASS.
- Browser dogfood evidence shows login -> export and refresh recovery through the real page.

Developer C must provide this handoff note:

```text
Local Runnable Alpha gate:
- npm test:
- npm run smoke:local:
- Browser dogfood evidence:
- Known skipped tests:
- Known out-of-scope gates:
```
