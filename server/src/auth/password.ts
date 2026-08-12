import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url')
  const key = await scrypt(password, salt, KEY_LENGTH) as Buffer
  return `scrypt$${salt}$${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, encoded] = stored.split('$')
  if (algorithm !== 'scrypt' || !salt || !encoded) return false
  const expected = Buffer.from(encoded, 'base64url')
  const actual = await scrypt(password, salt, expected.byteLength) as Buffer
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual)
}
