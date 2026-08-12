import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsString, Length } from 'class-validator'
import { createHash, randomBytes } from 'node:crypto'
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
  @Get('invites/me') async invite(@CurrentUser() user: AuthenticatedUser) {
    let invitation = await this.prisma.invitation.findFirst({ where: { inviterId: user.id, inviteeId: null } })
    if (!invitation) invitation = await this.prisma.invitation.create({ data: { inviterId: user.id, code: randomBytes(6).toString('base64url').toUpperCase() } })
    const [invited, reward] = await Promise.all([this.prisma.invitation.count({ where: { inviterId: user.id, inviteeId: { not: null } } }), this.prisma.invitation.aggregate({ where: { inviterId: user.id }, _sum: { reward: true } })])
    return { code: invitation.code, url: `${process.env.WEB_ORIGIN?.split(',')[0] || 'http://localhost:5173'}/?invite=${invitation.code}`, invited, reward: reward._sum.reward || 0 }
  }
  @Post('credits/redeem') async redeem(@CurrentUser() user: AuthenticatedUser, @Body() body: RedeemDto) {
    const codeHash = createHash('sha256').update(body.code.trim().toUpperCase()).digest('hex')
    const redemption = await this.prisma.redemptionCode.findUnique({ where: { codeHash } })
    if (!redemption || redemption.disabledAt || redemption.usedCount >= redemption.maxUses || redemption.expiresAt && redemption.expiresAt < new Date()) return { redeemed: false, reason: 'INVALID_CODE' }
    await this.credits.mutate(user.id, redemption.credits, 'REDEEM', '兑换码充值', `redeem:${redemption.id}:${user.id}`, { type: 'redemption', id: redemption.id })
    await this.prisma.redemptionCode.update({ where: { id: redemption.id }, data: { usedCount: { increment: 1 } } })
    return { redeemed: true, credits: redemption.credits }
  }
}
