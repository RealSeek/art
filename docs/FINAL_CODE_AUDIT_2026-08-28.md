# Xinyue AI 最终代码审计报告

更新时间：2026-08-28
审计性质：最终审计、必要安全/账务收尾修复与验证

## 1. 审计结论

当前版本已经具备继续开发和内部试运行的基础：聊天流、生成任务、Provider 路由、任务追踪、分支消息、Token 预扣/结算、后台权限和画布主流程均已形成可运行闭环。没有发现会阻断编译或启动的 P0 问题。

审计期间已补齐三项高优先级修复：统一工具 Endpoint 公网校验、多 quota 批量原子结算，以及用户工具事件脱敏。当前仍有 Agent 任务链路取消和 Provider 请求关联等上线前增强项。

另外，Agent 任务链路的取消信号、Provider 请求关联 ID 等属于上线前应补齐的可靠性和审计能力。长文件问题属于 P2 重构，不建议在本轮审计后直接大范围改动。

## 2. 审计范围与方法

- 扫描用户端 `src/`、管理端 `admin/src/`、API `server/src/`、Prisma schema/migrations、测试和本地文档。
- 排除 `node_modules`、构建产物和缓存目录。
- 重点检查：认证与权限、生成状态机、SSE、工具循环、Provider failover、Token 计费幂等、数据库迁移、画布/媒体任务、后台页面拆分边界。
- 当前代码量约 908 个排除依赖与产物后的文件。

## 3. 阻断级问题（P0）

未发现 P0 阻断项。前端、API、管理端均可构建，数据库 schema 可通过 Prisma 校验，服务可启动并响应健康检查。

## 4. P1 必须修复

### P1-1 自定义工具 Endpoint SSRF（本轮已修复）

此前 `server/src/agent-tasks/agent-tools.service.ts:53-70`、`server/src/generations/runners/chat-generation.runner.ts:532-555` 和 `server/src/workspace/workspace.controller.ts:256-270` 会直接请求数据库中的 Endpoint。

本轮新增 `server/src/common/public-endpoint-policy.service.ts`，并接入工具创建、更新、Agent 自动执行和工作区手动调用；执行请求禁止重定向，DNS 失败和私网解析会被拒绝。仍需在真实部署环境验证 DNS 变更和代理层行为。

### P1-2 多 quota 结算不是原子操作（本轮已修复）

此前 runner 按 scope 顺序逐条结算，存在部分成功风险。本轮新增 `TokenQuotaService.settleMany()`，由 ChatGenerationRunner 一次性提交月度和每日 scope，内部使用 Serializable 事务，任一 scope 失败都会整体回滚。仍需补充真实 PostgreSQL 并发和进程中断集成测试。

### P1-3 工具循环超时不会取消底层请求（聊天链路已修复，Agent 任务链路待验证）

本轮 `ToolLoopRunner` 已创建共享 `AbortController`，聊天 planner 和工具 fetch 会接收 signal。AgentTasksProcessor 使用的 `AgentToolsService.execute()` 仍未接收外部 signal，需在真实调度任务中继续接入并验证。

### P1-4 用户事件流暴露完整工具输入输出（本轮已修复）

`server/src/generations/runners/chat-generation.runner.ts:544-555` 将 `call.input` 和最多 4000 字符的工具输出写入用户可读 SSE 事件。输入可能含密钥、内部 URL、业务参数，输出可能含内部数据。

本轮用户 SSE 仅返回工具名、参数键名、状态和耗时，完整 input/output 仍只写入 `ToolCallAudit`。后台读取仍需按任务所有者和管理员权限继续核验。

## 5. P2 可排期重构

### 5.1 ChatGenerationRunner

`server/src/generations/runners/chat-generation.runner.ts` 当前约 953 行，仍同时承担 Provider 请求、联网搜索、工具规划/执行、SSE 写入、Token 结算和图片提示词反推。建议后续拆为 provider client、search context、tool executor、settlement service；保持 `GenerationRunner` 接口和现有 UI 不变。

### 5.2 Provider 管理门面

`server/src/providers/providers.service.ts` 当前约 1551 行。路由、凭据、健康、价格和管理 CRUD 仍集中在一个 service。建议拆为 catalog、routing、health、credential、admin facade 五个服务，先保持 API 返回结构兼容。

