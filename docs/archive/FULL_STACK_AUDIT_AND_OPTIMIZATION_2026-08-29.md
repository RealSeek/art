# Xinyue AI 全栈代码审计与优化报告

更新时间：2026-08-29
审计性质：全量静态审计、实际运行验证、保守重构、计费架构对照与收尾验证
结论：当前版本可进入内部试运行/灰度；不建议继续扩展业务功能，应转入压测、监控和生产配置阶段。

## 1. 审计结论

本轮基于真实代码检查并实际运行了用户端、管理端、NestJS API、Prisma schema 与 111 条迁移、Provider 调用、BullMQ 任务、Token 计费、创作点、文件/媒体下载、外部工具和本地文档。排除依赖、构建产物、测试报告和运行缓存后，项目共 917 个文件，其中 667 个 TypeScript/Vue/Prisma/SQL 源文件。

当前核心闭环已经成立：

```text
用户操作
  -> Vue 工作区 / 管理后台
  -> /v1 API
  -> Controller + Guard
  -> Service / Generation Runner / BullMQ
  -> Provider 路由与故障切换
  -> UsageNormalizer
  -> PricingResolver 价格快照
  -> UserTokenQuota 预扣/结算或 Credits 扣费
  -> TokenUsageLedger / TokenQuotaEvent / ProviderAttempt
  -> SSE、任务中心和后台账务展示
```

没有发现阻断编译、启动或数据库迁移的 P0 问题。本轮已经修复外部请求边界、媒体响应上限、价格目录下载、ProviderAttempt 账务关联等上线前风险。没有执行大规模重写，也没有改变现有 UI 布局。

## 2. 项目现状

### 2.1 技术栈

| 层级 | 技术 |
| --- | --- |
| 用户端 | Vue 3、TypeScript、Vite、Pinia、Vue Router、Naive UI、Vue Flow |
| 管理端 | Vue 3、Element Plus、Art Design Pro、Pinia、Vue Router |
| 服务端 | NestJS 11、Fastify、Prisma 6、BullMQ、LangGraph.js |
| 数据与队列 | PostgreSQL 17、Redis 7、BullMQ |
| 文件存储 | 本地存储或 S3-compatible object storage |
| AI 接入 | OpenAI-compatible、Anthropic、Gemini、独立图片 Worker、用户 BYOK |

### 2.2 核心模块

- 认证、会话、用户、角色、后台资源权限。
- 对话、分支消息、SSE、上下文预算、联网搜索、工具循环。
- Provider、凭据、模型预设、路由、健康、冷却和 failover。
- GenerationJob、GenerationEvent、ProviderAttempt、异步导出和任务中心。
- Token quota、使用量、价格快照、额度事件、账单和创作点。
- 图片、视频、文件、知识库、项目、无限画布和 Office 工作中心。
- 套餐、支付、兑换码、用户分组、运营告警和系统配置。

## 3. 前后端交互与数据流

### 3.1 文字聊天

1. 工作区提交消息，`studio` store 创建/复用会话并调用生成 API。
2. API 校验登录、模型能力、项目/助手访问权和速率限制。
3. 生成服务创建 `GenerationJob`，按估算 Token 预留月度及每日 `UserTokenQuota`。
4. Chat runner 构造活动分支上下文，按预算裁剪，并按路由顺序调用 Provider。
5. Provider 返回内容、thinking、工具事件和 usage；事件持久化后通过 SSE 输出。
6. `UsageNormalizer` 统一供应商字段；成功 ProviderAttempt 的 ID 写入 Token ledger。
7. `PricingResolver` 使用成功渠道的价格生成不可变快照；月度/每日额度在同一个 Serializable 事务内结算。
8. 预估高于实际时释放，实际高于预估时补扣；失败/取消释放预留额度。
9. 用户端显示的是“计费额度”和真实 Token 统计，不把额度错误描述成固定 Token 数量。

聊天默认走工作区聊天预设；首页模型入口的切换不会改写现有对话使用的模型。

### 3.2 图片、视频和文件

- 图片/视频仍使用创作点，和文字会员 Token quota 分离。
- 生成任务通过统一 GenerationJob、ProviderAttempt 和状态机追踪。
- 远端媒体结果下载前校验 URL 边界，跨域地址必须是公网地址，禁止重定向。
- 图片响应最大 50 MB，视频响应最大 500 MB，流式读取过程中也会强制截断。
- 文件写入本地或 S3-compatible 存储，资产记录再返回前端。

### 3.3 后台运营

