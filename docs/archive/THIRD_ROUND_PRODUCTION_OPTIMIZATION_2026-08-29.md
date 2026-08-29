# Xinyue AI 第三轮生产级优化报告

更新时间：2026-08-29
定位：生产级稳定性、性能、可观测性与上线准备

## 1. 完成内容

本轮不增加业务功能，不修改 UI 布局、API 返回结构或数据库核心业务模型。已完成可由当前代码和本地环境可靠验证的生产优化：

- Usage 统一结果补充 `totalTokens`，保持 Provider 字段转换集中在 UsageNormalizer。
- 新增有界的 `RuntimeMetricsService`，按 HTTP 方法和路径聚合请求数、错误数、平均耗时，最多保留 200 条路由，避免指标基数无限增长。
- 请求上下文拦截器自动记录请求耗时和错误状态，并继续返回 `x-request-id`、`x-trace-id`。
- 健康端点增加 `/v1/health/metrics`，用于本地和运维检查。
- 保留现有 Provider 路由优先级、权重、冷却和 failover 行为，不引入未经真实 Provider 验证的路由改写。

## 2. Usage 统一情况

统一入口：`server/src/billing/usage-normalizer.ts`。

当前标准结构：

```ts
{
  inputTokens,
  outputTokens,
  totalTokens,
  cachedInputTokens,
  reasoningTokens,
  source: 'PROVIDER' | 'TOKENIZER'
}
```

OpenAI-compatible、Anthropic 和 Gemini 的原始字段仍由 Provider/解析层转换；计费层只接收统一字段。缓存和推理字段继续记录但不重复计费。

## 3. Provider 稳定性

现有 `ProviderRoutingService`、`ProviderHealthService` 和 `ChatGenerationRunner.withProviderFailover()` 已覆盖优先级、权重、冷却、429/5xx/网络错误切换及成功渠道记录。本轮补充确认：

- 失败渠道会写入 `ProviderAttempt` 并更新健康状态。
- 成功渠道写入 Ledger 的 `providerAttemptId`。
- 账单价格快照使用最终成功渠道的模型和成本。
- 取消信号不会被误记为搜索渠道故障。

真实的 A 渠道 429、B 渠道成功、Provider 超时和真实 usage 结算仍需要生产相同的 Provider 配置进行故障注入，不能由本地单元测试替代。

## 4. 计费验证

- PricingResolver 继续负责输入/输出单价、分组倍率、汇率和版本化快照。
- TokenQuota 继续执行预扣、补扣、释放和 Serializable 结算。
- TokenUsageLedger 与 TokenQuotaEvent 保持分离，幂等键保持任务级稳定。
- 新增 `totalTokens` 只是统一 usage 的派生字段，不改变已有扣费公式。

## 5. 可观测性

新增文件：

- `server/src/common/runtime-metrics.service.ts`
- `tests/unit/runtime-metrics.test.ts`

指标服务是进程内轻量快照，适合健康检查和本地运维，不宣称替代 Prometheus、OpenTelemetry 或集中式日志。生产多实例环境应在网关或指标系统汇总各实例数据。

已有后台健康摘要继续提供数据库、Redis、存储、Provider、Generation、导出、告警和账务对账状态。

## 6. 性能检查

- Usage 计算和指标记录均为内存操作，不增加数据库查询或 Provider 请求。
- 指标路由数量有 200 条硬上限，避免动态路径造成内存增长。
- Generation、Agent、Export 和商业生命周期队列已有明确并发、重试、退避和清理策略。
- 生成任务查询已有分页/数量上限；本轮未改变查询返回结构。

尚未执行生产数据量下的慢查询采样、Redis 压测、BullMQ 吞吐压测和大列表浏览器性能测试，这些必须使用接近生产的数据量验证。

## 7. 生产安全检查

已确认：

