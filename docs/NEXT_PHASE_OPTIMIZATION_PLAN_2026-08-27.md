# Xinyue AI 下一阶段统一优化方案

更新时间：2026-08-27  
文档性质：实施总方案与进度记录  
适用范围：用户端、无限画布、聊天与多模态生成、管理端、NestJS 服务端、计费会员、队列、存储、测试和部署

## 1. 一句话结论

下一阶段不需要重做页面，也不需要换前端框架。应在保留现有 UI 布局、路由和核心工作流的前提下，把项目从“页面能够完成业务”提升为“任务可持续、状态可追踪、费用可核对、模块可独立演进”的多模态 AI 工作空间。

本轮实施遵循该原则：只增加服务端合同、审计和内部模块边界，不改变现有用户端或管理端布局。

实施顺序固定为：

1. 统一任务、流式事件、用量和分页合同。
2. 拆分 Provider、Generation、画布和后台领域边界。
3. 把长任务、导出和定时同步移到可恢复队列。
4. 完善 Token/创作点/会员/团队账本与对账。
5. 补齐结构化日志、指标、告警和恢复演练。
6. 在不改变布局的前提下做最后一轮体验和性能收敛。

### 2026-08-27 首批实施状态

本方案已经开始实施，不再只是规划文档。首批完成：

- 全局 HTTP `requestId`/`traceId` 接收、生成和响应头回传。
- `GenerationJob` 增加 `requestId`、`traceId` 及查询索引。
- 新增 `GenerationEvent`，持久化排队、运行、成功、失败和取消等关键事件。
- 新增 `ProviderAttempt`，记录每次渠道尝试、模型、耗时、错误、Token 和上游成本。
- 新增 `GenerationLifecycleService`，统一开始、成功、失败和取消写入。
- 新增任务事件历史接口和失败/取消任务重试接口。
- 用户端工作区头部新增任务中心，可查看最近任务、运行数量、停止和重试，不改变现有布局与路由。
- 新增状态迁移单元测试。
- 任务详情现在返回有限期关键事件和 Provider 尝试摘要，便于用户和后台按 `generationId` 定位链路。
- Generation Runner 第一刀已落地：新增 Runner 合同与注册表，Processor 的能力分支改为统一调度；Chat/Image/Video/Commerce 后续可独立物理迁移，当前行为保持不变。
- Runner 注册表新增单元测试，未知能力会明确失败，不会静默回退到错误 Runner。
- 新增 `BillingTransaction` 审计模型和幂等服务，记录预扣、结算、退款及 Token/上游成本快照；余额来源仍为现有个人/团队创作点账本。
- 生成创建、入队失败、取消、最终失败、成功结算和 Token 预授权差额退款均已写入账务审计；任务详情返回账务交易时间线。
- 新增全局/用户级 `FeatureFlag` 模型、解析服务和管理员 API。图片提示词反推使用 `generation.image_prompt_extraction`，无 Flag 配置时回退到原有 `SystemSetting`。
- 图片和商品视觉任务已切换到独立 `ImageGenerationRunner` 调度，Processor 中旧图片执行、Provider、结果标准化和下载校验逻辑已删除，不保留双实现。
- 新增 `GenerationOutputService`，图片和视频统一通过服务保存资产、创建 `JobOutput` 并在关联失败时清理孤儿资产；取消清理也复用该服务。
- 新增 `UsageRecord` 与 `UsageRecordsService`，按 `generationId` 幂等记录 Token、图片数量、视频时长和上游成本，与 `BillingTransaction` 审计分离。
- Worker 启动时会扫描排队任务并补入 BullMQ；超过 30 分钟未更新的 RUNNING 任务会回置 QUEUED 后恢复，写入 `requeued` 事件。

本地开发数据库已应用全部迁移，包括异步导出、账务、用量、Worker 租约和追踪迁移。本轮已完成 Chat/Video Runner 物理迁移、基础账务/用量归档、后台任务详情、Provider 路由/健康第一阶段拆分、Worker 租约恢复、异步导出、Prompt Library 队列刷新和统一健康汇总。生产环境仍需在发布窗口执行迁移并完成真实依赖演练。

## 2. 必须保持的不变量

