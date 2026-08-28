export type GenerationStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

const transitions: Record<GenerationStatus, ReadonlySet<GenerationStatus>> = {
  QUEUED: new Set(['RUNNING', 'FAILED', 'CANCELLED']),
  RUNNING: new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']),
  SUCCEEDED: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
}

export const canTransitionGeneration = (from: GenerationStatus, to: GenerationStatus) => transitions[from].has(to)
export const isTerminalGenerationStatus = (status: GenerationStatus) => transitions[status].size === 0