### 5.3 画布页面

`src/views/CanvasEditorPage.vue` 当前约 1874 行。节点操作、历史、视口、媒体节点、图片工具、分镜、Agent 和侧栏状态仍集中。建议按 composable/功能组件拆分，不改变当前画布布局和交互入口。

### 5.4 管理端页面

以下页面状态和表单逻辑偏多，应逐步抽取统一的表格、筛选、分页、抽屉和表单 schema：

- `admin/src/views/xinyue/operations/index.vue`（约 1155 行）
- `admin/src/views/xinyue/settings/index.vue`（约 1111 行）
- `admin/src/views/xinyue/providers/index.vue`（约 997 行）
- `admin/src/views/xinyue/commerce/index.vue`（约 827 行）
- `admin/src/views/xinyue/models/index.vue`（约 891 行）

这是可维护性问题，不是当前功能阻断问题。重构时应继续使用现有后台路由和权限资源，不引入第二套 UI 规范。

## 6. 当前确认完成项

- GenerationJob 已关联 requestId、traceId、ProviderAttempt、GenerationEvent。
- SSE 已支持结构化 `text_delta`、`thinking_delta`、`usage`、`tool_call`、`tool_result`、`tool_loop` 事件及 cursor/Last-Event-ID 续传。
- ChatContextService 已按活动分支和动态预算裁剪上下文。
- Conversation/Message 已支持 `activeLeafId`、`parentId`、`branchIndex` 和分支激活。
- ToolLoopRunner 已限制最大轮数、单轮调用数、总调用数和总时长。
- Agent planner 的 Token usage 已合并到最终聊天结算。
- TokenPricing/UsageNormalizer/TokenUsageLedger/UserTokenQuota 已接入，BigInt 在 `server/src/main.ts` 统一序列化为字符串；多 scope 结算已通过 `settleMany()` 放入同一 Serializable 事务。
- 生成失败、取消、重试路径已有创作点退款和 quota release 的幂等键。
- 前端、管理端和 API 构建脚本均可执行；UI 操作审计通过。

## 7. 历史兼容代码与文档

本轮已删除旧阶段性审计/规划文档，仅保留部署、运行协议和最新最终审计报告；未根据文件长度删除业务代码。当前最终报告是唯一有效的审计基线。

没有发现需要恢复旧 API/旧 UI 的必要兼容层。后续删除兼容代码前必须先确认线上仍无调用方，并通过迁移/日志证据证明可安全移除。

## 8. 数据库与迁移审查

- 当前 Prisma migrations 目录共 105 条迁移，`20260828100000_token_billing_v1` 和 `20260828120000_message_branch_tree` 已应用到本地数据库。
- 分支迁移先为历史线性消息回填 `parentId`，再设置 `activeLeafId`，逻辑与现有数据模型一致。
- Token ledger/event 使用唯一 `idempotencyKey` 和必要索引，quota 使用 `version` 做乐观并发控制。
- Prisma 没有自动 down migration；生产部署必须继续执行现有备份脚本，并在发布记录中保存迁移前备份和恢复步骤。不要把“回滚”理解为直接删除已执行迁移。

## 9. 认证与权限审查

- `AuthGuard` 只接受有效、未撤销、未过期且 ACTIVE 用户会话。
- 所有当前 `@Controller('admin')` 类均使用 `@UseGuards(AuthGuard, AdminGuard)`；后台权限由 `permissionForAdminRequest()` 按资源和读写方法映射。
- 管理员登录 401 的代码含义是统一错误文案，不足以证明密码错误。`loginAdmin()` 还要求邮箱对应用户同时满足：`passwordHash` 存在、角色为 `ADMIN/SUPER_ADMIN`、状态为 `ACTIVE`。排查时应先核对这三个数据库条件，再核对密码哈希。
- 未发现本轮新增的认证绕过路径。生产环境仍需确认 `COOKIE_SECURE`、`WEB_ORIGIN`、反向代理信任配置和密钥已设置。

## 10. Token 计费审查

