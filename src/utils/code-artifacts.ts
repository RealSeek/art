import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import groovy from 'highlight.js/lib/languages/groovy'
import http from 'highlight.js/lib/languages/http'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import nginx from 'highlight.js/lib/languages/nginx'
import objectivec from 'highlight.js/lib/languages/objectivec'
import perl from 'highlight.js/lib/languages/perl'
import php from 'highlight.js/lib/languages/php'
import powershell from 'highlight.js/lib/languages/powershell'
import properties from 'highlight.js/lib/languages/properties'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import vim from 'highlight.js/lib/languages/vim'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('go', go)
hljs.registerLanguage('graphql', graphql)
hljs.registerLanguage('groovy', groovy)
hljs.registerLanguage('http', http)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('makefile', makefile)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('nginx', nginx)
hljs.registerLanguage('objectivec', objectivec)
hljs.registerLanguage('perl', perl)
hljs.registerLanguage('php', php)
hljs.registerLanguage('powershell', powershell)
hljs.registerLanguage('properties', properties)
hljs.registerLanguage('python', python)
hljs.registerLanguage('r', r)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('vim', vim)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

const aliases: Record<string, string> = {
  'c#': 'csharp', 'c++': 'cpp', 'objective-c': 'objectivec', cjs: 'javascript', conf: 'ini', cs: 'csharp', gql: 'graphql', golang: 'go', html: 'xml', htm: 'xml', js: 'javascript', jsx: 'javascript', kt: 'kotlin', md: 'markdown', mjs: 'javascript', mk: 'makefile', objc: 'objectivec', ps1: 'powershell', py: 'python', rs: 'rust', sass: 'scss', shell: 'bash', sh: 'bash', svelte: 'xml', svg: 'xml', ts: 'typescript', tsx: 'typescript', toml: 'ini', txt: 'text', vue: 'xml', yml: 'yaml', zsh: 'bash',
}

export function normalizedLanguage(value?: string) {
  const raw = (value || 'text').trim().toLowerCase().split(/\s+/)[0]
  return aliases[raw] || raw
}

export function languageLabel(value?: string) {
  const raw = (value || 'text').trim().toLowerCase().split(/\s+/)[0]
  const labels: Record<string, string> = { bash: 'Shell', c: 'C', cpp: 'C++', csharp: 'C#', css: 'CSS', diff: 'Diff', dockerfile: 'Dockerfile', go: 'Go', graphql: 'GraphQL', groovy: 'Groovy', html: 'HTML', htm: 'HTML', http: 'HTTP', ini: 'INI', java: 'Java', js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX', json: 'JSON', kotlin: 'Kotlin', lua: 'Lua', makefile: 'Makefile', md: 'Markdown', markdown: 'Markdown', nginx: 'Nginx', objectivec: 'Objective-C', perl: 'Perl', php: 'PHP', powershell: 'PowerShell', properties: 'Properties', py: 'Python', python: 'Python', r: 'R', ruby: 'Ruby', rust: 'Rust', scss: 'SCSS', sh: 'Shell', sql: 'SQL', svg: 'SVG', swift: 'Swift', text: 'Text', plaintext: 'Text', ts: 'TypeScript', typescript: 'TypeScript', tsx: 'TSX', vim: 'Vim', vue: 'Vue', xml: 'XML', yaml: 'YAML' }
  return labels[raw] || raw.toUpperCase()
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function highlightCode(code: string, language?: string) {
  const normalized = normalizedLanguage(language)
  // 未注册语言（plaintext/vue/yaml 等）按纯文本转义输出——高亮失败绝不能拖垮整个页面渲染
  if (!hljs.getLanguage(normalized)) return escapeHtml(code)
  try {
    return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
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
