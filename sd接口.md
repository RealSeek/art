# 视频生成接口与高级功能说明

> 此文件是尚未逐项验收的高级能力草案，不要直接对外发布。当前已实现的统一请求、公开模型名和素材限制见 [视频统一接口.md](视频统一接口.md)。

适用对象：使用本站视频生成服务的客户。

本文介绍本站接口、模型能力、请求参数、参考素材、异步任务、回调通知、计费和结果下载。请使用本站 API 密钥调用；示例中的文件、网址和任务编号均为占位值。

## 内容导航

1. 接入信息与当前模型
2. 基础创建、查询与下载
3. 2.5 / 2.0 支持范围与高级参数
4. 参考图生成、视频编辑与延长
5. 首尾帧、音频参考与搜索工具
6. 文件上传、Base64 和已授权素材
7. 回调通知与失败重试
8. Token 计费与常见问题
9. Python 完整调用示例

## 接入信息与当前模型

| 项目 | 配置 |
| --- | --- |
| 本站客户 API 地址 | `https://ai.realseek.wiki` |
| 创建任务 | `POST /v1/videos` |
| 查询任务 | `GET /v1/videos/{task_id}` |
| 下载内容 | `GET /v1/videos/{task_id}/content` |
| JSON 请求类型 | `Content-Type: application/json` |
| 鉴权 | `Authorization: Bearer YOUR_API_KEY` |
| 2.5 模型 | `doubao-seedance-2-5-260628` |
| 2.0 模型 | `doubao-seedance-2-0-260128` |

请求中的 model 必须使用上述公开模型名。通过 resolution 选择清晰度，无需为不同分辨率改写模型名；实际可用档位以账户权限和价格页为准。

任务完成后通过查询接口获取视频和尾帧的完整下载地址。结果可能带有时效性签名，请及时保存；上传参考素材与下载生成结果是两个独立步骤。

### 最短固定时长测试请求

两个当前模型的最短固定时长均为 4 秒。下面是 2.0 的完整基础 JSON，2.5 示例见后文。

```json
{
  "contract_version": "video-v1",
  "model": "seedance-2-0",
  "prompt": "一只红色纸船在平静湖面上缓慢漂动",
  "duration": 4,
  "resolution": "480p",
  "ratio": "16:9",
  "options": {"generate_audio": false}
}
```

这只是请求示例，不会自动执行。创建成功即进入异步任务流程；不要因本地等待超时直接重复创建。

## 按模型开放的高级功能

以下为可选能力，不代表每个模型全部支持；以该公开模型的能力文档为准；本页「高级功能详细说明」提供支持范围、参数限制和完整示例。高级字段放在 `options` 对象中，已支持该能力的模型也兼容同名顶层字段。两处提供冲突值会报错。

- `duration: -1`：自动时长，仅支持该模式的模型接受；不能将 -1 用作计费秒数。
- `options.omni_reference_task_type`：`auto`、`reference`、`edit`、`extend`。编辑要求视频参考、`ratio: adaptive` 和自动时长；延长要求视频参考及 adaptive。
- `options.generate_audio`、`watermark`、`return_last_frame`：布尔选项，显式 false 会被保留。任务完成后从 `result.last_frame_url` 获取尾帧链接，交付方式见下文。
- `options.video_format`：支持模型的 `mp4` / `mov`。
- `options.seed`、`camera_fixed`、`draft`、`service_tier`、`frames`：按模型开放。草稿限制、帧数取值和服务档位不能跨模型套用。
- `options.priority`、`execution_expires_after`、`safety_identifier`：优先级、等待期限和用户标识。
- `options.tools`：支持模型可使用 `[{"type":"web_search"}]`；工具费用以账户可见价格页为准。
- `options.callback_url`：客户 HTTPS 回调地址。通知使用本站任务编号和公开状态；以 `event_id` 去重，最终仍可查询原任务确认。

支持的模型可接受图片/音频 Base64、公开 HTTPS 素材和已授权的 `asset://` 引用。视频 Base64 不支持。文件上传使用 multipart 的 image/video/audio/first_frame/last_frame 字段。当前两个模型不开放草稿及草稿引用。

输出 Token 计费模型按最终有效用量结算；如启用工具，是否另收费用以本站配置为准：费用已包含的规则不另收费，按次数收费的规则按实际工具次数结算。自动时长或 frames 模式的请求参数不作为实际输出时长展示。未开放或未定义的字段会明确报错，不静默丢弃。

