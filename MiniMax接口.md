# MiniMax H3 API 说明

> 状态：发给客户的接口说明，已去掉内部实现细节。
> 日期：2026-08-27（Asia/Taipei）。
> 范围：DMC 已发布的 MiniMax H3 接口；正式商业条款与账单以 DMC 控制台为准。
> 服务地址：`https://dmc.cc`，公开模型名 `MiniMax-H3`。

本页描述 DMC 已确定提供的接口和能力范围，不代表 MiniMax 官方托管 API 的全部功能。

创建和查询路径、请求字段、响应结构、任务状态和 `task.content.url` 字段保持不变。成功任务的 `task.content.url` 是公开 HTTPS 直链，不带独立过期签名。服务在视频发布成功后至少 24 小时内不主动删除该结果，但不会在第 24 小时准时让链接失效；实际删除可能更晚。

## 1. 能力概览

DMC MiniMax H3 API 提供异步视频生成。目前公开两个端点：

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/v2/video_generation` | 创建视频生成任务 |
| `GET` | `/v2/query/video_generation/{task_id}` | 查询单个任务状态和结果 |

系统根据 `content[]` 自动识别生成方式：

| `content[]` 输入 | 能力 |
|---|---|
| 文本 | 文生视频 |
| 文本 + 首帧、尾帧或首尾帧 | 关键帧生视频 |
| 文本 + 参考图片、参考视频、参考音频的任意合法组合 | 参考素材视频生成 |
| 文本 + 纯参考音频 | 音频参考视频生成 |

本服务统一输出 `768P`，支持整数 `1–15` 秒。当前不提供 `2K`、提示词增强、视频再生成、质量档位或自定义推理参数。

## 2. 鉴权与快速开始

创建和查询 API 请求使用 Bearer API Key：

```http
Authorization: Bearer <DMC_API_KEY>
Content-Type: application/json
```

建议通过安全的服务端环境变量注入 Key：

```bash
export DMC_API_KEY='替换为你的 DMC API Key'
export DMC_BASE_URL='https://dmc.cc'
```

创建文生视频任务：

```bash
curl -sS -X POST "${DMC_BASE_URL}/v2/video_generation" \
  -H "Authorization: Bearer ${DMC_API_KEY}" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-demo-001' \
  --data-binary @- <<'JSON'
{
  "model": "MiniMax-H3",
  "content": [
    {"type": "text", "text": "A cinematic view of ocean waves at sunset"}
  ],
  "resolution": "768P",
  "duration": 5,
  "ratio": "16:9"
}
JSON
```

创建成功返回：

```json
{"task_id":"{task_id}"}
```

创建成功只表示任务已经被受理，并不表示输入预处理或视频生成已经完成。

## 3. 请求契约

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `model` | string | 是 | 固定为 `MiniMax-H3` |
| `content` | array | 是 | 恰好一个文本项，以及 0–12 个媒体项 |
| `resolution` | string | 是 | 固定为 `768P` |
| `duration` | integer | 是 | 输出名义时长，整数 `1–15` 秒 |
| `ratio` | string | 是 | 固定比例；关键帧或含视觉参考时可使用 `adaptive` |
| `callback_url` | string | 否 | 接收任务状态回调的公网 HTTPS URL |

请求使用严格字段校验。未知字段、字段类型错误、多余 JSON、非法角色或 URL 语法错误返回 HTTP `400`。

### 3.1 文本项

```json
{"type":"text","text":"Describe the video to generate"}
```

- 必须且只能有一个文本项；
- 文本不能为空，最长 7000 个 Unicode 字符；
- 文本项不能携带媒体 URL 或 `role`。

### 3.2 固定画幅

| `ratio` | 输出画布 |
|---|---:|
| `21:9` | `1536×672` |
| `16:9` | `1344×768` |
| `4:3` | `1024×768` |
| `1:1` | `768×768` |
| `3:4` | `768×1024` |
| `9:16` | `768×1344` |

关键帧和含视觉参考的请求既可以使用上表中的固定比例，也可以使用 `adaptive`。固定比例必须原样决定输出画布，服务不能接受后再静默改成 `adaptive`。纯音频请求必须使用固定比例。

## 4. 媒体输入格式与限制

所有媒体必须使用服务端可直接访问的公网 HTTPS URL。不支持 Base64、data URI、`mm_file://`、私网地址、回环地址或云元数据地址。

