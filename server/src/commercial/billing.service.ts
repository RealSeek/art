import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InvoiceStatus, Prisma } from '@prisma/client'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'

export type BillingProfileInput = {
  profileType: 'PERSONAL' | 'COMPANY'
  title: string
  taxId?: string
  invoiceEmail: string
  phone?: string
  address?: string
  bankName?: string
  bankAccount?: string
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  profile(userId: string) { return this.prisma.billingProfile.findUnique({ where: { userId } }) }

  saveProfile(userId: string, input: BillingProfileInput) {
    const data = {
      profileType: input.profileType, title: input.title.trim(), taxId: input.taxId?.trim() || '',
      invoiceEmail: input.invoiceEmail.trim().toLowerCase(), phone: input.phone?.trim() || '',
      address: input.address?.trim() || '', bankName: input.bankName?.trim() || '', bankAccount: input.bankAccount?.trim() || '',
    }
    if (data.profileType === 'COMPANY' && !data.taxId) throw new BadRequestException('企业抬头必须填写纳税人识别号')
    return this.prisma.billingProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } })
  }

  removeProfile(userId: string) {
    return this.prisma.billingProfile.deleteMany({ where: { userId } }).then((result) => ({ deleted: Boolean(result.count) }))
  }

  invoices(userId: string) {
    return this.prisma.invoiceRequest.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 200,
      include: { transaction: { select: { id: true, outTradeNo: true, orderType: true, paymentMethod: true, completedAt: true } } },
    })
  }

  eligibleTransactions(userId: string) {
    return this.prisma.paymentTransaction.findMany({
      where: { userId, status: { in: ['COMPLETED', 'REFUNDED'] }, invoiceRequest: null },
      orderBy: { completedAt: 'desc' }, take: 200,
      select: { id: true, outTradeNo: true, orderType: true, status: true, amountCents: true, currency: true, paymentMethod: true, completedAt: true },
    })
  }

  async requestInvoice(userId: string, transactionId: string, invoiceType: string) {
    const [profile, transaction] = await Promise.all([
      this.profile(userId),
      this.prisma.paymentTransaction.findFirst({ where: { id: transactionId, userId }, include: { invoiceRequest: true } }),
    ])
    if (!profile) throw new BadRequestException('请先填写开票资料')
    if (!transaction) throw new NotFoundException('支付交易不存在')
    if (!['COMPLETED', 'REFUNDED'].includes(transaction.status)) throw new BadRequestException('只有已完成的支付交易可以申请发票')
    if (transaction.invoiceRequest) throw new BadRequestException('该交易已经提交过发票申请')
    const snapshot = {
      profileType: profile.profileType, title: profile.title, taxId: profile.taxId,
      invoiceEmail: profile.invoiceEmail, phone: profile.phone, address: profile.address,
      bankName: profile.bankName, bankAccount: profile.bankAccount,
    }
    const created = await this.prisma.invoiceRequest.create({ data: {
      userId, transactionId, amountCents: transaction.amountCents, currency: transaction.currency,
      invoiceType, profileSnapshot: snapshot as Prisma.InputJsonValue,
    } })
    await this.notifications.sendCustomToUsers([userId], '发票申请已提交', `交易 ${transaction.outTradeNo} 的发票申请已进入审核。`)
    return created
  }

  async cancelInvoice(userId: string, id: string) {
    const updated = await this.prisma.invoiceRequest.updateMany({
      where: { id, userId, status: { in: [InvoiceStatus.REQUESTED, InvoiceStatus.REVIEWING] } },
      data: { status: InvoiceStatus.CANCELLED, reviewedAt: new Date() },
    })
    if (!updated.count) throw new BadRequestException('当前发票状态不能撤销')
    return this.prisma.invoiceRequest.findUniqueOrThrow({ where: { id } })
  }

  adminInvoices(status?: InvoiceStatus) {
    return this.prisma.invoiceRequest.findMany({
      where: status ? { status } : undefined, orderBy: { createdAt: 'desc' }, take: 500,
      include: {
        user: { select: { id: true, displayName: true, email: true, company: true } },
        transaction: { select: { id: true, outTradeNo: true, orderType: true, status: true, paymentMethod: true, completedAt: true } },
      },
    })
  }

  async review(id: string) {
    const result = await this.prisma.invoiceRequest.updateMany({ where: { id, status: InvoiceStatus.REQUESTED }, data: { status: InvoiceStatus.REVIEWING, reviewedAt: new Date() } })
    if (!result.count) throw new BadRequestException('只有待审核发票可以开始处理')
    return this.prisma.invoiceRequest.findUniqueOrThrow({ where: { id } })
  }

  async issue(id: string, invoiceNumber: string, invoiceUrl: string) {
    const current = await this.prisma.invoiceRequest.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('发票申请不存在')
    if (current.status !== InvoiceStatus.REQUESTED && current.status !== InvoiceStatus.REVIEWING) throw new BadRequestException('当前发票状态不能开具')
    const safeUrl = this.invoiceUrl(invoiceUrl)
    const result = await this.prisma.invoiceRequest.update({ where: { id }, data: {
      status: InvoiceStatus.ISSUED, invoiceNumber: invoiceNumber.trim(), invoiceUrl: safeUrl,
      rejectionReason: '', reviewedAt: current.reviewedAt || new Date(), issuedAt: new Date(),
    } })
    await this.notifications.sendCustomToUsers([result.userId], '发票已开具', `发票 ${result.invoiceNumber} 已开具，可在套餐与账单中查看。`)
    return result
  }

  async reject(id: string, reason: string) {
    const current = await this.prisma.invoiceRequest.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('发票申请不存在')
    if (current.status !== InvoiceStatus.REQUESTED && current.status !== InvoiceStatus.REVIEWING) throw new BadRequestException('当前发票状态不能拒绝')
    const result = await this.prisma.invoiceRequest.update({ where: { id }, data: { status: InvoiceStatus.REJECTED, rejectionReason: reason.trim(), reviewedAt: new Date() } })
    await this.notifications.sendCustomToUsers([result.userId], '发票申请未通过', result.rejectionReason)
    return result
  }

  private invoiceUrl(value: string) {
    const trimmed = value.trim()
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed
    } catch {}
    throw new BadRequestException('电子发票地址必须是站内路径或 HTTP(S) 地址')
  }
}