## 结果下载与有效期

任务完成且结算完成后，从 `result.url` 获取视频地址；开启并成功返回尾帧时，从 `result.last_frame_url` 获取尾帧地址。使用完整 URL 并保留全部签名参数，不要自行替换域名或拼接下载路径。

`GET /v1/videos/{task_id}/content` 用于获取已完成任务的内容，客户端应支持 HTTP 302 重定向。可使用后文的 curl --location 下载示例。

结果链接可能包含有效期或下载次数限制，不是永久存储承诺。请在可用时及时下载保存；重新查询任务不保证产生新链接或延长签名有效期。

遇到链接过期、访问受限或下载失败时，先保存任务编号并联系平台，不要自动重新提交付费生成。若返回 HTTP 410 且错误码为 media_expired，表示文件已超过可下载期限；其他错误以实际响应为准。文件过期不改变任务的生成成功记录，也不自动退款。

## 接口列表

- POST `/v1/videos`：创建异步视频任务。
- GET `/v1/videos/{task_id}`：查询任务。
- GET `/v1/videos/{task_id}/content`：下载生成结果。

## 鉴权与参数约定

API 服务地址：https://ai.realseek.wiki

所有调用携带 `Authorization: Bearer YOUR_API_KEY`，JSON 请求使用 `Content-Type: application/json`。

将 `YOUR_API_KEY` 替换为本站 API 密钥。本文件的多数完整示例使用 2.5 模型，2.0 请使用本文列出的完整模型名；只有标注为双方支持的示例才能直接替换模型。不同模型的分辨率、时长、执行方式和参考素材限制不同；示例值不代表所有模型都支持。未支持的参数不能通过修改文档或改名变成可用参数。

## 请求参数

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `contract_version` | string | 新接入显式传 video-v1。 |
| `model` | string | 必填，公开模型名。 |
| `prompt` | string | 必填，生成要求。 |
| `duration` | number | 时长，单位秒，按所用模型允许值填写。 |
| `resolution` | string | 分辨率档位，按所用模型支持的值填写。 |
| `ratio` | string | 宽高比，按所用模型支持的值填写。 |
| `references` | array | 参考图片、视频或音频，数量和角色取决于模型。 |
| `options` | object | 模型声明支持的高级能力。 |

options 中布尔字段使用 JSON 布尔值，数字字段使用 JSON 数字。仅传当前模型支持的选项；2.5 / 2.0 不接受 seed，不要给这两个模型补上该字段。

## 创建视频

下例的 4 秒、480p、16:9 是示例值，请按所用模型调整。

```json
{
  "contract_version": "video-v1",
  "model": "seedance-2-5",
  "prompt": "一只红色纸船漂浮在平静的湖面上",
  "duration": 4,
  "resolution": "480p",
  "ratio": "16:9"
}
```

### cURL

```bash
curl 'https://ai.realseek.wiki/v1/videos' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "contract_version": "video-v1",
  "model": "seedance-2-5",
  "prompt": "一只红色纸船漂浮在平静的湖面上",
  "duration": 4,
  "resolution": "480p",
  "ratio": "16:9"
}'
```

### Python

```python
import json
import requests

payload = json.loads(r'''{
  "contract_version": "video-v1",
  "model": "seedance-2-5",
  "prompt": "一只红色纸船漂浮在平静的湖面上",
  "duration": 4,
  "resolution": "480p",
  "ratio": "16:9"
}''')
response = requests.post(
    'https://ai.realseek.wiki/v1/videos',
    headers={'Authorization': 'Bearer YOUR_API_KEY', 'Content-Type': 'application/json'},
    json=payload,
    timeout=180,
)
print(response.status_code, response.text)
```

### JavaScript / TypeScript

以下示例适用于支持 fetch 的服务端 JavaScript / TypeScript。不要把真实密钥写进公开网页。

```javascript
const payload = {
  "contract_version": "video-v1",
  "model": "seedance-2-5",
  "prompt": "一只红色纸船漂浮在平静的湖面上",
  "duration": 4,
  "resolution": "480p",
  "ratio": "16:9"
}
const response = await fetch('https://ai.realseek.wiki/v1/videos', {
  method: 'POST',
  headers: { Authorization: 'Bearer YOUR_API_KEY', 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
console.log(response.status, await response.json())
```

## 参考素材

需要参考图时，将下面的 references 合并到创建请求中。素材地址必须替换成实际可访问的地址。