| 媒体 | `type` | `role` | 格式与编码 | 单文件限制 |
|---|---|---|---|---|
| 图片 | `image_url` | `first_frame`、`last_frame`、`reference_image` | JPG/JPEG、PNG、WebP、HEIC、HEIF；静态图片 | 30,000,000 bytes |
| 视频 | `video_url` | `reference_video` | MP4/MOV；H.264/H.265；可含 AAC/MP3 音轨 | 50,000,000 bytes；最短 2 秒，超过 15 秒取片头 15 秒 |
| 音频 | `audio_url` | `reference_audio` | WAV/PCM、MP3、M4A/AAC、裸 ADTS AAC | 15,000,000 bytes；最短 2 秒，超过 15 秒取片头 15 秒 |

图片还必须满足：单边 256–5760 像素、解码后不超过 33,177,600 像素、宽高比 0.4–2.5，且不能是动态图片。

多参考请求的数量和时长限制：

- 参考图片最多 9 张；
- 参考视频最多 3 段；
- 参考音频最多 3 段；
- 全部参考文件合计最多 12 个；
- 每段参考视频、参考音频最短 2 秒；短于 2 秒的任务进入 `failed`，错误码为 `input_duration_out_of_range`；
- 单段超过 15 秒时，标准化只保留从开头起的 15 秒，后面丢掉；不会压缩体积来"挤进"15 秒，也不会加速整段；
- 参考视频累计（裁切后）不超过 15 秒；
- 独立参考音频累计（裁切后）不超过 15 秒；
- 视频内嵌音轨不作为独立音频重复计数；
- 服务不会因负载静默丢掉整段参考文件。

**提示：** 超过 15 秒的参考视频或音频会被裁切，不是压缩或加速。只保留从开头起的 15 秒，后面丢掉，并按 15 秒计入累计时长。裁切后视频合计或独立音频合计仍超过 15 秒，任务进入 `failed`，错误码为 `input_duration_out_of_range`。客户请求的输出 `duration` 不会因此改短。

服务会将图片标准化为静态 RGB JPEG，将视频标准化为 H.264/24fps MP4，将音频标准化为 32kHz、双声道 WAV。超过 15 秒的视频/音频在这一步被裁到 15 秒。

## 5. 关键帧请求

首帧和尾帧支持三种组合：仅首帧、仅尾帧、首尾帧。`first_frame`/`last_frame` 不得与任何 `reference_*` 角色混用。

只有一张图片且省略 `role` 时，为兼容旧请求，系统仍将它视为 `first_frame`。多张图片必须显式填写角色。

仅首帧。下面示例使用固定 `16:9`；改成 `adaptive` 时，输出画布才根据视觉输入确定：

```json
{
  "model":"MiniMax-H3",
  "content":[
    {"type":"text","text":"The camera slowly moves forward and clouds begin to drift"},
    {"type":"image_url","image_url":{"url":"https://assets.example.com/first.png"},"role":"first_frame"}
  ],
  "resolution":"768P",
  "duration":10,
  "ratio":"16:9"
}
```

仅尾帧只需将角色改为 `last_frame`：

```json
{
  "model":"MiniMax-H3",
  "content":[
    {"type":"text","text":"The scene gradually transitions into the supplied final frame"},
    {"type":"image_url","image_url":{"url":"https://assets.example.com/last.png"},"role":"last_frame"}
  ],
  "resolution":"768P",
  "duration":10,
  "ratio":"adaptive"
}
```

首尾帧同样支持固定比例。下面示例使用固定 `9:16`：

```json
{
  "model":"MiniMax-H3",
  "content":[
    {"type":"text","text":"The scene changes smoothly from day to night"},
    {"type":"image_url","image_url":{"url":"https://assets.example.com/first.png"},"role":"first_frame"},
    {"type":"image_url","image_url":{"url":"https://assets.example.com/last.png"},"role":"last_frame"}
  ],
  "resolution":"768P",
  "duration":10,
  "ratio":"9:16"
}
```

首尾帧的宽高比差异不得超过 2%。

## 6. 多参考请求

参考素材在每一种媒体类型内，按照它们在 `content[]` 中出现的先后顺序独立编号：

