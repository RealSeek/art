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
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: settings.smtpUsername ? { user: settings.smtpUsername, pass: this.crypto.decrypt(settings.encryptedSmtpPassword) } : undefined,
    })
    await transport.sendMail({
      from: { name: settings.smtpFromName || settings.siteName, address: settings.smtpFromEmail },
      to: email,
      subject: `${settings.siteName} 登录验证码`,
      text: `你的登录验证码是 ${code}，${ttlMinutes} 分钟内有效。请勿将验证码告诉他人。`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#171717"><h2 style="margin:0 0 18px">${this.escape(settings.siteName)} 登录验证码</h2><p>使用下面的验证码继续登录：</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:20px 0">${code}</div><p style="color:#666">验证码 ${ttlMinutes} 分钟内有效，请勿将验证码告诉他人。</p></div>`,
    })
    return true
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
  }
}
