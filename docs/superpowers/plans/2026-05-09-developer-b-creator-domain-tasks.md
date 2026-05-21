# 开发者 B 任务包：创作域

> 日期：2026-05-09
> 回填更新：2026-05-19
> 负责人：Developer B
> 角色：创作域负责人
> 使命：把创作主链路的业务事实做扎实：Project、Script、Asset、Shot、Calibration、Generation、Export。

## 0. 回填结论

截至 2026-05-19，这份计划中的 `B0-B9` 已经不再处于“全部待做”的状态。代码核对后更准确的判断是：`B0-B9` 的主链路均已落地，其中 `B2/B7/B8/B9` 已不应再标记为“只打通半条链路”。当前剩余工作主要是：

- 继续同步计划文档和 readiness 文档，避免状态漂移。
- 把工作区中的未提交 creator-domain 改动整理进正式提交。
- 做发布前的扩大验证、真实 provider/storage 适配验证和后续硬化。
- 将剩余工作明确归类为 release hardening，而不是回到 B0/B1 的前置阻塞阶段。

## 0.1 当前状态总表

| 任务 | 当前状态 | 说明 | 主要证据 |
| --- | --- | --- | --- |
| B0 | 已完成 | 契约、fixtures、场景矩阵、blocker 基线已落地 | `project-readiness.ts`，`project-readiness.spec.ts` |
| B1 | 已完成 | CreateProject 已接入 ActorContext、幂等、审计、SQL，真实写入 project + script | `create-project.command.ts`，`sql-project.command.ts`，`sql-project.command.spec.ts` |
| B2 | 已完成 | ParseScript 已创建 durable workflow/task，并在 finalization 中落地 asset review candidates、shots、project phase 与 script status | `parse-script.command.ts`，`parse-script.service.ts`，`creator-application.service.ts` |
| B3 | 已完成 | Asset / AssetVersion 模型和 SQL 快照持久化已落地 | `asset.service.ts`，`asset-version-record.service.ts` |
| B4 | 已完成 | Shot current 指针保护和 stale 完成保护已落地 | `shot.service.ts`，`shot.service.spec.ts` |
| B5 | 已完成 | Public Asset 确认、编辑、阻塞项计算已落地 | `asset-review-record.service.ts`，`asset-review.service.ts` |
| B6 | 已完成 | Calibration pass / skip / override 和审计持久化已落地 | `calibration.service.ts`，`creator-application.service.ts` |
| B7 | 已完成 | GenerateShotImage 已打通 workflow/task、provider request、storage object、AssetVersion 落地与 shot current pointer 更新 | `shot-image-generation.service.ts`，`creator-platform.service.ts`，`creator-application.service.ts` |
| B8 | 已完成 | GenerateShotVideo 已打通 current image 前置校验、workflow/task、AssetVersion 落地与 shot current video pointer 更新 | `shot-video-generation.service.ts`，`creator-platform.service.ts`，`creator-application.service.ts` |
| B9 | 已完成 | Export manifest、导出记录、签名链接、export history 与 export phase 推进已落地 | `export-manifest.service.ts`，`export-record.service.ts`，`creator-platform.service.ts` |

## 0.2 回填后判断

- 这份文档第 1 节中关于 “A2/A3/A4 未就绪前只能做准备工作” 的限制，属于 2026-05-09 当时的正确约束。
- 到 2026-05-19，这些约束已经不再是主阻塞。它们应被视为历史背景，而不是当前执行状态。
- 当前的真实风险不是“代码还停留在 B0/B1 准备阶段”，而是：
- 文档仍混有 2026-05-09 的前置约束描述和 2026-05-19 的已实现状态，容易误导后续开发。
- creator-domain 改动仍停留在工作区，尚未整理成正式提交。
- 后续验证重点应转向真实 provider/storage 适配、跨模块集成、发布前回归，而不是继续追问 B2/B7/B8/B9 是否已经打通。

## 1. B 现在能开始吗？

可以，但必须严格限定边界。

B 可以立即开始以下工作：