- 模型中心维护上游成本、用户输入/输出价格、价格来源和模型能力。
- 定价预览会拉取价格目录，换算汇率和每额度价值，再展示当前售价、建议售价及倍率。
- 管理员选择模型后才应用价格；目录未命中时保留人工定价，不会写入零价格。
- Provider、模型、套餐、用户分组、Web Search、能力预设均通过既有权限资源访问。

## 4. 计费专项审计

### 4.1 当前真实计费规则

```text
文字聊天
  inputTokens * inputUnitsPerMillion
  + outputTokens * outputUnitsPerMillion
  -> 计费额度（UserTokenQuota）

套餐允许超额且 quota 不足
  -> 按 overageRatePercent 换算创作点

图片 / 视频 / 视觉工具
  -> 创作点（Credits）
```

因此“文字聊天扣额度”是产品内部计价单位，不是把文字任务改成图片创作点。前端应持续显示“计费额度”，同时单独展示本周期真实 input/output Token。

### 4.2 New API 与 Sub2API 代码对照

本轮直接阅读了 New API 的 `ratio_setting`、`price.go`、billing session、funding source 和 text quota 实现，也阅读了 Sub2API 的 pricing、gateway usage billing、usage billing 及其模型价格目录。只吸收架构思想，没有复制代码。

| 能力 | New API | Sub2API | Xinyue 当前状态 |
| --- | --- | --- | --- |
| 模型输入/输出差异 | 模型倍率 + completion ratio | 模型绝对价格 | 已支持独立输入/输出售价 |
| 用户分组倍率 | 支持 | 支持套餐/分组策略 | 已支持 `creditRatePercent` |
| 上游成本 | 主要由倍率映射 | 独立成本核算 | 已保留绝对上游成本 |
| 预扣与实扣 | 支持 | 支持 | 已支持预留、补扣、释放 |
| 资金来源 | quota/余额 | 余额、订阅等多来源 | 订阅 quota + 可选创作点超额 |
| 审计快照 | 日志中保留倍率 | usage billing 记录 | 版本化 pricing snapshot + ledger |
| Provider 关联 | 渠道日志 | 账号/请求关联 | ledger 已关联成功 ProviderAttempt |
| 官方价格预设 | 维护内置倍率表 | 维护模型价格目录 | 支持远程目录预览、选择性应用和人工覆盖 |
| 汇率与额度价值 | quota 汇率 | 金额制 | 汇率和每额度货币价值均可配置 |

### 4.3 为什么不改成 New API 的纯倍率表

New API 的倍率模型适合统一 API 网关，但 Xinyue 同时承担会员、Provider 成本、图片/视频创作点、利润和多渠道 failover。仅保存倍率会丢失以下信息：

- 上游官方价格和平台真实成本。
- 不同币种汇率及历史换算依据。
- 用户实际售价和毛利。
- failover 后成功渠道的真实结算价格。

因此保留以下组合更适合当前业务：

```text
上游绝对成本
+ 明确的用户输入/输出售价
+ 用户组倍率
+ 汇率和每额度价值
+ resolverVersion 价格快照
```

completion ratio 仍写入快照用于解释价格，但不是唯一价格来源。

### 4.4 暂缓的高级定价

以下能力在 New API 中更完善，但本版不应直接加入结算公式：

- cached input 的独立倍率。
- reasoning token 的独立倍率。
- 长上下文阶梯价格。
- service tier / priority 等分层价格。

原因是 OpenAI-compatible 中转、Anthropic 和 Gemini 对这些字段的语义及包含关系并不统一。当前系统记录 cached/reasoning usage，但它们已经包含在标准 input/output 总数中，继续单独扣费会产生重复收费。等 usage normalizer 有跨 Provider 契约测试后再启用独立价格。

## 5. 发现问题与处理结果

### P0

未发现。

### P1-01 外部 Endpoint SSRF 边界不一致（已修复）

涉及文件：

- `server/src/alerts/alerts.service.ts`
- `server/src/notifications/notifications.service.ts`
- `server/src/payments/payments.service.ts`
- `server/src/agent-tasks/web-search.service.ts`
- `server/src/providers/providers.service.ts`
- `server/src/providers/model-discovery.service.ts`

问题：部分 Webhook、支付、网页抓取、用户 BYOK 和目录下载使用数据库 URL，但没有统一执行 DNS 解析和私网地址拒绝。