```json
{"references":[{"type":"image","role":"reference_image","source":"https://example.com/reference.png"}]}
```

视频、音频分别使用 type=video/audio 和 role=reference_video/reference_audio。首尾帧仅在模型支持时使用 first_frame/last_frame。不同素材的数量与组合限制依模型而定，不能默认单独音频或所有素材组合均可用。

## 高级功能详细说明

以下说明适用于本文列出的两个公开模型。2.5、2.0 是文档中的简称，请求中需填写完整模型名。其他模型不能直接套用这些参数。

### 2.5 与 2.0 支持范围

| 能力 | 2.5 | 2.0 |
| --- | --- | --- |
| 固定时长 | 4～30 秒，整数秒 | 4～15 秒，整数秒 |
| 自动时长 | `duration: -1`；不填时默认自动 | `duration: -1`；不填时默认 5 秒 |
| 分辨率 | 480p、720p、1080p | 480p、720p、1080p、4k |
| 图片、视频、音频参考数量上限 | 分别 30、10、10 | 分别 9、3、3 |
| 音频生成、水印、返回尾帧 | 支持 | 支持 |
| 显式参考模式、视频编辑、视频延长 | 支持 `omni_reference_task_type` | 不接受该字段 |
| 指定 mp4 / mov | 支持 `video_format` | 不接受该字段 |
| 优先级、搜索工具、客户回调 | 支持 | 支持 |
| `seed`、`camera_fixed`、`draft`、`frames`、`service_tier` | 当前接入不开放 | 当前接入不开放 |

两者支持的比例为 `adaptive`、`16:9`、`9:16`、`1:1`、`4:3`、`3:4`、`21:9`。分辨率不填时当前默认 720p，比例不填时默认 adaptive；建议显式指定。表中是当前模型支持范围；账户可用分辨率以价格页为准，素材编码、尺寸、长度和组合还须通过请求校验。

### 高级参数表

除 `duration` 外，下表字段放在 `options` 中。使用 JSON 布尔值 `true` / `false`，不要写成字符串；显式 `false` 和优先级 `0` 都会保留。兼容格式可以在顶层传同名字段，但不能与 `options` 提供冲突值。

| 字段 | 类型 | 取值与约束 |
| --- | --- | --- |
| `duration` | integer | 请求顶层字段；支持自动模式时可填 -1。固定秒数按模型允许范围填写。-1 不是收费秒数。 |
| `omni_reference_task_type` | string | 仅 2.5：auto、reference、edit、extend。edit/extend 要求视频参考和 adaptive；edit 还要求 duration=-1。 |
| `generate_audio` | boolean | 两个模型均支持。false 表示不生成音频。 |
| `watermark` | boolean | 是否添加生成水印。 |
| `return_last_frame` | boolean | 请求尾帧；完成后在 result.last_frame_url 中读取，不代表一定额外生成一张独立图片任务。 |
| `video_format` | string | 仅 2.5：mp4 或 mov。 |
| `priority` | integer | 2.x 支持，0～9；不可与 flex 混用。 |
| `execution_expires_after` | integer | 3600～259200 秒；不填按默认 172800 秒处理。它是任务等待期限，不是成片长度或下载链接有效期。 |
| `safety_identifier` | string | 最长 64 字节的可打印 ASCII 用户标识。 |
| `tools` | array | 2.x 可传 `[{"type":"web_search"}]`；最多一个工具项，不接受其他类型或未定义的嵌套字段。 |
| `callback_url` | string | 接收任务状态通知的公开 HTTPS 地址，具体约定见下方回调章节。 |
| `seed` | integer | 当前两个模型均不开放，不要传入。 |
| `camera_fixed` | boolean | 当前两个模型均不开放，不要传入。 |
| `draft` | boolean | 当前两个模型均不开放，不要传入，包括 false。 |
| `service_tier` | string | 当前两个模型均不开放，不要传入 default 或 flex。 |
| `frames` | integer | 当前两个模型均不开放；使用 duration 指定时长。 |

不要给 2.5 / 2.0 请求统一补上 `seed`、`draft:false` 等字段；即便值是 false，不支持的字段仍可能被拒绝。

以下高级示例使用本站已支持的兼容请求格式，省略 contract_version，仍调用同一个 `/v1/videos` 接口；高级字段放在 options 中。不要将示例与旧字段别名混合。

### 示例一：参考图生成并返回尾帧

