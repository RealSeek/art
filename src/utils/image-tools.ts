export type ImageToolType = 'BACKGROUND_REMOVAL' | 'INPAINT' | 'OUTPAINT' | 'UPSCALE' | 'CUSTOM'
export type ImageToolInputMode = 'REFERENCE' | 'MASK'
export type ImageToolExecutionMode = 'GENERIC' | 'WORKER'

export interface ImageToolOptions {
  toolKey?: string
  toolType?: ImageToolType
  inputMode?: ImageToolInputMode
  executionMode?: ImageToolExecutionMode
  placeholder?: string
  outpaintLeft?: number
  outpaintRight?: number
  outpaintTop?: number
  outpaintBottom?: number
  steps?: number
  strength?: number
  [key: string]: unknown
}

export interface ImageToolRecord {
  id: string
  title: string
  prompt: string
  imageUrl?: string
  model?: string | null
  enabled?: boolean
  options?: ImageToolOptions | null
}

const doubaoToolImages = {
  backgroundRemoval: '/assets/doubao-tools/ai-cutout.png',
  erase: '/assets/doubao-tools/erase.png',
  markedEdit: '/assets/doubao-tools/marker-edit.png',
  outpaint: '/assets/doubao-tools/expand.png',
  enhance: '/assets/doubao-tools/enhance.png',
} as const

const systemTools: ImageToolRecord[] = [
  {
    id: 'system:image-tool:background-removal',
    title: 'AI 抠图',
    prompt: '移除图片主体以外的背景，保留主体、边缘细节和自然透明通道。不要改变主体的颜色、比例或构图。',
    imageUrl: doubaoToolImages.backgroundRemoval,
    options: { toolKey: 'background-removal', toolType: 'BACKGROUND_REMOVAL', inputMode: 'REFERENCE', executionMode: 'GENERIC', placeholder: '可补充抠图要求，例如保留发丝和半透明材质' },
  },
  {
    id: 'system:image-tool:erase',
    title: '擦除',
    prompt: '只移除蒙版标记区域内的对象或瑕疵，并根据周边画面自然补全。保留未标记区域的主体、光影和构图。',
    imageUrl: doubaoToolImages.erase,
    options: { toolKey: 'erase', toolType: 'INPAINT', inputMode: 'MASK', executionMode: 'GENERIC', placeholder: '描述希望擦除或补全的内容' },
  },
  {
    id: 'system:image-tool:marked-edit',
    title: '标记改图',
    prompt: '仅修改蒙版标记区域，并严格按照用户描述完成编辑。其他区域保持不变，确保边缘、光照和透视自然衔接。',
    imageUrl: doubaoToolImages.markedEdit,
    options: { toolKey: 'marked-edit', toolType: 'INPAINT', inputMode: 'MASK', executionMode: 'GENERIC', placeholder: '描述标记区域需要如何修改' },
  },
  {
    id: 'system:image-tool:outpaint',
    title: '扩图',
    prompt: '在不改变原图主体、风格、透视和光照的前提下，向指定边缘自然扩展画面，补全合理背景与细节。',
    imageUrl: doubaoToolImages.outpaint,
    options: { toolKey: 'outpaint', toolType: 'OUTPAINT', inputMode: 'REFERENCE', executionMode: 'GENERIC', placeholder: '描述扩展方向和需要补全的画面' },
  },
  {
    id: 'system:image-tool:enhance',
    title: '变清晰',
    prompt: '提升图片清晰度、细节和有效分辨率，同时保持原图主体、构图、色彩和风格不变。不要凭空添加不相关内容。',
    imageUrl: doubaoToolImages.enhance,
    options: { toolKey: 'enhance', toolType: 'UPSCALE', inputMode: 'REFERENCE', executionMode: 'GENERIC', placeholder: '可补充清晰化要求，例如保留颗粒或文字细节' },
  },
]

function toolKey(tool: ImageToolRecord) {
  const configured = typeof tool.options?.toolKey === 'string' ? tool.options.toolKey.trim() : ''
  return configured || tool.id.replace(/^system:image-tool:/, '')
}

/**
 * System tools remain usable through a generic image-edit model when no Worker is configured.
 * An enabled admin record with the same toolKey overrides the system definition; disabling it hides it.
 */
export function mergeImageTools(configuredTools: ImageToolRecord[]) {
  const configuredByKey = new Map(configuredTools.map((tool) => [toolKey(tool), tool]))
  const merged = systemTools.flatMap((systemTool) => {
    const configured = configuredByKey.get(toolKey(systemTool))
    if (configured?.enabled === false) return []
    if (!configured) return [systemTool]
    return [{
      ...systemTool,
      ...configured,
      prompt: configured.prompt?.trim() || systemTool.prompt,
      // The five built-in tools mirror Doubao's official examples. Keep their
      // local assets stable even when an older admin record still has a stale URL.
      imageUrl: systemTool.imageUrl || configured.imageUrl,
      options: { ...systemTool.options, ...configured.options, toolKey: toolKey(systemTool) },
    }]
  })
  const custom = configuredTools.filter((tool) => !systemTools.some((systemTool) => toolKey(systemTool) === toolKey(tool)) && tool.enabled !== false)
  return [...merged, ...custom]
}

export function isDedicatedImageTool(tool: ImageToolRecord | null | undefined) {
  return Boolean(tool?.id && !tool.id.startsWith('system:image-tool:') && tool.options?.executionMode === 'WORKER')
}
