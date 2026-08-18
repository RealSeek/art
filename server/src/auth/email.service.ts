import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer from 'nodemailer'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../providers/credential-crypto.service'

@Injectable()
export class EmailService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly config: ConfigService) {}

  async sendLoginCode(email: string, code: string, ttlMinutes: number) {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.smtpEnabled) {
      if (this.config.get('NODE_ENV') === 'development') return false
      throw new BadRequestException('邮件服务尚未配置，请联系管理员')
    }
    if (!settings.smtpHost || !settings.smtpFromEmail || !settings.encryptedSmtpPassword) throw new BadRequestException('SMTP 配置不完整')
    const transport = this.transport(settings)
    await transport.sendMail({
      from: { name: settings.smtpFromName || settings.siteName, address: settings.smtpFromEmail },
      to: email,
      subject: `${settings.siteName} 登录验证码`,
      text: `你的登录验证码是 ${code}，${ttlMinutes} 分钟内有效。请勿将验证码告诉他人。`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#171717"><h2 style="margin:0 0 18px">${this.escape(settings.siteName)} 登录验证码</h2><p>使用下面的验证码继续登录：</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:20px 0">${code}</div><p style="color:#666">验证码 ${ttlMinutes} 分钟内有效，请勿将验证码告诉他人。</p></div>`,
    })
    return true
  }

  async sendNotification(email: string, subject: string, body: string) {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.smtpEnabled || !settings.smtpHost || !settings.smtpFromEmail || !settings.encryptedSmtpPassword) return false
    const transport = this.transport(settings)
    const safeBody = this.escape(body).replace(/\r?\n/g, '<br>')
    await transport.sendMail({
      from: { name: settings.smtpFromName || settings.siteName, address: settings.smtpFromEmail },
      to: email,
      subject,
      text: body,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:28px;color:#171717"><h2 style="margin:0 0 18px">${this.escape(subject)}</h2><div style="font-size:15px;line-height:1.7">${safeBody}</div><p style="margin-top:28px;color:#777;font-size:12px">${this.escape(settings.siteName)}</p></div>`,
    })
    return true
  }

  async sendTeamInvitation(email: string, teamName: string, inviterName: string, acceptUrl: string) {
    const settings = await this.prisma.systemSetting.findUnique({ where: { id: 'global' } })
    if (!settings?.smtpEnabled || !settings.smtpHost || !settings.smtpFromEmail || !settings.encryptedSmtpPassword) return false
    const transport = this.transport(settings)
    const safeTeam = this.escape(teamName)
    const safeInviter = this.escape(inviterName)
    const safeUrl = this.escape(acceptUrl)
    await transport.sendMail({
      from: { name: settings.smtpFromName || settings.siteName, address: settings.smtpFromEmail },
      to: email,
      subject: `${inviterName} 邀请你加入 ${teamName}`,
      text: `${inviterName} 邀请你加入团队 ${teamName}。请打开以下链接并使用受邀邮箱登录：${acceptUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#171717"><h2 style="margin:0 0 18px">加入 ${safeTeam}</h2><p>${safeInviter} 邀请你加入团队。请使用受邀邮箱登录后接受邀请。</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:11px 18px;background:#171717;color:#fff;text-decoration:none;border-radius:6px">查看团队邀请</a></p><p style="color:#666;font-size:13px">邀请链接 7 天内有效。</p></div>`,
    })
    return true
  }

  private transport(settings: { smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUsername: string; encryptedSmtpPassword: string }) {
    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: settings.smtpUsername ? { user: settings.smtpUsername, pass: this.crypto.decrypt(settings.encryptedSmtpPassword) } : undefined,
    })
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
  }
}
