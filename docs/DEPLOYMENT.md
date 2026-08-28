# Xinyue AI 部署与运维指南

产品和技术边界以 [最终代码审计](FINAL_CODE_AUDIT_2026-08-28.md) 为准。本文只维护可直接执行的部署和运维步骤。

本文覆盖 Docker Compose 生产部署、首次安装、升级、备份恢复、健康检查和手工 Node.js 部署。

## 1. 生产架构

| 服务 | 作用 | 默认暴露 |
| --- | --- | --- |
| `frontend` | Nginx、用户端和管理端静态文件、API 反向代理 | 主机 `80` |
| `backend` | NestJS API、BullMQ Worker、迁移和幂等初始化 | 容器 `3100` |
| `postgres` | 主业务数据库 | 仅 Compose 内网 |
| `redis` | 队列、缓存和任务状态 | 仅 Compose 内网 |

Nginx 路由：用户端位于 `/`，管理端位于 `/admin/`，API 位于 `/v1/`。上传上限为 55 MB，流式 API 已关闭代理缓冲。

## 2. Docker Compose 部署

### 2.1 环境要求

- 2 核 CPU、4 GB 内存起步；生成任务多时建议 4 核 8 GB
- 40 GB 以上可用磁盘
- Docker Engine 24+ 和 Docker Compose v2+
- 已解析到服务器的域名和可用的 HTTPS 反向代理

### 2.2 创建生产配置

```powershell
Copy-Item .env.production.example .env.production
```

必须修改 `.env.production` 中的 `POSTGRES_PASSWORD`、`SESSION_SECRET` 和 `CREDENTIAL_ENCRYPTION_KEY`，两个密钥均不得少于 32 位；占位值会让生产容器直接启动失败。首次部署默认管理员为 `xinyue@xinyue.mom`，默认密码为 `xinyue.mom`，也可通过 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 覆盖。登录后台后应立即在“业务系统配置 > 后台安全”修改管理员邮箱和密码。

重要：Compose 的 `--env-file` 用于解析 `${POSTGRES_PASSWORD}`，而 `backend.env_file` 仍读取根目录的 `.env.production`。两者都需要，因此后续命令始终保留 `--env-file .env.production`。

### 2.3 启动

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
```

后端每次启动都会先执行 `prisma migrate deploy`，然后幂等初始化全局设置、默认用户组和超级管理员；完成后才启动 API。重复启动不会创建重复管理员或重复用户组。

### 2.4 首次初始化

1. 查看 `backend` 日志，确认所有迁移完成并出现 `Super admin ready`。
2. 打开 `/admin/`，使用默认账号 `xinyue@xinyue.mom` 和密码 `xinyue.mom` 登录；如果环境变量覆盖过管理员信息，则使用配置值。
3. 登录后立即修改管理员邮箱和密码，并关闭不再需要的会话。
4. 在管理端完成站点、邮件、支付、模型渠道、搜索和内容配置。

数据库密码包含 `@`、`:`、`/`、`#` 等字符时，需要先在 `DATABASE_URL` 中进行 URL 编码。系统不提供公开安装页，也不会通过浏览器写入运行配置。

### 2.5 HTTPS 和域名

推荐在宿主机使用 Caddy、Nginx Proxy Manager 或云负载均衡终止 TLS，再转发到 `127.0.0.1:80`。启用 HTTPS 后修改：

```dotenv
WEB_ORIGIN=https://xinyue.example.com
COOKIE_SECURE=true
```

然后重建后端：

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build backend
```

`WEB_ORIGIN` 必须与浏览器实际访问的 Origin 完全一致，否则登录 Cookie 和跨域请求会失败。

## 3. 持久化与备份

生产数据位于以下 Docker Volume：

- `xinyue_postgres`：PostgreSQL 数据
- `xinyue_redis`：Redis AOF 和队列状态
- `xinyue_uploads`：本地存储模式下的用户上传与生成文件；切换 S3 后仍需保留，直到历史本地资产迁移完成

升级前至少备份数据库、上传文件和运行配置：

```powershell
npm run backup:production
```

脚本会备份 PostgreSQL、Redis、上传文件、生产环境配置和 Compose 文件，并生成带 SHA-256 的 `manifest.json`。备份目录默认位于 `backups/<时间>`；可使用 `--output=绝对路径` 指定位置。备份包含生产密钥，必须加密保存并限制读取权限。

数据库恢复应在维护窗口执行：

```powershell
npm run restore:production -- --source=backups/2026-08-17_00-00-00-000 --confirm
```

默认不会覆盖当前 `.env.production`。只有明确需要恢复旧配置时才添加 `--restore-config`。恢复脚本会先校验全部文件、停止写入服务、恢复数据库/上传/Redis，再重新启动服务。

先在测试环境验证恢复文件；不要在仍有业务写入时直接覆盖生产数据库。

### 3.1 对象存储

默认配置为 `STORAGE_DRIVER=local`。启用 AWS S3、Cloudflare R2 或其他 S3 兼容服务时设置：

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://你的对象存储端点
S3_REGION=auto
S3_BUCKET=xinyue-assets
S3_ACCESS_KEY_ID=你的访问标识
S3_SECRET_ACCESS_KEY=你的访问密钥
S3_FORCE_PATH_STYLE=false
```

