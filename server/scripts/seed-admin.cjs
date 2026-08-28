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
  if (!email || password.length < 8) throw new Error('请在 .env 中配置 ADMIN_EMAIL 和至少 8 位的 ADMIN_PASSWORD')
  const user = await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } })
    const defaultGroup = await tx.userGroup.upsert({
      where: { name: '默认用户' },
      update: { enabled: true },
      create: { name: '默认用户', description: '所有新注册用户的基础权限与计费策略', color: '#397157', enabled: true },
    })
    const existing = await tx.user.findUnique({ where: { email } })
    const passwordHash = hashPassword(password)
    const admin = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerifiedAt: existing.emailVerifiedAt || new Date(),
            ...(!existing.passwordHash || process.env.ADMIN_FORCE_PASSWORD_RESET === 'true' ? { passwordHash } : {}),
          },
        })
      : await tx.user.create({
          data: {
            email,
            displayName: process.env.ADMIN_DISPLAY_NAME?.trim() || '超级管理员',
            emailVerifiedAt: new Date(),
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            passwordHash,
          },
        })
    await tx.userSettings.upsert({ where: { userId: admin.id }, update: {}, create: { userId: admin.id } })
    await tx.creditAccount.upsert({ where: { userId: admin.id }, update: {}, create: { userId: admin.id, balance: 0 } })
    await tx.userGroupMember.upsert({
      where: { groupId_userId: { groupId: defaultGroup.id, userId: admin.id } },
      update: {},
      create: { groupId: defaultGroup.id, userId: admin.id },
    })
    return admin
  })
  console.log(`Super admin ready: ${user.email}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