- Project/Script/Asset/Shot/Export 的 schema 审查。
- Command 契约审查和测试骨架。
- CreateProject 和 ParseScript 的 fixtures。
- 创作域状态机草案（不得绕过 A 的 ActorContext、Audit、Workflow/Task 或幂等性机制）。

在 A2/A3 就绪之前，B 不得开始真正的 Project 写入命令。在 A4 就绪之前，B 不得实现 Script Parse 工作流。

## 2. 不可妥协的规则

- 不得绕过 ActorContext、capability 检查、tenant 范围或 audit 审计。
- 不得创建本地/模拟的 task 状态。长时间运行的任务必须使用 A4 的 Workflow/Task。
- 不得直接调用真实的 provider。必须使用 ModelGateway 边界。
- 不得覆写已生成的 asset。必须始终创建不可变的 AssetVersion。
- 不得静默导出不完整的成果。缺失的 asset 必须显式标注。

## 3. B 对其他开发者的交付物

| 消费者 | B 必须提供 | 阻塞项 |
| --- | --- | --- |
| C | Project 创建/解析/status API 及稳定的错误码 | C2/C3 UI |
| C | Asset 审核阻塞项和就绪标志 | C4 |
| C | Shot/calibration/generation/export API | C5-C7 |
| A | 用于幂等性和工作流的 Command 集成点 | A5 加固 |
| A/C | ModelGateway mock 行为及 fixture 输出 | A6/C8 |

## 4. 任务 B0：创作域契约和 Fixture 准备

| 字段 | 内容 |
| --- | --- |
| 背景 | 在 A 的平台基础完成之前，B 可以并行工作，但仅限于不伪造平台行为的制品。 |
| 能力 | 创作域测试 fixtures、command 契约审查、schema 对齐说明、为 B1/B2 编写失败测试。 |
| 前置条件 | M0.1 契约及当前任务分工。 |
| 验证 | 失败测试文件存在且引用了 TC/IDEMP ID；没有 production command 绕过 A2/A3/A4。 |
| 失败处理 | 如果发现缺失的平台依赖，应将其记录为阻塞项，而非实现变通方案。 |
| 主循环 | 是。一旦 A 解除平台边界限制，此任务将缩短 B1/B2 的实施时间。 |

## 5. 任务 B1：Project/CreateProject 和 Script 存储

| 字段 | 内容 |
| --- | --- |
| 背景 | 创作循环从真实的项目和真实的脚本开始。纯前端的临时状态会使下游的解析/生成无法被信任。 |
| 能力 | 在工作区中创建项目，并在 tenant 范围内持久化脚本输入。 |
| 前置条件 | A2 ActorContext、A3 Audit、M0.1 幂等性辅助工具、project/script 迁移脚本。 |
| 验证 | `npm test -- apps/backend/src/modules/project`；create-project 成功、无效输入、forbidden、replay、409 冲突。 |
| 失败处理 | 缺少 capability 时返回 403；校验错误返回稳定的字段级错误；重复 replay 返回相同的 project。 |
| 主循环 | 是。它启动了 login -> create project -> parse script 的流程。 |

实现说明：

- 在同一个事务中创建 project 和 script。
- 使用 `project.create` 操作名称。
- 在需要的地方写入 audit 日志。
- 初始 project 阶段应为 `script_input`。

## 6. 任务 B2：带 Mock 输出的 Script Parse 工作流

| 字段 | 内容 |
| --- | --- |
| 背景 | 这是第一个长时间运行的任务。它必须证明持久化的工作流/task 状态，而非前端的 loading 标志。 |
| 能力 | ParseScript command 创建 workflow/task；mock provider 生成 episodes、候选 assets 和 draft/ready 状态的 shots。 |
| 前置条件 | A4 Workflow/Task、B1、M0.1 幂等性辅助工具。在 A4 就绪之前，仅允许测试/契约/fixtures。 |
| 验证 | TC-P0-001、TC-P0-010、TC-P0-011、IDEMP-003。 |
| 失败处理 | 解析失败应保留可修复的状态；重复解析返回已有的 workflow；worker 失败时不得写入部分业务事实。 |
| 主循环 | 是。它将脚本输入转换为创作者工作区状态。 |