AWS S3 可留空 `S3_ENDPOINT` 并填写真实 Region；部分自建兼容服务需要 `S3_FORCE_PATH_STYLE=true`。Bucket 应使用私有访问策略，文件必须通过 Xinyue API 的登录和资源权限检查下载，不能直接公开整个 Bucket。

每条 `Asset` 都记录写入时的 `storageDriver`、`storageBucket` 和 SHA-256 校验和。迁移前已有记录会自动标记为 `local`，新上传文件使用当前活动驱动。

切换存储后，在管理端进入“运维管理 -> 系统健康 -> 资产存储迁移”。先确认活动存储健康，再按批次执行迁移。每个文件的顺序为：

```text
读取旧文件 -> 校验大小和 SHA-256 -> 写入并校验目标文件
-> 条件更新 Asset 存储位置 -> 删除旧副本
```

迁移进度直接由未处于活动存储的 `Asset` 数量计算，不依赖进程内状态；后端重启或单批失败后可以继续执行。冲突、源文件缺失或校验失败的记录会保留原存储位置，不会删除源文件。迁移时仍需注意：

- 切换到 S3 后不会在后台静默搬运历史文件，必须由管理员明确启动迁移。
- 历史本地资产未迁移前必须继续挂载并备份 `xinyue_uploads`。
- 数据库中仍存在 S3 资产时，必须保留对应 Bucket 和可读取该 Bucket 的凭据。
- 不要绕过管理端迁移流程手工复制后直接删除源文件。
- S3/R2 的版本控制、生命周期、跨区域复制和备份由对象存储侧配置，数据库备份不能代替对象备份。

管理端可以应用 Xinyue 自带的安全生命周期规则：清理未完成的分片上传，并在 Bucket 已启用版本控制时清理历史版本。它不会删除仍在使用的资产对象。保留天数由 `S3_ABORT_INCOMPLETE_UPLOAD_DAYS` 和 `S3_NONCURRENT_EXPIRATION_DAYS` 控制；其他非 Xinyue 生命周期规则会原样保留。

### 3.2 可选热点服务

生产 Compose 提供可选的 `DailyHotApi` 服务，它只负责首页多源热点推荐，不替代 SearXNG 或模型原生联网搜索。启用方式：

```powershell
docker compose --profile recommendations --env-file .env.production -f docker-compose.prod.yml up -d
```

随后在管理端“联网搜索与热点”中保存：

```text
服务地址：http://dailyhot:6688
```

选择需要展示的榜单后先执行“检测”，再启用首页推荐。系统最多并行读取 12 个榜单，按来源轮询、标题去重并持久化最近一次真实结果；单个上游故障不会用模型编造热点。DailyHotApi 聚合公开站点数据，上线前应评估目标站点条款和自身业务合规要求。

### 3.3 可选图片工具 Worker

首个独立 Worker 提供真实 `rembg` 智能抠图。它不管理用户、套餐或文件库，所有任务仍由 NestJS 执行权限、计费、BullMQ 调度、资产入库和审计。

先在 `.env.production` 生成独立令牌并启动 profile：

```dotenv
LOCAL_WORKER_TOKEN=替换为独立随机令牌
LOCAL_WORKER_CONCURRENCY=1
LOCAL_WORKER_RESULT_TTL_SECONDS=604800
LOCAL_WORKER_REMBG_MODEL=u2net
```

```powershell
docker compose --profile image-tools --env-file .env.production -f docker-compose.prod.yml up -d --build image-worker
```

随后在管理端创建 `LOCAL_WORKER` 渠道：

```text
API 地址：http://image-worker:8080
访问令牌：LOCAL_WORKER_TOKEN 的值
```

执行渠道检测后，使用发现的 `rembg` 能力创建图片模型、绑定路由、配置价格和用户分组，再发布对应图片工具。模型缓存保存在 `xinyue_worker_models`，七天幂等结果缓存保存在 `xinyue_worker_data`；两者都不进入 Git。完整接口和取消语义见 [LOCAL_WORKER_PROTOCOL.md](LOCAL_WORKER_PROTOCOL.md)。