- 用户端现有聊天、创作、项目、文件、知识库、作品和无限画布入口保持不变。
- 管理端现有 URL、权限资源 key 和主要菜单入口保持不变；允许调整分组、页面内部组件和抽屉。
- 无限画布继续保持当前全屏画布、工具栏、侧栏、底部控制和 Agent 面板布局。
- 不恢复旧版本 localStorage、多版本双读、旧提示词传输、旧 CSS 类或 deprecated API。
- OpenAI-compatible、Anthropic、Gemini、BYOK、平台渠道、故障切换和当前支付能力继续保留。
- 新增能力必须先有服务端合同和测试，再接入页面。
- 不把“文件变短”当作完成标准；行为、数据一致性、可恢复性和可观测性才是完成标准。

## 3. 参考项目如何转化为本项目能力

| 参考项目 | 借鉴重点 | 在本项目中的落点 | 不直接照搬的部分 |
| --- | --- | --- | --- |
| [infinite-canvas](https://github.com/basketikun/infinite-canvas) | 节点化无限画布、连线、撤销重做、插件节点、自定义接口 | `CanvasEditorPage.vue`、canvas composables、插件市场、导入导出 | 浏览器本地保存和前端直连不能替代本项目的权限、计费和服务端持久化 |
| [LobeHub](https://github.com/lobehub/lobehub) | Agent 作为工作单元、项目/工作区、Agent Group、记忆、计划与调度 | 工作区、项目、Agent Run、知识库、定时任务和可编辑记忆 | 不新增独立产品入口；先复用现有工作区和会话路由 |
| [OpenTu](https://github.com/ljquan/opentu) | 文本/图片/视频/音频统一任务、素材库、缓存、工具和 PPT/内容工作流 | Generation 任务中心、资产库、工具插件、导出任务 | 不引入新的渲染框架；先统一现有任务和资产模型 |
| [VOZEB-PRO](https://github.com/csyqlz/VOZEB-PRO) | 持久生成 Worker、失败续取、短剧流水线、作品治理、完整商业后台、备份 | BullMQ/Worker、生成运维、作品审核、套餐/优惠/订单/对账、备份恢复 | 不一次性实现短剧全链路；先把可恢复任务基础设施建好 |
| [grok-app](https://github.com/RongleCat/grok-app/) | 思考/工具/回复结构化时间线、队列追问、会话分叉、权限确认、媒体预览、多账户配额 | Chat timeline、busy 状态下追问队列、fork、工具确认、模型配额和预览 | 桌面 Tauri 能力不属于当前 Web 产品范围 |
| [Sub2API](https://github.com/Wei-Shaw/sub2api/) | 渠道池、优先级/权重/冷却、自动故障切换、Token 计费、订阅额度、运营台 | ProviderRouting、Usage/Billing、会员订阅、渠道健康和后台对账 | 不代理违反上游条款的账户；只实现合规的已配置 Provider |

## 4. 当前基线与主要缺口

本项目已经完成一轮兼容清理、页面分组、Token 用量补全、画布和后台初步拆分、管理员登录修复以及基础回归。下一阶段重点不是再做一次全局 UI 重写，而是处理以下结构性问题：

| 区域 | 当前问题 | 目标 |
| --- | --- | --- |
| 聊天 | 思考、检索、工具、正文和失败状态虽已统一解析，但前端仍缺少完整事件时间线和可恢复追问队列 | 统一事件流、阶段状态、取消/重试/fork 和草稿恢复 |
| 生成 | 聊天、图片、视频、商品图仍在同一 Processor 中编排较多业务 | Runner、生命周期、输出、结算分别独立 |
| Provider | 平台渠道、BYOK、路由、凭据、健康和统计职责过重 | 五个明确服务边界，共享同一选择合同 |
| 画布 | 页面仍集中节点命令、Agent、短剧、媒体和导入导出 | 页面只组合视图和命令层，保持当前布局 |
| 管理端 | operations/settings/providers 仍是大页面，类型和 locale 仍是聚合文件 | 按业务域拆 API、类型、locale、表单和抽屉 |
| 数据容量 | 导出、日志、会话和提示词同步仍存在大批量读取 | 游标分页、异步导出、增量同步和清理策略 |
| 计费 | Token 账本已补全，但会员权益、订阅额度、团队预算和运营对账还需统一 | 价格快照、预扣/结算/退款、订阅额度和对账状态一致 |
| 运维 | 请求、队列、上游、计费链路缺少统一关联 ID 和指标 | 任意任务 ID 可追到请求、Provider、账本和输出 |

当前优先继续治理的大文件：

- `src/views/CanvasEditorPage.vue`
- `src/components/WorkspaceShell.vue`
- `src/views/StudioPage.vue`
- `server/src/providers/providers.service.ts`
- `server/src/generations/generations.processor.ts`
- `server/src/prompt-templates/prompt-library.service.ts`
- `admin/src/views/xinyue/operations/index.vue`
- `admin/src/views/xinyue/settings/index.vue`
- `admin/src/views/xinyue/providers/index.vue`

### 本轮验证结果（2026-08-27）

- Prisma schema 校验通过。
- 本地迁移 `20260827150000_billing_transactions_feature_flags`、`20260827160000_usage_records` 已成功应用到开发库 `flux_studio`。
- 服务端 Nest 构建通过。
- 用户端构建通过。
- 管理端构建通过。
- 单元测试 `45/45` 通过。
- 核心 E2E `38/38` 通过。

## 5. 目标架构

### 5.1 用户端领域

```text
WorkspaceShell
├── ChatWorkspace
│   ├── ChatTimeline
│   ├── ChatComposer
│   ├── ToolApproval
│   └── FollowUpQueue
├── CreationWorkspace
│   ├── ImageCreation
│   ├── VideoCreation
│   └── AssetPreview
├── CanvasWorkspace
│   ├── CanvasViewport
│   ├── CanvasNodeCommands
│   ├── CanvasAgentRun
│   └── CanvasInspector
└── Shared
    ├── ProjectContext
    ├── UsageSummary
    ├── TaskCenter
    └── Account/Team/Subscription
```

页面组件只负责布局和组合；提交、任务订阅、节点命令、草稿恢复和费用预览放入 composable 或领域服务。

### 5.2 服务端领域

```text
HTTP Controller
└── Application Service
    ├── Chat / Agent Application
    ├── Generation Lifecycle
    ├── Provider Routing
    ├── Asset and Export
    ├── Subscription and Entitlement
    └── Billing Settlement
        └── Prisma Repository / Queue / Object Storage
```

Controller 只做 DTO 校验、认证上下文和 HTTP 映射，不直接编排多表事务或选择上游渠道。

### 5.3 管理端领域

菜单入口保持原样，内部按以下域拆分：

- 客户与权益：用户、团队、会员、额度、邀请。
- 模型与生成：Provider、模型、路由、生成任务、任务运维。
- 内容与插件：作品、提示词、插件、素材。
- 商业化：套餐、订单、支付、优惠券、退款、账本。
- 运营与安全：公告、客服、审核、告警、审计、系统健康。
- 系统配置：站点、认证、邮件、存储、生成和图片反推配置。

每个域拥有自己的 `api/`、`types.ts`、`locales/`、`components/` 和页面 section。

## 6. 统一合同（第一优先级）

### 6.1 Generation 状态机

允许状态：

```text
QUEUED -> RUNNING -> SUCCEEDED
             ├──> FAILED -> RETRYING -> RUNNING
             ├──> CANCELLING -> CANCELLED
             └──> EXPIRED
```

要求：

- 每个任务拥有不可变 `generationId`、幂等键、`requestId`、`traceId` 和 `providerAttempt`。
- 终态只能是 `SUCCEEDED`、`FAILED`、`CANCELLED` 或 `EXPIRED`。
- 重试不得重复扣费、退款或创建重复资产。
- 页面关闭、刷新或 Worker 重启后，可以通过 `generationId` 恢复状态。

### 6.2 流式事件合同

统一事件字段：

```ts
type StreamEvent = {
  id: string
  generationId: string
  sequence: number
  type: 'thought' | 'retrieval' | 'tool_call' | 'tool_result' | 'content' | 'usage' | 'error' | 'done'
  createdAt: string
  payload: unknown
}
```

前端按 `sequence` 去重和排序，不能再依赖不同 Provider 的分片顺序或字段名称。业务 4xx 进入消息状态，不进入全局运行时异常上报。

### 6.3 列表与导出合同

高增长列表统一使用：

```ts
type PageQuery = {
  cursor?: string
  pageSize?: number
  q?: string
  sort?: string
}

type PageResult<T> = {
  items: T[]
  nextCursor: string | null
  total?: number
}
```

用户导出统一改为：创建导出任务、后台分页读取、压缩并写入对象存储、通知用户、生成限时下载地址。HTTP 请求不再同步读取全部对话和资产。

## 7. 分阶段实施任务

### P0：合同、稳定性和可观测性

目标：让每个请求、任务和费用变化都能被定位。

实施内容：

- 增加 request ID/trace ID 中间件，写入响应头、结构化日志、审计和队列数据。
- 建立 `GenerationLifecycleService`，统一取消、超时、重试和终态校验。
- 建立统一流式事件序列化器，覆盖 OpenAI、Anthropic、Gemini 和图片/视频任务。
- 为队列、Provider、计费和错误上报定义指标名称与标签。
- 将进程内 Prompt Library/External Market 定时器迁移到 BullMQ scheduler 或分布式锁。
- CI 增加 unit、lint、构建、Prisma、迁移升级和核心集成测试门禁。

验收：给定一个失败 `generationId`，5 分钟内能从日志查到请求、队列、上游响应、扣费和退款；多实例不会重复执行同步任务。

### P1：Provider 与 Generation 拆分

目标：让新增模型或协议不再修改一个超长服务。

Provider 拆分：

- `ProviderCatalogService`：渠道、厂商、模型和能力目录。
- `ProviderRoutingService`：优先级、权重、BYOK、故障转移和冷却。
- `ProviderCredentialService`：凭据加密、轮换和脱敏。
- `ProviderHealthService`：探活、成功率、延迟、429/5xx 和熔断。
- `ProviderUsageService`：请求量、Token、上游成本和配额。

Generation 拆分：

- `ChatGenerationRunner`
- `ImageGenerationRunner`
- `VideoGenerationRunner`
- `CommerceGenerationRunner`
- `GenerationOutputService`
- `GenerationSettlementService`
- `GenerationTransport`

当前进度：Image/Commerce 已由 `ImageGenerationRunner` 承接并切换注册表调用，旧图片逻辑已清理；`GenerationOutputService` 和 `UsageRecord` 已接入。Chat（含流式、检索、工具）和 Video 仍在 Processor 内，下一步迁移 Chat Runner，并继续完善 Worker 租约/心跳与 Provider 路由/健康服务。迁移规则：先让旧门面调用新服务，完成调用方迁移后删除门面，不保留双实现。

验收：每种能力可单独测试；Provider 路由变更不触碰结算；同一幂等键重复消费只产生一笔账务和一组资产。

### P1：聊天体验和 Agent 工作流

目标：参考 Grok App/LobeHub，把“思考、工具、回答”变成可操作的时间线。

- 聊天消息显示 thought、retrieval、tool_call、tool_result、content 的真实顺序。
- Agent 忙碌时允许追问排队；用户可取消、插队或合并草稿。
- 支持从任意助手消息 fork 新会话，保留引用消息和项目上下文。
- 工具执行默认需要确认，支持“仅一次”“本会话允许”“项目允许”。
- 失败任务显示重试、复制请求、查看费用和查看 Provider 尝试信息。
- 关闭页面后通过任务中心恢复进行中的生成。

不改变现有聊天入口、输入框位置和消息视觉层级，只增加时间线细节和操作状态。

### P1：账务与 Feature Flag

目标：让创作点余额、Token 用量、会员权益和平台成本可以统一审计，同时支持不改代码的灰度发布。

- `BillingTransaction` 是不可变审计事件，不替代 `CreditLedger`/`TeamCreditLedger` 的余额职责。
- `PRE_AUTH` 表示创建任务时的预扣，`CAPTURE` 表示成功后的最终费用快照，`REFUND` 表示退款或预授权差额回退；所有事件使用任务级幂等键。
- 审计写入失败不得改变任务主流程；后台对账可按 `generationId` 将交易事件与现有创作点账本核对。
- Feature Flag 支持 `GLOBAL` 和 `USER` 两个作用域，缺少配置时必须返回调用方 fallback，避免历史配置回归。

验收：同一任务重复消费、重试或 Worker 重启不会产生重复账务事件；关闭 `generation.image_prompt_extraction` 后新任务立即被拒绝，已有任务不受影响。

### P1：无限画布继续拆分

目标：参考 infinite-canvas/OpenTu/VOZEB-PRO 的节点化和任务化能力，但保留现有画布布局。

建议文件边界：

- `useCanvasNodeCommands.ts`
- `useCanvasSelectionCommands.ts`
- `useCanvasMediaCommands.ts`
- `useCanvasAgentCommands.ts`
- `useShortDramaPipeline.ts`
- `useCanvasImportExport.ts`
- `CanvasInspector.vue`
- `CanvasContextMenu.vue`
- `CanvasTaskStatus.vue`

功能顺序：

1. 节点命令和选择状态迁出页面。
2. 生成节点绑定 `generationId`，支持刷新恢复和失败重试。
3. 增加节点版本、输入引用和输出资产引用，避免复制数据。
4. 导入导出改为版本化 JSON 合同并做大小限制。
5. 插件节点声明能力、输入 schema、输出 schema 和权限，不允许任意脚本直接修改全局状态。

验收：画布页面只组合 Vue Flow、面板和命令；节点拖拽、连线、撤销重做、Agent 预览和生成流程与当前行为一致。

### P1：数据容量与持久任务

- 管理端用户、团队、会话、审计、工具调用、告警和生成列表全部声明分页策略。
- Prompt Library 使用 `updatedAt + id` 游标增量同步，禁止固定 `take: 5000`。
- 用户数据导出采用队列任务、对象存储和过期清理。
- 图片、视频、音频和 Agent 任务由 Worker 持续续取；页面只订阅状态。
- 统一清理策略：过期下载地址、临时文件、失败任务日志和孤儿资产。

验收：数据量增长 10 倍时，单个 HTTP 请求的响应和内存有明确上限；服务重启不会丢失已入队任务。

### P1：计费、会员和团队权益

目标：参考 Sub2API 的 Token 级结算，同时保留本项目创作点产品语义。

统一账务流程：

```text
价格版本快照 -> 预扣最大费用 -> 上游完成 -> 按真实用量结算 -> 退回差额
                                              └──失败/取消：全额退款
```

必须支持：

- 输入、输出、缓存输入、推理 Token 分开记录。
- 平台承担、用户 BYOK、团队承担三种费用来源明确可追溯。
- 会员套餐包含创作点、Token 额度、模型能力、并发数和速率限制。
- 团队管理员可设置成员预算、项目预算和超额策略。
- 价格变更只影响新任务；历史任务使用不可变 `pricingSnapshot`。
- 账本、订单、支付 webhook、退款和 Provider 成本都具备幂等键。
- 后台提供收入、成本、毛利、退款、未对账和异常负余额视图。

验收：一次任务可以完整解释“谁承担费用、用了多少 Token、扣了多少创作点、上游成本多少、失败是否退款”。

### P1：管理端信息架构和 UI 统一

不改菜单 URL 和总体布局，按领域做内部重构：

- `operations/index.vue` 拆成审核、客服、通知、告警、审计和通用资源容器。
- `settings/index.vue` 拆成站点、认证、商业化、邮件、存储、生成和图片反推 section。
- `providers/index.vue` 分离渠道、模型路由、健康、凭据和价格。
- `api/xinyue/`、`types/`、`locales/` 与页面目录一一对应。
- 所有页面统一标题、描述、筛选条、表格、分页、空状态、抽屉和错误提示。
- 业务页面只使用设计 token；品牌色和媒体预览色保留为显式例外。
- 大表格使用虚拟滚动或服务端分页，抽屉表单使用统一保存/取消/脏检查。

验收：390px 和 1440px 下无页面级横向溢出；同层级标题、辅助文字、按钮和表格视觉一致；修改一个业务域不需要加载其他域的请求和类型。

### P2：模型、插件和内容生态

- 模型目录声明文本、视觉、图片、视频、音频、工具调用和结构化输出能力。
- 插件声明输入/输出 schema、权限、网络范围、费用和版本；安装、启用、更新、卸载可审计。
- Prompt Library 来源使用独立 adapter、缓存仓储、覆盖规则和查询服务。
- 内容发布增加草稿、审核、版本、下架、重发和举报处理状态。
- 图片提示词反推继续复用视觉模型和统一计费，不引入本地 GPU 依赖。

### P2：部署、备份和恢复

- 发布前显式执行 `prisma migrate deploy`，并检查 migration 状态。
- PostgreSQL、Redis、对象存储和本地媒体分别有备份与恢复步骤。
- 应用发布与不可逆迁移分阶段执行，先备份再迁移。
- Worker 支持优雅停机：停止领取新任务，等待在途任务到达安全点。
- 管理员密码初始化、轮换和紧急恢复继续使用独立命令，不复用普通 seed 的隐式开关。
- 预发布环境执行一条平台任务、一条 BYOK 任务、一条失败退款和一条支付 webhook 重放。

## 8. 建议新增或统一的接口

| 接口 | 用途 |
| --- | --- |
| `GET /v1/generations/:id/events` | 恢复任务时间线和流式事件 |
| `POST /v1/generations/:id/cancel` | 统一取消任务 |
| `POST /v1/generations/:id/retry` | 幂等重试失败任务 |
| `POST /v1/conversations/:id/fork` | 从指定消息创建分支会话 |
| `POST /v1/exports` | 创建异步用户或团队数据导出 |
| `GET /v1/exports/:id` | 查询导出进度和过期时间 |
| `GET /v1/admin/health/summary` | 后台统一读取队列、Provider、数据库和账务健康 |
| `GET /v1/admin/billing/reconciliation` | 查询账务异常和未对账任务 |

接口落地前必须先补 DTO、权限、幂等策略、审计事件和测试。

## 9. 测试与验收矩阵

### 单元测试

- 流式事件排序、跨分片标签解析、用量归一化。
- Provider 优先级/权重/冷却/故障切换。
- Generation 状态机、取消、超时、重试幂等。
- Token 价格快照、预扣、结算、退款和团队分摊。
- 分页 cursor、导出任务状态和过期清理。
- 画布命令、节点 schema、导入导出版本。

### 集成测试

- PostgreSQL 事务和账本唯一约束。
- Redis/BullMQ 重试、重复消费、优雅停机和恢复。
- 支付 webhook 签名、重复通知、乱序通知和退款。
- Provider 429/5xx/超时以及凭据失效后的冷却。

### E2E

- 思考/检索/工具/正文时间线和追问队列。
- 图片、视频、失败重试、刷新恢复和任务中心。
- 画布节点生成、Agent 预览、应用、撤销和导入导出。
- 管理端分页、抽屉脏检查、权限和响应式布局。
- 会员购买、额度扣减、BYOK、团队预算和退款。

发布门槛：用户端和管理端构建通过、服务端构建通过、Prisma 校验通过、Lint 无错误、单元/集成/E2E 通过、UI audit 通过、`git diff --check` 无空白错误。

## 10. 不做的事情

- 不重做现有用户端或后台的整体视觉布局。
- 不为了“参考开源项目”复制其品牌、代码或不兼容的许可证内容。
- 不引入桌面端、移动端或本地 GPU 作为当前阶段前置条件。
- 不把所有功能都改成 Agent 自动执行；涉及费用、文件、外部工具和发布必须保留确认与权限边界。
- 不用进程内内存作为跨实例任务状态或账本来源。
- 不一次性拆分全部 Prisma 模型；先按任务、账务、Provider、资产和权限边界演进。

## 11. 完成定义

下一阶段完成时，应同时满足：

1. 现有 UI 布局、路由和主要工作流保持不变。
2. 聊天、图片、视频和 Agent 任务都遵循同一状态机和事件合同。
3. 页面刷新、服务重启和 Worker 重启后，进行中的任务可恢复或明确进入失败状态。
4. 所有高增长列表有分页，导出和同步不再占用单个长 HTTP 请求。
5. 任务重试不会重复扣费、退款或创建资产。
6. 会员、创作点、Token、团队预算和 Provider 成本可对账。
7. 任意任务 ID 可以关联请求、队列、上游、输出和账本日志。
8. Provider、Generation、画布和后台核心页面均有独立测试边界。
9. 多实例部署不会重复执行定时同步或丢失队列任务。
10. 生产迁移、备份恢复和管理员密码轮换都有可执行 runbook。

## 12. 推荐执行批次

### 批次 A：合同和门禁

事件合同、状态机、分页合同、request ID、CI 集成测试和账务幂等约束。

### 批次 B：容量和可靠任务

异步导出、Prompt Library 增量同步、Generation Worker 续取、任务中心和统一清理。

### 批次 C：核心模块拆分

Provider 五域、Generation runners、Prompt adapters、Controller/Service 边界和资产输出服务。

### 批次 D：用户端体验

聊天时间线、追问队列、fork、工具确认、画布命令层和节点任务恢复。

### 批次 E：后台与商业化

后台领域拆分、会员权益、团队预算、支付 webhook、账务对账、系统健康页。

### 批次 F：生产化

指标和告警、备份恢复演练、优雅停机、生产级查询计划、包体和缓存优化。

### 本轮已完成的生产化收口

异步账户/团队导出、导出过期清理、Prompt Library 队列调度与游标分页、后台统一健康汇总均已实现。下一轮不再继续拆分同一模块，而是针对真实部署环境做 Redis/BullMQ 重试与恢复、Provider 失败切换、支付 webhook 重放、压力、备份恢复和优雅停机演练。

## 13. 参考资料和许可证边界

本方案只提取公开仓库的产品和架构思路，不复制其代码、品牌或资源。实际实现前需要分别确认各仓库当前许可证、第三方依赖许可证和上游服务条款，尤其是模型中转、OAuth、账号代理、媒体生成和支付相关能力。任何 Provider 接入都必须由管理员显式配置，并遵守对应上游的服务协议和适用法律。
