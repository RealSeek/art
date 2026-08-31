import { Prisma } from '@prisma/client'
import { publicGenerationError } from '../generations/generation-errors'

export const publicAgentGenerationSelect = {
  id: true,
  kind: true,
  status: true,
  creditCost: true,
  errorMessage: true,
} as const satisfies Prisma.GenerationJobSelect

export type PublicAgentGenerationRecord = Prisma.GenerationJobGetPayload<{
  select: typeof publicAgentGenerationSelect
}>

export class PublicAgentGenerationDto {
  id!: string
  status!: PublicAgentGenerationRecord['status']
  creditCost!: number
  errorMessage!: string | null
}

export function toPublicAgentGeneration(
  job: PublicAgentGenerationRecord | null,
): PublicAgentGenerationDto | null {
  if (!job) return null
  return {
    id: job.id,
    status: job.status,
    creditCost: job.creditCost,
    errorMessage: publicGenerationError(job.kind, job.status, job.errorMessage),
  }
}
