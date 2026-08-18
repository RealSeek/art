export interface ShortDramaShotDraft {
  episodeTitle: string
  episodeOrder: number
  shotOrder: number
  content: string
}

const EPISODE_HEADING = /^\s*(?:第\s*[一二三四五六七八九十百零〇0-9]+\s*[集幕章]|episode\s*\d+|ep\.?\s*\d+)\s*[:：.、-]?\s*(.*)$/i
const SHOT_HEADING = /^\s*(?:镜头|分镜|shot)\s*[一二三四五六七八九十百零〇0-9]+\s*[:：.、-]?\s*(.*)$/i

export function splitShortDramaScript(source: string, limit = 24): ShortDramaShotDraft[] {
  const lines = source.replace(/\r/g, '').split('\n')
  const episodes: Array<{ title: string; blocks: string[] }> = []
  let episode = { title: '第 1 集', blocks: [] as string[] }
  let paragraph: string[] = []

  const flushParagraph = () => {
    const value = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    if (value) episode.blocks.push(value)
    paragraph = []
  }
  const flushEpisode = () => {
    flushParagraph()
    if (episode.blocks.length) episodes.push(episode)
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const episodeMatch = line.match(EPISODE_HEADING)
    if (episodeMatch) {
      flushEpisode()
      const heading = line.replace(/[:：.、-]\s*$/, '')
      episode = { title: heading || `第 ${episodes.length + 1} 集`, blocks: [] }
      continue
    }
    const shotMatch = line.match(SHOT_HEADING)
    if (shotMatch) {
      flushParagraph()
      if (shotMatch[1]?.trim()) episode.blocks.push(shotMatch[1].trim())
      continue
    }
    if (!line) { flushParagraph(); continue }
    paragraph.push(line)
  }
  flushEpisode()

  const normalized = episodes.filter((item) => item.blocks.length)
  const drafts: ShortDramaShotDraft[] = []
  for (const [episodeIndex, item] of normalized.entries()) {
    for (const block of item.blocks) {
      const sentences = block.split(/(?<=[。！？!?；;])\s*/).filter(Boolean)
      const chunks = sentences.length > 1 ? sentences : [block]
      for (const chunk of chunks) {
        if (drafts.length >= limit) return drafts
        drafts.push({ episodeTitle: item.title || `第 ${episodeIndex + 1} 集`, episodeOrder: episodeIndex + 1, shotOrder: 0, content: chunk.trim() })
      }
    }
  }
  return drafts.map((draft, index, all) => ({
    ...draft,
    shotOrder: all.slice(0, index).filter((item) => item.episodeOrder === draft.episodeOrder).length + 1,
  }))
}
