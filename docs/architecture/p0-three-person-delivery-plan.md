# P0 三人开发任务拆分

> 状态：M0.1 之后的团队执行计划  
> 日期：2026-05-08  
> 目标：把 P0 模块实施蓝图拆成三名开发人员每天能推进、每周能验收、风险能提前暴露的开发任务体系。  
> 来源：`p0-delivery-execution-system.md`、`p0-module-implementation-blueprint.md`、`p0-verification-plan.md`、`2026-05-08-m1-platform-foundation.md`

## 1. 分工原则

三个人不按“前端/后端/测试”粗暴切分，而按能力闭环切分。

每个任务必须回答：

```text
交付什么能力？
依赖什么前提？
怎么验证完成？
出错怎么处理？
是否推进了主链路闭环？
```

分工目标：

- 一个人守住平台基础、租户安全、幂等、任务可靠性。
- 一个人推进创作主链路的后端能力。
- 一个人推进前端联调、验收测试、发布观测和用户可演示闭环。

## 2. 三人角色

| 人员 | 角色代号 | 主责 | 不负责 |
| --- | --- | --- | --- |
| 开发 A | Platform/Reliability Owner | M1 平台基础、DB 迁移、认证、租户、权限、幂等、Outbox/Inbox、Workflow/Task、可靠性与信用账本前置 | 不直接写项目/分镜业务规则，不绕过模块 owner 改业务表 |
| 开发 B | Creator Domain Owner | Project、Script、Asset、Shot、Calibration、Export、Mock ModelGateway、P0-A 主链路后端 | 不实现支付、不做 UI 假状态、不绕过 Workflow/Task 创建长任务 |
| 开发 C | Experience/QA/Ops Owner | Web 工作台、API 联调、E2E、验收用例、错误码体验、日志/指标/发布/Runbook/Admin Lite | 不用假数据伪造完成，不绕过后端权限和持久状态 |

## 3. 交付批次与负责人

| 批次 | 目标 | 主负责人 | 协作人 | 出口标准 |
| --- | --- | --- | --- | --- |
| B0 M0.1 | 合同、基础 SQL、测试入口可用 | A | B/C review | Contract tests 通过，M0.1 已记录 |
| B1 M1 | 真实登录、租户、权限、审计 | A | C 做权限/联调测试 | Auth/RBAC/tenant/audit tests 通过 |
| B2 M2 Skeleton | 项目创建、脚本解析 workflow、状态查询刷新恢复 | A+B | C 做 E2E 骨架 | 创建项目 -> 解析 workflow -> 状态查询真实落库 |
| B3 M2 Closure | 资产、分镜、校准、生图、导出闭环 | B | A 支持 Workflow/Task，C 做前端/E2E | P0-A mock provider 主链路 E2E 通过 |
| B4 M3 | ProviderRequest 副作用保护 | A | B 接入生成链路，C 做故障测试 | A-001/no blind retry 通过 |
| B5 M4 | 队列/worker/repair/credit reliability | A | B/C 联调 Ops 可见性 | Redis loss、lease repair、credit tests 通过 |
| B6 M5 | 支付、退款、发票、对账 gate | A | C 做 Admin/Ops 验收；B 只消费信用能力 | Payment gates 通过，仍需官方/财税确认 |
| B7 M6 | Beta 发布就绪 | C | A/B 提供指标与 runbooks | staging dry-run、rollback、ops drill 通过 |

## 4. 并行规则

1. B1 期间，B 只能做 Project/Shot 的领域设计和测试草稿，不落生产业务实现。
2. B1 期间，C 可以做 Web 壳、路由、空状态和 E2E 框架，但不能用假接口宣称主链路完成。
3. B2 开始后，B 的 Project/Script 必须依赖 A 提供的 `ActorContext`、`assertCapability`、idempotency helper 和 tenant-safe query。
4. B3 的生图链路必须通过 Workflow/Task 和 Mock ModelGateway，不允许 Shot 模块直接调用 provider。
5. M3 真实 provider dogfood 前，必须由 A 完成 ProviderRequest pre-call persistence 和 no-blind-retry 测试。
6. M5 支付实现前，必须完成官方支付字段、商户能力、财税流程确认；未确认前只允许 mock/provider-contract 测试。

