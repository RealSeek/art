const PENDING_IMAGE_PROMPT_KEY = 'xinyue:pending-image-prompt'

export type PendingImagePrompt = {
  prompt: string
  title: string
  sourceName: string
}

export function stageImagePrompt(payload: PendingImagePrompt): void {
  try { sessionStorage.setItem(PENDING_IMAGE_PROMPT_KEY, JSON.stringify(payload)) } catch { /* Use the library without transfer when storage is unavailable. */ }
}

export function consumeImagePrompt(): PendingImagePrompt | null {
  try {
    const prompt = sessionStorage.getItem(PENDING_IMAGE_PROMPT_KEY) || ''
    sessionStorage.removeItem(PENDING_IMAGE_PROMPT_KEY)
    if (!prompt) return null
    try {
      const value = JSON.parse(prompt) as Partial<PendingImagePrompt>
      if (typeof value.prompt !== 'string' || !value.prompt.trim()) return null
      return {
        prompt: value.prompt,
        title: typeof value.title === 'string' ? value.title : '',
        sourceName: typeof value.sourceName === 'string' ? value.sourceName : '',
      }
    } catch {
      // Preserve prompts staged by versions that stored plain text.
      return { prompt, title: '', sourceName: '' }
    }
  } catch {
    return null
  }
}
