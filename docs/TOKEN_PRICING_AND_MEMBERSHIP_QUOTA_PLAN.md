# Xinyue AI Token 定价与会员额度实施方案

> 状态：V1 已实施，用户端额度展示已接入，持续验收中（2026-08-28）
>
> 目标：在不改变现有工作区布局和创作点功能的前提下，为文字对话增加可审计、可配置、兼容 Sub2API/New API 的 Token 额度与定价体系。

## 1. 结论

当前系统已有模型输入/输出价格、供应商成本、价格版本、UsageRecord 和创作点流水，图片、视频、商品视觉可以继续使用创作点。

V1 已完成：`PricingResolver`、`Tokenizer`、`UserTokenQuota`、`TokenUsageLedger`、`TokenQuotaEvent`、预扣/结算/释放、每日与周期配额、GenerationJob 结算状态、BigInt JSON 序列化、用户额度查询和后台账务查询。现有 Credits 体系保持不变。

文字对话目前存在三个必须修复的问题：

1. `server/src/generations/generations.service.ts` 用消息字符长度估算 Token，不能准确覆盖中文、英文、代码、JSON、系统提示词、附件和工具上下文。
2. `server/src/generations/runners/chat-generation.runner.ts` 用 `Math.min(预扣费用, 实际费用)` 限制最终费用，实际用量超过预估时平台不会补扣。
3. 会员只发放 `includedCredits`，没有独立的周期 Token 配额，用户无法知道文字还能使用多少。

推荐采用两层账户：

```text
文字对话       -> 会员 Token 配额 / Token 超额策略
图片、视频等   -> 创作点余额
平台成本       -> 上游 USD/CNY 微单位成本
用户收入       -> 订单与账务流水
```

不要删除创作点系统，也不要把图片/视频成本强行转换成 Token。

## 2. 与 Sub2API / New API 的兼容思路

Sub2API 和 New API 的共同做法是：

- 请求前检查并预留额度；
- 请求完成后使用供应商真实 usage 结算；
- 模型价格、渠道倍率、分组倍率统一进入一个 Pricing Resolver；
- 订阅配额和钱包余额分离；
- usage、扣费、退款都使用幂等流水；
- 每个请求保留价格快照，不因后台改价影响历史账单。

Xinyue 应保留这些核心思想，但对用户提供更直观的 Token 展示。

### 2.1 内部计费单位

内部使用 `quotaUnits` 作为统一计费单位，避免不同模型直接按原始 Token 数量扣费导致高价模型被低价模型补贴。

```text
inputQuotaUnits  = inputTokens  × inputRate
outputQuotaUnits = outputTokens × outputRate
cachedUnits      = cachedInputTokens × inputRate × cachedRate
reasoningUnits   = reasoningTokens × outputRate × reasoningRate
chargedUnits     = ceil(inputQuotaUnits + outputQuotaUnits + cachedUnits + reasoningUnits)
```

其中 `inputRate` 和 `outputRate` 以每百万 Token 的整数价格保存。会员页面可以同时展示：

- 原始输入 Token；
- 原始输出 Token；
- 本次计费 Token 单位；
- 按当前模型估算的剩余额度。

这样既满足“会员得到多少 Token”的产品体验，也保留 New API 的模型差异化计费能力。

## 3. 账户与额度设计

> 名称约定：数据库和服务内部统一使用 `quotaUnits` / `billingUnits`，不把 Token 本身当作余额。用户界面可以继续显示 Token，但必须注明这是按当前模型折算的估算值。

### 3.1 会员文字额度

会员套餐增加以下字段：

```prisma
 monthlyQuotaUnits       BigInt @default(0)
 tokenQuotaMode          TokenQuotaMode @default(BILLABLE_UNITS)
 tokenOverageMode        TokenOverageMode @default(BLOCK)
 tokenOverageRate        Int @default(0)
 tokenQuotaCarryOver     Boolean @default(false)
 tokenQuotaResetDay      Int @default(1)
 dailyQuotaUnits         BigInt @default(0)
 byokMode                ByokQuotaMode @default(QUOTA)
```

推荐第一版只支持 `BILLABLE_UNITS` 和按订阅周期重置，暂不支持输入/输出分别封顶，减少用户理解成本。

### 3.2 用户周期额度表

新增 `UserTokenQuota`：

