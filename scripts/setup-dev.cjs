const { copyFileSync, existsSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const root = resolve(__dirname, '..')
const server = resolve(root, 'server')
const envFile = resolve(server, '.env')

if (!existsSync(envFile)) {
  copyFileSync(resolve(server, '.env.example'), envFile)
  console.log('[setup:dev] Created server/.env from server/.env.example')
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: server, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status || 1)
}

run('npm', ['exec', '--', 'prisma', 'generate', '--schema', 'prisma/schema.prisma'])
run('npm', ['exec', '--', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'])
run('node', ['scripts/seed-admin.cjs'])

console.log('[setup:dev] Database, system defaults, and development administrator are ready.')
