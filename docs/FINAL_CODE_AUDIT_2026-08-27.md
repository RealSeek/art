# Xinyue AI 最终代码审计

更新时间：2026-08-27  
审计范围：用户端、无限画布、管理端、NestJS 服务端、Prisma、BullMQ、测试、脚本和部署文档

## 1. 审计结论

当前版本已达到“代码层面可收工”的状态。现有 UI 布局、路由和主工作流保持不变；聊天、图片、视频、画布任务、Provider 路由、用量、创作点账务、会员和管理端运维均已有明确边界。

本轮没有发现可以在不改变行为的前提下安全删除的业务文件。已确认的旧实现已经移除：同步账户导出、旧的 Chat/Video Processor 执行副本、旧管理员 MFA 文件、旧连接器运行时和废弃的管理端 API 聚合文件。

## 2. 已完成检查

- Generation Processor 只保留队列编排、租约、状态收口、账务和用量归档。
- Chat、Image、Video 已使用独立 Runner；输出统一由 `GenerationOutputService` 处理。
- Worker 使用 claim、heartbeat、lease expiry 和重启恢复，避免多实例重复执行。
- Provider 路由和健康状态已独立，支持优先级、权重、冷却和失败切换。
- BillingTransaction、UsageRecord、个人/团队创作点账本可按 `generationId` 对账。
- 账户/团队导出已改为 BullMQ 异步任务，数据按游标批量读取，过期文件自动清理。
- Prompt Library 自动刷新已改为 BullMQ scheduler，列表支持 `nextCursor`。
- `/v1/admin/system` 与 `/v1/admin/health/summary` 使用同一健康服务，避免口径漂移。
- 旧同步 `/v1/conversations/export` 已删除，前端已切换到异步导出合同。

## 3. 容量与长文件审查

仍然较长的文件主要是领域聚合或样式资源，不属于无效代码：

| 文件 | 原因 | 当前处理 |
| --- | --- | --- |
| `CanvasEditorPage.vue` | 画布交互、节点命令和媒体工作流集中 | 已抽取 canvas composables，页面保留视图组合职责 |
| `providers.service.ts` | Provider 管理门面和历史管理接口 | 路由、健康已拆出，后续可继续按目录/凭据拆分，但不阻塞当前版本 |
| `prompt-library.service.ts` | 多种公开来源解析器和缓存策略 | 已统一 cursor、缓存和队列刷新，继续拆分会扩大回归面 |
| 管理端 operations/settings 页面 | 运营表单和抽屉较多 | 已抽取 API、类型、资源注册和抽屉组件 |

审计中发现的批量读取已收口：导出任务的会话、项目、资产和生成记录按 200 条游标读取；后台用量报表上限为 10000 条并返回 `truncated` 标记。

## 4. 有意保留的定时器

以下定时器均有明确用途和销毁边界，不应误删：

- 生成 Worker 心跳：任务租约续期。
- 前端任务中心轮询：恢复运行中任务。
- 登录验证码倒计时：界面状态倒计时。
- WebSocket ping/reconnect：连接保活和重连。
- 管理端表格缓存清理：清理过期缓存。

Prompt Library、订阅、商业生命周期和异步导出清理已经使用 BullMQ scheduler，不再依赖服务进程内定时器。

## 5. 发布前必须执行

```text
npm run verify
npm run test:unit
npm run audit:ui-actions
npx prisma validate
npx prisma migrate deploy
```

当前本地验证结果：用户端、服务端、管理端构建通过；48 项单元测试通过；UI 操作审计通过；Prisma schema 有效且数据库迁移已同步。

## 6. 仍需真实环境验证

这些不是代码缺陷，无法由静态构建证明：

1. Redis/BullMQ 重启、重复消费、优雅停机和多实例竞争。
2. OpenAI、Anthropic、Gemini、国内兼容渠道及 BYOK 的真实流式返回和失败切换。
3. 支付 webhook 签名、乱序通知、重放和退款。
4. 大账户导出、Provider 高并发、数据库查询计划和对象存储吞吐。
5. 生产备份恢复、密钥轮换和管理员紧急恢复流程。

## 7. 最终判断

本版本不需要继续拆分或重做 UI。后续工作应从“代码优化”转为“预发布验收和生产演练”。只有真实 Provider、支付、压力和灾备结果出现问题时，才需要针对性修改代码。