PricingResolver 已输出 `resolverVersion` 和价格快照，UsageNormalizer 支持 OpenAI-compatible、Anthropic、Gemini 和 tokenizer fallback；缓存/推理 Token 在 V1 记录但不重复计费。

仍需补强：

- `TokenUsageLedgerService.record()` 支持 `providerRequestId/providerAttemptId` 字段，但当前 ChatGenerationRunner 写入 ledger 时没有传入这两个值，导致后台无法直接按上游请求关联账单。
- `reserve/settle/release` 有唯一键和 Serializable 重试，多 scope 结算已改为批量原子事务；仍缺少真实 Prisma 并发、重复 settle、部分 scope 失败和进程崩溃恢复测试。
- 目前测试覆盖 resolver 和 normalizer 的纯函数，未覆盖真实 Prisma 并发、重复 settle、部分 scope 失败和进程崩溃恢复。

## 11. 聊天、SSE 与工具循环

聊天主链路已具备 Provider failover、流式事件持久化、上下文预算和工具规划 usage 合并；聊天工具循环已接入 AbortSignal，用户事件已与完整审计数据分离。仍需对 Agent 任务调度链路接入取消信号。对 SSE 断线恢复的真实浏览器网络中断场景仍应做一次 E2E 验证。

## 12. 画布和媒体任务

画布当前布局和主流程保持稳定，分支消息附件、图片提示词反推、图片/视频生成任务均复用 GenerationJob 和任务中心。现阶段不建议为了拆分代码而改变画布布局；后续只做内部组件/composable 拆分和大型文档化状态的收敛。

## 13. 后台审查

后台路由、权限资源和主要运营模块已经统一到 Xinyue 资源目录。主要遗留是页面过长、表单请求逻辑混合、局部样式和字体 token 仍需治理。建议以“统一数据表/筛选器/编辑抽屉/确认弹窗”作为共享组件边界，逐页迁移，不做一次性重写。

## 14. 验证结果

- `npm run test:unit`：55 passed，0 failed。
- `npm run build`：通过。
- `npm run server:build`：通过。
- `npm run admin:build`：通过。
- `npm run audit:ui-actions`：检查 88 个 Vue 页面/组件，无无行为按钮或链接。
- `npx prisma validate --schema prisma/schema.prisma`：通过。
- `npx prisma migrate deploy`：通过，最新分支迁移已应用。
- `git diff --check`：通过；仅有 Windows 工作区换行转换提示。
- `GET http://localhost:3100/v1/health`：HTTP 200，返回 `{"ok":true,"service":"flux-studio-api"}`。
- `GET http://localhost:5173`：HTTP 200。
- CI 已存在 `.github/workflows/build.yml`，覆盖依赖安装、Prisma 校验、UI 审计、单测、三端构建和 patch whitespace 检查。

## 15. 仍需真实环境验证

1. 使用非超级管理员账号逐项验证后台资源权限，尤其是未知路径默认 `admin.access` 的行为。
2. 在真实 Redis/PostgreSQL 并发下验证双 quota reserve/settle/release 和进程中断恢复。
3. 使用可控的自定义工具 Endpoint 验证公网、IPv4/IPv6、DNS 变更和重定向拦截。
4. 在浏览器 DevTools 模拟 SSE 断网、重复 Last-Event-ID、页面刷新后任务恢复。
5. 使用真实 Sub2API/New API/Anthropic/Gemini 返回 usage 缺失、分段 usage 和错误响应，核对 ledger、quota event、ProviderAttempt 三者一致。
6. 验证生产 Cookie、CORS、反向代理和 HTTPS 配置，避免本地默认值被带入生产。

## 16. 最终收工判断

本轮审计可以收工，当前版本适合作为下一次开发的基线，但不能把它标记为“所有商业化风险已清零”。上线前优先级应固定为：

1. 为 Agent 任务调度链路接入真正的取消信号，并补并发/崩溃测试。
2. 补齐 Provider request/attempt 与 TokenUsageLedger 的关联字段。
3. 再安排 ChatGenerationRunner、Provider service、画布和后台页面的渐进式拆分。

除上述事项外，不建议继续扩大本阶段功能范围，也不建议再删除保留的部署/运行文档或大面积重写 UI。当前主流程和布局应保持不变，以可验证的小步重构完成收尾。
