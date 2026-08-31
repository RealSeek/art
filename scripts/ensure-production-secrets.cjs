const { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } = require('node:fs')
const { randomBytes, createHash } = require('node:crypto')
const { relative, resolve } = require('node:path')

const root = resolve(__dirname, '..')
const example = resolve(root, '.env.production.example')
const envPath = resolve(root, process.argv.find((arg) => arg.startsWith('--env-file='))?.slice(11) || '.env.production')
const localMode = process.argv.includes('--local')

if (!localMode) {
  throw new Error('为避免误改生产配置，必须显式传入 --local；生产环境请使用 secret manager。')
}
const relativeEnvPath = relative(root, envPath)
if (relativeEnvPath.startsWith('..') || relativeEnvPath.includes(':')) {
  throw new Error('环境文件必须位于项目目录内。')
}
if (!existsSync(envPath)) copyFileSync(example, envPath)

function parse(text) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match) values[match[1]] = match[2].trim()
  }
  return values
}

function randomSecret() {
  return randomBytes(32).toString('hex')
}

function placeholder(value) {
  return !value || /(replace-with|change-me|changeme|example|dev_password|default-password|your[_-]|flux[_-]?dev|xinyue[_-]?(?:rc|dev|test)|local[_-]?only|staging|test[_-]?(?:secret|password))/i.test(value)
}

let text = readFileSync(envPath, 'utf8')
let values = parse(text)
const changed = []
function setValue(key, value) {
  const expression = new RegExp(`^${key}=.*$`, 'm')
  if (expression.test(text)) text = text.replace(expression, `${key}=${value}`)
  else text = `${text.replace(/\s*$/, '')}\n${key}=${value}\n`
  values[key] = value
  changed.push(key)
}

let databaseHost = ''
try {
  databaseHost = new URL(values.DATABASE_URL || '').hostname
} catch {
  throw new Error('DATABASE_URL 无法解析；不会生成或写入 Secret。')
}
if (!['postgres', 'localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
  throw new Error(`检测到非本地数据库主机 ${databaseHost}；请不要使用 --local。`)
}

for (const key of ['POSTGRES_PASSWORD', 'SESSION_SECRET', 'CREDENTIAL_ENCRYPTION_KEY', 'INSTALL_TOKEN', 'LOCAL_WORKER_TOKEN']) {
  if (placeholder(values[key])) setValue(key, randomSecret())
}
if (values.NODE_ENV !== 'production') setValue('NODE_ENV', 'production')
if (placeholder(values.XINYUE_HTTP_BIND)) setValue('XINYUE_HTTP_BIND', '0.0.0.0')

values = parse(text)
const required = ['POSTGRES_PASSWORD', 'SESSION_SECRET', 'CREDENTIAL_ENCRYPTION_KEY', 'INSTALL_TOKEN', 'LOCAL_WORKER_TOKEN']
const invalid = required.filter((key) => placeholder(values[key]) || values[key].length < 32)
if (invalid.length) throw new Error(`生成后的 Secret 仍不符合强度要求：${invalid.join(', ')}`)
if (values.SESSION_SECRET === values.CREDENTIAL_ENCRYPTION_KEY) throw new Error('SESSION_SECRET 与 CREDENTIAL_ENCRYPTION_KEY 不能相同。')

writeFileSync(envPath, text.endsWith('\n') ? text : `${text}\n`, { mode: 0o600 })
try { if ((statSync(envPath).mode & 0o077) !== 0) writeFileSync(envPath, readFileSync(envPath), { mode: 0o600 }) } catch { /* Windows does not expose POSIX mode bits. */ }

const fingerprint = createHash('sha256').update(required.map((key) => values[key]).join('\0')).digest('hex').slice(0, 12)
console.log(`[secrets] ${changed.length ? `updated: ${changed.join(', ')}` : 'no changes needed'}`)
console.log(`[secrets] values are not printed; local configuration fingerprint: ${fingerprint}`)