- 第 1、2 张参考图片对应 `<Picture 1>`、`<Picture 2>`；
- 第 1、2 段参考视频对应 `<Video 1>`、`<Video 2>`；
- 第 1、2 段参考音频对应 `<Audio 1>`、`<Audio 2>`。

提示词应使用这些标签明确引用素材。参考图片的处理方式由服务自动确定，不提供额外的图片处理档位。

### 6.1 多张参考图片

```json
{
  "model":"MiniMax-H3",
  "content":[
    {"type":"text","text":"<Picture 1> and <Picture 2> walk together through a rainy street"},
    {"type":"image_url","image_url":{"url":"https://assets.example.com/person-a.jpg"},"role":"reference_image"},
    {"type":"image_url","image_url":{"url":"https://assets.example.com/person-b.heic"},"role":"reference_image"}
  ],
  "resolution":"768P",
  "duration":8,
  "ratio":"adaptive"
}
```

### 6.2 参考视频

```json
{
  "model":"MiniMax-H3",
  "content":[
    {"type":"text","text":"Follow the camera movement and performance rhythm in <Video 1>"},
    {"type":"video_url","video_url":{"url":"https://assets.example.com/motion.mov"},"role":"reference_video"}
  ],
  "resolution":"768P",
  "duration":10,
  "ratio":"adaptive"
}
```

### 6.3 参考音频与纯音频

纯音频必须使用固定比例：

```json
{
  "model":"MiniMax-H3",
  "content":[
    {"type":"text","text":"Create a cinematic dance performance synchronized to <Audio 1>"},
    {"type":"audio_url","audio_url":{"url":"https://assets.example.com/music.mp3"},"role":"reference_audio"}
  ],
  "resolution":"768P",
  "duration":12,
  "ratio":"16:9"
}
```

### 6.4 图片、视频和音频混合参考

```json
{
  "model":"MiniMax-H3",
  "content":[
    {"type":"text","text":"<Picture 1> performs the motion from <Video 1> in sync with <Audio 1>"},
    {"type":"image_url","image_url":{"url":"https://assets.example.com/character.webp"},"role":"reference_image"},
    {"type":"video_url","video_url":{"url":"https://assets.example.com/motion.mp4"},"role":"reference_video"},
    {"type":"audio_url","audio_url":{"url":"https://assets.example.com/voice.wav"},"role":"reference_audio"}
  ],
  "resolution":"768P",
  "duration":15,
  "ratio":"adaptive"
}
```

服务会使用所有通过校验的参考素材。单段超过 15 秒的视频/音频只使用片头 15 秒。处理失败时任务会明确进入 `failed`，不会丢掉整段参考文件，也不会改短客户请求的输出 `duration`。

## 7. 异步预处理与任务状态

创建接口分两阶段校验：

1. JSON、字段类型、角色、数量和 URL 语法错误立即返回 HTTP `400`，不创建任务；
2. 通过同步校验后返回 `task_id`。此后服务端才异步下载、探测和标准化媒体，然后审核提示词与标准化输入，全部通过后任务才排队等待开始生成。

对外显示为 `queued` 时，可能是还在准备输入或审核，也可能是输入已就绪、正在排队等待生成。

如果下载、真实格式探测、解码、转码或内容审核失败，已创建的任务会进入 `failed`，并在查询或回调中返回具体错误码。提示词与输入素材的内容安全审核属于输入准备阶段，因此策略拒绝同样以 `failed` + `task.error` 返回，而不是创建时的 HTTP `400`。当前服务繁忙无法承接新的生成时，也发生在创建之后：已返回的 `task_id` 进入 `failed`，创建接口不会再改成 HTTP `429`。

| 对外状态 | 含义 |
|---|---|
| `queued` | 已受理；正在准备输入、审核或排队等待生成 |
| `running` | 正在生成或发布结果 |
| `succeeded` | 视频已生成、审查通过并发布为公开直链；后续清理对象不会改变任务成功状态 |
| `failed` | 输入准备或生成失败，不再执行 |
| `cancelled` | 服务端已终止任务 |

## 8. 查询任务与 usage

```bash
curl -sS \
  -H "Authorization: Bearer ${DMC_API_KEY}" \
  "${DMC_BASE_URL}/v2/query/video_generation/{task_id}"
```

成功响应示例：