```prisma
id                  String   @id @default(cuid())
userId              String
subscriptionId      String?
scopeKey            String   // 订阅 ID；免费用户使用 FREE
periodStart         DateTime
periodEnd           DateTime
grantedUnits        BigInt   @default(0)
reservedUnits       BigInt   @default(0)
usedUnits           BigInt   @default(0)
version             Int      @default(0)
inputTokens         BigInt   @default(0)
outputTokens        BigInt   @default(0)
cachedInputTokens   BigInt   @default(0)
reasoningTokens     BigInt   @default(0)
status              TokenQuotaStatus @default(ACTIVE)
createdAt           DateTime @default(now())
updatedAt           DateTime @updatedAt
```

约束：

```text
unique(userId, scopeKey, periodStart)
index(userId, status, periodEnd)
```

`reservedUnits` 用于并发请求的预授权，`usedUnits` 只记录最终确认的实际用量。所有扣减都必须带上 `version` 条件并递增版本号；更新失败时重试，不能只依赖应用层读取余额后再写回。

如果套餐配置了 `dailyQuotaUnits`，系统使用 `UserTokenQuota` 的 `DAILY:<subscription>:YYYY-MM-DD` scope 建立按天记录；月度记录使用 `MONTHLY:<subscription>` scope。一次请求同时预留两层额度，结算/释放同步作用于两层，避免每日限制只停留在配置层。

### 3.3 不可变 Token 流水

新增 `TokenUsageLedger`，每个任务最多产生一笔最终结算流水，退款和预授权冲正使用独立记录：

```prisma
id                  String
userId              String
generationId        String
subscriptionId      String?
model               String
provider            String?
providerRequestId   String?
providerAttemptId   String?
inputTokens         Int
outputTokens        Int
cachedInputTokens   Int
reasoningTokens     Int
reservedUnits       BigInt
chargedUnits        BigInt
inputCostMicros     Int
outputCostMicros    Int
pricingSnapshot     Json
usageSource         TokenUsageSource
settlementStatus    TokenSettlementStatus
type                TokenLedgerType
idempotencyKey      String @unique
createdAt           DateTime @default(now())
```

现有 `UsageRecord`、`BillingTransaction` 和 `GenerationJob` 不删除，继续承担兼容查询和任务审计；新的 Token 流水作为商业计费的权威明细。

## 4. 模型定价

现有 `ModelPreset` 与 `ModelPriceVersion` 已有以下字段，可以继续保留：

```text
inputCostMicrosPerMillion
outputCostMicrosPerMillion
inputCreditsPerMillion
outputCreditsPerMillion
```

补充：

```prisma
cachedInputRatePercent       Int @default(100)
reasoningOutputRatePercent   Int @default(100)
minimumChatChargeUnits       Int @default(0)
```

含义：

- `*CostMicros*`：平台向上游支付的真实成本，用于利润和对账；
- `*Credits*`：兼容旧创作点和非文本任务；
- `cachedInputRatePercent`：缓存输入相对于普通输入的用户计费倍率；
- `reasoningOutputRatePercent`：推理 Token 相对于普通输出的用户计费倍率；
- `minimumChatChargeUnits`：避免低价模型因整数取整长期免费。

### 4.1 定价优先级

统一由 `PricingResolver` 计算，不允许在 Controller、Runner 或前端各自计算：

```text
任务指定模型价格
  -> 用户分组价格覆盖
  -> 渠道/Provider 路由价格覆盖
  -> 系统默认模型价格
  -> 价格版本快照
```

渠道倍率、分组倍率和失败重试只影响本次任务的最终价格快照，不能回写历史任务价格。

## 5. 推荐套餐初始值

以下数值是保守的第一版建议，后台可修改，不应写死在前端：

| 套餐 | 价格 | 周期 Token 配额 | 创作点 | 并发 | 超额 |
|---|---:|---:|---:|---:|---|
| 免费版 | ¥0/月 | 1,000,000 units | 0 | 1 | 拒绝 |
| Plus | ¥68/月 | 10,000,000 units | 500 | 3 | 创作点超额 |
| Pro | ¥198/月 | 50,000,000 units | 2,000 | 8 | 创作点超额 |
| Team/企业 | 定制 | 后台配置 | 后台配置 | 后台配置 | 后台配置 |

页面不要只显示“10M Token”，建议显示：

```text
本周期含 10M 计费 Token
按当前模型约可完成：输入/输出比例不同，实际数量以任务用量为准
```

如果产品必须承诺原始 Token 数量，应把套餐改为 `TOTAL_RAW_TOKENS`，并接受高价模型补贴风险；不建议作为默认模式。

