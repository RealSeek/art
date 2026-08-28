# Xinyue AI 下一阶段全栈优化审计

> 状态：历史审计记录。实施结果和当前待办以 `FINAL_CODE_AUDIT_2026-08-27.md`、`NEXT_VERSION_SCOPE_AND_EXECUTION_PLAN_2026-08-27.md` 和 `LOCAL_CLEANUP_AND_RESTART_2026-08-28.md` 为准。

> 审计日期：2026-08-27  
> 范围：用户端、管理端、NestJS 服务端、Prisma 数据模型、BullMQ 任务、Python Worker、测试、CI 与部署脚本  
> 原则：保留现有产品布局、路由和核心工作流；下一阶段以稳定性、容量、可维护性和可观测性为主，不再做全局 UI 重写。

## 1. 结论

### 本轮执行状态（2026-08-27）

- 已修复管理端登录 401 的前端错误冒泡：预期的账号/密码错误现在由登录页消费并清空密码，不再冒泡为 `[VueError]`。
- 管理端登录已支持 `remember`：默认持久化 Cookie，取消勾选时使用浏览器会话 Cookie。
- 已新增 `npm --prefix server run admin:reset-password`，用于显式重置管理员密码并撤销该账户现有会话。
- CI 已加入 Prisma Schema 校验、单元测试、管理端 ESLint 和 `git diff --check`。

本轮仍未执行生产数据库迁移，也未改变现有页面布局和路由。

上一轮已经完成必要的旧兼容清理、页面分组、第一阶段组件拆分、Token 计费补全和全量回归。项目现在可以继续迭代，但还没有达到“可长期扩容、可多人并行开发、生产问题容易定位”的状态。

下一阶段建议按以下顺序执行：

1. 修复管理端登录错误流和密码初始化语义。
2. 把测试、Lint、Prisma 校验纳入 CI 强制门禁。
3. 治理同步全量导出、`take: 5000` 和无分页管理接口。
4. 继续拆分 Provider、Generation、Prompt Library 三个服务端核心大模块。
5. 继续拆分画布、工作区外壳和创作页，但保持现有 UI 布局不变。
6. 建立请求链路、任务队列、上游渠道和计费对账的可观测体系。

不建议现在做：重新设计全部页面、改变用户工作流、引入新的前端框架、恢复旧版本兼容层、一次性拆分 Prisma 全部模型。

## 2. 扫描结果

本次静态扫描覆盖约 560 个源文件、101,853 行代码：

| 区域 | 文件数 | 行数 | 超过 500 行 | 超过 1,000 行 |
| --- | ---: | ---: | ---: | ---: |
| 管理端 `admin/src` | 263 | 51,373 | 30 | 4 |
| 服务端 `server/src` | 137 | 19,546 | 5 | 3 |
| 用户端 `src` | 130 | 27,388 | 15 | 6 |
| Worker | 4 | 909 | 0 | 0 |
| 脚本 | 8 | 499 | 0 | 0 |
| 测试 | 18 | 2,138 | 1 | 0 |

当前最需要继续治理的文件：

| 文件 | 行数 | 主要问题 |
| --- | ---: | --- |
| `src/views/CanvasEditorPage.vue` | 1,874 | 画布编排、节点创建、短剧、Agent、媒体、生成和 UI 状态仍集中在一个页面 |
| `server/src/providers/providers.service.ts` | 1,574 | 平台渠道、BYOK、模型路由、健康状态、凭据和用量统计职责过多 |
| `src/components/WorkspaceShell.vue` | 1,277 | 外壳、账户、团队、知识库、设置和多种弹层编排耦合 |
| `server/src/generations/generations.processor.ts` | 1,242 | 聊天、图片、视频、商品图、轮询、落库、计费和退款集中 |
| `server/src/prompt-templates/prompt-library.service.ts` | 1,180 | 来源适配、抓取、缓存、覆盖规则和查询混合 |
| `admin/src/views/xinyue/operations/index.vue` | 1,155 | 通用资源页仍承担过多领域交互 |
| `admin/src/views/xinyue/settings/index.vue` | 1,111 | 系统设置领域过多，表单状态和保存逻辑仍集中 |
| `admin/src/locales/xinyue.ts` | 1,110 | 单文件语言映射难以按业务域维护 |
| `src/views/StudioPage.vue` | 1,060 | 多种创作模式与聊天编排仍共享一个页面控制器 |
| `admin/src/views/xinyue/providers/index.vue` | 997 | 渠道、路由、供应商与健康检查仍集中 |

