const { copyFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { randomBytes } = require('node:crypto')

const root = resolve(__dirname, '..')
const server = resolve(root, 'server')
const envFile = resolve(server, '.env')

if (!existsSync(envFile)) {
  copyFileSync(resolve(server, '.env.example'), envFile)
  let env = readFileSync(envFile, 'utf8')
  for (const key of ['SESSION_SECRET', 'INSTALL_TOKEN', 'CREDENTIAL_ENCRYPTION_KEY']) {
    env = env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${randomBytes(32).toString('hex')}`)
  }
  writeFileSync(envFile, env)
  console.log('[setup:dev] Created server/.env from server/.env.example')
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: server, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status || 1)
}

run('npm', ['exec', '--', 'prisma', 'generate', '--schema', 'prisma/schema.prisma'])
run('npm', ['exec', '--', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'])

console.log('[setup:dev] Database and system defaults are ready. Create the first administrator at /install using the INSTALL_TOKEN from server/.env.')