处理：复用 `PublicEndpointPolicyService`，限制为无凭据的公网 HTTP/HTTPS，拒绝 localhost、私网/保留地址和重定向。用户 BYOK 在创建、更新、模型发现和运行时都会复核。

影响：减少访问云 metadata、本机端口和内网服务的风险。管理员配置的 Provider 仍允许私网地址，以支持 Docker/LAN 图片 Worker；这是受后台权限保护的明确例外。

残余风险：校验和实际连接之间仍存在 DNS rebinding 时间窗。生产层应再配置 egress firewall，禁止 API 容器访问 metadata 和管理网段。

### P1-02 无上限媒体响应可能耗尽内存（已修复）

涉及文件：

- `server/src/common/response-bytes.ts`
- `server/src/generations/runners/image-generation.runner.ts`
- `server/src/generations/runners/video-generation.runner.ts`

问题：远端媒体结果可在完整读取后才暴露大小，恶意或故障 Provider 可能返回超大响应。

处理：增加有界流式读取器；图片 50 MB、视频 500 MB；同时检查 `Content-Length` 和实际流量，超限立即取消 reader。

影响：控制单任务内存占用，避免超大响应拖垮 Worker。

### P1-03 价格目录刷新可能污染有效缓存（已修复）

涉及文件：`server/src/providers/model-discovery.service.ts`

问题：目录 URL 缺少完整边界限制，异常刷新不应清空最后一次有效目录。

处理：拒绝带用户名/密码的 URL和重定向，限制 20 MB；刷新失败保留旧内存目录并尝试镜像源。

影响：后台“一键获取价格”失败时不会破坏现有定价，也不会自动应用不完整数据。

### P1-04 Ledger 缺少成功上游尝试关联（已修复）

涉及文件：`server/src/generations/runners/chat-generation.runner.ts`

问题：账单能关联 generation，但 failover 后无法直接定位最终成功的渠道尝试。

处理：普通聊天和图片提示词反推结算时均写入成功 `ProviderAttempt.id`。

影响：后台可从用户账单追踪任务、成功渠道、usage、成本和价格快照。

### P1-05 多 quota 非原子结算（此前已修复，本轮复核）

涉及文件：`server/src/billing/token-quota.service.ts`

处理：月度和每日 quota 使用 `settleMany()`，统一放入 Serializable 事务；version 冲突和 PostgreSQL 序列化冲突最多重试三次；事件使用幂等键。

影响：避免月额度已扣但日额度失败的部分结算。

### P1-06 BullMQ Agent 取消未贯穿外部工具请求（已修复）

涉及文件：`server/src/agent-tasks/agent-task-cancellation.service.ts`、`agent-tasks.processor.ts`、`agent-tasks.service.ts`、`agent-tools.service.ts`、`web-search.service.ts`

问题：聊天工具循环已有共享 `AbortSignal`，但办公 Agent 任务取消时，队列 processor 原先没有把取消信号传给正在进行的外部工具和网页抓取请求。

处理：新增任务级取消协调服务。Worker 执行期间每 500ms 检查任务状态，取消接口同时中止活动 controller；外部工具、搜索 API 和网页内容抓取复用该 signal。主动取消不会被记录为搜索渠道故障，也不会触发错误冷却。

影响：办公 Agent 的第三方请求可以在用户取消后尽快结束，已有任务/GenerationJob 状态机和幂等逻辑保持不变。

### P2-02 高耦合文件（未大拆）

| 文件 | 当前行数 | 建议边界 |
| --- | ---: | --- |
| `server/src/providers/providers.service.ts` | 1470 | catalog、routing、health、credential、admin facade |
| `server/src/generations/runners/chat-generation.runner.ts` | 948 | provider client、tool executor、search context、settlement |
| `src/views/CanvasEditorPage.vue` | 1739 | composable + 功能面板，不改布局 |
| `src/components/WorkspaceShell.vue` | 1185 | sidebar、dialog orchestration、workspace actions |
| `admin/src/views/xinyue/settings/index.vue` | 1185 | 分区表单 schema 和独立 section |
| `admin/src/views/xinyue/operations/index.vue` | 1127 | registry 驱动的筛选、表格和 drawer |

这些是维护性风险，不是当前功能故障。应按测试覆盖逐段抽取，不进行一次性重写。

本轮已完成低风险拆分：Provider 定价目录/批量应用已移至 `server/src/providers/provider-pricing.service.ts`；工作区对话菜单动作已移至 `src/composables/shell/useConversationActions.ts`。原有门面、模板、DOM、CSS 类名和 API 契约均保留。拆分后的文件仍可能超过 1000 行，行数本身不是强制拆分依据。

