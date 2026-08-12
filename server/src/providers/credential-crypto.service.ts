import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

@Injectable()
export class CredentialCryptoService {
  private readonly key: Buffer

  constructor(config: ConfigService) {
    const source = config.get<string>('CREDENTIAL_ENCRYPTION_KEY') || config.getOrThrow<string>('SESSION_SECRET')
    this.key = createHash('sha256').update(source).digest()
  }

  encrypt(value: string) {
    const plain = value.trim()
    if (!plain) return ''
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
  }

  decrypt(payload: string) {
    if (!payload) return ''
    const [version, iv, tag, data] = payload.split('.')
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('无法读取已保存的凭据')
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  }

  hint(value: string) {
    const secret = value.trim()
    if (!secret) return ''
    const prefix = secret.startsWith('sk-') ? 'sk-' : ''
    return `${prefix}••••${secret.slice(-4)}`
  }
}
