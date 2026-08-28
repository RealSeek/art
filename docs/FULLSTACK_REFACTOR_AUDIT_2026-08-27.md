# Xinyue AI 全栈优化完成审计

更新时间：2026-08-27

## 1. 结论

本轮已经按“保留产品、替换内部结构”的原则完成一轮前台、后台和服务端重构，不重做现有 UI 布局、路由和主要工作流。

- 用户端聊天、图片/视频创作、项目、文件、知识库、支付和无限画布原有流程保留。
- 无限画布继续使用原全屏布局，只拆分历史、键盘、持久化、生成监控和生成参数职责。
- 后台继续使用 Element Plus 与 Art Design Pro，统一页面度量、菜单分组、搜索和业务页面样式，不更换 UI 框架。
- Token 用量现在区分输入、输出、缓存输入和推理 Token，并进入价格快照、结算、毛利统计和对账。
- 已确认的旧版本存储迁移、升级模拟、旧提示词传输、旧画布 CSS 类和 deprecated API 已直接删除，不保留永久双读。
- 生产构建、36 条单元测试、37 条 E2E、Prisma 校验和 87 个 Vue 页面/组件操作审计均通过。

本轮不是推倒重写。仍然偏大的核心文件已经在第 8 节列为后续容量治理，不影响当前发布验证。

## 2. 不变量

| 项目 | 本轮处理 |
| --- | --- |
| 用户端布局和导航 | 保留 |
| 后台现有 URL 和权限资源 key | 保留 |
| 无限画布布局和节点交互模型 | 保留 |
| OpenAI-compatible、Anthropic、Gemini 协议 | 保留，属于当前产品能力 |
| BYOK、平台渠道、故障切换和路由优先级 | 保留并补测试 |
| 旧版本 localStorage、多版本扫描和升级弹窗 | 删除 |
| 旧 CSS 类、旧提示词 key、旧纯文本传输 | 删除 |
| 数据库生产迁移 | 只生成并校验迁移文件，未代替运维执行 |

## 3. 用户端完成项

### 3.1 聊天与思考/回复状态

- `ChatHome.vue`、`ChatComposer.vue`、`ChatThread.vue`、`ChatMessageItem.vue` 从 Studio 巨页中接管聊天显示和输入职责。
- `useChatSubmission.ts` 负责提交、图片/视频意图、草稿恢复和失败状态。
- `useChatConversationLifecycle.ts`、`useChatMessageNavigator.ts` 负责会话生命周期和消息定位。
- `chat-response-state.ts` 统一检索、思考、回答、完成和失败阶段，避免旧消息被误判为流式消息。
- `chat-response-parser.ts` 统一解析 OpenAI、Anthropic 与 Gemini 的正文、推理和流式增量。

用途：后续调整“思考中”“联网中”“回答中”时，不再同时修改 Studio 页面、消息组件和提交逻辑。

### 3.2 工作区壳与设置

- 新增 `ShellHeader.vue`、`ShellSidebar.vue`、`SettingsDialog.vue` 和 12 个设置 Section。
- 团队逻辑移到 `useTeamManagement.ts`，知识库逻辑移到 `useKnowledgeBases.ts`。
- API 密钥、私有模型、升级和支付弹窗分别拥有独立组件。
- `WorkspaceShell.vue` 从约 1,434 行降到 1,229 行，仍负责壳层编排，不再承载全部设置模板。

用途：账户、团队、知识库、会员和支付可以独立迭代，不再给主壳继续增加条件分支。

### 3.3 图片/视频创作与项目

- `CreationPanel.vue` 统一图片、视频和商品创作参数表面。
- `ProjectsPanel.vue`、`ProjectDetailDialog.vue` 接管项目列表和详情。
- Studio 的模型目录、文件上传和项目工作区分别移到 `useStudioModelCatalog.ts`、`useStudioFileUpload.ts`、`useStudioProjectWorkspace.ts`。
- `StudioPage.vue` 从约 1,239 行降到 1,019 行。

用途：创作参数、文件上传和项目工作流不再共享一个页面级状态块。

### 3.4 无限画布

