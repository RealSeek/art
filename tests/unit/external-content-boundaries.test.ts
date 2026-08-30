import assert from 'node:assert/strict'
import test from 'node:test'
import { ExternalMarketService, type ExternalSkill } from '../../server/src/plugins/external-market.service'
import { PromptLibraryService } from '../../server/src/prompt-templates/prompt-library.service'

type PromptSourceRow = {
  id: string
  displayName: string
  enabled: boolean
  sortOrder: number
  reviewAcceptedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function createPromptLibraryService(initial: PromptSourceRow | null = null) {
  let stored = initial
  let upsertArgs:
    | { create: Record<string, unknown>; update: Record<string, unknown> }
    | undefined
  const prisma = {
    promptLibrarySourceConfig: {
      findUnique: async () => stored,
      findMany: async () => (stored ? [stored] : []),
      upsert: async (args: {
        create: Record<string, unknown>
        update: Record<string, unknown>
      }) => {
        upsertArgs = args
        const now = new Date()
        stored = stored
          ? ({ ...stored, ...args.update, updatedAt: now } as PromptSourceRow)
          : ({
              id: 'awesome-gpt-image',
              displayName: 'Awesome GPT Image',
              enabled: false,
              sortOrder: 60,
              reviewAcceptedAt: null,
              createdAt: now,
              updatedAt: now,
              ...args.create,
            } as PromptSourceRow)
        return stored
      },
    },
  }
  return {
    service: new PromptLibraryService(prisma as never, {} as never),
    getStored: () => stored,
    getUpsertArgs: () => upsertArgs,
  }
}

test('external prompt source requires an explicit license review before first enable', async (t) => {
  const previous = process.env.PROMPT_LIBRARY_EXTERNAL_SYNC_ENABLED
  process.env.PROMPT_LIBRARY_EXTERNAL_SYNC_ENABLED = 'false'
  t.after(() => {
    if (previous === undefined) delete process.env.PROMPT_LIBRARY_EXTERNAL_SYNC_ENABLED
    else process.env.PROMPT_LIBRARY_EXTERNAL_SYNC_ENABLED = previous
  })

  const rejected = createPromptLibraryService()
  await assert.rejects(
    () => rejected.service.updateSource('awesome-gpt-image', { enabled: true }),
    /必须确认授权范围/,
  )
  assert.equal(rejected.getUpsertArgs(), undefined)

  const accepted = createPromptLibraryService()
  const result = await accepted.service.updateSource('awesome-gpt-image', {
    enabled: true,
    reviewAccepted: true,
  })
  assert.equal(result.enabled, true)
  assert.ok(accepted.getStored()?.reviewAcceptedAt instanceof Date)
})

test('normal edits do not rewrite an existing prompt source review timestamp', async () => {
  const acceptedAt = new Date('2026-08-30T01:02:03.000Z')
  const fixture: PromptSourceRow = {
    id: 'awesome-gpt-image',
    displayName: 'Awesome GPT Image',
    enabled: true,
    sortOrder: 60,
    reviewAcceptedAt: acceptedAt,
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T00:00:00.000Z'),
  }
  const context = createPromptLibraryService(fixture)
  await context.service.updateSource('awesome-gpt-image', {
    displayName: 'Image prompts',
    enabled: true,
    sortOrder: 61,
  })

  assert.equal('reviewAcceptedAt' in (context.getUpsertArgs()?.update || {}), false)
  assert.equal(context.getStored()?.reviewAcceptedAt, acceptedAt)
})

test('re-enabling an external prompt source requires a fresh explicit review', async () => {
  const fixture: PromptSourceRow = {
    id: 'awesome-gpt-image',
    displayName: 'Awesome GPT Image',
    enabled: false,
    sortOrder: 60,
    reviewAcceptedAt: new Date('2026-08-20T01:02:03.000Z'),
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
  }
  const context = createPromptLibraryService(fixture)
  await assert.rejects(
    () => context.service.updateSource('awesome-gpt-image', { enabled: true }),
    /必须确认授权范围/,
  )
  const previousAcceptedAt = context.getStored()?.reviewAcceptedAt
  await context.service.updateSource('awesome-gpt-image', {
    enabled: true,
    reviewAccepted: true,
  })
  assert.notEqual(context.getStored()?.reviewAcceptedAt, previousAcceptedAt)
})

function externalMarketService() {
  return new ExternalMarketService({} as never) as unknown as {
    mergeItems(items: ExternalSkill[]): ExternalSkill[]
    textResponse(value: string): Promise<string>
    json(value: string): Promise<unknown>
    downloadSkill(item: ExternalSkill): Promise<unknown>
  }
}

function externalSkill(overrides: Partial<ExternalSkill> = {}): ExternalSkill {
  return {
    id: 'example',
    source: 'skillsmp',
    sourceName: 'SkillsMP',
    name: 'Example',
    description: '',
    author: '',
    version: '1.0.0',
    sourceUrl: 'https://skillsmp.com/skills/example',
    skillUrl: 'https://raw.githubusercontent.com/example/example/main/SKILL.md',
    installable: true,
    risk: 'unreviewed',
    ...overrides,
  }
}

test('external marketplace source links fall back to their canonical homepage', () => {
  const service = externalMarketService()
  const [unsafe] = service.mergeItems([
    externalSkill({ sourceUrl: 'https://evil.example/redirect' }),
  ])
  assert.equal(unsafe.sourceUrl, 'https://skillsmp.com/zh/occupations')

  const [allowed] = service.mergeItems([
    externalSkill({ sourceUrl: 'https://github.com/example/example' }),
  ])
  assert.equal(allowed.sourceUrl, 'https://github.com/example/example')
})

test('external marketplace requests reject redirects outside the host allowlist', async (t) => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = []
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), redirect: init?.redirect })
    return new Response(null, {
      status: 302,
      headers: { location: 'https://evil.example/private' },
    })
  }) as typeof fetch
  t.after(() => { globalThis.fetch = originalFetch })

  const service = externalMarketService()
  await assert.rejects(
    () => service.textResponse('https://skillsmp.com/start'),
    /来源不在允许列表/,
  )
  await assert.rejects(
    () => service.json('https://api.skillhub.cn/start'),
    /来源不在允许列表/,
  )
  await assert.rejects(
    () => service.downloadSkill(externalSkill()),
    /来源不在允许列表/,
  )
  assert.equal(calls.length, 3)
  assert.ok(calls.every((call) => call.redirect === 'manual'))
})

