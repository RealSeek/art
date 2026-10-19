# 视频原生协议接入

核对日期：2026-10-19。Art 按模型调用 NewAPI 的原生插件入口，继续使用用户已有的 OnlyCode / NewAPI 地址与 API Key。NewAPI 的原生路径带插件前缀，与供应商直连路径不同；凭据地址以 `/v1` 结尾时，Art 会去掉末尾 `/v1` 后拼接原生路径，保留已有代理前缀。

| 模型 | 创建 | 查询 | 请求格式 |
| --- | --- | --- | --- |
| Seedance 2.0 / 2.5 | `/doubao/api/v3/contents/generations/tasks` | 同路径加 `/{id}` | 火山 `content`、`duration`、`resolution`、`ratio` |
| Wan | `/ali/api/v1/services/aigc/video-generation/video-synthesis` | `/ali/api/v1/tasks/{id}` | 百炼 `input` 与 `parameters` |
| Wan 首尾帧 / 语音驱动 | `/ali/api/v1/services/aigc/image2video/video-synthesis` | `/ali/api/v1/tasks/{id}` | 百炼 `input` 与 `parameters` |
| MiniMax-H3 | `/hailuo/v2/video_generation` | `/hailuo/v2/query/video_generation/{id}` | MiniMax `content`、`duration`、`resolution: 768P`、`ratio` |
| 可灵当前插件声明的模型 | `/kling/v1/videos/text2video` 或 `/image2video` | 对应创建路径加 `/{id}` | `model_name`、`prompt`、`duration`、`aspect_ratio`、`image` |

MiniMax H3 需要同时更新 new-api 的 Hailuo 插件至 1.4.0，并把模型绑定到 Hailuo / 任务插件渠道。原生入口不会把供应商任务交给原来的 RS Gateway 通用视频渠道。可灵当前 new-api 插件只声明 `kling-v1`、`kling-v1-6`、`kling-v2-master` 的文生与图生入口；不把文档中的 Omni 视频能力当作已实现能力。特惠 `[c]` 模型、其他未声明原生入口的模型和非 NewAPI 渠道继续使用各自原有配置。

已有 NewAPI 视频模型在目录读取和渠道解析时直接应用对应路径，无需用户删除后重新导入；自动同步也保存新配置。已有售价不因协议切换而改写。特惠 Seedance 的 720p 限制继续生效。

Seedance 保留多图、参考视频/音频、首尾帧、固定/自动时长以及版本支持的高级选项。Wan 按版本选择：旧文生视频发送像素 `size`，图生视频发送 `img_url`，首尾帧发送 `first_frame_url` / `last_frame_url`，Wan 2.7 / 3.0 发送各自 `media` 类型。模型不支持的素材组合与时长会被拒绝。

需要公开 URL 的模型会在任务期间临时托管本机素材；内联图片、视频和音频不写入任务记录或生成文件元数据。成功后 Art 读取原生结果中的成片地址，并保存到自己的文件库。Wan 使用 `output.task_id` 轮询，不能把 `request_id` 当任务号；MiniMax 读取 `task.status` 和 `task.content.url`，可灵读取 `data.task_status` 和 `data.task_result.videos`。

创建超时、5xx、缺少任务编号等结果不明的情况进入对账流程，不自动重建任务。查询临时错误继续查询原任务；明确失败立即停止。历史已创建任务保留原任务号，不重新提交付费任务。

参考资料（协议字段参考，实际 NewAPI 路径以插件声明为准）：[火山方舟](https://qiandream.com/docs/volcengine-ark/doc0023)、[阿里百炼](https://qiandream.com/docs/ali-kling/doc0026)、[可灵](https://qiandream.com/docs/ali-kling/doc0027)、[MiniMax](https://qiandream.com/docs/ali-kling/doc0028)。

验证使用本地 HTTP 模拟与隔离的浏览器接口：覆盖各协议创建、原任务查询、临时查询错误重试、下载保存、参数与任务号解析。未使用真实密钥执行付费生成。