适用于已开放图片参考的 2.5 / 2.0。将参考地址替换为真实可访问图片；`options` 中关闭音频和水印，开启尾帧。

```json
{
  "model": "seedance-2-5",
  "prompt": "保留参考图中人物的外观，让人物在田野中缓慢转身",
  "duration": 4,
  "resolution": "480p",
  "ratio": "16:9",
  "references": [
    {"type": "image", "role": "reference_image", "source": "https://example.com/person.png"}
  ],
  "options": {
    "generate_audio": false,
    "watermark": false,
    "return_last_frame": true
  }
}
```

### 示例二：编辑已有视频，仅 2.5

必须提供参考视频、`ratio: adaptive` 和 `duration: -1`。提示词明确描述希望修改的内容。这里选择 mov；需要 mp4 时修改 video_format 即可。

```json
{
  "model": "seedance-2-5",
  "prompt": "保留人物动作，将背景改为明亮的健身房",
  "duration": -1,
  "resolution": "720p",
  "ratio": "adaptive",
  "references": [
    {"type": "video", "role": "reference_video", "source": "https://example.com/reference.mp4"}
  ],
  "options": {
    "omni_reference_task_type": "edit",
    "generate_audio": false,
    "watermark": false,
    "return_last_frame": true,
    "video_format": "mov",
    "priority": 0,
    "execution_expires_after": 172800
  }
}
```

### 示例三：延长已有视频，仅 2.5

必须提供参考视频和 adaptive 比例。下面使用自动时长；若选择固定时长，仍须符合模型限制。请求时长不能视为实际成片时长、追加片段长度或最终计费数量的保证，应以返回结果为准。

```json
{
  "model": "seedance-2-5",
  "prompt": "延续原视频的人物和场景，让人物继续向前走并挥手",
  "duration": -1,
  "resolution": "720p",
  "ratio": "adaptive",
  "references": [
    {"type": "video", "role": "reference_video", "source": "https://example.com/reference.mp4"}
  ],
  "options": {"omni_reference_task_type": "extend", "generate_audio": true}
}
```

### 多模态参考、Base64 与已有素材

`references` 中图片使用 image / reference_image，视频使用 video / reference_video，音频使用 audio / reference_audio；首尾帧使用 image / first_frame 或 last_frame。只传所选模型支持的角色和组合。

以下是可合并到创建请求的参考素材片段，不是完整请求。音频参考与生成音频是不同能力；传入音频参考不等于必须设置 generate_audio=true。

```json
{
  "references": [
    {"type": "image", "role": "reference_image", "source": "https://example.com/person.png"},
    {"type": "audio", "role": "reference_audio", "source": "https://example.com/voice.mp3"}
  ]
}
```

- 图片和音频可用对应 MIME 类型的 Data URL，例如 `data:image/png;base64,BASE64_DATA`、`data:audio/mpeg;base64,BASE64_DATA`。BASE64_DATA 必须替换为实际数据；编码后的数据部分上限为 32 MiB，实际总请求还受网关限制。视频不接受 Base64。
- HTTPS 素材需能被生成服务访问，不能依赖浏览器登录态或本站 API 密钥；有签名的 URL 应覆盖任务处理所需时间。
- `asset://ASSET_ID` 仅可引用已存在且经平台授权给当前用户的素材。这里不是上传或创建资产的接口；没有授权时先联系平台。
- 一次请求使用一个媒体集合：推荐 references；使用兼容格式 content 或旧图片字段时，不要再混用另一套媒体集合。重复素材会保留数量与顺序，并计入数量限制。
- 不支持把任意图片、音频、视频组合都视为可用；请求仍可能因素材尺寸、长度、编码或组合拒绝请求。

### 本地文件上传：multipart/form-data

仍调用 POST `/v1/videos`。文件字段支持 `image`、`video`、`audio`、`first_frame`、`last_frame`；同名文件字段可重复，但必须遵守所选模型的数量上限。单文件上限 128 MiB，上传处理上限 50 个文件，模型限制或网关总请求限制可能更小。

以下示例上传参考视频并调用 2.5 编辑能力。文件路径换成客户端本机路径，字段中明确指定对应的文件 MIME 类型。不要手动填写 multipart 的 Content-Type 边界，由客户端生成。

