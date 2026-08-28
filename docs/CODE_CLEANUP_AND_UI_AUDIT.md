# 代码清理与 UI 审计记录

更新时间：2026-08-25

## 备份

本次改动前的源码、配置、迁移、文档和脚本已备份到：

`C:\Users\qiantingwl\Desktop\shengt-backup-20260825-014903`

备份不包含依赖目录、构建产物和浏览器测试缓存。

## 已清理

- 删除旧的 Playwright 产物、构建目录、临时修复目录和 TypeScript 增量缓存。
- 删除本轮审计产生的临时调试脚本；可复用的 `audit-ui-actions.mjs`、`ui-audit-all.mjs`、`ui-audit-admin.mjs`、备份/恢复脚本予以保留。
- 构建产物不进入源码提交，使用 `npm run clean` 或 `npm run clean:reports` 后按需重新生成。

## 本轮修复

- 启动时始终通过 HttpOnly 会话 Cookie 与 `/auth/me` 对齐，解决管理端登录后用户工作区误判未登录的问题；没有 Cookie 时 401 静默处理。
- 统一模型选择器移动端布局，修复能力、厂商、模型三列在窄屏下横向溢出。
- 画布 Agent 工作区补充明确的任务目标语义标签和“生成操作计划”操作名，保留计划预览、确认应用和运行状态展示。
- 知识库创建弹窗补回通用 `connector-dialog` 语义类，保持现有样式与自动化定位兼容。

## UI 入口与样式边界

用户端样式按入口加载：

1. `src/styles/tokens.css`：颜色、间距、圆角、阴影和厂商徽标等设计令牌。
2. `src/styles/main.css`：全局基础和公共控件。
3. `src/styles/workspace.css`：工作台壳、聊天和设置区域。
4. `src/styles/landing.css`、`prompt-library.css`、`office.css`、`plugins.css`、`canvas.css`：各业务域样式。

新增样式优先使用令牌和已有组件变体，避免在页面内追加同一视觉角色的独立实现。

## 启动方式

```powershell
npm run dev -- --port 5173
npm --prefix server run start
pnpm --dir admin dev --host 0.0.0.0 --port 4173
```

健康检查：`http://127.0.0.1:3100/v1/health`

## 验证范围

- 用户端：对话、图片、视频、商品视觉、办公、提示词库、能力中心、工作空间、画布。
- 管理端：模型与定价、生成任务、内容与插件、Agent、工作空间、商业化、运营、安全和系统设置路由。
- 响应式宽度：桌面 1440px、平板 768px、移动 390px。
- 关键流程：模型切换、画布 Agent 计划确认、图片/视频任务状态、文件上传、项目和知识库管理。

真实第三方模型、支付、邮件、对象存储和 GPU Worker 仍取决于部署环境中的凭据与服务健康状态；没有密钥时不应把配置失败解释成前端功能失败。

本机本次真实入队检查结果：图片路由返回上游 `grok_media_no_eligible_account`，视频路由返回 `INVALID_API_KEY`；任务状态均正确落为失败并保留可读错误和重试信息，说明队列、重试和错误归一化链路可用，但外部渠道凭据/账号池仍需在部署环境补齐。

## 后续规则

- 临时截图、trace、视频和测试报告统一放在 `test-results/` 或 `output/playwright/`，完成后清理。
- 不提交 `dist/`、`admin/dist/`、`server/dist/`、`.playwright-cli/`、日志和缓存。
- 继续拆分大文件时先保持行为等价，再单独做接口或视觉改动，避免把结构重构和业务回归混在同一变更中。