test('external marketplace follows only revalidated redirects and caps the chain', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const service = externalMarketService()

  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    if (calls === 1) {
      return new Response(null, { status: 302, headers: { location: '/next' } })
    }
    return new Response('ok', { status: 200 })
  }) as typeof fetch
  assert.equal(await service.textResponse('https://skillsmp.com/start'), 'ok')
  assert.equal(calls, 2)

  calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(null, {
      status: 302,
      headers: { location: `https://skillsmp.com/step-${calls}` },
    })
  }) as typeof fetch
  await assert.rejects(
    () => service.textResponse('https://skillsmp.com/start'),
    /重定向次数超过限制/,
  )
  assert.equal(calls, 4)
})

test('prompt library source fetch revalidates every redirect', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const context = createPromptLibraryService()
  const source = {
    id: 'test-source',
    promptType: 'IMAGE',
    upstreamName: 'Test',
    defaultDisplayName: 'Test',
    url: 'https://cdn.jsdelivr.net/gh/example/source.json',
    format: 'normalized',
  }
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = []
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), redirect: init?.redirect })
    if (calls.length === 1) {
      return new Response(null, { status: 302, headers: { location: '/next.json' } })
    }
    return new Response(JSON.stringify([{ id: 'item' }]), { status: 200 })
  }) as typeof fetch
  const payload = await (context.service as unknown as { fetchSourcePayload(value: unknown): Promise<unknown> }).fetchSourcePayload(source)
  assert.deepEqual(payload, [{ id: 'item' }])
  assert.equal(calls.length, 2)
  assert.ok(calls.every((call) => call.redirect === 'manual'))

  calls.length = 0
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), redirect: init?.redirect })
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/private' } })
  }) as typeof fetch
  await assert.rejects(
    () => (context.service as unknown as { fetchSourcePayload(value: unknown): Promise<unknown> }).fetchSourcePayload({ ...source, url: 'https://cdn.jsdelivr.net/gh/example/source.json' }),
    /不在允许列表/,
  )
})