```bash
curl 'https://ai.realseek.wiki/v1/videos' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --form 'model=seedance-2-5' \
  --form 'prompt=保留人物动作，将背景改为明亮的健身房' \
  --form 'duration=-1' \
  --form 'resolution=720p' \
  --form 'ratio=adaptive' \
  --form 'options={"omni_reference_task_type":"edit","generate_audio":false}' \
  --form 'video=@reference.mp4;type=video/mp4'
```

表单里的 options、references、content、tools 用 JSON 文本；布尔与数字字段也按 JSON 值传入，例如 false、0、-1，不要额外套字符串引号。上传参考文件后，平台会处理素材并创建生成任务；文件上传和结果下载使用不同流程。

### 当前未开放的高级字段

本文两个模型当前均不开放草稿及草稿引用、随机种子、固定镜头、按帧数生成或服务档位选择。请不要传入 draft、draft_task、seed、camera_fixed、frames、service_tier；即便值是 false、0 或 default，也不能视为可以忽略的字段。

若以后开放其他能力，以本站对应模型文档更新为准。

### 搜索工具与计费

支持的 2.x 模型可将下面片段合并到 options；它只能启用已开放的 web_search，不能执行任意工具。

```json
{"options":{"tools":[{"type":"web_search"}]}}
```

使用工具是否另收费以本站显示的售价规则为准：已包含模式不额外收取；按次模式使用实际搜索次数。

对于本节按输出 Token 计费的模型，同一个 model 通过 resolution 选择分辨率；有无参考视频会匹配不同售价档位。提交时先预扣预算，完成后按最终有效 completion_tokens 结算差额，适用时再计入工具费用。预扣额不是最终消费，也不是要求生成服务最多使用多少 Token。

计费 Token 不等同于文本字数、请求秒数或成片秒数；参考素材可能影响用量，不能仅凭 completion_tokens 这个字段名断言参考素材处理免费。用量尚未核实时不会拿请求秒数冒充最终 Token。具体价格以账户可见价格页和对应档位为准。

### 客户回调：请求、事件与重试

创建时在 options 中传入公开 HTTPS 回调地址，例如：

```json
{"options":{"callback_url":"https://example.com/hooks/video"}}
```

本站向该地址发送 HTTP POST，Content-Type 为 application/json；通知包含本站任务 id、model、status 和 event_id。每个事件也在 `X-MAI-Event-ID` 请求头提供相同标识，接收端按 event_id 去重，成功处理后返回 2xx，不要返回跳转页。

以下是完成事件的结构示例。**回调的地址字段是顶层 video_url / last_frame_url；任务查询的地址字段是 result.url / result.last_frame_url，两者不要混用。**

```json
{
  "id": "TASK_ID",
  "model": "seedance-2-5",
  "status": "completed",
  "event_id": "TASK_ID:SUCCESS",
  "video_url": "https://media.example.com/result.mp4?signature=EXAMPLE",
  "last_frame_url": "https://media.example.com/last-frame.jpg?signature=EXAMPLE"
}
```

- 中间状态只在平台实际观察到时发送，可能合并快速发生的状态变化，不能要求每个阶段必有通知。
- 完成事件等待结果可交付且结算对齐；失败事件等待退款完成，并带 error.code、error.message。尾帧地址仅在有结果时出现。
- 网络异常、超时或非 2xx 响应会重试；单个状态连续失败 8 次后停止该状态通知。未终态任务出现后续状态时可继续通知。
- event_id 用于去重，不是签名凭证。接收通知后，可用自己的 API 密钥查询原任务核实最终状态；回调不可用时继续轮询即可，不要重新创建生成任务。

## 返回与任务查询

创建成功后保存 task_id：

```json
{"id":"TASK_ID","task_id":"TASK_ID","status":"queued","progress":0}
```

每隔 5～10 秒查询一次，并设置总等待时限：

