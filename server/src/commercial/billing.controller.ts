import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { InvoiceStatus, Prisma } from '@prisma/client'
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import type { FastifyRequest } from 'fastify'
import { AdminGuard } from '../admin/admin.guard'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PrismaService } from '../prisma/prisma.service'
import { BillingProfileInput, BillingService } from './billing.service'

class BillingProfileDto implements BillingProfileInput {
  @IsIn(['PERSONAL', 'COMPANY']) profileType!: 'PERSONAL' | 'COMPANY'
  @IsString() @MinLength(1) @MaxLength(200) title!: string
  @IsOptional() @IsString() @MaxLength(100) taxId?: string
  @IsEmail() @MaxLength(320) invoiceEmail!: string
  @IsOptional() @IsString() @MaxLength(50) phone?: string
  @IsOptional() @IsString() @MaxLength(1000) address?: string
  @IsOptional() @IsString() @MaxLength(200) bankName?: string
  @IsOptional() @IsString() @MaxLength(200) bankAccount?: string
}
class InvoiceRequestDto { @IsString() transactionId!: string; @IsIn(['ELECTRONIC_NORMAL', 'ELECTRONIC_SPECIAL']) invoiceType!: string }
class IssueInvoiceDto { @IsString() @MinLength(1) @MaxLength(100) invoiceNumber!: string; @IsString() @MinLength(1) @MaxLength(2000) invoiceUrl!: string }
class RejectInvoiceDto { @IsString() @MinLength(2) @MaxLength(2000) reason!: string }

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('profile') profile(@CurrentUser() user: AuthenticatedUser) { return this.billing.profile(user.id) }
  @Patch('profile') save(@CurrentUser() user: AuthenticatedUser, @Body() body: BillingProfileDto) { return this.billing.saveProfile(user.id, body) }
  @Delete('profile') remove(@CurrentUser() user: AuthenticatedUser) { return this.billing.removeProfile(user.id) }
  @Get('invoice-transactions') eligible(@CurrentUser() user: AuthenticatedUser) { return this.billing.eligibleTransactions(user.id) }
  @Get('invoices') invoices(@CurrentUser() user: AuthenticatedUser) { return this.billing.invoices(user.id) }
  @Post('invoices') request(@CurrentUser() user: AuthenticatedUser, @Body() body: InvoiceRequestDto) { return this.billing.requestInvoice(user.id, body.transactionId, body.invoiceType) }
  @Delete('invoices/:id') cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.billing.cancelInvoice(user.id, id) }
}

@Controller('admin/invoices')
@UseGuards(AuthGuard, AdminGuard)
export class AdminBillingController {
  constructor(private readonly billing: BillingService, private readonly prisma: PrismaService) {}
  @Get() list(@Query('status') status?: InvoiceStatus) { return this.billing.adminInvoices(status) }
  @Post(':id/review') review(@CurrentUser() admin: AuthenticatedUser, @Req() req: FastifyRequest, @Param('id') id: string) { return this.run(admin.id, req, 'invoice.review', id, () => this.billing.review(id)) }
  @Post(':id/issue') issue(@CurrentUser() admin: AuthenticatedUser, @Req() req: FastifyRequest, @Param('id') id: string, @Body() body: IssueInvoiceDto) { return this.run(admin.id, req, 'invoice.issue', id, () => this.billing.issue(id, body.invoiceNumber, body.invoiceUrl)) }
  @Post(':id/reject') reject(@CurrentUser() admin: AuthenticatedUser, @Req() req: FastifyRequest, @Param('id') id: string, @Body() body: RejectInvoiceDto) { return this.run(admin.id, req, 'invoice.reject', id, () => this.billing.reject(id, body.reason)) }

  private async run(actorId: string, request: FastifyRequest, action: string, targetId: string, operation: () => Promise<unknown>) {
    const result = await operation()
    await this.prisma.auditLog.create({ data: { actorId, action, targetType: 'invoice', targetId, ipAddress: request.ip, userAgent: request.headers['user-agent'], after: result as Prisma.InputJsonValue } })
    return result
  }
}
