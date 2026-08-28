import { expect, type Page } from '@playwright/test'

export const adminEmail = process.env.E2E_ADMIN_EMAIL || 'xinyue@xinyue.mom'
export const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'xinyue.mom'
type SessionCookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None' }
let cachedSessionCookie: SessionCookie | undefined

function parseSessionCookie(setCookieHeader: string): SessionCookie | null {
  const [nameValue, ...attributes] = setCookieHeader.split(/;\s*/)
  const separator = nameValue.indexOf('=')
  if (separator <= 0) return null
  const name = nameValue.slice(0, separator)
  const value = nameValue.slice(separator + 1)
  const cookie: SessionCookie = {
    name,
    value,
    domain: 'localhost',
    path: '/',
    expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }
  for (const attribute of attributes) {
    const [rawKey, ...rawValueParts] = attribute.split('=')
    const key = rawKey.trim().toLowerCase()
    const valuePart = rawValueParts.join('=').trim()
    if (key === 'domain' && valuePart) cookie.domain = valuePart.replace(/^\./, '')
    if (key === 'path' && valuePart) cookie.path = valuePart
    if (key === 'expires' && valuePart) {
      const timestamp = Date.parse(valuePart)
      if (!Number.isNaN(timestamp)) cookie.expires = Math.floor(timestamp / 1000)
    }
    if (key === 'samesite') {
      if (valuePart.toLowerCase().includes('strict')) cookie.sameSite = 'Strict'
      else if (valuePart.toLowerCase().includes('none')) cookie.sameSite = 'None'
      else cookie.sameSite = 'Lax'
    }
    if (key === 'httponly') cookie.httpOnly = true
    if (key === 'secure') cookie.secure = true
  }
  return cookie
}

export async function loginAdminByApi(page: Page) {
  if (cachedSessionCookie) {
    await page.context().addCookies([cachedSessionCookie])
    return
  }
  const response = await page.request.post('/v1/auth/admin/login', {
    data: { email: adminEmail, password: adminPassword },
  })
  expect(response.ok()).toBeTruthy()
  const setCookie = response.headersArray().find((header) => header.name.toLowerCase() === 'set-cookie')
  cachedSessionCookie = setCookie ? parseSessionCookie(setCookie.value) || undefined : undefined
  if (cachedSessionCookie) await page.context().addCookies([cachedSessionCookie])
  expect(cachedSessionCookie).toBeTruthy()
}

export async function assertNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}
