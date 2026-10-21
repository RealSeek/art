# 视频协议核对

核对日期：2026-10-21。资料来自供应商公开文档、官方文档，以及部署中的端点声明和已有请求记录。接口声明、只读任务查询和真实视频生成是不同证据；本次没有提交付费生成任务。

## 统一接口实现

ART 与 New API 网关渠道统一使用 OpenAI 视频入口及 `prompt/seconds` 等字段，供应商适配由网关执行。New API 在渠道视频能力中发布 `request_protocol: openai_video`，ART 刷新目录后保存 `requestProtocol`；其他原生插件和直连不受这个标记替代。网关调用不再在 ART 组装 `content[]` 或改写供应商引用标记。

统一扩展包含 `resolution/aspect_ratio`、有序 `images[{url,role}]/videos/audios`，以及模型支持的音频、水印、尾帧、输出格式和编辑参数。网关分别为 MAI 日期模型、HHCoding 特惠 MiniMax、WhatsToken NSFW 和 DMC MiniMax 配置明确的请求与异步任务协议，完整处理创建、查询和内容下载。MAI 简写名仍是本项目别名，不因此接入 MAI 简化模型。

自动时长保留 `seconds: -1`，支持的模型按允许上限预留、按实际用量结算。创建结果不明时禁止在 ART 或网关自动重建任务。部署必须一起发布 New API 插件、网关协议及供应商配置，处理同一模型重复的原生渠道，并刷新 ART 目录；仅更新 ART 不会使上游协议自动完成切换。

## Seedance

同一供应商、同一品牌可以提供不同请求格式，必须同时核对模型 ID 和接口文档。

| 服务 / 模型 | 创建、查询 | 请求与结果 |
| --- | --- | --- |
| MAI `seedance-2.0` / `seedance-2.5` | `POST /v1/videos`；`GET /v1/videos/{id}` | `prompt`、`aspect_ratio`、`mode`、`reference_*_urls`；成功为 `completed` |
| MAI `doubao-seedance-2-0-260128` / `doubao-seedance-2-5-260628` | 文档同样声明 `/v1/videos` | 原生形态 `content`、`ratio`、素材 `role`；成功为 `completed`，成片在 `metadata.url` |
| 火山官方 Seedance | `POST /api/v3/contents/generations/tasks`；查询追加 `/{id}` | 原生 `content`、`ratio`；成功为 `succeeded`，成片在 `content.video_url` |

MAI 简化模型 2.5 的时长为整数 4–30 秒，自动为 `-1`；视频编辑使用 `mode: videoEdit2video`、`duration: 0` 和 `aspect_ratio: adaptive`。首尾帧使用 `frames2video` 及按顺序排列的图片 URL。它不接受把 `content[]` 当成这套简化协议，也不能用 `image2video` 替代 2.5 的模式。

火山原生 2.5 通过 `first_frame` / `last_frame` 表示帧，通过 `reference_image` / `reference_video` / `reference_audio` 表示参考素材。帧模式、编辑和延长使用 `ratio: adaptive`；编辑使用 `omni_reference_task_type: edit` 和 `duration: -1`。不能照搬 MAI 简化模型的 `duration: 0`。

当前 MAI 网关端点声明的是 Ark 原生 generate/get/cancel，凭证模型白名单是两个 `doubao-seedance-*` ID。公开文档证明了原生参数形态，但没有证明该供应商另行支持火山的 `/api/v3` 地址；已有记录只有失败的只读查询，不能据此宣称整条原生生成链已验收。`seedance-*` 展示别名若走 Ark 原生插件，需由渠道明确映射到对应 `doubao-seedance-*` 模型，不能靠品牌名推断。

MAI 的 `task_id` 与可选的真实上游 `cgt_id` 不可互换。批量生成要读取全部 `outputs` / `output.assets`，不能只取第一条 `video_url`。当前 ART 的原生任务以单次生成的请求与任务生命周期为范围，不宣称支持 MAI 简化协议的多输出功能。

## MiniMax