实现说明：

- 状态查询必须读取 PostgreSQL/领域状态。
- Mock 输出必须对 E2E fixtures 具有确定性。
- 完成时以事务方式写入领域事实。

当前状态 / 下一步动作：

- 当前已具备能力：`ParseScript` 已通过 durable workflow/task 完成 parse finalization，并写入 `asset review candidates`、`shots`、`project phase`、`script status`。
- 当前证据：creator application 集成测试已覆盖 parse finalization 的 durable facts 写入。
- 下一步动作：围绕 replay、失败恢复、跨模块 API 使用和发布前回归继续硬化，而不是重复实现 parse finalization。

## 7. 任务 B3：Asset 和不可变 AssetVersion

| 字段 | 内容 |
| --- | --- |
| 背景 | 生成的输出必须是可追溯和可复现的。覆写当前 asset 会破坏可审计性和重新生成的安全性。 |
| 能力 | Asset 代表业务对象；AssetVersion 代表不可变的二进制/输出版本。 |
| 前置条件 | B2 候选 assets、A-S1 存储适配器。 |
| 验证 | `npm test -- apps/backend/src/modules/asset`；版本号单调递增、旧版本保留、元数据增强安全。 |
| 失败处理 | 版本写入失败回滚 finalization；缺失存储元数据为可重试失败。 |
| 主循环 | 是。它使 generation/export 可信。 |

## 8. 任务 B4：Shot 状态和 Current 指针安全

| 字段 | 内容 |
| --- | --- |
| 背景 | Shot 编辑和生成可能乱序完成。Current 指针必须反映当前用户的意图，而非最后一个完成的 task。 |
| 能力 | Shot 内容/图片/视频状态机及 current 指针保护机制。 |
| 前置条件 | B3、A4。 |
| 验证 | R-011、R-012；过时完成和乱序重新生成测试。 |
| 失败处理 | 延迟成功仅写入历史 AssetVersion；异常状态进入修复/管理员可见范围。 |
| 主循环 | 是。它保护已生成的 storyboard 状态。 |

实现说明：

- 使用 content revision 和 active task ID。
- 绝不从过时的 task 完成事件中更新 current 指针。

## 9. 任务 B5：Public Asset 确认

| 字段 | 内容 |
| --- | --- |
| 背景 | Asset 确认是脚本解析与可靠的 shot/calibration 生成之间的业务关卡。 |
| 能力 | 确认/编辑关键角色、主要场景、重要道具，并计算阻塞项/就绪标志。 |
| 前置条件 | B2、B3、A2。 |
| 验证 | TC-P0-002；关键角色/场景在确认前阻塞进度；重要道具可能发出警告但不阻塞。 |
| 失败处理 | 单卡片保存失败不影响其他卡片；未授权编辑返回 403。 |
| 主循环 | 是。它将解析后的候选项推向生成就绪状态。 |

## 10. 任务 B6：Calibration 会话和门控

| 字段 | 内容 |
| --- | --- |
| 背景 | Calibration 必须是持久化的业务事实。UI 复选框不是生成的门控。 |
| 能力 | 三镜头 calibration 会话、pass/skip/override 决策、批量生成的后端门控。 |
| 前置条件 | B4、B5、A3 Audit。 |
| 验证 | TC-P0-003、TC-P0-009、R-016、R-024。 |
| 失败处理 | 错误的 shot 数量会被拒绝；未通过质量检查的无法 pass；skip 需要原因和 audit 记录。 |
| 主循环 | 是。它控制批量图片生成的门控。 |

## 11. 任务 B7：带 Mock ModelGateway 的 GenerateShotImage