- 新增 `useCanvasHistory.ts`、`useCanvasKeyboard.ts`、`useCanvasPersistence.ts`、`useCanvasGenerationMonitor.ts`、`useCanvasGenerationOptions.ts`。
- 模型选择、上下游提示词合并、图片/视频能力校验、规格和费用计算已移出页面。
- Vue Flow 改用当前 `useVueFlow(id)` API，删除无效 `selectionKeyCode` prop，并在画布挂载后恢复视口。
- 窄屏保留工具 dock 与导航 dock，Agent 工作区转为纵向排列，不重做原布局。
- `canvas.css` 变成 7 行入口，实际样式按 `foundation/shell/agent/dock/polish` 分文件所有权。

用途：节点编辑、媒体生成、自动保存和 Agent 互不污染，同时保留现有画布工作方式。

### 3.5 图片提示词反推

- 入口位于工作空间“画布”之后，不占用画布编辑器布局。
- 前台提供上传、提取、失败、重试和结构化提示词传输状态。
- 后台可设置开关、视觉模型和费用承担方（用户创作点或平台）。
- 服务端使用现有视觉模型与生成计费链路，不要求本地显卡。

用途：把图片理解转换成可继续用于图片创作的提示词，同时由管理员控制成本归属。

### 3.6 样式所有权

- 新增全局 `tokens.css`，收敛用户端色彩、间距、圆角和层级。
- `workspace.css` 从约 4,940 行降为 6 行入口，样式按 `foundation/shell/chat/settings/auth/surface` 拆分。
- `canvas.css` 从约 1,744 行降为 7 行入口。
- 删除后置 legacy selector 块，不再通过旧类名维持布局。

## 4. 管理端完成项

### 4.1 信息架构与查找

- 保留原 URL 和资源 key，菜单改为稳定业务域：客户与权益、模型与生成、内容与插件、AI 能力、工作空间与数据、商业化、运营与安全、业务系统配置。
- “运营与安全”增加“用户触达”“内容安全与客服”“监控与审计”段落。
- 全局搜索支持 BYOK、生成记录、插件等业务别名，并显示所属功能域。
- 390px 下菜单、搜索弹窗和业务页面无页面级横向溢出。

用途：后台功能不再依赖记忆具体菜单位置，搜索与分组同时提供定位路径。

### 4.2 UI 一致性

- `xinyue.scss` 统一页面标题、描述、卡片、筛选区、表格、分页、空状态、按钮和响应式度量。
- 核心业务页统一使用同一页面背景、标题层级、13px 正文和 12px 辅助信息。
- 设置、模型和联网搜索的样式分别迁移到 `settings.css`、`models.css`、`web-search.css`。
- 默认关闭 Art 模板主题引导气泡，避免首次访问遮挡窄屏内容。
- ECharts 6 使用新的 `outerBounds` 语义，删除 `containLabel` 兼容警告。
- 删除 Art Design Pro 宣传控制台输出。

用途：同一信息层级不再出现多套字号、圆角和卡片规格，窄屏也不会被模板引导层遮挡。

### 4.3 运营页拆分

- `operations/index.vue` 从约 3,462 行降到 1,155 行（已按项目 Prettier 规则展开）。
- 资源定义拆到 `resource-registry.ts`，编辑表单拆到 `resource-editor-registry.ts`。
- 格式化、资源类型和通用编辑行为分别拆到独立模块。
- 工单、审核策略、提示词来源、项目工作流、通用资源编辑和详情各自拥有抽屉组件。
- 页面不再直接导入请求工具，运营接口统一由 `admin/src/api/xinyue/operations.ts` 承担。

用途：30 类资源不再把查询、字段、抽屉和特殊动作全部堆在一个 Vue 文件中。

### 4.4 API 与分页

- 原 997 行 `admin/src/api/xinyue.ts` 已删除，API 按 customers、models、content、commerce、governance、operations、settings、subscriptions、web-search 分域。
- 提示词库改为服务端分页，后台不再请求 `pageSize=5000`。
- 服务端提示词库管理接口单页上限降到 100，运营页使用服务端 `page/pageSize/q/total`。

用途：页面只编排业务状态，接口地址、类型和分页合同由业务 API 模块负责。

### 4.5 存储和模板遗留

- 后台仅使用 `sys-user`、`sys-setting`、`sys-table` 等稳定 key。
- 删除多版本 localStorage 扫描、旧 key 迁移、升级工具和 changelog mock。
- 删除 `storage.ts`、`upgrade.ts`、升级日志 mock 和旧菜单水合迁移钩子。

影响：仅持有旧版本 key 的管理员需要重新登录一次；这是新版本切换，不保留永久兼容读取。

## 5. 服务端完成项

### 5.1 Token 定价、结算与对账

