# Changelog

本文件记录 Xinyue AI 的重要发布变化。

## Unreleased

- 增加 Docker 一键部署脚本，自动生成生产密钥并初始化管理员。
- 生产启动不再回退到固定管理员密码，必须显式配置管理员凭据。
- 补充开源发布、部署、安全和 Release Candidate 验收文档。
- 清理本地运行日志、构建缓存和用户数据，确保不会进入版本库。

## 1.0.0

- 提供用户工作区、管理后台、统一 API、Provider 路由和生成任务。
- 提供 Token 额度、创作点、账单流水和会员配置能力。
- 提供 PostgreSQL、Redis、BullMQ 和 Docker Compose 部署支持。