```bash
curl 'https://ai.realseek.wiki/v1/videos/TASK_ID' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

status=completed 时读取 result.url，status=failed 时读取 error 并停止轮询。结果地址为示意，使用实际返回值。

```json
{"id":"TASK_ID","task_id":"TASK_ID","status":"completed","progress":100,"result":{"url":"https://media.example.com/result.mp4?signature=EXAMPLE"}}
```

### 下载结果

```bash
curl --location 'https://ai.realseek.wiki/v1/videos/TASK_ID/content' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --output video.mp4
```

下载接口仅用于已完成且结算完成的任务。客户端应支持重定向；使用上面的 `curl --location` 即可。也可直接下载查询响应中的 `result.url`，该地址不需要附带本站 API 密钥。不要使用 `--location-trusted`，也不要把本站的 Authorization 头转发到跨域结果地址。链接有效期按前述交付策略处理。

## 常见错误与重试

| 错误码 | 处理方式 |
| --- | --- |
| `invalid_request` | 检查请求字段、类型与所用模型限制。 |
| `generation_option_unsupported` | 移除当前模型不支持的可选能力。 |
| `generation_contract_not_prepared` | 联系平台确认模型配置。 |
| `generation_failed` | 查看任务 error，停止轮询并保留任务号。 |

创建请求超时不能视为任务未创建，不要盲目重复提交。保存已有任务号与请求标识，先查询任务或联系平台排查。鉴权、余额、权限等错误按接口实际返回处理，不要无限重试。

## 老请求格式兼容

原有请求格式继续兼容。旧别名用于不带 contract_version 的旧格式请求，不要与显式 video-v1 请求混用：

| 旧字段 | 统一字段 | 单位 |
| --- | --- | --- |
| seconds | duration | 秒 |
| duration_ms | duration | 毫秒，内部换算成秒 |
| aspect_ratio | ratio | 宽高比 |
| input_reference / content | references | 参考素材 |

## 更多高级功能组合示例

本章与前述高级示例一样，使用不带 contract_version 的兼容 JSON 格式。图片、视频、音频地址必须替换成实际可访问文件；示例网址不是测试素材。

### 2.5 显式参考模式

reference 用于指定参考任务类型；auto 按输入素材和请求内容确定任务类型。需要明确编辑或延长时使用前文 edit / extend 示例，不要仅靠修改提示词替代所需参数。

```json
{
  "model": "seedance-2-5",
  "prompt": "参考图一的人物和图二的场景，让人物沿小路行走",
  "duration": 4,
  "resolution": "720p",
  "ratio": "16:9",
  "references": [
    {"type":"image","role":"reference_image","source":"https://example.com/person.png"},
    {"type":"image","role":"reference_image","source":"https://example.com/scene.png"}
  ],
  "options": {"omni_reference_task_type":"reference","generate_audio":false}
}
```

### 2.0 首尾帧约束

first_frame / last_frame 属于输入约束；return_last_frame 是请求额外返回生成结果的尾帧，两者不是同一件事。

```json
{
  "model":"seedance-2-0",
  "prompt":"从第一张画面平滑过渡到最后一张画面，保持人物一致",
  "duration":4,
  "resolution":"480p",
  "ratio":"16:9",
  "references":[
    {"type":"image","role":"first_frame","source":"https://example.com/start.png"},
    {"type":"image","role":"last_frame","source":"https://example.com/end.png"}
  ],
  "options":{"return_last_frame":true,"generate_audio":false}
}
```

### 2.0 音频参考、搜索与回调组合

```json
{
  "model":"seedance-2-0",
  "prompt":"根据参考人物和声音生成一段介绍春日旅行的视频",
  "duration":4,
  "resolution":"720p",
  "ratio":"16:9",
  "references":[
    {"type":"image","role":"reference_image","source":"https://example.com/person.png"},
    {"type":"audio","role":"reference_audio","source":"https://example.com/voice.mp3"}
  ],
  "options":{
    "generate_audio":true,
    "watermark":false,
    "return_last_frame":true,
    "tools":[{"type":"web_search"}],
    "priority":0,
    "execution_expires_after":172800,
    "safety_identifier":"customer_demo_001",
    "callback_url":"https://example.com/hooks/video"
  }
}
```

素材组合需要通过请求校验，实际生成效果以返回结果为准。safety_identifier 使用不含敏感信息的业务标识；搜索是否另收费由本站工具计价规则决定。

## Python：创建一次、轮询原任务、读取结果链接

运行前安装 requests，并在环境变量 MAI_API_KEY 中设置本站 API 密钥。下方示例只创建一次任务；网络错误或等待超时会退出，不会自动创建第二个任务。请保存输出的 task_id，后续查询这个任务。

```python
import os
import time
import requests

base = "https://ai.realseek.wiki"
headers = {"Authorization": "Bearer " + os.environ["MAI_API_KEY"]}
payload = {
    "model": "seedance-2-5",
    "prompt": "一只红色纸船在平静湖面上缓慢漂动",
    "duration": 4,
    "resolution": "480p",
    "ratio": "16:9",
    "options": {"generate_audio": False, "return_last_frame": True},
}
response = requests.post(base + "/v1/videos", headers=headers, json=payload, timeout=180)
response.raise_for_status()
created = response.json()
task_id = created.get("task_id") or created.get("id")
if not task_id:
    raise RuntimeError(f"未返回任务编号，请保留原响应排查：{created}")
