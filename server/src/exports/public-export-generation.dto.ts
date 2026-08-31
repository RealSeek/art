import { Prisma } from '@prisma/client'
import { publicGenerationError } from '../generations/generation-errors'

export const publicExportGenerationSelect = {
  id: true,
  kind: true,
  status: true,
  model: true,
  prompt: true,
  creditCost: true,
  inputTokens: true,
  outputTokens: true,
  cachedInputTokens: true,
  reasoningTokens: true,
  createdAt: true,
  completedAt: true,
  errorMessage: true,
} as const satisfies Prisma.GenerationJobSelect

export type PublicExportGenerationRecord = Prisma.GenerationJobGetPayload<{
  select: typeof publicExportGenerationSelect
}>

export class PublicExportGenerationDto {
  id!: string
  kind!: PublicExportGenerationRecord['kind']
  status!: PublicExportGenerationRecord['status']
  model!: string
  prompt!: string
  creditCost!: number
  inputTokens!: number
  outputTokens!: number
  cachedInputTokens!: number
  reasoningTokens!: number
  createdAt!: Date
  completedAt!: Date | null
  errorMessage!: string | null
}

export function toPublicExportGeneration(
  job: PublicExportGenerationRecord,
): PublicExportGenerationDto {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    model: job.model,
    prompt: job.prompt,
    creditCost: job.creditCost,
    inputTokens: job.inputTokens,
    outputTokens: job.outputTokens,
    cachedInputTokens: job.cachedInputTokens,
    reasoningTokens: job.reasoningTokens,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    errorMessage: publicGenerationError(job.kind, job.status, job.errorMessage),
  }
}