## 6. 修改记录

### 6.1 Provider 与定价

文件：`server/src/providers/providers.service.ts`、`model-discovery.service.ts`、`pricing-resolver.service.ts`、`admin-providers.controller.ts`、Prisma 定价迁移及管理端模型/设置页面。

修改内容：增加价格目录预览与选择性应用、可配置美元汇率、当前/建议价格对比、基础价/分组倍率/毛利来源快照、BYOK 公网校验和 ProviderAttempt 关联。

修改原因：兼容 New API 的倍率运营能力，同时保留 Xinyue 的绝对成本和审计能力。

影响：管理员可开箱获取参考价、调整加价比例并人工确认；历史账单仍可按 `resolverVersion=v2` 解释。

### 6.2 Token quota 与套餐

文件：`server/src/billing/token-quota.service.ts`、`chat-generation.runner.ts`、`tests/unit/token-billing.test.ts`、管理端套餐页和用户端套餐展示。

修改内容：复核原子多 scope 结算、分组倍率、预估/实际补扣释放、超额创作点来源和真实 Token 展示。

修改原因：避免字符长度当 Token、部分结算、失败重复扣费以及套餐“固定 Token”承诺。

影响：文字任务按模型价格扣计费额度；不同模型成本和售价不同；图片/视频创作点体系不受影响。

### 6.3 外部请求与媒体

文件：告警、通知、支付、Web Search、Provider、图片/视频 runner、`response-bytes.ts`。

修改内容：统一公网 URL 校验、拒绝重定向、限制价格目录和媒体响应大小。

修改原因：收敛 SSRF、开放重定向和内存耗尽风险。

影响：用户提供的外部地址必须公网可解析；后台私有 Worker 保持可用。

### 6.4 开箱预设与后台配置

文件：能力预设、Web Search 预设、对应 migrations、管理端 operations/settings/web-search 页面。

修改内容：加入可识别的能力与搜索服务预设、部署/配置说明、跳转地址和注释；沿用后台现有视觉规范。

修改原因：减少新部署后的空白配置和功能查找成本。

影响：部署者仍需填写自己的密钥或启动第三方服务；预设不会写入真实凭据。

### 6.5 工作区与会话

文件：工作区 Shell、ChatHome、ChatComposer、Sidebar、ProjectsPanel、StudioPage、store 和样式。

修改内容：修复工作中心重叠、首页与聊天模型切换边界、会话归档展示和“今天/昨天/三天前”分组。

修改原因：消除已确认的交互错误，同时保持现有页面布局。

影响：归档会话在归档入口展示；侧栏仅保留三个时间分组；首页选择不会改变现有对话模型。

### 6.6 工程结构拆分

文件：`server/src/providers/provider-pricing.service.ts`、`server/src/providers/providers.service.ts`、`src/composables/shell/useConversationActions.ts`、`src/components/WorkspaceShell.vue`。

修改内容：将 Provider 定价目录发现、价格比较、批量应用和价格字段快照抽取到独立服务；将工作区对话菜单动作抽取到 composable。原有 `ProvidersService` 和 `WorkspaceShell` 继续保留兼容门面与模板绑定。

修改原因：降低高耦合文件的职责密度，为后续按测试覆盖渐进拆分建立边界。

影响：Provider 管理 API、用户端对话菜单、DOM 结构、CSS 类名和路由均未改变；服务端和用户端构建通过。

### 6.6 工程结构拆分

文件：`server/src/providers/provider-pricing.service.ts`、`server/src/providers/providers.service.ts`、`src/composables/shell/useConversationActions.ts`、`src/components/WorkspaceShell.vue`。

修改内容：将 Provider 定价目录发现、价格比较、批量应用和价格字段快照抽取到独立服务；将工作区对话菜单动作抽取到 composable。原有 `ProvidersService` 和 `WorkspaceShell` 继续保留兼容门面与模板绑定。

修改原因：降低高耦合文件的职责密度，为后续按测试覆盖渐进拆分建立边界。

影响：Provider 管理 API、用户端对话菜单、DOM 结构、CSS 类名和路由均未改变；服务端和用户端构建通过。

## 7. 删除记录

本轮没有删除业务文件或数据库字段。

原因：扫描到的长文件虽然需要拆分，但都有路由、组件、API、数据库或用户流程引用；没有候选同时满足“无引用、无接口调用、无数据库关联、无用户流程影响”的删除条件。构建产物和运行缓存由 `.gitignore`/清理脚本管理，不作为源码删除提交。

