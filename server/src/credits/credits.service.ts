import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { LedgerType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}
  async balance(userId: string) { return this.prisma.creditAccount.findUniqueOrThrow({ where: { userId }, select: { balance: true, updatedAt: true } }) }
  async entries(userId: string, take = 50) { return this.prisma.creditLedger.findMany({ where: { account: { userId } }, orderBy: { createdAt: 'desc' }, take: Math.min(take, 100) }) }
  async mutate(userId: string, amount: number, type: LedgerType, description: string, idempotencyKey?: string, reference?: { type: string; id: string }) {
    if (!Number.isInteger(amount) || amount === 0) throw new ConflictException('无效的创作点变更')
    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.creditLedger.findUnique({ where: { idempotencyKey } })
        if (existing) return existing
      }
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { userId } })
      const next = account.balance + amount
      if (next < 0) throw new HttpException('创作点不足', HttpStatus.PAYMENT_REQUIRED)
      const updated = await tx.creditAccount.updateMany({ where: { id: account.id, version: account.version }, data: { balance: next, version: { increment: 1 } } })
      if (updated.count !== 1) throw new ConflictException('创作点账户发生并发更新，请重试')
      return tx.creditLedger.create({ data: { accountId: account.id, type, amount, balanceAfter: next, description, idempotencyKey, referenceType: reference?.type, referenceId: reference?.id } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }
}
