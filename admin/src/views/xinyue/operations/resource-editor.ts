import type { ResourceEditorField, ResourceRow } from './resource-types'

const imageToolTypes: Record<string, string> = {
  'background-removal': 'BACKGROUND_REMOVAL',
  erase: 'INPAINT',
  'marked-edit': 'INPAINT',
  outpaint: 'OUTPAINT',
  enhance: 'UPSCALE'
}

export function resourceEditorValue(
  resourceKey: string,
  fieldKey: string,
  source: ResourceRow,
  defaults: ResourceRow,
  editing: boolean
) {
  let value = source[fieldKey] ?? defaults[fieldKey]
  if (!editing) return value
  if (resourceKey === 'inspirations') {
    if (fieldKey === 'videoResolution') value = source.options?.resolution || '720p'
    if (fieldKey === 'videoDuration') value = source.options?.duration || 5
    if (fieldKey === 'videoAspectRatio') value = source.options?.aspectRatio || '16:9'
    if (fieldKey === 'externalVideoUrl') value = source.options?.previewVideoUrl || ''
  }
  if (resourceKey === 'imageTools') {
    if (fieldKey === 'inputMode') value = source.options?.inputMode || 'REFERENCE'
    if (fieldKey === 'toolKey') value = source.options?.toolKey || 'custom'
    if (fieldKey === 'executionMode') value = source.options?.executionMode || 'GENERIC'
    if (fieldKey === 'toolType')
      value =
        source.options?.toolType ||
        imageToolTypes[String(source.options?.toolKey || '')] ||
        'CUSTOM'
    if (fieldKey === 'placeholder') value = source.options?.placeholder || ''
    if (
      [
        'outpaintLeft',
        'outpaintRight',
        'outpaintTop',
        'outpaintBottom',
        'steps',
        'strength'
      ].includes(fieldKey)
    )
      value = source.options?.[fieldKey] ?? defaults[fieldKey]
  }
  if (resourceKey === 'assistants') {
    if (fieldKey === 'toolIds') value = (source.tools || []).map((item: ResourceRow) => item.toolId)
    if (fieldKey === 'knowledgeBaseIds')
      value = (source.knowledgeBases || []).map((item: ResourceRow) => item.knowledgeBaseId)
  }
  if (resourceKey === 'tools') {
    if (fieldKey === 'headersText') value = JSON.stringify(source.headers || {}, null, 2)
    if (fieldKey === 'secretHeadersText') value = ''
    if (fieldKey === 'inputSchemaText') value = JSON.stringify(source.inputSchema || {}, null, 2)
    if (fieldKey === 'credentialFieldsText')
      value = JSON.stringify(source.credentialFields || [], null, 2)
  }
  return value
}

export function buildResourceEditorPayload(
  resourceKey: string,
  fields: ResourceEditorField[],
  form: ResourceRow,
  editingRow: ResourceRow | null
) {
  const payload: ResourceRow = {}
  for (const field of fields) {
    const value = form[field.key]
    if (field.omitEmpty && (value === '' || value === undefined || value === null)) continue
    payload[field.key] = value
  }
  if (resourceKey === 'inspirations') normalizeInspirationPayload(payload, editingRow)
  if (resourceKey === 'imageTools') normalizeImageToolPayload(payload, editingRow)
  if (resourceKey === 'tools') normalizeToolPayload(payload)
  return payload
}

function normalizeInspirationPayload(payload: ResourceRow, editingRow: ResourceRow | null) {
  const options = { ...(editingRow?.options || {}) }
  delete options.resolution
  delete options.duration
  delete options.aspectRatio
  delete options.previewVideoUrl
  if (payload.mode === 'VIDEO') {
    options.resolution = payload.videoResolution || '720p'
    options.duration = Number(payload.videoDuration || 5)
    options.aspectRatio = payload.videoAspectRatio || '16:9'
    if (String(payload.externalVideoUrl || '').trim())
      options.previewVideoUrl = String(payload.externalVideoUrl).trim()
  }
  delete payload.externalVideoUrl
  delete payload.videoResolution
  delete payload.videoDuration
  delete payload.videoAspectRatio
  payload.options = options
}

function normalizeImageToolPayload(payload: ResourceRow, editingRow: ResourceRow | null) {
  payload.options = {
    ...(editingRow?.options || {}),
    toolKey: String(payload.toolKey || 'custom').trim(),
    toolType: payload.toolType || 'CUSTOM',
    inputMode: payload.inputMode || 'REFERENCE',
    executionMode: payload.executionMode || 'GENERIC',
    placeholder: String(payload.placeholder || '').trim(),
    outpaintLeft: Number(payload.outpaintLeft || 0),
    outpaintRight: Number(payload.outpaintRight || 0),
    outpaintTop: Number(payload.outpaintTop || 0),
    outpaintBottom: Number(payload.outpaintBottom || 0),
    steps: Number(payload.steps || 30),
    strength: Number(payload.strength ?? 1)
  }
  for (const key of [
    'inputMode',
    'toolType',
    'toolKey',
    'executionMode',
    'placeholder',
    'outpaintLeft',
    'outpaintRight',
    'outpaintTop',
    'outpaintBottom',
    'steps',
    'strength'
  ])
    delete payload[key]
  payload.mode = 'IMAGE_TOOL'
}

function normalizeToolPayload(payload: ResourceRow) {
  for (const [textKey, targetKey] of [
    ['headersText', 'headers'],
    ['secretHeadersText', 'secretHeaders'],
    ['inputSchemaText', 'inputSchema'],
    ['credentialFieldsText', 'credentialFields']
  ] as const) {
    const raw = String(payload[textKey] || '').trim()
    delete payload[textKey]
    if (!raw && textKey === 'secretHeadersText') continue
    try {
      payload[targetKey] = raw ? JSON.parse(raw) : {}
    } catch {
      throw new Error(`${textKey} 不是有效 JSON`)
    }
  }
}
