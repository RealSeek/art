import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsString, Length } from 'class-validator'
import { createHash } from 'node:crypto'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUser, AuthenticatedUser } from '../common/request-user'
import { CreditsService } from '../credits/credits.service'
import { PrismaService } from '../prisma/prisma.service'

class RedeemDto { @IsString() @Length(4, 64) code!: string }

@Controller()
@UseGuards(AuthGuard)
export class EngagementController {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService) {}
  @Get('notifications') notifications(@CurrentUser() user: AuthenticatedUser) { return this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }) }
  @Patch('notifications/:id/read') async read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { await this.prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } }); return { read: true } }
  @Post('notifications/read-all') async readAll(@CurrentUser() user: AuthenticatedUser) { await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } }); return { read: true } }
  @Post('credits/redeem') async redeem(@CurrentUser() user: AuthenticatedUser, @Body() body: RedeemDto) {
    const codeHash = createHash('sha256').update(body.code.trim().toUpperCase()).digest('hex')
    const redemption = await this.prisma.redemptionCode.findUnique({ where: { codeHash } })
    if (!redemption || redemption.disabledAt || redemption.usedCount >= redemption.maxUses || redemption.expiresAt && redemption.expiresAt < new Date()) return { redeemed: false, reason: 'INVALID_CODE' }
    await this.credits.mutate(user.id, redemption.credits, 'REDEEM', '兑换码充值', `redeem:${redemption.id}:${user.id}`, { type: 'redemption', id: redemption.id })
    await this.prisma.redemptionCode.update({ where: { id: redemption.id }, data: { usedCount: { increment: 1 } } })
    return { redeemed: true, credits: redemption.credits }
  }
}
