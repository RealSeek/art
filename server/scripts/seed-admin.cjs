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
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ''
  if (!email || password.length < 12) throw new Error('请在 .env 中配置 ADMIN_EMAIL 和至少 12 位的 ADMIN_PASSWORD')
  const passwordHash = hashPassword(password)
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'SUPER_ADMIN', status: 'ACTIVE', passwordHash },
    create: {
      email,
      displayName: '超级管理员',
      emailVerifiedAt: new Date(),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      passwordHash,
      settings: { create: {} },
      creditAccount: { create: { balance: 0 } },
    },
  })
  console.log(`Super admin ready: ${user.email}`)
}

main().finally(() => prisma.$disconnect())
