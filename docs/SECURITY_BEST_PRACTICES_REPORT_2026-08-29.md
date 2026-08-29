# Xinyue AI 安全最佳实践审查

审查时间：2026-08-29
范围：NestJS/Fastify 服务端、Vue 用户端和管理端的生产安全配置

## 摘要

未发现本轮新增的 Critical 漏洞。认证 Cookie、输入校验、CORS、上传限制和外部 URL 边界已有基础保护。以下项目需要在生产部署时确认或补强。

## SEC-001：反向代理信任范围需与部署拓扑一致

- 严重性：Medium
- 位置：[server/src/main.ts](../server/src/main.ts:21)
- 证据：`new FastifyAdapter({ trustProxy: true })`
- 影响：如果入口代理不覆盖客户端转发头，公网请求可能伪造 IP/协议，影响限流、审计和安全判断。
- 修复：按实际代理跳数或受信网段配置 `trustProxy`，并确保边缘代理覆盖 `X-Forwarded-*`。
- 缓解：在网关层固定来源 IP、启用 egress firewall，并对生产限流结果做真实验证。

## SEC-002：应用层未提供 CSP，需要在边缘层补齐

- 严重性：Medium
- 位置：[server/src/main.ts](../server/src/main.ts:26)
- 证据：`app.register(helmet, { contentSecurityPolicy: false })`
- 影响：应用渲染用户内容时缺少浏览器脚本加载约束，XSS 发生后的影响面更大。
- 修复：根据用户端和管理端实际资源，在反向代理/静态站点层配置 CSP；先以报告模式观察，再逐步收紧 `script-src`、`connect-src` 和 `frame-ancestors`。
- 说明：直接在 API 层开启默认 CSP 可能破坏现有 Vite/管理端资源，因此应结合部署后的资源清单配置，而不是盲目打开。

## SEC-003：默认管理员凭据必须在生产首次启动前轮换

- 严重性：High（仅限未完成初始化的部署）
- 位置：[server/src/auth/auth.controller.ts](../server/src/auth/auth.controller.ts:110)、`server/.env.example`
- 证据：项目提供默认管理员账号和初始化密码；登录接口虽有限流，但默认密码若暴露会导致后台接管。
- 影响：攻击者可登录管理后台修改 Provider、价格、用户额度或密钥配置。
- 修复：部署时使用随机 `ADMIN_PASSWORD` 或首次登录强制修改，并轮换 `SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY`。
- 缓解：限制管理端网络访问、启用 HTTPS、降低生产 `ADMIN_LOGIN_RATE_LIMIT`，并监控异常登录。

## 已确认的安全控制

- Cookie：`HttpOnly`、`SameSite=Lax`，生产可启用 `Secure`（[auth.controller.ts](../server/src/auth/auth.controller.ts:50)）。
- 输入：全局 ValidationPipe 使用 whitelist 和 forbidNonWhitelisted（[main.ts](../server/src/main.ts:58)）。
- CORS：生产只使用显式 `WEB_ORIGIN`（[main.ts](../server/src/main.ts:31)）。
- 外部请求：BYOK、Webhook、搜索、支付、价格目录和媒体下载已统一公网地址与响应边界检查。
- 限流：管理员登录和验证码接口使用独立 Throttler 配置。

## 生产验证清单

1. 反向代理覆盖 `X-Forwarded-*`，并与 `trustProxy` 配置一致。
2. HTTPS、Secure Cookie、CSP 和 egress firewall 已启用。
3. 默认管理员凭据和所有服务密钥已轮换。
4. 使用真实域名执行登录、OAuth、上传、Provider 调用和跨域请求测试。
5. 记录并告警管理员登录失败、SSRF 拒绝、Provider 密钥错误和账务结算失败。