```json
{
  "task": {
    "id":"{task_id}",
    "model":"MiniMax-H3",
    "status":"succeeded",
    "created_at":1786500000,
    "updated_at":1786500720,
    "resolution":"768P",
    "duration":15,
    "ratio":"adaptive",
    "task_type":"generation",
    "modality":"video",
    "progress":1,
    "content":{"url":"https://media.example.com/{opaque_random_id}.mp4"},
    "usage":{
      "total_seconds":15,
      "input_seconds":12,
      "output_seconds":15,
      "input_image_count":1
    }
  }
}
```

`progress` 为 0 到 1 的可选字段：执行中是服务端上报的采样进度，终态为 `1`。旧客户端可忽略。

`usage` 口径：

- `input_seconds`：参考视频时长与独立参考音频时长之和；视频内嵌音轨不重复计算；
- `input_image_count`：全部输入图片数，包括首帧、尾帧和参考图片；
- `output_seconds`：客户请求的名义输出秒数；
- `total_seconds`：为兼容现有计费，当前与 `output_seconds` 相同。

当前按输出秒数计费。关键帧和参考素材请求采用相同的输出秒数计费口径，不按参考图片数量额外计费。正式单价、额度和账单以 DMC 控制台为准。

### 8.1 公开结果地址与保留时间

查询成功任务时，结果仍位于 `task.content.url`。该字段是完整的公开 HTTPS 直链，客户应直接保存和使用，不要根据 `task_id` 猜测或自行拼接下载地址。

- 服务在视频发布成功后的 24 小时内不主动删除该业务结果；起点不是创建任务的时间；
- 24 小时是最早删除时间，不是链接的限时失效时间。实际删除可能更晚；
- 再次查询任务不会刷新或重新计算最早删除时间；
- 查询任务仍需携带 Bearer API Key，下载 `task.content.url` 时不要携带 `Authorization`；
- 公开对象存在期间支持普通 GET 和 Range GET；有效的 Range 请求返回 HTTP `206 Partial Content`；
- 对象被清理后，存储层可能返回 `404`、`403` 或其他响应；DMC 不承诺返回 HTTP `410 Gone`，任务状态仍保持 `succeeded`；
- 如需长期保存，客户应在任务成功后尽快把视频下载到自己的存储。

公开直链不绑定登录用户、任务身份或绝对过期时间。谁取得完整链接，谁就能读取，客户不应把它发给无关人员。

下面只演示下载方式。`RESULT_URL` 必须使用查询响应中返回的完整原值：

```bash
RESULT_URL='替换为 task.content.url 的完整值'
curl -sS -L --output result.mp4 "${RESULT_URL}"
```

## 9. 幂等与回调

建议每次创建都发送：

```http
Idempotency-Key: <客户生成的唯一值>
```

- 同一账户、同一 Key 和同一规范化请求返回同一个 `task_id`；
- 同一 Key 对应不同请求返回 HTTP `400`；
- 同一幂等请求不会重复下载参考素材；
- 网络超时后必须复用原 Key 和原请求体。

未提供 `Idempotency-Key` 时，每次成功创建都视为新任务；网络重试可能产生重复任务。

`callback_url` 必须是公网 HTTPS URL。创建时服务会先发送 challenge，接收端需在 3 秒内返回相同 JSON。之后 `queued`、`running`、`succeeded`、`failed`、`cancelled` 变化均可能回调；接收端应按任务和状态实现幂等。

## 10. 输出规格与时长

成功结果固定为：

- MP4；
- H.264；
- 24 FPS；
- `768P` 画布；
- AAC、32kHz、双声道音频；
- 公开结果对象存在期间支持 GET 和 Range GET；有效的 Range 请求返回 HTTP `206`。

视频按固定的 24 FPS 帧网格生成，实际容器时长可能略长于名义时长。查询和计费仍使用客户提交的 `duration`。

| 名义秒数 | 帧数 | 容器时长约 |
|---:|---:|---:|
| 1 | 39 | 1.625 秒 |
| 2 | 56 | 2.333 秒 |
| 3 | 73 | 3.042 秒 |
| 4 | 107 | 4.458 秒 |
| 5 | 124 | 5.167 秒 |
| 6 | 158 | 6.583 秒 |
| 7 | 175 | 7.292 秒 |
| 8 | 192 | 8.000 秒 |
| 9 | 226 | 9.417 秒 |
| 10 | 243 | 10.125 秒 |
| 11 | 277 | 11.542 秒 |
| 12 | 294 | 12.250 秒 |
| 13 | 328 | 13.667 秒 |
| 14 | 345 | 14.375 秒 |
| 15 | 362 | 15.083 秒 |

