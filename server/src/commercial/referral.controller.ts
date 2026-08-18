import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ReferralStatus, Prisma } from '@prisma/client'
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { ReferralService } from './referral.service'

class ApproveReferralDto { @IsOptional() @IsBoolean() releaseNow?: boolean }
class RejectReferralDto { @IsString() @MinLength(2) @MaxLength(1000) reason!: string }

@Controller('invites')
@UseGuards(AuthGuard)
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}
  @Get('me') summary(@CurrentUser() user: AuthenticatedUser) { return this.referrals.summary(user.id) }
}

@Controller('admin/referrals')
@UseGuards(AuthGuard, AdminGuard)
export class AdminReferralController {
  constructor(private readonly referrals: ReferralService, private readonly prisma: PrismaService) {}
  @Get() list(@Query('status') status?: ReferralStatus) { return this.referrals.list(status) }
  @Post(':id/approve') approve(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: ApproveReferralDto) { return this.run(admin.id, request, 'referral.approve', id, () => this.referrals.approve(id, admin.id, Boolean(body.releaseNow))) }
  @Post(':id/reject') reject(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string, @Body() body: RejectReferralDto) { return this.run(admin.id, request, 'referral.reject', id, () => this.referrals.reject(id, admin.id, body.reason)) }

  private async run<T>(actorId: string, request: FastifyRequest, action: string, targetId: string, operation: () => Promise<T>) {
    const result = await operation()
    await this.prisma.auditLog.create({ data: { actorId, action, targetType: 'invitation', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: result as unknown as Prisma.InputJsonValue } })
    return result
  }
}