## 5. 开发 A 任务清单

### A1. M1 Email-Code 登录与 Session

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 用户可以通过 email-code 登录，系统生成服务端可撤销 session。 |
| 依赖什么前提？ | `users`、`login_codes`、`auth_sessions` 表；错误码规范；测试 runner。 |
| 怎么验证完成？ | `login-code.spec.ts`、`session.spec.ts` 覆盖 hash 存储、一次性消费、过期/撤销、disabled user 拒绝。 |
| 出错怎么处理？ | 错码区分 `code_expired`、`code_consumed`、`code_invalid`、`user_disabled`；日志只记录 email hash，不记录明文 code/token。 |
| 是否推进主链路闭环？ | 是。它是所有项目/生成/导出接口的真实入口。 |

### A2. M1 ActorContext、Capability、Tenant-Safe Query

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 后端能解析用户所在组织/工作区/成员身份，并在命令边界执行能力校验。 |
| 依赖什么前提？ | A1 session；`organizations`、`workspaces`、`memberships` 表。 |
| 怎么验证完成？ | 401/403/disabled user/suspended org/missing membership/无能力测试；tenant leak negative tests。 |
| 出错怎么处理？ | 在 command handler 之前拒绝；记录 `traceId`、`userId`、`organizationId`、拒绝原因。 |
| 是否推进主链路闭环？ | 是。它允许 B 安全实现 Project/Script/Shot，避免后续返工。 |

### A3. M1 Audit Append Helper

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 敏感操作可以追加审计事件，记录 actor、scope、target、reason、metadata。 |
| 依赖什么前提？ | A2 ActorContext；`audit_events` 表。 |
| 怎么验证完成？ | audit tests 覆盖必填字段、metadata 脱敏、append-only、不允许缺 actor/reason 的高风险操作。 |
| 出错怎么处理？ | 审计写失败时核心高风险命令不得静默成功；低风险事件可进入 outbox/repair 后续补偿。 |
| 是否推进主链路闭环？ | 是。校准 skip、导出、Admin/Ops、支付退款都依赖审计。 |

### A4. B2 Workflow/Task/Attempt 骨架

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 创建 durable workflow/task/attempt，支持状态查询、worker claim、finalization skeleton。 |
| 依赖什么前提？ | A2 tenant scope；M0.1 contracts；foundation SQL。 |
| 怎么验证完成？ | task claim concurrency、duplicate worker claim、workflow status aggregation、refresh-running status tests。 |
| 出错怎么处理？ | worker crash 由 lease 标记可恢复；finalization 失败必须事务回滚；状态不只存在 Redis。 |
| 是否推进主链路闭环？ | 是。脚本解析、生图、导出都必须通过它。 |

### A5. B2/B3 Idempotency 持久化接入

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | `CreateProject`、`ParseScript`、`GenerateShotImage`、`CreateExport` 重试/刷新不会创建重复资源。 |
| 依赖什么前提？ | M0.1 idempotency helper；真实 repository/transaction。 |
| 怎么验证完成？ | IDEMP-001/002 已有；补 IDEMP-003/004 和 R-002。 |
| 出错怎么处理？ | 同 key 不同 hash 返回 `409 idempotency_conflict`；running 命令返回已有 workflow/task 状态。 |
| 是否推进主链路闭环？ | 是。用户刷新/双击不破坏主链路。 |

### A6. B4 ProviderRequest 副作用保护

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 外部 provider 调用前持久化 `provider_requests`，外部提交开始后崩溃/超时进入 `result_unknown`，禁止盲重试。 |
| 依赖什么前提？ | A4 Workflow/Task；B 的 Mock ModelGateway 接口。 |
| 怎么验证完成？ | A-001、R-026、R-027、timeout-before/after-accept provider stub tests。 |
| 出错怎么处理？ | before external start 可安全重试；after external start 只能 lookup/manual review，不创建第二次外部请求。 |
| 是否推进主链路闭环？ | 是。它决定能否从 mock provider 进入真实 provider dogfood。 |