| 字段 | 内容 |
| --- | --- |
| 背景 | 这是 P0-A 的核心 AI 能力。它必须由持久化的 task 驱动，并生成不可变版本。 |
| 能力 | 单/批量 shot 图片生成、部分成功、重试、AssetVersion finalization。 |
| 前置条件 | A4/A5、B3/B4/B6。 |
| 验证 | TC-P0-004、TC-P0-012、R-002、R-016。 |
| 失败处理 | 单个 shot 失败不阻塞成功的 shot；重复点击回放已有 task；重试在 3 步用户操作内可达。 |
| 主循环 | 是。它创建核心生成输出。 |

实现说明：

- 首先使用 mock ModelGateway。
- 将成功结果写入 AssetVersion 和受保护的 current 指针。
- 失败项必须可见且可重试。

当前状态 / 下一步动作：

- 当前已具备能力：图片生成已经打通 workflow/task、provider request、storage object、`AssetVersion` 写入和 `Shot current pointer` 更新。
- 当前证据：creator application 与 creator platform 测试已覆盖 deferred finalization、current pointer 写入和任务状态落地。
- 下一步动作：继续验证真实 provider/storage 配置、失败可见性和发布前回归。

## 12. 任务 B8：GenerateShotVideo 最小实现

| 字段 | 内容 |
| --- | --- |
| 背景 | P0 包含单镜头图片转视频，但不应延迟图片生成循环。 |
| 能力 | 当存在 current 图片时启动视频 task；complete/fail/stale 状态正确。 |
| 前置条件 | B7。 |
| 验证 | TC-P0-006。 |
| 失败处理 | 缺少 current 图片时被拒绝；旧视频不被覆写；失败可重试。 |
| 主循环 | 是。它在图片路径稳定后完成 P0 媒体能力。 |

当前状态 / 下一步动作：

- 当前已具备能力：视频生成闭环已存在，并复用了 `current image` 作为启动前提。
- 当前证据：creator application 集成测试已覆盖视频任务成功落地与 project phase 推进；领域测试已覆盖 stale/current pointer 规则。
- 下一步动作：继续验证失败重试、真实视频 provider 适配和发布前回归。

## 13. 任务 B9：Export Manifest

| 字段 | 内容 |
| --- | --- |
| 背景 | Export 是脚本 -> asset 流程的终点。缺失的 asset 必须可见，而非被静默忽略。 |
| 能力 | 创建导出记录和 manifest；标识缺失的 asset；支持不完整导出确认。 |
| 前置条件 | B3、B7、A-S1、至少一个已完成的图片。 |
| 验证 | TC-P0-007、TC-P0-014、R-017。 |
| 失败处理 | 缺失 asset 默认阻塞；导出失败可重试；签名下载链接可刷新。 |
| 主循环 | 是。它关闭 P0-A 创作者循环。 |

当前状态 / 下一步动作：

- 当前已具备能力：manifest、export record、signed URL、export history 查询和 export phase 推进已经具备。
- 当前证据：creator application / creator platform 测试已覆盖导出记录创建、签名链接生成和导出任务成功落地。
- 下一步动作：继续验证 partial export 交互路径、真实下载链路和发布前回归。

## 14. 第一周计划

| 天数 | 重点 | 预期产出 |
| --- | --- | --- |
| 第 1 天 | B0 契约/schema/测试审查 | 阻塞项列表、fixture 计划、B1 失败测试草案 |
| 第 2 天 | B1 CreateProject 测试骨架 | 测试引用 A2/A3 依赖而非绕过它们 |
| 第 3 天 | B2 ParseScript fixture/mock 输出草案 | 确定性 mock 输出结构文档 |
| 第 4 天 | Asset/Shot 状态审查 | 版本控制和指针安全测试草案 |
| 第 5 天 | 准备好等待 A 解除阻塞的交付包 | A2/A3 上线后 B 可立即开始 B1 实现 |

## 15. 信心检查

我 100% 确信 B 可以现在开始，前提是 B 将早期工作视为测试/契约/fixture 准备，且不伪造平台边界。B 的真正实现路径被有意地设置为需要 A2/A3/A4 的门控，因为这是保护产品长期健康的关键。