## 11. 错误语义

同步错误使用统一 envelope：

```json
{
  "type":"error",
  "error":{"type":"bad_request_error","message":"content: invalid role (2013)","http_code":"400"},
  "request_id":"req_01K..."
}
```

| HTTP | `error.type` | 常见原因 |
|---:|---|---|
| `400` | `bad_request_error` | JSON、字段、角色、数量、URL 语法或幂等冲突 |
| `401` | `authorized_error` | API Key 缺失或无效 |
| `429` | `rate_limit_error` | 账户或入口限流，尚未创建任务；按 `Retry-After` 等待。服务繁忙无法开始生成不是这条 |
| `500` | `server_error` | 服务内部错误；使用原幂等 Key 退避重试 |

`request_id` 只用于定位这一次 HTTP 调用，不是任务号，也不能用来查询任务。

结果下载地址不使用上面的 Bearer 鉴权错误表。公开对象被清理后，存储层可能返回 `404`、`403` 或其他响应；这不表示生成任务失败，也不会把任务状态改为 `failed`。客户应在任务成功后及时保存自己的副本。

异步媒体失败位于 `task.error`：

```json
{
  "task": {
    "id":"{task_id}",
    "status":"failed",
    "error":{"code":"input_format_unsupported","message":"decoded container is not MP4/MOV"}
  }
}
```

常见异步错误码：

| 错误码 | 含义 |
|---|---|
| `input_download_failed` | 下载失败、超时或远端返回错误 |
| `input_security_violation` | URL、DNS、重定向或目标地址违反安全策略 |
| `input_too_large` | 实际流式下载超过文件大小上限 |
| `input_probe_failed` | 无法探测或媒体损坏 |
| `input_format_unsupported` | MIME、容器、编码或动态图片不符合要求 |
| `input_duration_out_of_range` | 单段短于 2 秒，或裁切后参考视频/独立音频累计超过 15 秒 |
| `input_dimensions_out_of_range` | 图片或视频尺寸超出安全范围 |
| `input_aspect_ratio_mismatch` | 首尾帧宽高比差异超过 2% |
| `input_transcode_failed` | 标准化失败 |
| `input_preparation_timeout` | 单任务输入准备超时 |
| `input_storage_failed` | 输入素材保存失败 |
| `content_policy_violation` | 提示词、输入素材或成片被审核明确拒绝 |
| `content_review_required` | 内容需要人工复核，任务不继续执行 |
| `content_moderation_failed` | 审核提交失败、查询失败、未知结果，或素材上传后 60 秒内未得到通过结论 |
| `input_review_failed` | 输入审核流程未能启动或中断，不是审核服务给出的策略结论 |
| `fail_to_fetch_task` | 任务已创建，但当前无法开始生成，包括服务繁忙 |

查询已失败任务仍返回 HTTP `200`，以 `task.status=failed` 和 `task.error.code` 表达结果。创建成功后的内容审核、服务繁忙都不会改成创建接口的 HTTP `400` 或 `429`。

| `task.error.code` | 客户可见结果 |
|---|---|
| `content_policy_violation` | `failed`；已扣费用全额退回 |
| `content_review_required` | `failed`；已扣费用全额退回 |
| `content_moderation_failed` | `failed`；已扣费用全额退回 |
| `input_review_failed` | `failed`；尚未扣费时不产生费用 |
| `fail_to_fetch_task` | `failed`；已预扣则全额退回 |

## 12. 明确不提供的能力

- `2K` 输出；
- `POST /v2/h3_context_ir` 提示词增强；
- `POST /v2/video_regeneration` 视频再生成；
- `GET /v2/query/video_generation` 任务列表与筛选；
- `DELETE /v2/video_generation/{task_id}` 公开取消或删除任务；
- 小于 1 秒或大于 15 秒的输出；
- 自定义宽高或未在本页列出的生成控制参数；
- 质量档位或参考图片处理档位；
- Base64、data URI、动态图片或自定义处理流程；
- SSE 或其他未在本页列出的接口。

服务不会把不支持的参数静默改写成其他值。