### A7. B5 Queue/Worker Repair

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | Redis 丢 job、worker lease 过期、outbox 重放都可以恢复或幂等 no-op。 |
| 依赖什么前提？ | A4 Workflow/Task；Outbox/Inbox；ProviderRequest state。 |
| 怎么验证完成？ | R-001、R-003、R-004、R-005、R-014、R-021。 |
| 出错怎么处理？ | `FOR UPDATE SKIP LOCKED` 小批量扫描；重复派发由 worker claim/inbox 去重兜底。 |
| 是否推进主链路闭环？ | 间接推进。它让主链路在失败后仍可恢复。 |

### A8. B6 Credit Ledger 与 Reservation

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 生成前额度可校验/预留，任务成功 consume，失败 release，unknown 保持 reserved。 |
| 依赖什么前提？ | A4/A7；B 的生成 task；`credit_ledger_entries`、reservation tables。 |
| 怎么验证完成？ | R-008、R-009、R-015、R-028、TC-P0-008。 |
| 出错怎么处理？ | allocation 单次结算约束防止 consume/release 双写；read-model drift 通过 ledger recompute 修复。 |
| 是否推进主链路闭环？ | 是。P0-B 商业 beta 前必须有信用可靠性。 |

### A9. B6/B7 Commerce/Payment 后端 Gate

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | Credit package、order、payment intent、callback dedup、payment-to-credit grant。 |
| 依赖什么前提？ | A8 credit ledger；官方 WeChat/Alipay 字段验证；财税流程确认。 |
| 怎么验证完成？ | callback signature、duplicate callback、amount mismatch、frontend return no grant、paid-without-credit repair。 |
| 出错怎么处理？ | 金额/币种/商户 mismatch 进入 risk/manual review；重复回调返回成功但不重复 grant。 |
| 是否推进主链路闭环？ | 不推进 P0-A 创作闭环，但推进 P0-B 商业闭环。 |

## 6. 开发 B 任务清单

### B1. Project/CreateProject + Script 存储

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 登录用户可在工作区创建项目并保存剧本文本/文件引用。 |
| 依赖什么前提？ | A2 ActorContext；A5 idempotency；project/script migration。 |
| 怎么验证完成？ | TC-P0-001 的 create 部分；CreateProject replay/conflict；forbidden tenant tests。 |
| 出错怎么处理？ | invalid input/duplicate conflict/无权限返回稳定错误；失败不写半截 project/script。 |
| 是否推进主链路闭环？ | 是。它是创作闭环第一步。 |

### B2. Script Parse Workflow + Mock Output Finalization

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 用户触发剧本解析后，系统创建 workflow/task，并用 mock provider 产出 episode、asset candidate、shot draft。 |
| 依赖什么前提？ | A4 Workflow/Task；A5 ParseScript idempotency；A2 权限。 |
| 怎么验证完成？ | TC-P0-001、TC-P0-010、IDEMP-003；状态查询从 PostgreSQL 返回 queued/running/succeeded/failed。 |
| 出错怎么处理？ | parse failed 保留可重试状态；重复 parse 返回已有 workflow；worker failure 不产生脏数据。 |
| 是否推进主链路闭环？ | 是。它把项目推进到资产/分镜阶段。 |

### B3. Asset 与 AssetVersion

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 角色/场景/道具/分镜图/视频都以业务 asset + immutable version 存储。 |
| 依赖什么前提？ | B2 解析候选；storage adapter 最小接口；A2 tenant scope。 |
| 怎么验证完成？ | asset version unique、regeneration preserves old version、signed URL tenant auth 与 C 联测。 |
| 出错怎么处理？ | 版本写失败回滚 finalization；旧版本不覆盖；storage metadata 缺失进入 failed/retryable。 |
| 是否推进主链路闭环？ | 是。没有 asset/version 就无法生成、预览、导出。 |

