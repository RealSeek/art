const { copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { basename, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const root = resolve(__dirname, '..')
const envFile = resolve(root, '.env.production')
const composeFile = resolve(root, 'docker-compose.prod.yml')
if (!existsSync(envFile)) throw new Error('缺少 .env.production，不能执行生产备份')

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
const target = resolve(process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) || resolve(root, 'backups', timestamp))
mkdirSync(target, { recursive: true })

const compose = ['compose', '--env-file', envFile, '-f', composeFile]
function run(args, options = {}) {
  const result = spawnSync('docker', [...compose, ...args], { cwd: root, stdio: options.stdio || 'inherit' })
  if (result.status !== 0) throw new Error(`Docker 命令失败：docker ${[...compose, ...args].join(' ')}`)
}
function capture(file, args) {
  const fd = openSync(resolve(target, file), 'w')
  try { run(args, { stdio: ['ignore', fd, 'inherit'] }) } finally { closeSync(fd) }
}
function checksum(file) { return createHash('sha256').update(readFileSync(resolve(target, file))).digest('hex') }

run(['up', '-d', '--wait', '--wait-timeout', '180', 'postgres'])
capture('database.dump', ['exec', '-T', 'postgres', 'pg_dump', '-U', 'flux', '-Fc', 'flux_studio'])
capture('uploads.tar.gz', ['run', '--rm', '-T', '--no-deps', 'backend', 'tar', 'czf', '-', '-C', '/app/uploads', '.'])
run(['up', '-d', '--wait', '--wait-timeout', '180', 'redis'])
run(['exec', '-T', 'redis', 'redis-cli', 'SAVE'])
capture('redis.tar.gz', ['run', '--rm', '-T', '--no-deps', 'redis', 'tar', 'czf', '-', '-C', '/data', '.'])
copyFileSync(envFile, resolve(target, 'environment.production'))
copyFileSync(composeFile, resolve(target, 'docker-compose.prod.yml'))

const files = ['database.dump', 'uploads.tar.gz', 'redis.tar.gz', 'environment.production', 'docker-compose.prod.yml']
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
const manifest = {
  format: 1,
  application: 'OnlyArt',
  createdAt: new Date().toISOString(),
  gitCommit: git.status === 0 ? git.stdout.trim() : '',
  files: Object.fromEntries(files.map((file) => [file, { sha256: checksum(file), bytes: readFileSync(resolve(target, file)).byteLength }])),
}
writeFileSync(resolve(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`[backup] 完成：${target}`)
console.log(`[backup] 文件：${files.map(basename).join(', ')}`)