- 生成任务记录输入、输出、缓存输入和推理 Token。
- OpenAI、Anthropic、Gemini 用量统一归一化，流式分片不会互相覆盖。
- 任务创建时保存价格版本与 `pricingSnapshot`，包含输入/输出每百万 Token 售价和成本。
- 聊天先预留最大输出费用，完成后按实际 Token 结算并退回差额；失败和取消退回全部预扣。
- BYOK 与平台渠道继续使用不同费用承担策略，路由排序抽成 `provider-routing.ts` 纯函数。
- 新增 `BillingReconciliationService`，按任务核对个人/团队账本、缺失扣款和退款异常。
- 管理端成本与毛利统计同时返回 Token 细分、收入、上游成本和毛利。

用途：聊天不再只有“创作点单价”，可以按真实 Token 和价格版本追踪收入、成本与退款。

### 5.2 Provider 与聊天主页

- 默认聊天主页、快捷能力配置和 URL 校验移到 `chat-home-content.ts`。
- Provider 来源、BYOK 费用、私有路由和平台路由排序移到 `provider-routing.ts`。
- 删除按旧轮播标题强制改写内容的运行时迁移。
- OpenAI-compatible、Anthropic、Gemini、故障切换和环境变量渠道属于现有产品能力，继续保留。

用途：管理配置和请求期路由开始解耦，核心排序可直接单测。

### 5.3 管理概览、项目和生成协议

- `AdminOverviewService` 接管后台概览聚合。
- 管理项目 Controller 从用户项目 Controller 中拆出，公共合同放入 `project-contracts.ts`。
- `projects.controller.ts` 从约 826 行降到 453 行。
- 聊天响应解析和用量解析分别移到 `chat-response-parser.ts`、`chat-usage.ts`。
- `generations.processor.ts` 从约 1,344 行降到 1,180 行。

用途：管理员接口、用户接口、协议解析和任务结算拥有更明确的修改边界。

### 5.4 数据库与查询

- `CreditLedger(referenceType, referenceId)` 和 `TeamCreditLedger(referenceType, referenceId)` 增加联合索引。
- 删除已停用的管理员 MFA 字段和 ConnectorCredential 运行时表。
- 图片反推配置进入 `SystemSetting`。
- 生成任务增加缓存输入和推理 Token 字段。

用途：对账不再依赖无索引引用查询，Schema 与当前启用能力一致。

## 6. 已删除的旧实现

| 旧实现 | 新版本行为 |
| --- | --- |
| `xinyue:pending-image-prompt` | 只读当前结构化提示词传输格式 |
| 纯文本提示词回填 | 删除 |
| `canvas-tool-rail`、`canvas-bottom-bar` | 只使用正式 dock 类 |
| `batchUpdateColumns` deprecated 接口 | 删除 |
| 后台多版本 storage key 扫描 | 只使用稳定 `sys-*` key |
| 后台升级 changelog mock | 删除 |
| 旧菜单布局水合迁移 | 删除 |
| 旧轮播标题运行时改写 | 删除 |
| 管理员 MFA 半成品 | Schema、服务和迁移删除 |
| ConnectorCredential 未启用运行时 | Schema、服务和迁移删除 |

“兼容接口”一词仍会出现在 OpenAI-compatible、支付网关和移动端样式中，这些是当前产品协议或跨设备能力，不是旧版本双读。

## 7. 当前文件规模

| 文件 | 旧规模 | 当前规模 | 状态 |
| --- | ---: | ---: | --- |
| `src/styles/workspace.css` | 4,940 | 6 | 已变为分层入口 |
| `src/styles/canvas.css` | 1,744 | 7 | 已变为分层入口 |
| `admin/.../operations/index.vue` | 3,462 | 1,155 | 抽屉、registry、API 已拆，仍可继续瘦身 |
| `src/views/CanvasEditorPage.vue` | 1,994 | 1,739 | 核心 composable 已拆，节点/Agent/短剧仍偏大 |
| `src/components/WorkspaceShell.vue` | 1,434 | 1,229 | 设置组件和团队/知识库已拆 |
| `src/views/StudioPage.vue` | 1,239 | 1,019 | 聊天、创作、项目和 composable 已拆 |
| `admin/.../settings/index.vue` | 1,406 | 1,111 | 样式和账户卡片已拆，压缩模板已格式化 |
| `admin/.../models/index.vue` | 1,104 | 891 | 样式和 API 已拆 |
| `admin/.../web-search/index.vue` | 658 | 571 | 样式和 API 已拆 |
| `server/src/providers/providers.service.ts` | 1,610 | 1,467 | 路由与主页配置已拆 |
| `server/src/generations/generations.processor.ts` | 1,344 | 1,180 | 解析和用量已拆 |
| `server/src/projects/projects.controller.ts` | 826 | 453 | 管理 Controller 已拆 |