## 6. 任务计费流程

### 6.0 已实现接口

用户端：

- `GET /v1/billing/token-quota`：当前有效的月度/每日额度、已用、预留、剩余和 Token 汇总；
- `GET /v1/billing/token-quota/events?limit=100`：额度变化审计事件。

管理员端：

- `GET /v1/admin/token-billing/quotas`：按用户或 scope 查询额度状态；
- `GET /v1/admin/token-billing/ledger`：查询 Token 用量流水和关联任务。

BigInt 字段通过统一 JSON 序列化输出为十进制字符串，前端不得按 JavaScript Number 处理大额度。

### 6.1 请求前

1. 解析完整上下文：系统提示词、历史消息、项目指令、知识库、附件文本、搜索结果和工具上下文。
2. 使用统一 Tokenizer 估算输入 Token；无法使用对应 Tokenizer 时使用明确版本的保守估算器。
3. 根据 `maxOutputTokens` 计算预授权上限。
4. 查询当前有效会员周期额度。
5. 在事务中增加 `reservedUnits`，并使用版本号或行锁防止并发超额。
6. `BLOCK` 模式下额度不足直接返回 402；`OVERAGE_CREDITS` 模式只对超出部分转为创作点预扣。

### 6.2 请求完成

1. 读取 OpenAI、Anthropic、Gemini 或 Sub2API/New API 透传的真实 usage。
2. 统一归一化 input、output、cached、reasoning Token。
3. 通过同一个 Pricing Resolver 计算 `chargedUnits`。
4. 在事务中：
   - 减少 `reservedUnits`；
   - 增加 `usedUnits`；
   - 写入 `TokenUsageLedger`；
   - 更新 `GenerationJob` 的 Token 与价格快照；
   - 记录创作点超额或退款。
5. 实际费用必须使用真实值，禁止再使用 `Math.min(reserved, actual)`。

### 6.3 失败、取消和重试

- Provider 失败：释放全部 Token 预授权，不计入已用额度；
- 用户取消：按已确认 usage 结算，未使用部分释放；没有 usage 时按策略处理；
- 队列重试：同一 `generationId` 只允许一个最终结算，ProviderAttempt 分开记录；
- 网络断开但 Provider 已完成：通过幂等键和补偿任务对账，不能重复扣费。

## 7. 供应商 usage 缺失策略

Sub2API/New API 可能因为流式转发、渠道配置或协议转换丢失 usage。后台增加系统级策略：

```text
REJECT_SETTLEMENT       拒绝标记成功，进入待对账
ESTIMATE_WITH_TOKENIZER 使用统一 Tokenizer 估算并标记估算
CHARGE_RESERVED         按预授权上限结算
MANUAL_RECONCILIATION   任务成功但进入人工对账队列
```

默认建议：

- 会员 Token：`ESTIMATE_WITH_TOKENIZER`；
- 创作点：`CHARGE_RESERVED`；
- 后台记录 `usageSource = provider | tokenizer | reserved`；
- 前端任务详情显示“供应商 usage 缺失，已按估算/预授权结算”。

## 8. BYOK、团队和代理渠道

### BYOK

- BYOK 不产生平台上游成本；
- 默认仍消耗会员 Token 配额，保证套餐权益一致；
- 管理员可配置为 `FREE_PLATFORM_COST` 或 `CONSUME_TOKEN_QUOTA`；
- BYOK 的平台成本字段固定为 0，不能与平台渠道混入利润报表。

### 团队

团队需要独立的 `TeamTokenQuota`，成员请求优先扣团队周期额度，再按团队超额策略处理。个人额度与团队额度不能同时预扣后再决定扣谁。

### Sub2API/New API

Provider 只负责上游请求和 usage 透传；用户侧价格不得直接读取中转站返回的价格。所有用户扣费都通过 Xinyue 自己的 `PricingResolver` 和价格快照完成。

## 9. 后台需要增加的配置

### 套餐管理

- 周期 Token 配额；
- 配额单位（计费单位/原始 Token）；
- 超额模式；
- 超额创作点价格；
- 是否结转；
- 重置日和有效期；
- BYOK 是否消耗会员额度；
- 团队共享额度。

### 模型管理

- 输入价格 / M Token；
- 输出价格 / M Token；
- 缓存输入倍率；
- 推理输出倍率；
- 最低扣费单位；
- Provider/渠道覆盖价格；
- 分组价格覆盖；
- 价格版本生效时间。

### 运营与对账

