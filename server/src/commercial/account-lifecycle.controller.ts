import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AccountDeletionStatus, Prisma } from '@prisma/client'
import { IsOptional, IsString, MaxLength } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { AccountLifecycleService } from './account-lifecycle.service'

class RequestDeletionDto { @IsOptional() @IsString() @MaxLength(2000) reason?: string }

@Controller('users/me/deletion')
@UseGuards(AuthGuard)
export class AccountLifecycleController {
  constructor(private readonly lifecycle: AccountLifecycleService) {}
  @Get() current(@CurrentUser() user: AuthenticatedUser) { return this.lifecycle.current(user.id) }
  @Post() request(@CurrentUser() user: AuthenticatedUser, @Body() body: RequestDeletionDto) { return this.lifecycle.request(user.id, body.reason) }
  @Delete() cancel(@CurrentUser() user: AuthenticatedUser) { return this.lifecycle.cancel(user.id) }
}

@Controller('admin/account-deletions')
@UseGuards(AuthGuard, AdminGuard)
export class AdminAccountLifecycleController {
  constructor(private readonly lifecycle: AccountLifecycleService, private readonly prisma: PrismaService) {}
  @Get() list(@Query('status') status?: AccountDeletionStatus) { return this.lifecycle.list(status) }
  @Post(':id/process') async process(@CurrentUser() admin: AuthenticatedUser, @Req() request: FastifyRequest, @Param('id') id: string) {
    const result = await this.lifecycle.process(id, true)
    await this.prisma.auditLog.create({ data: { actorId: admin.id, action: 'account.deletion.process', targetType: 'user', targetId: result.userId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: result as unknown as Prisma.InputJsonValue } })
    return result
  }
}