### B4. Shot 状态与 Current Pointer Safety

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 分镜有 content/image/video 独立状态，生成完成只在 active task/revision 匹配时更新 current pointer。 |
| 依赖什么前提？ | B3 AssetVersion；A4 Workflow/Task。 |
| 怎么验证完成？ | R-011、R-012、TC-P0-005：stale task/out-of-order regeneration 不移动 current pointer。 |
| 出错怎么处理？ | late success 写历史版本但不设为 current；状态异常进入 repair/admin 可见。 |
| 是否推进主链路闭环？ | 是。它保护分镜生成质量和版本历史。 |

### B5. Public Asset Confirm

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 用户确认关键角色/主要场景/关键道具，阻塞项明确影响下一步。 |
| 依赖什么前提？ | B2 解析候选；B3 asset model；C 的 UI tab/卡片。 |
| 怎么验证完成？ | TC-P0-002：关键角色/场景未确认时不能进入校准/生成。 |
| 出错怎么处理？ | 删除/修改关键资产后重新计算阻塞项；无权限编辑返回 403。 |
| 是否推进主链路闭环？ | 是。它连接解析结果和分镜/校准。 |

### B6. Calibration Session + Gate

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 用户选择 3 张代表分镜生成校准，pass/skip/override 形成 durable gate。 |
| 依赖什么前提？ | B4 shots ready；A3 audit；C 校准 UI。 |
| 怎么验证完成？ | TC-P0-003、TC-P0-009、R-016、R-024。 |
| 出错怎么处理？ | 小于/大于 3 张拒绝；质量失败阻塞 pass；skip 必须审计。 |
| 是否推进主链路闭环？ | 是。它解锁批量/单张生成。 |

### B7. GenerateShotImage with Mock ModelGateway

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 单张/批量分镜图通过 mock ModelGateway 生成，部分成功可落库。 |
| 依赖什么前提？ | A4/A5；B3/B4/B6；C 状态 UI。 |
| 怎么验证完成？ | TC-P0-004、TC-P0-012、R-002、R-016。 |
| 出错怎么处理？ | 单镜失败不阻塞其他分镜；重复运行返回已有 task；provider failure 显示可重试原因。 |
| 是否推进主链路闭环？ | 是。它是 P0-A 最核心能力。 |

### B8. GenerateShotVideo 最小能力

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 对已完成 current image 的单个分镜发起图转视频 mock task。 |
| 依赖什么前提？ | B7 image completed；A4 workflow/task；B3 asset version。 |
| 怎么验证完成？ | TC-P0-006：失败后 3 步内可重试；video status 从 ready/generating/completed/failed 流转。 |
| 出错怎么处理？ | image stale 后 video stale；失败保留重试入口，不覆盖旧视频。 |
| 是否推进主链路闭环？ | 是，但低于分镜图生成优先级。 |

### B9. Export Manifest

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 项目生成可下载/可检查的素材包 manifest，缺失资产明确列出。 |
| 依赖什么前提？ | B3 asset versions；B7 至少一个 completed image；C 导出 UI。 |
| 怎么验证完成？ | TC-P0-007、TC-P0-014、R-017。 |
| 出错怎么处理？ | 缺失资产时不静默失败；用户明确确认 incomplete export 才创建任务。 |
| 是否推进主链路闭环？ | 是。它关闭“剧本到素材包”闭环。 |

## 7. 开发 C 任务清单

### C1. Web App Shell + Auth Flow UI

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 用户能通过真实 API 登录并进入工作台壳。 |
| 依赖什么前提？ | A1/A2 auth APIs；错误码规范。 |
| 怎么验证完成？ | E2E: 未登录跳转登录；登录成功进入项目入口；disabled/invalid code 显示稳定错误。 |
| 出错怎么处理？ | 展示字段级/全局错误；不泄露 code/token；网络失败可重试。 |
| 是否推进主链路闭环？ | 是。它让真实用户路径开始可演示。 |