行数不是单独的缺陷，但这些文件同时具有多个业务职责，修改时容易产生跨区域回归。

## 3. 管理端登录 401 诊断

### 3.1 已确认事实

本地 401 不是代理地址错误：

- `http://localhost:3100/v1/health` 返回 200。
- `http://localhost:5174/v1/health` 返回 200。
- `admin/vite.config.ts` 会把 `/v1` 代理到 `http://localhost:3100`。
- 管理员 `xinyue@xinyue.mom` 在当前数据库中存在。
- 账号角色为 `SUPER_ADMIN`，状态为 `ACTIVE`，并且存在 `scrypt` 密码哈希。
- 当前 `server/.env` 中的 `ADMIN_PASSWORD` 与数据库密码哈希匹配。
- 完整 E2E 使用同一管理员登录链路通过，因此当前后端账号和密码本身有效。

所以浏览器中的这次 401 表示：登录页实际提交的邮箱或密码与当前数据库记录不一致。优先检查浏览器密码管理器是否自动填入旧密码、邮箱是否为另一个地址、输入法或大小写是否改变了内容。

### 3.2 为什么控制台看起来像程序崩溃

涉及文件：

- `admin/src/views/auth/login/index.vue`
- `admin/src/utils/http/index.ts`
- `admin/src/utils/http/error.ts`
- `admin/src/utils/sys/error-handle.ts`

登录接口返回 401 后，Axios 正确转换成了 `HttpError`。登录组件只有 `try/finally`，没有 `catch`，因此这个预期业务错误继续从 Vue 组件事件处理器向上冒泡，最终被全局错误处理器记录为 `[VueError]`。

浏览器 Network 面板中的 `POST ... 401` 无法也不应该伪装成 200，但 `[VueError]`、重复堆栈和“XHR 加载失败”可以通过正确消费业务错误来减少。错误账号不能登录是正常行为，不应被记录成前端运行时故障。

### 3.3 当前登录页还有两个语义问题

1. `rememberPassword` 原先只绑定了复选框，没有发送到服务端，也不改变 Cookie 生命周期；本轮已补齐该语义。
2. `seed-admin.cjs` 默认不会覆盖已存在管理员的密码。修改 `.env` 后如果没有设置 `ADMIN_FORCE_PASSWORD_RESET=true`，数据库仍可能保留旧密码。这容易让运维人员误以为 `.env` 就是当前密码。

当前本地数据库没有发生第二个问题，因为环境变量和数据库哈希已经匹配，但脚本语义仍应改清楚。

### 3.4 推荐修复

优先级：P0，预计 0.5 到 1 天。

- 登录组件捕获 `HttpError`，在表单内或通知中显示一次明确错误，不再冒泡到 Vue 全局错误处理器。
- 登录提交期间禁用重复请求；失败后保留邮箱、清空密码并重新聚焦密码框。
- 增加 Caps Lock 提示，避免常见误输入。
- 已把 `remember` 传到服务端并决定持久化 Cookie 或浏览器会话 Cookie；服务端 Session 的最长有效期仍由 `SESSION_TTL_DAYS` 统一控制。
- 为登录增加成功、错误密码、非管理员、停用账号、限流和 Cookie 持久化测试。
- 新增明确的 `admin:reset-password` 运维命令，避免复用 seed 的隐式开关。

