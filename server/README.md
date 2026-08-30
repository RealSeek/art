# Xinyue AI Server

Xinyue AI 的统一 NestJS API、任务队列和商业业务服务。完整产品说明见仓库根目录 [README](../README.md)，生产部署见 [部署与运维指南](../docs/DEPLOYMENT.md)。

## 技术栈

- NestJS 11、Fastify、Prisma、PostgreSQL 17
- Redis 7、BullMQ、LangGraph.js
- HttpOnly Cookie 会话与管理员权限控制
- 本地磁盘或 S3 兼容对象存储
- SMTP 邮件、站内通知和 HMAC Webhook
- SSE 对话流、生成进度和 Agent 任务事件

## 本地开发

从仓库根目录执行：

```powershell
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
docker compose up -d
npm run setup:dev
npm run server:dev
```

API 地址为 `http://localhost:3100/v1`。用户端和管理端开发服务器分别代理到该地址；管理端位于 `http://localhost:5174/admin/`。

`setup:dev` 会创建缺失的 `server/.env`、生成 Prisma Client、执行迁移并幂等初始化系统数据和开发管理员。示例账号仅用于本地开发，生产环境不要复用示例凭据。

## 已实现领域

- 邮箱验证码、邮箱/密码、Linux.do OAuth 和可撤销会话
- 用户、分组、订阅、充值、支付、退款、兑换码和创作点流水
- 管理员渠道、模型路由、健康检查、故障切换、价格版本和用户 BYOK
- 对话、附件、图片/视频/商品生成、流式输出、取消、重试和失败退款
- Agent 计划、联网搜索、知识库、工具审批和 PPTX/DOCX/XLSX 导出
- 项目、文件、版本、团队席位、共享额度、成员限额和团队审计
- 提示词、技能、助手、工具授权、CMS、公告、通知、工单和内容审核
- 本地/S3 资产、校验、迁移、生命周期、备份和恢复

没有健康模型渠道时，API 会明确返回不可用错误，不生成伪造的演示回复。图片工具 Worker 使用独立容器和协议，见 [WORKER_PROTOCOL](../docs/WORKER_PROTOCOL.md)。

## 管理端

开发环境可以通过 `server/.env` 中的 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 幂等创建测试管理员。生产环境默认不配置这两个变量，服务启动后访问 `/install` 创建首个管理员；如果明确配置了两者，启动脚本会执行一次幂等初始化，但不会回退到固定密码。执行：

```powershell
npm --prefix server run admin:seed
```

开发管理端：`http://localhost:5174/admin/`。生产管理端：`https://你的域名/admin/`。普通用户不能通过用户注册获得管理员权限。

上传文件保存在 `UPLOAD_DIR` 或私有 S3 Bucket 中，只能通过带资源权限校验的 API 读取。首次部署可通过前端 `/install` 页面创建管理员，创建后该入口自动关闭。

## 发布检查

```powershell
npm run verify
npm --prefix server run prisma:deploy
npm run test:e2e
```

生产环境必须使用 HTTPS、强随机会话/凭据密钥、真实邮件和支付配置，并执行数据库、Redis、资产与配置备份。扩容时可将 API 与 BullMQ Worker 分进程部署，但必须共用 PostgreSQL、Redis 和对象存储。