### C2. Project Create + Script Input UI

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 用户填写项目名、画幅、分辨率、剧本并调用真实 CreateProject/ParseScript。 |
| 依赖什么前提？ | B1/B2 APIs；A5 idempotency；C1 auth。 |
| 怎么验证完成？ | TC-P0-001 E2E；点击解析 1 秒内进入 loading/queued；刷新后状态仍从 API 恢复。 |
| 出错怎么处理？ | duplicate replay 显示同一 workflow；409 conflict 提示刷新/重新提交；字段错误停留表单。 |
| 是否推进主链路闭环？ | 是。它连上前端和 Project/Workflow。 |

### C3. Project Workspace 状态导航

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 工作台按 project phase + readiness flags 显示最早未完成模块和主 CTA。 |
| 依赖什么前提？ | B2 状态查询；state dictionary mapping。 |
| 怎么验证完成？ | E2E 覆盖 script_input、asset_review、shot_generation、exportable 状态路由。 |
| 出错怎么处理？ | API 状态未知时显示可恢复错误，不自行猜测下一步；所有 CTA 依赖后端可执行状态。 |
| 是否推进主链路闭环？ | 是。它让用户知道项目卡在哪里。 |

### C4. Public Asset Review UI

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 角色/场景/道具 tab、资产卡片、编辑/确认/阻塞项展示。 |
| 依赖什么前提？ | B5 APIs；B2 mock parsed assets。 |
| 怎么验证完成？ | TC-P0-002：未确认关键资产阻塞后续；确认后可继续。 |
| 出错怎么处理？ | 单项保存失败不影响其他卡片；权限失败禁用编辑并展示原因。 |
| 是否推进主链路闭环？ | 是。它把解析候选推进到可生成资产。 |

### C5. Shot List + Calibration UI

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 分镜列表、3 张校准槽位、生成校准、pass/skip 操作。 |
| 依赖什么前提？ | B4/B6 APIs。 |
| 怎么验证完成？ | TC-P0-003、TC-P0-009 E2E；未通过校准时批量生成按钮后端/前端都不可用。 |
| 出错怎么处理？ | 校准失败显示失败项和重试入口；skip 二次确认并记录原因。 |
| 是否推进主链路闭环？ | 是。它解锁生成阶段。 |

### C6. Generation Status UI + Retry UX

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 分镜逐个展示 generating/completed/failed/stale；失败可进入编辑和重试。 |
| 依赖什么前提？ | B7/B8 APIs；A4 task status query。 |
| 怎么验证完成？ | TC-P0-004、TC-P0-005、TC-P0-006、TC-P0-011、TC-P0-012。 |
| 出错怎么处理？ | 单镜失败不阻塞其他镜；刷新恢复；重复点击不产生重复 task；失败 3 步内可重试。 |
| 是否推进主链路闭环？ | 是。它验证长任务用户体验。 |

### C7. Export UI

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 导出模块展示资产完整性检查、缺失项、确认 incomplete export、下载/manifest 状态。 |
| 依赖什么前提？ | B9 Export API。 |
| 怎么验证完成？ | TC-P0-007、TC-P0-014 E2E/API。 |
| 出错怎么处理？ | 缺失资产清单明确；导出失败显示原因和重试；下载链接过期可刷新。 |
| 是否推进主链路闭环？ | 是。它关闭素材包交付。 |

### C8. E2E/Regression Harness

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 自动化覆盖 P0-A 从登录到导出的主链路和关键异常。 |
| 依赖什么前提？ | C1-C7；A/B 提供真实 API/test fixtures。 |
| 怎么验证完成？ | `e2e-p0-a` gate 跑通 TC-P0-001 至 TC-P0-014 中 P0-A 范围。 |
| 出错怎么处理？ | 失败用 traceId 关联 API/worker logs；测试不稳定必须标阻塞，不允许忽略。 |
| 是否推进主链路闭环？ | 是。它是每周验收的核心证据。 |

