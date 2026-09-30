# Changelog

本文件记录 OnlyArt 的重要发布变化。

## 未发布

### 新增

- 上游模型自动同步：用户接入密钥与平台渠道按可配间隔重新读取上游 `/models`，新增模型自动上架、下线模型自动移除（渠道侧停用预设并保留定价版本）。
- 自动同步配置位于管理端“设置 → 站点与功能 → 模型自动同步”，单个渠道可在渠道编辑中单独关闭。
- 用户端模型目录自动刷新：可见标签页按分钟轮询，窗口重新聚焦或标签页切回时立即补刷；打开选择模型时仍会强制拉取一次。
- 用户端“设置 → API 与模型”显示上次同步时间，支持逐密钥关闭自动同步或点击“立即同步模型”。
- 用户手动删除的模型会被记录，不会被自动同步重新加回；上游回归的模型自动恢复上架。

### 数据库

- 新增迁移 `20260907170000_model_auto_sync`：`ProviderChannel` 与 `UserApiCredential` 增加 `autoSyncModels`、`lastModelSyncAt`，`UserApiCredential` 增加 `suppressedModels`，`SystemSetting` 增加 4 项自动同步配置。

## 1.0.1

首个公开版本后的 Release Candidate 稳定性更新。

### 新增

- 用户工作区、多模型对话、流式响应、会话历史与文件能力。
- 无限画布、图片、视频、商品视觉和异步生成任务。
- 用户、权限、Provider、模型、价格、额度、订单和系统配置管理后台。
- OpenAI Compatible、Anthropic、Gemini 与本地 Worker 接入能力。
- PostgreSQL、Redis、BullMQ、Docker Compose 和首次启动初始化向导。

### 稳定性与账务

- 增加额度 Reservation 生命周期、幂等结算和 Ledger 一致性保护。
- 增加 ProviderAttempt 审计、模型故障切换和 Worker lease fencing。
- 统一 Chat、Image、Video 等生成任务的失败释放与恢复路径。
- 增加健康检查、就绪检查和启动配置校验。

### 安全

- 管理端 RBAC 改为 fail-closed，并保留 SUPER_ADMIN 完整权限。
- 首次初始化使用一次性安装令牌，不提供固定管理员密码。
- 外部 HTTP 请求增加协议、私网地址和重定向逐跳校验。
- 生产启动拒绝空值、示例值和低强度关键配置。
- 默认关闭未经审查的外部 Prompt 与技能市场同步。

### 验证

- 210 项单元测试、44 项 Playwright E2E 基线及 UI action audit 通过。
- 用户端、管理端、服务端构建通过。
- 116 项 Prisma migration 在全新本地 PostgreSQL 中部署通过。

## 1.0.0

首次公开版本。

- 提供用户工作区、管理后台、统一 API、Provider 路由和生成任务。
- 提供 Token 额度、创作点、账单流水和会员配置能力。
- 提供 PostgreSQL、Redis、BullMQ、Docker Compose 和一键部署支持。