当前若只想确认密码，不需要重置：查看 `server/.env` 的 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`，关闭浏览器自动填充后手动输入。

确实需要重置时，可在维护窗口使用现有机制：

```powershell
$env:ADMIN_FORCE_PASSWORD_RESET='true'
npm --prefix server run admin:seed
Remove-Item Env:ADMIN_FORCE_PASSWORD_RESET
```

执行前应先在 `server/.env` 设置目标密码。生产环境需要在对应容器或部署环境中执行，不能直接照搬本地路径。

验收标准：错误密码只出现一次明确提示，不出现 `[VueError]`；正确密码通过 `5174` 登录；remember 开关能真实改变 Cookie 持久化行为；测试覆盖 401 和 429。

## 4. P0：发布质量门禁

当前 `.github/workflows/build.yml` 只执行 UI action audit 和三端构建，没有执行以下已经存在的检查：

- `npm run test:unit`
- `pnpm --dir admin lint`
- Prisma Schema 校验
- `git diff --check`
- 完整 E2E

建议：

1. 每个 PR 强制执行单元测试、管理端 Lint、三端类型/构建和 Prisma 校验。
2. 为 PostgreSQL 与 Redis 配置 CI service containers，执行核心 API 集成测试。
3. 完整 E2E 可先作为 main 分支或每日定时任务，稳定后再变成 PR 必过项。
4. 对 migration 做空库部署和从上一版本升级两条验证链路。
5. 根目录增加统一 `verify:ci`，本地与 CI 使用同一命令，避免检查标准漂移。

用途：阻止格式、类型、计费、认证和迁移问题进入主分支，而不是依赖发布前人工全量检查。

验收标准：任一测试、Lint、Schema 或构建失败都会阻止合并；CI 不依赖开发机上已经启动的服务。

## 5. P0/P1：数据容量与分页

### 5.1 用户数据导出

`server/src/conversations/conversations.controller.ts` 的导出接口会同步读取用户全部对话及消息、项目和资产元数据，再一次性返回 JSON。用户数据变大后会增加数据库连接占用、Node 内存和请求超时风险。

建议改成：创建导出任务 -> BullMQ 分页读取 -> 生成压缩文件 -> 对象存储 -> 站内通知和限时下载。导出任务需要幂等键、进度、过期清理和审计日志。

### 5.2 提示词库内部全量读取

`server/src/prompt-templates/prompt-library.service.ts` 的社区作品来源仍有 `take: 5000`。前端分页已经完成，但服务端同步缓存仍会一次加载最多 5,000 条作品及关联资源。

建议改成游标增量同步，仅缓存当前需要展示的字段；按 `updatedAt + id` 保存水位，删除记录使用墓碑或定期全量校准。

### 5.3 管理接口

多个管理接口仍使用固定 `take: 100/200/300/500` 或直接 `findMany` 返回全部数据，例如登录会话、审计日志、工具调用、团队、助手、知识库、用户组成员、告警和商品配置。

建议建立统一合同：

```ts
type PageQuery = {
  cursor?: string
  pageSize?: number
  query?: string
  sort?: string
}