- 用户 Token 余额和周期使用量；
- 输入/输出/缓存/推理分项统计；
- 单任务价格快照；
- 供应商成本、用户收入、毛利；
- usage 缺失和估算任务；
- 预授权、结算、退款异常；
- 超额和拒绝次数。

## 10. 用户端展示

不改变现有工作区布局，只在现有设置/套餐/任务详情区域增加信息。当前用户端已在“套餐与账单”区域接入 `GET /v1/billing/token-quota`，展示月度/周期和每日额度的总额、已用、预留、剩余及有效期；接口失败时不阻塞原有套餐和账单功能。

其余规划信息：

- 当前套餐剩余 Token 配额；
- 当前周期起止时间；
- 本月输入、输出、缓存、推理 Token；
- 当前模型输入/输出价格；
- 发送前的预计最大消耗；
- 任务完成后的实际消耗；
- Token 不足时的升级或使用创作点超额入口。

现有“创作点”区域继续只解释图片、视频、商品视觉等创作任务，避免把两种余额混在一个数字里。

## 11. 实施顺序

### P0：计费正确性

1. 引入 Token 估算器并覆盖完整上下文；
2. 抽取 `PricingResolver`；
3. 移除 `Math.min(reserved, actual)`；
4. 补齐 cached/reasoning 独立计价；
5. 增加缺失 usage 策略；
6. 为现有任务保留完整 `pricingSnapshot`。

### P1：会员 Token 配额

1. Prisma 增加计划字段、周期额度表和 Token 流水表；
2. 实现 `TokenQuotaService`；
3. 将预授权、结算、退款接入事务和幂等键；
4. 订阅开通、续费、管理员赠送时发放新周期额度；
5. 增加周期重置和过期处理任务；
6. 增加用户端余额与使用量接口。

### P2：后台与报表

1. 后台套餐表单增加 Token 配置；
2. 后台模型价格表单增加缓存/推理倍率；
3. 增加 Token 用量、成本、收入和毛利报表；
4. 增加单任务账单明细和对账异常列表；
5. 增加审计日志和价格变更记录。

### P3：迁移与清理

1. 老会员的 `includedCredits` 原值不变；
2. 新增 Token 配额默认从下一个订阅周期生效；
3. 历史任务不回算新价格；
4. 稳定运行一个完整结算周期后，再考虑删除旧聊天创作点兼容分支；
5. 不删除图片、视频和团队创作点流水。

## 12. 必须覆盖的测试

- 中文、英文、代码、JSON、长上下文 Token 估算；
- OpenAI、Anthropic、Gemini usage 归一化；
- Sub2API/New API OpenAI-compatible usage 透传；
- cached/reasoning Token 计费；
- 预授权小于实际用量时补扣；
- 实际用量小于预授权时退款；
- 两个并发请求不能超卖周期额度；
- 失败、取消、重试和 Provider failover 幂等；
- 周期重置、续费、过期和管理员赠送；
- BLOCK 与 OVERAGE_CREDITS；
- BYOK 和团队额度；
- 供应商缺失 usage 的四种策略；
- 价格版本变更不影响历史账单。

## 13. 最终建议

第一版不要把会员 Token 直接做成无限制的原始 Token 钱包，也不要让前端按模型自行换算费用。正确边界是：

```text
Tokenizer -> UsageNormalizer -> PricingResolver -> TokenQuotaService
                                           └──────> CreditsService（超额/媒体）
```

先完成 P0 和 P1，再优化套餐文案和价格数值。这样既兼容现有创作点，又能承载 Sub2API/New API 的多渠道、多模型和倍率计费。

## 14. 复核意见后的版本边界

复核意见建议第一版降低复杂度，这个判断正确。最终分期如下：

### 第一版必须完成

- `PricingResolver` 独立模块；
- OpenAI-compatible、Anthropic、Gemini usage 归一化；
- 中文、英文、代码、JSON 和完整上下文的 Token 估算；
- `TokenUsageLedger`；
- `UserTokenQuota` 及 `version` 乐观锁；
- input/output Token 的真实预扣、补扣、释放和退款；
- `pricingSnapshot`、`usageSource`、`settlementStatus`、上游 request/attempt 关联；
- `BLOCK` 与 `OVERAGE_CREDITS`；
- 免费版每日额度限制；
- 任务级结算状态；
- 额度事件日志；
- 免费版请求频控（独立于 Token 额度）；
- 管理后台套餐和模型输入/输出价格配置。

