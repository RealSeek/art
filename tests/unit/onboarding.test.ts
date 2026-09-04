import assert from 'node:assert/strict'
import test from 'node:test'
import { UsersController } from '../../server/src/users/users.controller'

test('完成引导必须由服务端落库后才返回非必需状态', async () => {
  let update: Record<string, unknown> = {}
  const prisma = {
    userSettings: {
      upsert: async (input: { update: Record<string, unknown> }) => {
        update = input.update
        return { onboardingRequired: false, onboardingExperience: 'BEGINNER', onboardingCapabilities: ['CHAT', 'IMAGE'], onboardingCompletedAt: new Date('2026-09-04T00:00:00Z') }
      },
    },
  }
  const controller = new UsersController(prisma as never, {} as never, {} as never)

  const result = await controller.updateOnboarding({ id: 'user-1' } as never, { experience: 'BEGINNER', capabilities: ['CHAT', 'IMAGE'], complete: true })

  assert.equal(update.onboardingRequired, false)
  assert.ok(update.onboardingCompletedAt instanceof Date)
  assert.deepEqual(result.capabilities, ['CHAT', 'IMAGE'])
  assert.equal(result.required, false)
})