- Cookie 使用 `HttpOnly`、`SameSite=Lax`，生产 `Secure` 可由 `COOKIE_SECURE` 控制。
- 全局 ValidationPipe 启用 whitelist、forbidNonWhitelisted 和 transform。
- CORS 使用显式 `WEB_ORIGIN`，生产环境不自动加入本地来源。
- multipart 文件大小和文件数量有上限。
- 用户 BYOK、Webhook、支付、搜索、价格目录和媒体下载已执行公网 URL/响应边界控制。
- 管理员登录有独立限流。

需要部署侧确认的项目：

- `FastifyAdapter({ trustProxy: true })` 必须与真实反向代理链匹配，禁止让公网客户端伪造转发头。
- Helmet 当前关闭 CSP（`contentSecurityPolicy: false`），应在反向代理或静态站点层配置与实际资源兼容的 CSP。
- 必须轮换默认管理员密码、`SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY` 及支付/Webhook 密钥，并启用 HTTPS。

详细安全发现见 [安全最佳实践审查](SECURITY_BEST_PRACTICES_REPORT_2026-08-29.md)。

## 8. 新增测试

- `tests/unit/runtime-metrics.test.ts`：请求聚合、错误计数、查询串归一化和路由数量上限。
- `tests/unit/token-billing.test.ts`：更新 UsageNormalizer 契约，验证 `totalTokens`。

## 9. 验证结果

| 检查 | 结果 |
| --- | --- |
| 用户端 `npm run build` | 通过 |
| 管理端 `npm run admin:build` | 通过 |
| 后端 `npm run server:build` | 通过 |
| 单元测试 `npm run test:unit` | `72/72` 通过 |
| UI 操作审计 | 通过，88 个页面/组件 |
| Prisma validate | 通过 |
| Prisma migrate status | 111 条迁移，数据库已最新 |
| API 健康检查 | `/v1/health` 正常 |
| 运行指标端点 | `/v1/health/metrics` 正常，返回有界路由快照 |
| `git diff --check` | 通过 |

## 10. 修改文件

| 文件 | 修改 | 原因 | 影响 |
| --- | --- | --- | --- |
| `server/src/billing/usage-normalizer.ts` | 增加 `totalTokens` | 固化跨 Provider 统一 usage 契约 | 不改变扣费字段 |
| `server/src/common/runtime-metrics.service.ts` | 新增有界运行指标 | 提供基础请求可观测性 | 只增加内存快照 |
| `server/src/common/request-context.ts` | 记录请求状态和耗时 | 复用已有 trace 链路 | 不改变响应正文 |
| `server/src/health.controller.ts` | 增加 metrics 查询端点 | 便于运维检查 | 不影响原 health 接口 |
| `server/src/app.module.ts` | 注册指标服务 | 依赖注入 | 不改变模块边界 |
| `tests/unit/runtime-metrics.test.ts` | 新增测试 | 防止指标无界增长/重复计数 | 仅测试 |

## 11. 当前生产准备状态

### 代码层面已完成

- Usage 统一契约和计费边界。
- Provider failover、冷却、成功渠道账务关联。
- Token quota 并发结算和幂等账本。
- 请求追踪、基础运行指标和健康检查。
- 前后端构建、Prisma 和单元测试验证。

### 上线前必须人工完成

1. 生产 PostgreSQL/Redis 并发 quota 结算和进程中断测试。
2. 真实 Provider 小额调用，注入 429/500/超时并核对最终渠道和账单。
3. 配置反向代理信任范围、HTTPS、CSP、egress firewall。
4. 轮换所有默认凭据和密钥。
5. 配置集中式日志、Prometheus/OpenTelemetry 或同等监控，并设置结算失败告警。

### 后续优化

- usage 合同测试覆盖更多 OpenAI-compatible 中转差异。
- Provider/Generation 指标接入集中式时序系统。
- 使用生产数据量执行慢查询和队列吞吐分析。

## 12. 最终判断

本轮已完成代码层面的生产稳定性收尾，项目不应继续无目的重构。下一步应从代码修改转为生产配置、真实 Provider 核验、压测、安全检查和灰度监控。