### 第一版只记录、不独立定价

`cachedInputTokens` 和 `reasoningTokens` 继续从 Provider usage 中记录到 `GenerationJob`、`UsageRecord` 和 `TokenUsageLedger`，但第一版统一按 input/output 基础价格计费。这样不会丢失数据，也不会因为不同中转服务的字段不稳定阻塞上线。

### 后续增强

- cached Token 独立倍率；
- reasoning Token 独立倍率；
- `BYOK_MODE = FREE / QUOTA` 的完整后台配置；
- 团队 Token 额度；
- 供应商成本与毛利报表；
- 自动补偿和人工对账工作台。

### 不能推迟的安全边界

以下内容不能因为降低第一版复杂度而省略：

- 价格解析只能有一个服务；
- 预扣和最终结算必须幂等；
- 实际用量大于预估时必须补扣或拒绝结算；
- 历史任务必须保留价格快照；
- 供应商缺失 usage 必须记录来源并进入可查询状态；
- 会员 Token 与创作点必须保持两套余额。

## 15. 最终审核补充

### 15.1 GenerationJob 结算状态

`GenerationJob.status` 只表示任务生命周期，不能代替账务状态。增加独立的 `settlementStatus`：

```text
PENDING      尚未执行额度动作
RESERVED     已完成预授权
SETTLED      已按真实 usage 结算
RELEASED     预授权已释放
REFUNDED     已完成退款
RECONCILING  usage 缺失，等待对账
```

任务详情和后台任务列表直接返回该字段，避免每次都通过 Ledger 判断任务是否已结算。状态迁移必须幂等，不能从终态回退到 `RESERVED`。

### 15.2 TokenQuotaEvent

增加额度事件表作为余额变化的可读审计轨迹：

```prisma
id              String
userId          String
quotaId         String
generationId    String?
type            TokenQuotaEventType // GRANT/RESERVE/RELEASE/CHARGE/REFUND/EXPIRE/ADJUST
units           BigInt
balanceBefore   BigInt
balanceAfter    BigInt
idempotencyKey  String @unique
metadata        Json?
createdAt       DateTime @default(now())
```

`TokenUsageLedger` 记录最终用量和价格，`TokenQuotaEvent` 记录额度变化，两者职责不同，不能合并成一张模糊流水表。

当一个请求同时使用月度额度和每日额度时，两层额度各自独立产生 `RESERVE`、`RELEASE`、`CHARGE` 事件。事件幂等键必须包含 `generationId`、`quotaId` 和动作，例如 `generation:<job>:quota:<quota>:charge`，不能只按任务生成全局键，否则第二层额度会被唯一约束拒绝或被错误跳过。

### 15.3 免费版三层限制

免费版按以下顺序限制：

```text
请求频控 requestRateLimit
        -> 每日额度 dailyQuotaUnits
        -> 周期额度 monthlyQuotaUnits
```

请求频控应放在 API 网关/Guard 或 Redis 限流层，不能通过查询 `UserTokenQuota` 实现。建议第一版支持每分钟请求数和每日请求数两个配置项；具体数值由后台配置，默认值不得写死在前端。

## 16. 定稿后的开发任务拆分

### Sprint 1：计费核心

- 新建 `billing/pricing-resolver`；
- 抽取并统一 usage normalizer；
- 接入真实 Token 估算器；
- 增加价格快照、结算状态和 TokenUsageLedger；
- 修复实际用量超过预估不补扣的问题。

### Sprint 2：会员额度

- Prisma 增加 SubscriptionPlan 配额字段、UserTokenQuota、TokenQuotaEvent；
- 实现带 `version` 的 TokenQuotaService；
- 接入预扣、补扣、释放、退款和幂等；
- 实现月度/订阅周期和每日额度；
- 接入免费版请求频控。

### Sprint 3：业务接入

- 改造聊天 Runner 和任务创建流程；
- 保留并记录 cached/reasoning，但第一版按基础 input/output 价格计费；
- 接入 Sub2API/New API/OpenAI-compatible、Anthropic、Gemini；
- 增加 BYOK `FREE/QUOTA` 配置；
- 增加用户余额、预计消耗和实际消耗接口。

### Sprint 4：后台与验收

- 后台套餐 Token 配额、日限额和超额策略；
- 后台模型输入/输出价格和价格版本；
- 任务结算状态、额度事件和缺失 usage 对账页面；
- 完成并发、补扣、退款、重试、Provider failover 和价格快照测试。