删除内容：`docs/FINAL_CODE_AUDIT_2026-08-28.md`。

原因：该阶段性报告已由本文完整取代；README、部署文档和 Worker 协议已全部切换到本文，仓库内不存在剩余引用。

确认无影响：只删除过期文档，不影响运行、部署、数据库或用户流程。

结论：没有为了降低文件数而删除核心能力，也没有恢复老 API 或老 UI 兼容层。

## 8. 数据库与迁移

- Prisma schema 当前 2707 行、迁移 111 条。
- 本轮数据库字段变化均配套 migration，包括定价汇率、聊天 Token 初始价格和预设数据。
- `UserTokenQuota.version` 用于乐观并发控制。
- `TokenUsageLedger` 和 `TokenQuotaEvent` 分离：前者解释请求消费，后者解释余额变化。
- `GenerationJob.status` 与 `settlementStatus` 分离，任务生命周期和账务生命周期不会混用。
- BigInt 由 API 全局序列化为字符串，避免 JSON 运行错误。
- Prisma migration status 已确认本地数据库为最新状态。

## 9. 安全与权限

- 默认管理员实测可登录：`xinyue@xinyue.mom` / `xinyue.mom`，返回 `SUPER_ADMIN` 会话 cookie；部署后可在后台修改，初始化脚本不会在重启时覆盖已修改密码。
- 所有后台 controller 持续使用认证和后台权限 Guard。
- 用户 BYOK 密钥加密存储，响应仅返回 hint。
- 外部工具完整 input/output 只进入 `ToolCallAudit`，用户 SSE 返回脱敏状态。
- 自定义外部 URL 的应用层校验不能替代生产 egress firewall。
- 生产必须替换 session secret、credential encryption key 和默认管理员密码，并启用 HTTPS/Secure Cookie。

## 10. 验证结果

| 检查 | 结果 |
| --- | --- |
| UI action audit | 通过，扫描 88 个 Vue 页面/组件，无死按钮或死链接 |
| 用户端 production build | 通过 |
| 管理端 production build | 通过 |
| NestJS production build | 通过 |
| Unit tests | 69/69 通过 |
| Prisma validate | 通过 |
| Prisma migrate status | 111 条迁移，本地数据库已最新 |
| API health | `http://localhost:3100/v1/health` 返回成功 |
| 默认管理员登录 | HTTP 201，SUPER_ADMIN 会话创建成功 |
| 移动端定价/套餐弹窗 | 430x900 下无重叠，控制台无错误 |
| `git diff --check` | 无 whitespace error，仅 Git 的 LF/CRLF 提示 |

没有在本轮执行生产规模压测、故障注入和全量真实 Provider 付费调用；这些不能由本地 build/unit test 替代。

## 11. 灰度前建议

### 必须完成

1. 使用生产 PostgreSQL/Redis 做并发 quota 结算与进程中断测试。
2. 配置 API 容器 egress firewall，阻断 metadata、本机和管理网段。
3. 轮换默认管理员密码、session secret、credential encryption key 和支付/Webhook 密钥。
4. 对主要 Provider 做小额度真实调用，核对 usage、成功 ProviderAttempt、用户扣费和上游成本。
5. 建立 quota/ledger 自动对账和 `RECONCILING` 告警。

### 后续渐进优化

1. 在不改变 API/UI 的前提下逐步拆 Provider service、Chat runner、WorkspaceShell 和后台聚合页。
2. 增加缓存 Token、推理 Token 和长上下文计价前，先完成 OpenAI-compatible、Anthropic、Gemini 的 usage 契约测试。
3. 为远程价格目录增加持久化 hash、更新时间和审批记录，支持多实例一致性。
4. 持续补充请求延迟、429/5xx、Provider 成功率、毛利和结算失败指标。

## 12. 最终判断

当前版本的业务建设阶段可以收口。聊天、Provider、模型路由、任务、会员 Token quota、创作点、账务、图片/视频、工作区、画布和后台均有可运行闭环；关键安全和账务问题已有明确处理或残余风险说明。

下一阶段不应继续堆页面和功能。合理顺序是：生产配置与密钥轮换 -> 并发/故障测试 -> 真实 Provider 小流量核账 -> 内部试运行 -> 灰度。New API/Sub2API 后续仍可作为定价和运营参考，但 Xinyue 应继续保留“绝对成本 + 用户售价 + 分组倍率 + 价格快照”的混合模型。