| 服务 / 模型 | 创建、查询与下载 | 能力边界 |
| --- | --- | --- |
| DMC `MiniMax-H3` | `/v2/video_generation`；`/v2/query/video_generation/{id}`；读取 `task.content.url` | 部署服务约定 768P、整数 1–15 秒、公开 HTTPS 素材 |
| MiniMax 官方 `MiniMax-H3` | 同上 V2 路径 | 整数 4–15 秒，768P / 2K |
| MiniMax 官方 `MiniMax-H3-Max` | 同上 V2 路径 | 整数 5–15 秒，480P / 768P；`extra.prompt_expansion_mode` 控制提示词扩写 |
| MiniMax Hailuo 2.x / 01 系列 | `/v1/video_generation`；`/v1/query/video_generation?task_id=...`；再调用 `/v1/files/retrieve?file_id=...` | V1 的 `prompt_optimizer` 等选项不能直接当成 H3 V2 参数 |
| 特惠 `MiniMaxH3-*` 画质别名 | 按特惠渠道的兼容接口配置 | 不是原生 `MiniMax-H3` 的 768P / 2K 枚举 |

H3 原生参考输入上限为 9 张图片、3 段视频、3 段音频，合计最多 12 个；帧模式与参考模式互斥。纯文本或纯音频须用固定画幅，有图片或视频时才允许 `adaptive`。官方 H3 可单独使用尾帧；Seedance 不据此自动获得同样能力。

官方托管 H3 接受公开 URL、`mm_file://` 和 Data URI；DMC 当前合同要求公开 HTTPS。ART 对 DMC 继续临时托管本机素材，不把官方托管平台更宽的素材支持无条件套到自部署服务。引用序号按各类输入的实际提交顺序从 1 开始。

部署中的 DMC 旧 `/v1/videos` 入口能通过网关适配到 V2，但原生请求走另一条端点选择路径。本次已在部署配置中补上独立的 `minimax.video.generate~v2` 和 `minimax.video.get~v2` 声明。原生同格式转发保留请求体，不能先转成旧视频协议再拼回 V2 字段。

只读验证还发现：直接查询上游任务 ID 时，网关把无请求体的视频查询错误绑定到图片解析器，返回 400；对应解析绑定已修复在代码中，需随网关版本发布。已有 `gwm_` 任务由持久化任务绑定先行接管查询，不经过这个直接查询入口。端点配置已保存不等于创建、轮询和下载全部通过真实供应商验证。

## ART 变更与验证

视频页增加按模型能力显示的紧凑设置菜单，接通素材角色、Seedance 2.5 编辑/延长、音频、水印、返回尾帧、输出格式与公开素材链接。引用列表包含本机及远程素材，并与实际提交顺序一致；修复本机参考视频与音频组合的前端误判。MiniMax 引用标记只转换实际存在的素材，DMC 无视觉素材时拒绝 `adaptive`。

发布隔离工作区验证：三个视频单元测试文件共 26 项通过；用户端 `npm run build`、服务端 `npm run server:build`、`npm run audit:ui-actions`（87 个 Vue 页面/组件）通过；`seedance-video.spec.ts` 浏览器回归 1 项通过，检查了桌面及 390px 手机深浅主题的设置菜单。生成请求使用模拟接口拦截，未执行真实付费生成。

网关新增的原生 MiniMax GET 解析绑定核心回归 1 项通过，使用线上 `80df903` 基线与本次修复的隔离检出验证；不代表其他并行工作区改动已经构建或发布。

## 来源

- [MAI Seedance 2.5](https://api.mai-token.com/docs?category=video&model=seedance-2.5)；[公开原文](https://api.mai-token.com/api/docs/model-documentation?model=seedance-2.5)
- [MAI 原生形态 2.5](https://api.mai-token.com/api/docs/model-documentation?model=doubao-seedance-2-5-260628)
- [火山创建视频任务](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh)；[查询视频任务](https://docs.volcengine.com/docs/ark/get-video-generation-task-api?lang=zh)
- [MiniMax H3 创建](https://platform.minimax.io/docs/api-reference/video-generation-v2-create)；[查询](https://platform.minimax.io/docs/api-reference/video-generation-v2-query)；[视频指南](https://platform.minimax.io/docs/guides/video-generation)
- [MiniMax Hailuo 文生视频](https://platform.minimax.io/docs/api-reference/video-generation-t2v)；[下载文件](https://platform.minimax.io/docs/api-reference/video-generation-download)
- 部署方提供的 DMC 服务合同：项目根目录 `MiniMax接口.md`。该文件明确说明其不代表 MiniMax 官方托管 API。
