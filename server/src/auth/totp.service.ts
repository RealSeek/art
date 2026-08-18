import { Injectable } from '@nestjs/common'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

@Injectable()
export class TotpService {
  generateSecret(bytes = 20) {
    return this.base32Encode(randomBytes(bytes))
  }

  uri(secret: string, account: string, issuer: string) {
    const label = `${issuer}:${account}`
    return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
  }

  verify(secret: string, input: string, now = Date.now()) {
    const code = input.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(code)) return false
    const counter = Math.floor(now / 30_000)
    return [-1, 0, 1].some((offset) => this.safeEqual(code, this.code(secret, counter + offset)))
  }

  recoveryCodes(count = 10) {
    return Array.from({ length: count }, () => randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-'))
  }

  normalizeRecoveryCode(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  }

  private code(secret: string, counter: number) {
    const buffer = Buffer.alloc(8)
    buffer.writeBigUInt64BE(BigInt(counter))
    const digest = createHmac('sha1', this.base32Decode(secret)).update(buffer).digest()
    const offset = digest[digest.length - 1] & 0x0f
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
    return value.toString().padStart(6, '0')
  }

  private base32Encode(value: Buffer) {
    let bits = 0
    let buffer = 0
    let output = ''
    for (const byte of value) {
      buffer = (buffer << 8) | byte
      bits += 8
      while (bits >= 5) {
        output += alphabet[(buffer >>> (bits - 5)) & 31]
        bits -= 5
      }
    }
    if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31]
    return output
  }

  private base32Decode(value: string) {
    let bits = 0
    let buffer = 0
    const bytes: number[] = []
    for (const character of value.toUpperCase().replace(/=+$/, '')) {
      const index = alphabet.indexOf(character)
      if (index < 0) continue
      buffer = (buffer << 5) | index
      bits += 5
      if (bits >= 8) {
        bytes.push((buffer >>> (bits - 8)) & 255)
        bits -= 8
      }
    }
    return Buffer.from(bytes)
  }

  private safeEqual(left: string, right: string) {
    const a = Buffer.from(left)
    const b = Buffer.from(right)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
