require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { randomBytes, scryptSync } = require('node:crypto')

const prisma = new PrismaClient()

function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  const key = scryptSync(password, salt, 64)
  return `scrypt$${salt}$${key.toString('base64url')}`
}

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.ADMIN_PASSWORD || '')
  if (!email || password.length < 8) {
    throw new Error('请在 server/.env 中配置 ADMIN_EMAIL 和至少 8 位的 ADMIN_PASSWORD')
  }

  const admin = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
  if (!admin || !['ADMIN', 'SUPER_ADMIN'].includes(admin.role)) {
    throw new Error(`管理员账户不存在：${email}`)
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: admin.id }, data: { passwordHash: hashPassword(password), status: 'ACTIVE', emailVerifiedAt: new Date() } })
    await tx.session.updateMany({ where: { userId: admin.id, revokedAt: null }, data: { revokedAt: new Date() } })
  })
  console.log(`管理员密码已重置，并已撤销该账户的现有会话：${email}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
