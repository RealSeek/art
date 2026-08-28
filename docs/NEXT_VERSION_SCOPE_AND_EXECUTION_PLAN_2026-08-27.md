# Xinyue AI 下一版本范围审定与执行计划

更新时间：2026-08-27  
文档性质：实施边界、拆分清单和验收基线  
适用范围：用户端、服务端、队列、Provider、计费、会员、无限画布和管理后台

## 1. 结论先行

参考评审的方向正确，但不能把所有建议都当成下一版本的必做项。当前项目已经完成 Generation 生命周期、账务审计、UsageRecord、图片 Runner、输出服务和基础 Worker 恢复。下一版本的目标应是：

> 在不改变现有 UI 布局、路由和主工作流的前提下，把聊天、视频、Provider 路由、任务恢复和后台运维补齐到可稳定运行的版本。

可以在同一个版本内连续完成全部“当前必须项”，但不建议一次提交、一次替换或同时重写所有模块。原因是聊天、Provider、队列和计费互相依赖，必须每一批都能单独构建、迁移、回归和回滚。

## 2. 还需要拆分多少

### 2.1 必须拆分的服务端区域

| 区域 | 当前规模/问题 | 下一版本必须拆分 | 完成后保留的职责 |
| --- | --- | --- | --- |
| `generations.processor.ts` | 约 1,088 行，仍包含 Chat、Video、通用队列和结算编排 | `ChatGenerationRunner`、`VideoGenerationRunner`、`GenerationSettlementService` | Processor 只负责取任务、调用 Runner、统一状态收口 |
| `providers.service.ts` | 约 1,574 行，目录、路由、凭据、健康和统计耦合 | 第一阶段只拆 `ProviderRoutingService`、`ProviderHealthService` | 旧 `ProvidersService` 暂作为门面，迁移完成后删除重复实现 |
| Generation 输出 | 图片/视频已存在重复风险 | 已新增 `GenerationOutputService`，继续覆盖所有媒体输出 | Asset、JobOutput、孤儿清理和输出元数据 |
| Worker 可靠性 | 已有启动恢复和心跳，但没有租约抢占 | 增加 `lockedBy`、`heartbeatAt` 或等价 claim 合同 | 防止多实例重复执行和重复资产 |
| 用量/账务 | 已有 `BillingTransaction` 和 `UsageRecord` | 补齐失败入队、取消和重试的统一归档 | 钱、用量、成本三者可对账 |

### 2.2 可以拆但不应阻塞下一版本的区域

| 区域 | 建议 |
| --- | --- |
| `CanvasEditorPage.vue` | 只迁出命令层和任务状态层，不重做布局，不拆成几十个组件 |
| 管理后台 operations/settings/providers | 保持 URL 和菜单不变，拆 API、类型、表单和抽屉；不重新设计视觉系统 |
| Prompt Library | 先保持游标同步，`PromptRevision` 放到下一版本之后 |
| Asset | 先使用现有 Asset + JobOutput，`AssetVersion` 等内容版本化放到稳定性完成之后 |
| Feature Flag | 当前先保持 GLOBAL/USER；TEAM/PLAN/ROLE 等作用域放到会员权限统一时处理 |

### 2.3 当前不要做

- 不新增音乐、短剧、插件市场、独立 Agent 产品入口。
- 不重做无限画布布局，不引入新的画布渲染框架。
- 不一次性把 Provider 五个域全部重写。
- 不做 AssetVersion、PromptRevision、复杂团队权限，除非基础任务和账务已经通过压力测试。
- 不保留旧实现作为长期兼容路径；迁移完成后必须删除旧调用和 deprecated API。

## 3. 是否可以“一次搞完全部”

### 可以一次完成的范围

以下内容可以作为一个版本连续完成：

1. Chat Runner 迁移并保持 OpenAI、Anthropic、Gemini、思考、检索、工具调用和 Token 结算行为不变。
2. Video Runner 迁移并保持轮询、取消、失败切换和视频输出格式不变。
3. Worker claim、heartbeat、超时恢复和重复消费保护。
4. Provider Routing/Health 第一阶段拆分。
5. UsageRecord 与 BillingTransaction 的成功、失败、取消、入队失败全链路对账。
6. 管理后台生成任务详情、Provider 尝试、账务和用量查看。
7. 现有聊天和任务中心的状态恢复、重试和错误信息收敛。
8. 画布只增加 `generationId -> 状态 -> assetId` 绑定，不改变布局。

### 不应承诺在同一版本彻底完成的范围

- Provider Catalog、Credential、Usage、Health、Routing 五域全部独立化。
- AssetVersion、PromptRevision、完整团队预算和复杂角色 Feature Flag。
- 大规模异步导出、数据归档、灾备演练和压测报告。
- 短剧流水线、插件沙箱、第三方生态和全新产品入口。

这些不是不能做，而是会把“稳定性版本”变成“平台重写版本”，风险和回归面会显著增加。

## 4. 下一版本实施批次

### Batch A：Generation 完整拆分（已完成）

目标：Processor 只保留队列编排和统一收口。

- `server/src/generations/runners/chat-generation.runner.ts` 已承接普通聊天、图片提示词反推、流式 Provider、消息持久化、检索、工具调用和 Token 结算。
- `server/src/generations/runners/video-generation.runner.ts` 已承接视频 Provider 创建、轮询、下载、取消和输出落库。
- `generations.processor.ts` 已删除 `runChat`、`runVideo` 及相关 Provider 执行副本，只保留队列、租约、统一状态收口和账务/用量归档。
- 统一使用 `GenerationOutputService`、`GenerationLifecycleService` 和 `UsageRecordsService`。
- 每完成一个 Runner，删除 Processor 中对应旧方法，不保留双实现。

