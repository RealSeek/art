# 本地代码扫描、清理与重启记录

更新时间：2026-08-28  
范围：用户端、管理端、NestJS 服务端、Prisma、测试、启动脚本和本地文档

## 1. 扫描结论

- 已排除 `node_modules`、`dist`、`output`、`test-results`、`server/storage` 等依赖、构建产物、测试产物和运行时缓存。
- 未发现可以在不改变运行合同的前提下安全删除的业务模块。长文件（画布、工作区、Provider、Prompt Library、后台运营/设置/渠道页）仍是领域聚合文件，不能仅按行数删除。
- 已确认旧的管理端聚合 API、旧 MFA 服务、连接器运行时和同步对话导出没有有效业务引用；它们已经由当前改动删除，不再保留兼容转发层。
- `ExternalMarketService` 中的 `setInterval` 是社区技能目录每日刷新任务，具备并发去重、缓存落盘和模块销毁清理；本轮保留，避免误删正常后台同步。
- `generations.processor.ts` 的 heartbeat、任务中心轮询、WebSocket ping/reconnect、验证码倒计时和表格缓存清理均属于当前生命周期逻辑，不是历史代码。
- `deprecated`、`兼容` 等命中主要来自第三方 lockfile、CHANGELOG、OpenAI-compatible/S3-compatible 协议名称或响应式布局，不作为删除依据。

## 2. 文档真相源

- `docs/FINAL_CODE_AUDIT_2026-08-27.md`：最近一轮代码与验收状态。
- `docs/NEXT_VERSION_SCOPE_AND_EXECUTION_PLAN_2026-08-27.md`：下一版本范围与执行边界。
- 本文：2026-08-28 本地扫描、清理判断、启动命令和重启结果。
- `docs/DEPLOYMENT.md`：生产部署、升级、备份和恢复，继续保留。
- `docs/LOCAL_WORKER_PROTOCOL.md`：图片 Worker 接口协议，继续保留。

`PROJECT_AUDIT_AND_NEXT_STEPS.md`、`NEXT_OPTIMIZATION_AUDIT_2026-08-27.md`、`FULLSTACK_REFACTOR_AUDIT_2026-08-27.md`、`CODE_CLEANUP_AND_UI_AUDIT.md` 和 `FRONTEND_ADMIN_OPTIMIZATION_ROADMAP.md` 是历史审计/实施记录；其中的完成度和后续计划不覆盖当前代码状态。

## 3. 本地启动

开发环境端口约定：

| 服务 | 命令 | 地址 |
| --- | --- | --- |
| API | `npm --prefix server run dev` | `http://localhost:3100` |
| 用户端 | `npm run dev -- --host 0.0.0.0 --port 5173` | `http://localhost:5173` |
| 管理端 | `pnpm --dir admin dev --host 0.0.0.0 --port 5174` | `http://localhost:5174` |

API 生产启动必须使用 `server/scripts/start-production.cjs`，它会先执行 Prisma 迁移和管理员幂等初始化；缺少生产密钥时应拒绝启动。

## 4. 重启验收

重启后应检查：

```powershell
Invoke-WebRequest http://localhost:3100/v1/health
Invoke-WebRequest http://localhost:5173
Invoke-WebRequest http://localhost:5174
```

`/v1/admin/health/summary` 未登录返回 `401` 属于正常权限行为；公共 `/v1/health` 必须返回 `200`。

本次本地重启结果：

- API 监听 `3100`，Nest 应用启动成功，PID `45528`。
- 用户端监听 `5173`，Vite 返回 `200`，PID `78336`。
- 管理端监听 `5174`，Vite 返回 `200`，PID `47840`。
- `GET /v1/health` 返回 `200`，响应 `{"ok":true,"service":"flux-studio-api"}`。
- `GET /v1/admin/health/summary` 未登录返回 `401`，符合管理员权限要求。
- 重启后 API、用户端、管理端错误日志均无新增错误；启动窗口内前端先于 API 发出的旧 `ECONNREFUSED` 不再复现。

## 5. 发布前门禁

```powershell
npm run verify
npm run test:unit
npm run audit:ui-actions
npx prisma validate --schema server/prisma/schema.prisma
npx prisma migrate status --schema server/prisma/schema.prisma
git diff --check
```

真实模型、支付、OAuth、邮件、对象存储、图片 Worker、数据库恢复和压力容量仍需在具备真实凭据与依赖的环境单独验收，本地启动成功不等于这些外部能力已生产可用。

本轮门禁结果：`npm run verify` 通过（UI 审计、用户端构建、服务端构建、管理端构建）；`npm run test:unit` 通过（48/48）；Prisma schema 校验通过；数据库 103 条迁移已同步；`git diff --check` 通过。
