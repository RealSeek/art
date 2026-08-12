import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)

const aliases: Record<string, string> = {
  cjs: 'javascript', html: 'xml', htm: 'xml', js: 'javascript', jsx: 'javascript', md: 'markdown',
  mjs: 'javascript', py: 'python', shell: 'bash', sh: 'bash', svg: 'xml', ts: 'typescript', tsx: 'typescript',
}

export function normalizedLanguage(value?: string) {
  const raw = (value || 'text').trim().toLowerCase().split(/\s+/)[0]
  return aliases[raw] || raw
}

export function languageLabel(value?: string) {
  const raw = (value || 'text').trim().toLowerCase().split(/\s+/)[0]
  const labels: Record<string, string> = { html: 'HTML', htm: 'HTML', css: 'CSS', js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX', json: 'JSON', py: 'Python', python: 'Python', sh: 'Shell', bash: 'Shell', sql: 'SQL', md: 'Markdown', markdown: 'Markdown', svg: 'SVG', text: 'Text', plaintext: 'Text' }
  return labels[raw] || raw.toUpperCase()
}

export function highlightCode(code: string, language?: string) {
  const normalized = normalizedLanguage(language)
  return hljs.getLanguage(normalized)
    ? hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value
    : hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value
}

export function isPreviewableCode(code: string, language?: string) {
  const raw = (language || '').trim().toLowerCase().split(/\s+/)[0]
  return ['html', 'htm', 'svg'].includes(raw) || /<!doctype\s+html|<html[\s>]/i.test(code)
}

export function artifactTitle(code: string, language?: string) {
  const title = code.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
  return title || `${languageLabel(language)} 预览`
}

export function artifactDocument(code: string, language?: string) {
  const raw = (language || '').trim().toLowerCase().split(/\s+/)[0]
  if (raw === 'svg' && !/<html[\s>]/i.test(code)) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{min-height:100%;margin:0;display:grid;place-items:center;background:#f6f7f8}svg{max-width:100%;height:auto}</style></head><body>${code}</body></html>`
  }
  return code
}

export function artifactExtension(language?: string) {
  const raw = (language || '').trim().toLowerCase().split(/\s+/)[0]
  return raw === 'svg' ? 'svg' : 'html'
}