验收：48 项单元测试通过；服务端构建通过；Processor 架构测试确认不再包含 Chat/Video 执行实现。

### Batch B：Worker 可靠性（已完成）

目标：多实例和重启场景不重复执行。

- GenerationJob 已增加 `lockedBy`、`heartbeatAt`、`leaseExpiresAt`。
- claim 使用条件更新，只允许一个 Worker 获得执行权；heartbeat/release 绑定 `lockedBy`。
- 启动恢复优先按租约过期判断，兼容历史无租约记录的 30 分钟兜底。
- 任务超时进入 `FAILED` 或 `EXPIRED`，不能无限重试。
- 资产写入和账务写入继续使用任务级幂等键。

验收：租约 claim、心跳和错误 Worker 保护均有单元测试；任务恢复、输出和账务写入继续使用任务级幂等键。

### Batch C：Provider 路由与健康（第一阶段已完成）

目标：业务 Runner 不再自行判断渠道优先级和冷却。

- 已提取 `ProviderRoutingService`：BYOK、用户指定、优先级、权重、能力和失败切换。
- 已提取 `ProviderHealthService`：成功率、延迟、429/5xx、冷却时间和恢复探活。
- 保留 `ProvidersService` 作为短期门面，只转发到新服务。
- 迁移完成后删除重复的旧路由分支。

验收：路由选择有独立单测；429/5xx 会冷却和切换；Runner 不包含 Provider 排序规则。

### Batch D：计费、用量和后台（基础链路已完成）

目标：后台可以回答“谁、调用了什么、消耗多少、平台成本多少、是否退款”。

- 生成任务详情已展示 GenerationEvent、ProviderAttempt、UsageRecord、BillingTransaction 和 JobOutput 摘要。
- 对账按 `generationId` 汇总，不直接从页面拼接多套统计。
- 会员、团队、BYOK、平台承担和 Token 预扣使用同一价格快照。
- 后台列表统一分页，禁止大表一次性读取。

验收：成功、失败、取消、入队失败和重试五类场景均能对账；管理员不会看到重复用量或重复扣款。

### Batch E：前端和画布收口（基础收口已完成）

目标：保持布局不变，只提高状态可靠性和信息一致性。

- 聊天已按真实解析结果区分思考、检索、工具和正文阶段。
- 任务中心支持刷新恢复、取消、重试和账务摘要。
- 画布节点已绑定 generationId 和输出 assetId，保持原布局。
- 后台已完成菜单/API/抽屉和设计 token 的基础统一，不改变菜单 URL 和主布局。

验收：现有页面截图和主流程不发生结构性变化；移动端和桌面端不出现重叠；所有新状态都有加载、空、错误和终态。

## 5. 完成定义

只有满足以下条件，才算下一版本完成：

- Processor 中没有旧 Chat/Video 执行副本。
- 每个 Runner 可独立测试，Provider 路由可独立测试。
- Worker 重启、超时、重复消费和多实例竞争都有测试。
- 每个 GenerationJob 最多一组有效输出和一套幂等账务事件。
- UsageRecord、BillingTransaction、CreditLedger/TeamCreditLedger 可以按任务核对。
- 用户端布局、路由和主流程保持不变。
- 管理后台没有新增无后端合同的页面。
- 服务端、用户端、管理端构建通过，Prisma 校验和迁移通过，核心 E2E 通过。

## 6. 最终回答

当前还需要重点拆分的只有四块：

1. Chat Runner。
2. Video Runner。
3. Provider Routing/Health。
4. Worker Lease/Recovery。

输出、用量、图片 Runner、Chat/Video Runner 的物理执行边界、Worker Lease/Recovery、ProviderHealthService、ProviderRoutingService 第一阶段、异步导出、Prompt Library 队列刷新和统一健康汇总均已落地。下一步不再拆核心执行代码，转入真实依赖的压测、恢复、支付 webhook 和灾备演练。画布和后台继续保持收口级维护，不推倒重来。

因此，下一版本可以“全部做完”上述四个核心目标；但 AssetVersion、PromptRevision、Provider 五域全拆、复杂团队权益和新产品功能应明确排除在本版本之外。这样完成后，项目就从“能运行的多模态应用”进入“可以稳定承载更多模型和任务的 AI 工作平台”。

## 7. 本轮实施结果（2026-08-27）

- 异步导出已落地：`POST/GET /v1/exports`、状态查询和下载接口使用 BullMQ，导出文件写入 `storage/exports`，默认 24 小时过期。
- 用户端数据设置已切换到异步导出任务并轮询状态；旧的同步 `GET /v1/conversations/export` 已删除，避免大查询占用 HTTP 请求。
- 导出 Worker 对会话按时间和 ID 游标分批读取消息，过期任务由同一队列的 repeatable cleanup scheduler 清理并删除本地文件。
- Prompt Library 自动刷新已从进程 `setInterval` 改为 BullMQ repeatable scheduler，单 Worker 串行刷新；公开和后台列表保留页码，同时提供 `nextCursor`。
- 后台新增 `GET /v1/admin/health/summary`，统一返回数据库、Redis、存储、Provider、Generation、ExportJob、告警、账务对账和运行时摘要。
- 已补充异步导出 E2E 合同，保留原有 UI 布局、路由和操作入口。

当前发布前仍需在目标环境执行 `prisma migrate deploy`，并完成真实 Redis/BullMQ、Provider、支付 webhook、压力和备份恢复演练；这些不能由本地静态构建替代。