### C9. Observability、Runbook、Release

| 问题 | 答案 |
| --- | --- |
| 交付什么能力？ | 开发/测试/运维能定位 API、Workflow/Task、Provider、Credit、Storage、Redis、PostgreSQL 层故障。 |
| 依赖什么前提？ | A/B 输出 trace/log/metric IDs。 |
| 怎么验证完成？ | ops drill：5 分钟内定位故障层；staging smoke；rollback drill。 |
| 出错怎么处理？ | 每类故障有 runbook：stuck task、unknown provider result、paid without credit、export failed。 |
| 是否推进主链路闭环？ | 间接推进。它决定闭环能否稳定上线。 |

## 8. 每周节奏

### 周一：计划与风险

- 确认本周目标批次。
- 每人只选 1 个高价值高风险主任务 + 1 个辅助任务。
- 检查是否有任务缺少依赖、验证、异常处理、观测要求。

### 周二到周四：开发与联调

- 每天先处理阻塞主链路的任务。
- 每个 PR 必须引用 verification ID。
- 完成代码不等于 Done；必须进入自测/联调/验收。

### 周五：验收与复盘

- C 主持主链路 demo。
- A 跑 contracts/unit/integration gate。
- B 说明领域状态/数据归属是否有漂移。
- 三人共同更新风险表和下周批次。

## 9. 看板列

```text
待澄清
待开发
开发中
待自测
待联调
待测试
待验收
阻塞中
已完成
```

任务进入 `待开发` 前必须具备：

- 负责人。
- reviewer。
- 依赖。
- 验证方式。
- 异常处理。
- 是否推进主链路闭环。

任务进入 `已完成` 前必须具备：

- 测试证据。
- 联调或验收证据。
- 错误处理证据。
- 日志/trace/metric 证据。
- 文档更新或明确不需要更新。

## 10. 当前第一周建议分配

| 人员 | 本周主任务 | 本周辅助任务 | 周五验收物 |
| --- | --- | --- | --- |
| A | A1 Email-Code 登录与 Session | A2 ActorContext 测试草稿 | 登录/session 单测通过，ActorContext 红灯测试已写 |
| B | B1 Project/CreateProject 测试草稿与数据模型补齐 | B2 Parse workflow 设计对齐 A 的 Workflow/Task | CreateProject task card 可进入开发，ParseScript 依赖无歧义 |
| C | C1 Auth Flow UI 壳与 E2E harness | C2 Project Create UI 测试脚本草稿 | 登录 UI 可对接 A mock/真实 API，E2E runner 能启动 |

第一周禁止事项：

- B 不提前实现绕过权限的 Project API。
- C 不用假状态伪造项目已解析。
- A 不把 session/token 明文落库或写日志。
- 三人都不改 state/operation/event 名称，除非提交 contract-change record。

## 11. 验收口径

一个任务只有在下面五问都有证据时才能关闭：

| 问题 | 关闭证据 |
| --- | --- |
| 交付什么能力？ | 任务卡 capability ID + 可调用接口/可运行测试/可演示 UI |
| 依赖什么前提？ | PR 描述列出依赖并证明已满足 |
| 怎么验证完成？ | 测试命令、E2E、验收截图/日志、verification ID |
| 出错怎么处理？ | 错误码、状态流转、重试/补偿、日志/审计 |
| 是否推进主链路闭环？ | 标记 Yes/No；No 必须说明它服务哪个上线 gate |

## 12. 结论

三人分工不是三条互不相干的线，而是一条主链路上的三种责任：

```text
A 保证系统可信
B 保证业务成立
C 保证用户可用、可验收、可上线
```

三人每天都要围绕同一个问题同步：

```text
今天做的事，是否让“登录 -> 创建项目 -> 解析 -> 分镜 -> 校准 -> 生成 -> 导出”这个真实闭环更接近可运行？
```
