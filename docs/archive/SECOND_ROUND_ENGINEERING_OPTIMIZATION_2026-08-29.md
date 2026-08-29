# Xinyue AI 第二轮工程优化报告

更新时间：2026-08-29
范围：生产级代码整理、渐进式重构、测试补强与运行验证

## 1. 执行结论

本轮没有增加业务功能，没有改变 UI 布局、API 返回契约或数据库业务模型，也没有替换技术栈。重点落在低风险、可回滚的职责边界整理和测试补强。

已完成的代码级改动可以合并进入当前版本；高风险的大型文件拆分保留为后续渐进任务，不以文件行数作为强制拆分标准。

## 2. 优化范围

### 2.1 Chat Runner 计费职责拆分

原文件：`server/src/generations/runners/chat-generation.runner.ts`

新增：`server/src/generations/chat-billing.ts`

拆分内容：

- `ChatBillingOptions` 计费参数类型。
- `parseChatBillingOptions()` 对任务 JSON 做安全解析。
- `calculateChatTokenSettlement()` 统一调用 `PricingResolverService` 计算输入/输出额度和超额创作点。

原因：Chat Runner 同时负责 Provider、SSE、工具循环、搜索和结算。将无副作用的计费解析与计算移出后，减少重复逻辑，并为独立单测提供稳定边界。

保持不变：预扣、实际用量结算、释放/补扣、Ledger 写入、Provider failover、图片提示词反推流程和 API 契约。

### 2.2 Provider 既有边界复核

Provider 定价已经在上一轮抽取到 `provider-pricing.service.ts`；路由和健康逻辑分别位于 `provider-routing.service.ts`、`provider-health.service.ts`。本轮没有继续拆 CRUD/凭据/私有模型部分，因为它们仍共享门面、权限和 Prisma 查询上下文，强行拆分会增加循环依赖和回归风险。

### 2.3 Workspace 与 Canvas

工作区对话菜单动作已在上一轮抽取到 `src/composables/shell/useConversationActions.ts`。画布已有多个专用 composable（持久化、历史、键盘、生成监控、生成选项）。本轮不重写 `CanvasEditorPage.vue`，以保护 Vue Flow 状态、节点交互和现有布局。

## 3. 测试补强

新增：`tests/unit/chat-billing.test.ts`

覆盖：

- `null`、数组和错误 billing 结构不会被当作计费配置。
- 输入/输出单价经共享 PricingResolver 结算。
- 超额创作点按配置倍率计算。

全量单元测试由上一轮的 69 个增加到 `71/71`，全部通过。

## 4. 大文件处理决策

当前仍较大的文件包括：

| 文件 | 处理决定 |
| --- | --- |
| `server/src/providers/providers.service.ts` | 保留门面，定价/路由/健康已分边界，CRUD 与凭据暂不强拆 |
| `server/src/generations/runners/chat-generation.runner.ts` | 已抽取计费计算，Provider/SSE/工具循环按后续契约测试继续拆 |
| `src/views/CanvasEditorPage.vue` | 保留页面布局和 Vue Flow 状态，已有 composable 边界，暂不重写 |
| `admin/src/views/xinyue/settings/index.vue` | 依赖现有分区表单和权限数据，暂不改变后台 UI 结构 |
| `admin/src/views/xinyue/operations/index.vue` | 采用 registry/drawer 边界，暂不改变操作中心交互 |

不以“超过 1000 行”直接删除或拆分代码；每次抽取必须有清晰职责、测试和可验证的行为等价性。

## 5. 历史代码清理

本轮没有发现同时满足以下条件的安全删除候选：无引用、无路由、无接口调用、无数据库依赖、无用户流程依赖。因此没有删除业务代码、组件、Controller 或数据库字段。

构建产物和运行缓存继续由现有忽略规则和清理脚本管理，不进入源码重构范围。

## 6. 性能与稳定性检查

- 计费计算保持 BigInt 额度链路，新增模块只在最终转换边界转为受控 number。
- 计费解析不增加数据库查询或 Provider 请求。
- 现有 Provider 健康冷却、路由排序和 failover 未改变。
- 现有媒体响应上限、外部 URL 策略和 Agent 取消机制未回退。
- UI 操作审计继续通过，未引入死按钮或死链接。

本轮未进行生产规模压测；本地单测和构建不能代替 PostgreSQL/Redis 并发、故障注入和真实 Provider 核账。

## 7. 验证结果

| 检查 | 结果 |
| --- | --- |
| 用户端 `npm run build` | 通过 |
| 管理端 `npm run admin:build` | 通过 |
| 后端 `npm run server:build` | 通过 |
| 单元测试 `npm run test:unit` | `71/71` 通过 |
| UI 操作审计 | 通过，88 个页面/组件 |
| `prisma validate` | 通过 |
| `prisma migrate status` | 111 条迁移，数据库已最新 |
| API 健康检查 | `http://localhost:3100/v1/health` 正常 |
| `git diff --check` | 通过，无 whitespace error |

## 8. 风险与后续顺序

下一轮若继续整理，建议按以下顺序，并且每步配套契约测试：

1. 抽取 Chat Runner 的 usage 归一化适配层，先覆盖 OpenAI-compatible、Anthropic、Gemini。
2. 抽取 Provider 凭据与模型导入服务，保留 `ProvidersService` 兼容门面。
3. 抽取 Workspace/Canvas 的非视觉状态逻辑，不改变模板和 CSS 类名。
4. 对数据库查询执行真实 PostgreSQL/Redis 的 N+1 和并发压测。

不得在这些测试完成前启用 cached token、reasoning token 独立计价，也不得进行一次性核心模块重写。

## 9. 最终判断

第二轮已完成“生产级整理”的低风险部分：核心业务保持稳定，计费职责边界更清晰，测试覆盖得到补强，前后端和数据库验证通过。项目可以继续进入灰度准备；后续重构应以测试驱动的小步迁移为准，不再进行无边界的全面审计或大规模重写。