print("task_id =", task_id, flush=True)

deadline = time.monotonic() + 1200
while time.monotonic() < deadline:
    response = requests.get(base + "/v1/videos/" + task_id, headers=headers, timeout=30)
    response.raise_for_status()
    task = response.json()
    status = task.get("status")
    print("status =", status, flush=True)
    if status == "completed":
        result = task.get("result") or {}
        video_url = result.get("url")
        if not video_url:
            raise RuntimeError("任务已完成但未取得结果链接，请保存任务编号联系平台")
        print("video_url =", video_url)
        print("last_frame_url =", result.get("last_frame_url"))
        break
    if status == "failed":
        raise RuntimeError(task.get("error"))
    time.sleep(8)
else:
    raise TimeoutError(f"本地停止等待；任务未因此取消，请继续查询 {task_id}")
```

这里的 1200 秒只是客户端本地等待窗口，与 execution_expires_after 及下载链接有效期不同。需要下载时，使用 GET 内容接口或返回的完整 result.url；直接下载结果 URL 时不附带本站 API 密钥。


## 费用计算与分组价格

本服务按成功任务的有效计费 Token 结算。同一模型按分辨率及是否含参考视频选择单价，不按请求秒数重复计费。

- 价格页的基础价格尚未计入分组倍率；当前分组价格已经计入该倍率，不能再重复相乘。
- 含参考视频使用参考视频档位；参考视频会影响实际 Token 用量，不能当作免费输入，也不额外重复加收一份参考视频秒数费用。
- 创建时可能先预扣预算，任务完成后按实际费用结算差额。预扣额度不等于最终消费，也不是生成用量上限。
- 工具费用是否已包含，以账户可见规则为准；需另收时按实际使用次数计算。
- 已提交任务按提交时约定的价格结算，后续改价不追溯修改该任务。

```text
使用分组单价时：
视频费用 = 实际计费 Token ÷ 1,000,000 × 对应分组单价
总费用 = 视频费用 + 按当前规则计算的工具费用
```

请求时长不保证与成片时长完全一致。若结果不符合预期，请保存任务编号反馈；不要自行用请求秒数替换实际 Token 用量计算费用。

## 常见问题

| 情况 | 处理方式 |
| --- | --- |
| seed、draft:false 等字段报错 | 当前两个模型不支持这些字段，请删除 |
| edit 报参数错误 | 确认使用 2.5，传入参考视频、adaptive 比例及 duration=-1 |
| extend 报参数错误 | 确认使用 2.5，传入参考视频和 adaptive 比例 |
| 素材下载失败 | 检查 URL 是否公开可访问，签名是否覆盖任务处理时间 |
| 文件上传失败 | 检查 MIME 类型、文件大小、数量和总请求限制 |
| 余额不足 | 同时检查是否满足提交时的预扣预算 |
| 定价不可用或价格冲突 | 保存请求参数并联系平台，不要无限重试 |
| 任务长时间未完成 | 按间隔查询原任务并保存编号，不要反复创建 |
| 回调收不到 | 检查公开 HTTPS 地址和 2xx 响应，继续查询原任务 |
| 收到重复回调 | 按 event_id 去重，重复通知不代表新任务 |
| 下载链接过期 | 联系平台核实，重新查询不保证延长有效期 |
| 本地等待超时 | 任务未因此取消，后续仍查询同一任务编号 |

## 示例文件与占位符

| 名称 | 用途 |
| --- | --- |
| YOUR_API_KEY | 替换为自己的本站 API 密钥 |
| TASK_ID | 替换为创建接口返回的任务编号 |
| reference.mp4 | 客户本机待上传的视频文件 |
| person.png、scene.png | 示例参考图片，替换为实际素材 |
| start.png、end.png | 示例首尾帧素材 |
| voice.mp3 | 示例音频素材 |
| video.mp4 | 下载命令保存到本机的结果文件名，可自行更改 |
| example.com、media.example.com | 示例素材、回调和结果地址，不是可直接使用的真实文件 |

相关文档：[本站视频调用文档](https://ai.realseek.wiki/docs/?family=video)。
