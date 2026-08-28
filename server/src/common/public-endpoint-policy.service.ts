import { BadRequestException, Injectable } from '@nestjs/common'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

@Injectable()
export class PublicEndpointPolicyService {
  async assertPublicHttpUrl(value: string): Promise<URL> {
    let url: URL
    try { url = new URL(value) } catch { throw new BadRequestException('工具 Endpoint 地址无效') }
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (!['http:', 'https:'].includes(url.protocol) || !hostname || url.username || url.password) throw new BadRequestException('工具 Endpoint 仅允许公网 HTTP/HTTPS 地址')
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new BadRequestException('工具 Endpoint 不允许访问本机或内网')
    let addresses: string[]
    try { addresses = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true, verbatim: true })).map((item) => item.address) } catch { throw new BadRequestException('工具 Endpoint DNS 解析失败') }
    if (!addresses.length || addresses.some((address) => this.isPrivateAddress(address))) throw new BadRequestException('工具 Endpoint 解析到非公网地址')
    return url
  }

  private isPrivateAddress(value: string) {
    const address = value.toLowerCase().replace(/^::ffff:/, '')
    if (address.includes(':')) return address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd') || /^fe[89ab]/.test(address) || address.startsWith('2001:db8:')
    const parts = address.split('.').map(Number)
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
    const [a, b] = parts
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
}
