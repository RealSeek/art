import { AsyncLocalStorage } from 'node:async_hooks'
import { lookup as dnsLookup } from 'node:dns'
import type { LookupAddress, LookupOptions } from 'node:dns'
import type { LookupFunction } from 'node:net'
import { Agent } from 'undici'
import { isPrivateNetworkAddress, publicHttpUrl } from './public-endpoint-policy.service'

export type OutboundExecutionLease = Readonly<{ workerId: string; leaseVersion: number }>
type OutboundExecutionContext = Readonly<{ signal: AbortSignal; lease?: OutboundExecutionLease }>

const outboundContext = new AsyncLocalStorage<OutboundExecutionContext>()

type PublicAddressResolver = (
  hostname: string,
  options: LookupOptions & { all: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void

export function createPublicNetworkLookup(resolve: PublicAddressResolver = dnsLookup as PublicAddressResolver): LookupFunction {
  return (hostname, options, callback) => resolve(hostname, {
    all: true,
    family: options.family,
    hints: options.hints,
    order: 'verbatim',
  }, (error, addresses) => {
    if (error) {
      callback(error, [])
      return
    }
    if (!addresses.length || addresses.some((entry) => isPrivateNetworkAddress(entry.address))) {
      const denied = Object.assign(new Error('Outbound HTTP target resolved to a non-public address'), { code: 'EACCES' })
      callback(denied, [])
      return
    }
    if (options.all) callback(null, addresses)
    else callback(null, addresses[0].address, addresses[0].family)
  })
}

const publicNetworkLookup = createPublicNetworkLookup()
const publicNetworkDispatcher = new Agent({ connect: { lookup: publicNetworkLookup } })
type FetchInitWithDispatcher = RequestInit & { dispatcher?: Agent }

export class OutboundRedirectError extends Error {
  constructor(status?: number) {
    super(status ? `Outbound HTTP redirect rejected (HTTP ${status})` : 'Outbound HTTP redirects are not allowed')
    this.name = 'OutboundRedirectError'
  }
}

/**
 * Runs Provider-facing work with a signal that is automatically inherited by
 * every fetchNoRedirect call in the async call tree.
 */
export function runWithOutboundSignal<T>(signal: AbortSignal, callback: () => Promise<T>, lease?: OutboundExecutionLease) {
  return outboundContext.run({ signal, lease }, callback)
}

export function currentOutboundExecutionLease() {
  return outboundContext.getStore()?.lease
}

/**
 * Outbound requests fail closed on redirects. This prevents a public endpoint
 * from redirecting a request (and its credentials) to loopback, metadata, or a
 * private network after the original URL has passed validation.
 */
export async function fetchNoRedirect(input: string | URL | Request, init: RequestInit = {}) {
  return fetchWithPolicy(input, init, 'error')
}

/**
 * Public-only outbound requests validate DNS in the connector lookup callback,
 * so the exact address set approved by policy is the one handed to the socket.
 */
export async function fetchPublicNoRedirect(input: string | URL | Request, init: RequestInit = {}) {
  publicHttpUrl(requestUrl(input))
  return fetchWithPolicy(input, init, 'error', publicNetworkDispatcher)
}

/** Used only by callers that validate every Location hop themselves. */
export async function fetchPublicManualRedirect(input: string | URL | Request, init: RequestInit = {}) {
  publicHttpUrl(requestUrl(input))
  return fetchWithPolicy(input, init, 'manual', publicNetworkDispatcher)
}

function requestUrl(input: string | URL | Request) {
  return typeof input === 'string' || input instanceof URL ? input : input.url
}

async function fetchWithPolicy(input: string | URL | Request, init: RequestInit, redirect: RequestRedirect, dispatcher?: Agent) {
  const inheritedSignal = outboundContext.getStore()?.signal
  const signals = [init.signal, inheritedSignal].filter((signal): signal is AbortSignal => Boolean(signal))
  const requestInit: FetchInitWithDispatcher = {
    ...init,
    redirect,
    ...(dispatcher ? { dispatcher } : {}),
    ...(signals.length ? { signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) } : {}),
  }
  const response = await fetch(input, requestInit as RequestInit)
  // Real fetch rejects redirect:'error' before returning a 3xx. Keep this
  // explicit check for alternative fetch implementations and test doubles.
  if (redirect === 'error' && response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined)
    throw new OutboundRedirectError(response.status)
  }
  return response
}