其余图片 Worker 按需启动，不需要时不要构建：

```powershell
docker compose --profile iopaint --env-file .env.production -f docker-compose.prod.yml up -d --build iopaint-worker
docker compose --profile realesrgan --env-file .env.production -f docker-compose.prod.yml up -d --build realesrgan-worker
docker compose --profile comfyui --env-file .env.production -f docker-compose.prod.yml up -d --build comfyui-gateway
```

对应管理端渠道地址分别是 `http://iopaint-worker:8080`、`http://realesrgan-worker:8080` 和 `http://comfyui-gateway:8080`。ComfyUI 本体由运维人员单独部署，并通过 `COMFYUI_URL` 指向其内网地址；`COMFYUI_WORKFLOW_DIR` 只读挂载管理员审核后的 API 工作流。首次 Real-ESRGAN 和 IOPaint 推理会下载模型，生产环境应在发布前预热并确认模型许可证、磁盘和显存/内存容量。

## 4. 升级与回滚

### 4.1 升级

```powershell
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

后端容器每次启动都会先执行 `prisma migrate deploy`，迁移成功后才启动 API。迁移失败时容器不会带着不匹配的数据库结构继续运行。

### 4.2 回滚

1. 保留升级前的 Git 提交号、数据库备份和 Volume 备份。
2. 切换到上一稳定提交并重新构建镜像。
3. 如果新版本执行了不可向后兼容的数据库迁移，先停止后端，再恢复数据库备份。
4. 恢复上传和配置 Volume 后启动全部服务。

Prisma 迁移不会自动执行数据库降级，不能只回退代码而忽略数据结构。

## 5. 健康检查与故障定位

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 200 frontend
Invoke-RestMethod http://localhost/v1/health
```

上线检查：

- `/v1/health` 返回 `ok: true`
- `/`、`/login` 和 `/admin/` 路由状态正确，`/install` 不存在
- 超级管理员可以登录，普通用户不能进入管理后台
- PostgreSQL、Redis、文件存储在管理端系统健康页均正常
- 模型和搜索渠道健康检查成功
- 注册、登录、套餐下单、支付回调、对话和生成任务完成
- HTTPS 下 Cookie 带 `Secure`，浏览器控制台没有跨域或 Mixed Content 错误

常见问题：

- `env file .env.production not found`：先复制 `.env.production.example`。
- 登录后仍提示未授权：检查 `WEB_ORIGIN`、`COOKIE_SECURE`、代理的 `X-Forwarded-Proto` 和系统时间。
- 后端反复重启：查看迁移日志，确认数据库可连接且用户有建表权限。
- 上传失败：检查反向代理请求体上限和 `xinyue_uploads` Volume 的可写状态。
- S3 上传或下载失败：检查 Bucket、Region、Endpoint、路径风格、凭据权限和服务器时间；管理端系统健康应返回当前存储驱动和 Bucket。

## 6. 手工 Node.js 部署

不使用 Docker 时，需要自行提供 PostgreSQL 17、Redis 7、Node.js 20.19+（推荐 22）、pnpm 和 Nginx。

```powershell
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
npm run build
npm run admin:build
npm run server:build
npm --prefix server run prisma:generate
npm --prefix server run prisma:deploy
```

部署结构：

- `dist/` 作为用户端静态目录
- `admin/dist/` 挂载到 `/admin/`
- `server/dist/main.js` 由 systemd、PM2 或 Windows Service 常驻运行
- Nginx 将 `/v1/` 代理到 `127.0.0.1:3100`
- `UPLOAD_DIR` 指向持久化目录

后端至少需要配置：`NODE_ENV=production`、`DATABASE_URL`、`REDIS_URL`、`WEB_ORIGIN`、`COOKIE_SECURE`、`SESSION_SECRET`、`CREDENTIAL_ENCRYPTION_KEY` 和存储配置；`ADMIN_EMAIL`、`ADMIN_PASSWORD` 可覆盖首次初始化默认值。手工部署升级时，应在启动新进程前先执行 `npm --prefix server run prisma:deploy` 和 `npm --prefix server run admin:seed`。已有管理员在后台修改密码后，`admin:seed` 不会覆盖密码，除非明确设置 `ADMIN_FORCE_PASSWORD_RESET=true`。

## 7. 发布前验证

```powershell
npm run audit:ui-actions
npm run verify
npm run test:e2e
git diff --check
```

真实生产密钥、管理员密码、支付密钥、OAuth Secret 和供应商 API Key 只能通过部署环境注入，不能提交到仓库。
