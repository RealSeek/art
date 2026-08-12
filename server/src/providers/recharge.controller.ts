import { BadRequestException, Body, Controller, Get, NotFoundException, Post, UseGuards } from '@nestjs/common'
import { IsIn, IsString } from 'class-validator'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedUser, CurrentUser } from '../common/request-user'
import { PAYMENT_METHODS, type PaymentMethod } from '../payments/payment.constants'
import { PrismaService } from '../prisma/prisma.service'

class CreateRechargeOrderDto {
  @IsString() packageId!: string
  @IsIn(PAYMENT_METHODS) paymentMethod!: PaymentMethod
}

@Controller('recharge/orders')
@UseGuards(AuthGuard)
export class RechargeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.rechargeOrder.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { package: { select: { name: true } } } })
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateRechargeOrderDto) {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.rechargeEnabled) throw new BadRequestException('充值功能当前未开放')
    const item = await this.prisma.rechargePackage.findFirst({ where: { id: body.packageId, enabled: true } })
    if (!item) throw new NotFoundException('充值套餐不存在或已下架')
    if (item.priceCents < settings.minRechargeCents) throw new BadRequestException('套餐金额低于系统最低充值金额')
    const pending = await this.prisma.rechargeOrder.findFirst({ where: { userId: user.id, packageId: item.id, paymentMethod: body.paymentMethod, amountCents: item.priceCents, currency: settings.currency, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, include: { package: { select: { name: true } } } })
    if (pending) return pending
    return this.prisma.rechargeOrder.create({ data: { userId: user.id, packageId: item.id, credits: item.credits, amountCents: item.priceCents, currency: settings.currency, paymentMethod: body.paymentMethod }, include: { package: { select: { name: true } } } })
  }
}