type PageResult<T> = {
  items: T[]
  nextCursor: string | null
  total?: number
}
```

高增长表默认使用 cursor pagination；只有管理端明确需要页码和总数时才执行 `count`。前端表格不能再假设“接口返回数组就是全部数据”。

验收标准：用户数据量和后台日志量增长 10 倍时，单请求内存和响应大小仍有明确上限；所有列表端点都声明分页策略。

## 6. P1：服务端核心模块拆分

### 6.1 Provider

将 `providers.service.ts` 拆成以下边界：

- `ProviderCatalogService`：平台渠道、厂商、模型与模板管理。
- `ProviderRoutingService`：平台路由、BYOK 路由、权重和故障转移。
- `ProviderCredentialService`：凭据加密、用户密钥、提示信息和轮换。
- `ProviderHealthService`：健康检查、冷却、成功/失败计数。
- `ProviderUsageService`：Token 和请求量累计。

`ProvidersService` 最终只作为兼容期内的门面；完成调用方迁移后删除门面，不保留长期双实现。

### 6.2 Generation

将 `generations.processor.ts` 拆成：

- `ChatGenerationRunner`
- `ImageGenerationRunner`
- `VideoGenerationRunner`
- `CommerceGenerationRunner`
- `GenerationTransport` 与不同上游适配器
- `GenerationLifecycleService`：状态机、取消、重试、超时
- `GenerationSettlementService`：计费、退款、价格快照、对账引用
- `GenerationOutputService`：资产落库与输出序列化

所有 runner 返回统一结果，不直接各自修改多张账务表。任务重试必须依赖幂等键，不能重复扣费或重复创建资产。

### 6.3 Prompt Library

将 `prompt-library.service.ts` 拆成来源适配器、同步协调器、缓存仓储、覆盖规则和查询服务。每个远程站点适配器单独测试，远程 HTML/JSON 变化时只影响对应适配器。

### 6.4 Controller 与 Service 边界

当前大量 Controller 直接注入 `PrismaService`，部分方法包含完整业务事务和超长单行查询。应逐域迁入 Service，Controller 只负责 DTO、认证上下文和 HTTP 映射。

用途：降低 Provider、生成、后台资源操作之间的隐式耦合，让计费和状态机可以被独立测试。

验收标准：核心业务路径可以在不启动 HTTP 服务的情况下做集成测试；Controller 不直接编排多表事务；单个核心服务不再同时负责五种以上领域职责。

## 7. P1：前端继续拆分，但不改变布局

### 7.1 无限画布

`CanvasEditorPage.vue` 已拆出历史、持久化、键盘和生成监控，但页面仍包含大量命令。下一步按行为拆分：

- `useCanvasNodeCommands`
- `useCanvasSelectionCommands`
- `useCanvasMediaCommands`
- `useCanvasAgentCommands`
- `useShortDramaPipeline`
- `useCanvasImportExport`
- 画布右侧检查器、短剧生产面板、上下文菜单拆为独立组件

页面只负责组合 Vue Flow、面板和命令，不改变当前工具栏、侧栏、画布或底部控制的位置。

### 7.2 工作区与创作页

`WorkspaceShell.vue` 继续拆出账户设置、团队、知识库、通知与额度弹层的控制器；`StudioPage.vue` 将聊天、图片、视频和商品视觉的提交适配层分开，共享展示组件但不共享一大段条件分支。

### 7.3 CSS 和设计令牌

设计令牌已经建立，但用户端仍有约 1,000 处原始 `font-size: Npx` 和大量直接颜色值。不能机械全局替换，应按页面族逐步治理：

1. 先整理聊天、画布、设置三类组件度量。
2. 把重复字号、间距、圆角、边框和状态色映射到 token。
3. 保留图片、模型品牌色、媒体内容和一次性装饰色例外。
4. 每改一个页面族，同时跑桌面、窄屏、浅色、深色和长文本截图。

管理端已有统一 `--xinyue-*` 令牌，但业务页面仍有 93 处原始字号和 37 处十六进制颜色。下一阶段优先消除同类卡片、表格标题、辅助文字和状态提示的重复定义。

### 7.4 管理端领域拆分

- `operations/index.vue` 按审核、通知、支持、告警、审计拆成领域页面或领域容器，保留现有菜单路径。
- `settings/index.vue` 按站点、认证、商业化、邮件、生成、图片反推拆分表单 section 和保存 payload。
- `providers/index.vue` 分离渠道、模型路由、健康状态与凭据 UI。
- `admin/src/api/xinyue/types.ts` 和 `admin/src/locales/xinyue.ts` 按同一领域目录拆分。

用途：保证 UI 看起来不变，但修改某一个业务域时不需要加载和理解整个后台。

## 8. P1/P2：可靠性与可观测性

当前服务端除少量模块外缺少统一结构化日志、请求 ID、任务 ID 关联、指标和错误上报。后台控制台仍有较多模板遗留的 `console.log/warn/error`。

建议建立：

- HTTP request ID，并写入响应头、日志、审计记录和队列任务 data。
- 结构化日志字段：用户、管理员、路由、任务、上游渠道、模型、耗时、状态码、重试次数。
- BullMQ 指标：等待数、运行数、失败数、重试数、最长等待时间。
- Provider 指标：成功率、P50/P95 延迟、429、5xx、冷却次数和成本。
- 计费指标：预扣、结算、退款、未对账任务和负毛利。
- 前端错误上报分级：业务 4xx 不作为运行时异常；脚本错误和未处理 Promise 才进入错误平台。
- 管理端“系统健康”页读取聚合指标，而不是每个页面自己拼状态。

`prompt-library.service.ts` 和 `external-market.service.ts` 使用进程内 `setInterval`。多实例部署时每个实例都会执行同步。应迁移到 BullMQ job scheduler，或增加分布式锁和唯一任务 ID。

验收标准：给定一个失败的生成任务 ID，可以在日志中追到请求、队列、上游响应、计费和退款全链路；扩容到多个 backend 实例不会重复执行定时同步。

## 9. P2：测试体系

当前 36 个单元测试集中在纯函数和新拆出的工具，38 个 E2E 覆盖了主要工作流和管理端登录错误流，但服务端领域服务缺少直接集成测试。

优先补齐：

1. Auth：管理员成功/失败/停用/限流/Session TTL/密码重置。
2. Billing：平台付费、用户 BYOK、团队承担、失败退款、重试幂等、并发结算。
3. Provider routing：权重、优先级、冷却、熔断、私有密钥回退限制。
4. Generation：四类 runner 的状态机、取消、上游超时和重复任务。
5. Payment webhook：签名、重复通知、乱序通知、退款。
6. Migration：空库部署、旧版本升级、回滚前备份验证。
7. 管理端登录错误 UI 与核心表格分页。

建议采用测试金字塔：纯函数单测 -> PostgreSQL/Redis 集成测试 -> 少量真实浏览器工作流。不要把所有业务正确性都压在单线程 E2E 上。

## 10. P2：部署与运维

- 生产启动前自动检查 migration 状态，发布流程中显式执行 `prisma migrate deploy`。
- 为数据库恢复、对象存储恢复和 Redis 丢失分别建立演练文档。
- 迁移与应用发布分两阶段，涉及不可逆字段删除时先做数据验证和备份。
- 为队列增加优雅停机，发布时停止领取新任务并等待在途任务达到安全点。
- 将管理员密码初始化、轮换和紧急恢复从通用 seed 脚本中分离。
- Worker 镜像固定依赖和模型版本；模型下载失败时提供可诊断状态，不在首次业务请求中静默下载。

## 11. 推荐实施顺序

### 第一批：认证与门禁

- 管理端登录错误处理和 remember 语义。
- 管理员密码重置命令与文档。
- CI 加入 unit、lint、Prisma 和 migration 验证。
- 补 Auth 集成测试。

### 第二批：容量治理

- 异步用户数据导出。
- 管理接口统一分页。
- Prompt Library 游标增量同步。
- 对高增长表执行 `EXPLAIN ANALYZE` 并按真实查询补索引。

### 第三批：服务端核心拆分

- Provider 五域拆分。
- Generation runner、生命周期与结算拆分。
- Prompt Library adapter 拆分。
- Controller 业务逻辑迁入 Service。

### 第四批：前端和后台可维护性

- CanvasEditor 命令层拆分。
- WorkspaceShell 和 StudioPage 编排层拆分。
- 后台 operations/settings/providers 领域拆分。
- locale、API types 和 CSS token 按领域收敛。

### 第五批：生产可观测性

- request ID、结构化日志和错误上报。
- 队列、Provider、计费指标。
- 进程内定时器迁入队列调度。
- 备份恢复和多实例发布演练。

## 12. 完成定义

下一阶段不能只以“文件变短”作为完成标准。至少满足：

- 现有 UI 布局和主要工作流保持不变。
- 不恢复已经删除的旧版本兼容代码。
- 登录错误不再产生 Vue 运行时异常噪声。
- CI 自动执行测试、Lint、构建和数据库校验。
- 高增长列表全部有分页或明确上限。
- 导出和长任务不占用单个 HTTP 请求完成全部工作。
- 生成重试不会重复扣费、退款或创建资产。
- 多实例部署不会重复执行定时同步。
- 核心模块拆分后有对应单元或集成测试。
- 每批修改都通过三端构建、Prisma 校验、36+ 单元测试、38+ E2E 和 UI audit。

## 13. 审计边界

本次结论来自当前工作区静态代码、当前本地 PostgreSQL/Redis、运行中的开发服务、健康检查和已有测试。没有连接生产数据库，也没有调用真实付费上游、支付渠道或生产对象存储。因此渠道容量、生产查询计划、真实成本和第三方限流仍需在预发布环境验证。
