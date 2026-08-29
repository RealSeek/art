# Xinyue AI Release Candidate 验收报告

验收日期：2026-08-29
验收范围：当前工作区代码、构建产物、本地基础设施与可执行的自动化检查

## 1. 当前版本状态

**状态：NOT READY**

代码质量和自动化验证已达到候选版本水平，但生产环境仍存在配置与部署阻塞项。当前结论不是业务代码不可用，而是不能在未完成生产配置、TLS 和真实 Provider 验证前直接对外开放。

版本信息目前不一致：根 `package.json` 为 `0.1.0`，`server/package.json` 为 `1.0.0`，管理端环境配置为 `1.0.0`。Git 当前提交为 `6c27233 fix: avoid duplicate office task controls`。发布前应确定一个正式版本号，并在根项目、服务端、管理端和发布标签中统一。

## 2. 已完成并验证

### 代码与构建

- 用户端构建通过：`npm run build`
- 管理端构建通过：`npm run admin:build`
- 后端构建通过：`npm run server:build`
- 全量验证脚本完成：`npm run verify`
- 单元测试通过：72/72
- `git diff --check` 通过
- UI 操作审计已覆盖 88 个页面/组件

### 数据库、缓存与队列

- `prisma validate` 通过
- Prisma migration 状态为最新（共 112 条迁移）
- 本地 PostgreSQL 与 Redis 容器运行且健康
- 生产 Compose 配置解析通过
- 生产 Compose 使用 PostgreSQL、Redis、上传目录持久化卷
- BullMQ 已配置重试、退避、并发及完成/失败任务清理策略

### API 运行检查

- 本地 API 已重新启动，监听 `3100`
- `GET /v1/health` 返回 HTTP 200
- `GET /v1/health/metrics` 返回 HTTP 200，运行时请求/错误/耗时指标可读
- 当前启动日志显示 Nest 应用及各业务模块成功初始化

## 3. 上线阻塞项

以下项目完成前，状态保持 `NOT READY`：

1. **生产环境变量仍为模板值**
   - `.env.production` 中 `POSTGRES_PASSWORD` 仍是占位密码。
   - `WEB_ORIGIN` 仍指向 HTTP/localhost。
   - `COOKIE_SECURE=false`，不适合 HTTPS 生产环境。
   - `SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY` 为空时会依赖首次安装流程，必须确认已生成并安全保存。

2. **生产 Compose 尚未完整运行应用栈**
   - 当前 Docker Compose 仅确认 PostgreSQL、Redis 在运行。
   - `backend`、`frontend` 需要在目标主机完成构建、启动和健康检查验证。

3. **Nginx 未配置 TLS**
   - `deploy/nginx.conf` 当前只有 80 端口监听。
   - SSE 的 `proxy_buffering off` 和 300 秒超时已配置。
   - 当前代码未发现 WebSocket 依赖，但若以后启用 WebSocket，需要补充 Upgrade/Connection 转发。
   - HTTPS 证书、HTTP 到 HTTPS 跳转、HSTS 和生产 CSP 需在边缘层完成。

4. **Cloudflare 配置无法由仓库验收**
   - SSL 模式、WAF、缓存规则及 API 路径保护不在仓库中，必须由运维在目标账号中核对。

5. **真实 Provider 和故障演练尚未完成**
   - 当前环境没有可用于验收的生产 Provider 凭据，因此无法证明真实 429、500、超时、failover 及供应商 usage 兼容性。

## 4. 高风险事项

- `trustProxy: true` 只有在前方确实存在受信任反向代理且网络边界受控时才安全；直连应用服务器时应关闭或限制可信代理数量。
- `contentSecurityPolicy` 在应用层关闭，需由 Nginx/Cloudflare 或应用层补充严格 CSP。
- Redis 使用 AOF 持久化，但生产配置未明确 `maxmemory-policy`；需按队列与缓存用途设置并监控内存。
- 生产数据库、Redis、上传文件和密钥的备份脚本已存在，但尚未执行真实恢复演练。
- 账务、取消、超时和 Provider failover 的自动化单元测试已覆盖核心逻辑；真实上游响应和网络故障仍需集成/灰度验证。

## 5. 必须人工操作项

1. 复制 `.env.production.example` 生成生产配置，替换所有占位值；设置最终 HTTPS `WEB_ORIGIN`，启用 `COOKIE_SECURE=true`。
2. 生成并保管高强度 `SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY`、支付和 Webhook 密钥；不要提交到 Git。
3. 首次部署后立即登录管理后台修改默认管理员密码，并验证普通用户、管理员权限边界。
4. 在目标主机执行 `docker compose -f docker-compose.prod.yml up -d --build`，确认 backend/frontend/PostgreSQL/Redis 全部 healthy。
5. 配置 Nginx TLS、SSE 长连接超时、HSTS、CSP、限流及日志轮转。
6. 在 Cloudflare 核对 SSL（建议 Full/Strict）、WAF、缓存绕过 `/v1/*`、API 访问保护及上传限制。
7. 使用测试 Provider 执行成功、429、500、超时、取消和 failover 场景，核对 ProviderAttempt、Usage、PricingSnapshot、Ledger 与 Quota 变化。
8. 使用 `npm run backup:production` 生成备份，并在隔离环境执行 `npm run restore:production` 完成一次可记录的恢复演练。
9. 配置错误率、Provider 失败率、账务结算失败、管理员异常登录、队列堆积和数据库/Redis 健康告警。

## 6. 可以上线确认项

在上述人工项完成后，可以确认以下代码层面能力具备上线条件：

- 用户端、管理端和服务端均可构建。
- 数据库迁移完整且目标状态最新。
- API 健康检查和运行时指标可用。
- SSE 代理配置已避免缓冲并设置长超时。
- 计费核心具备预扣、结算、释放、退款、幂等和审计记录实现。
- Provider 路由、任务队列、权限和文件上传已有基础安全控制。

## 7. 上线后的观察指标

首个灰度周期至少观察：

- API 请求量、P95/P99 延迟、5xx 与限流比例
- Provider 成功率、429/5xx/超时次数、failover 比例
- Token usage 缺失率、预扣与实扣差异、结算失败/补偿数量
- BullMQ waiting/active/failed 数量及任务平均处理时长
- PostgreSQL 连接池、慢查询、锁等待
- Redis 内存、命中率、AOF 重写和连接数
- 登录失败、管理员异常登录、SSRF/上传拦截日志

## 8. 验收结论

本轮未发现需要立即修改的业务代码阻塞。构建、测试、迁移和本地健康检查均通过；剩余问题集中在生产密钥、HTTPS/边缘代理、完整容器部署、真实 Provider 故障演练和备份恢复证明。

完成第 5 节人工操作并留存演练记录后，再将发布状态从 `NOT READY` 更新为 `READY`。
