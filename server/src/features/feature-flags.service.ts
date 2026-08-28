import { Injectable } from '@nestjs/common'
import { FeatureFlagScope, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(key: string, fallback: boolean, userId?: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } })
    if (!flag) return fallback
    if (flag.scope === FeatureFlagScope.GLOBAL) return flag.enabled
    return flag.enabled && Boolean(userId && flag.userIds.includes(userId))
  }

  isEnabled(key: string, userId?: string) {
    return this.resolve(key, false, userId)
  }

  list() {
    return this.prisma.featureFlag.findMany({ orderBy: [{ key: 'asc' }] })
  }

  upsert(key: string, data: { enabled: boolean; scope: FeatureFlagScope; userIds?: string[]; metadata?: Prisma.InputJsonValue }) {
    const userIds = [...new Set((data.userIds || []).map((id) => id.trim()).filter(Boolean))]
    return this.prisma.featureFlag.upsert({
      where: { key },
      update: { enabled: data.enabled, scope: data.scope, userIds, metadata: data.metadata },
      create: { key, enabled: data.enabled, scope: data.scope, userIds, metadata: data.metadata },
    })
  }

  remove(key: string) {
    return this.prisma.featureFlag.deleteMany({ where: { key } })
  }
}