## 8. 验收结果

| 检查 | 结果 |
| --- | --- |
| 用户端 TypeScript | 通过 |
| 管理端 TypeScript | 通过 |
| 管理端 ESLint | 通过，0 error / 0 warning |
| 用户端生产构建 | 通过 |
| 管理端生产构建 | 通过，2,851 个模块 |
| 服务端生产构建 | 通过 |
| 单元测试 | 36/36 通过 |
| 完整 E2E | 38/38 通过 |
| Vue 操作审计 | 87 个页面/组件通过 |
| Prisma schema | `prisma validate` 通过 |
| `git diff --check` | 无空白错误，仅 Windows LF/CRLF 提示 |
| 画布浏览器控制台 | 0 error / 0 warning |
| 后台浏览器控制台 | 0 error / 0 warning |

E2E 覆盖聊天快捷能力、模型选择、图片/视频任务、支付、项目、文件、知识库、画布保存/恢复、短剧、Agent、上传、后台业务路由、全局搜索和窄屏溢出。

## 9. 浏览器截图审计

截图位于 `output/playwright/`：

- `user-chat-desktop.png`
- `user-chat-mobile.png`
- `canvas-desktop.png`
- `canvas-mobile.png`
- `admin-dashboard-desktop.png`
- `admin-operations-desktop.png`
- `admin-operations-mobile.png`
- `admin-settings-desktop.png`
- `admin-settings-mobile.png`

实测结果：

- 用户聊天桌面和 390px 窄屏没有页面级横向溢出。
- 画布桌面加载 7 个真实节点，缩放恢复为 76%，工具 dock、导航 dock 和 Agent 面板可见。
- 画布 390px 下保留 7 个节点并转为纵向 Agent 工作区，页面无横向滚动。
- 后台运营页和设置页在 1440px 与 390px 下无页面级横向溢出；表格在自身容器内处理二维内容。
- 未发现标题、按钮、表单和后续内容互相遮挡。

## 10. 上线前必须执行

以下迁移文件已创建并通过 Prisma 校验，但本轮没有对生产数据库执行 `prisma migrate deploy`：

1. `20260824100000_remove_admin_mfa`
2. `20260824120000_remove_connector_runtime`
3. `20260826120000_image_prompt_extraction`
4. `20260827100000_generation_usage_breakdown`
5. `20260827120000_add_ledger_reference_indexes`

上线顺序：

1. 备份生产数据库。
2. 在维护窗口执行 `npx prisma migrate deploy`。
3. 启动服务端并检查 `/v1/health`。
4. 登录后台确认模型价格、图片反推费用承担方和订阅配置。
5. 执行一条平台聊天和一条 BYOK 聊天，核对 Token、创作点、收入和成本。
6. 通知旧后台 storage key 用户重新登录。

## 11. 剩余风险与下一阶段

这些不是本轮回归阻塞项，但应作为下一阶段的容量治理：

1. 用户数据导出仍是同步全量读取。数据量扩大前应改为后台导出任务、游标分页和对象存储下载。
2. `providers.service.ts`、`generations.processor.ts`、`prompt-library.service.ts` 仍超过 1,000 行，应继续按管理命令、运行时解析、来源适配和结算拆分。
3. `CanvasEditorPage.vue` 仍应继续拆节点工厂、Agent 和短剧域，但不改变画布布局。
4. `operations/index.vue` 与两个 registry 仍偏大，应按内容、商业、Agent、运营资源分目录。
5. 管理端 `types.ts` 和 `locales/xinyue.ts` 仍是聚合文件，应按业务 API 模块拆分。
6. 管理端最大生产包仍超过 1 MB，应按路由检查 ECharts、编辑器和大资源 registry 的懒加载边界。
7. 账本联合索引上线后需要用生产量级 `EXPLAIN ANALYZE` 验证对账查询。

下一阶段不应再做全局 UI 重写。优先顺序应是：异步数据导出、Provider/Generation 继续拆分、后台类型与 locale 分域、生产查询计划验证。
