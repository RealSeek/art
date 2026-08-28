import type { GenerationRunStatus } from '../types'

export interface GenerationRunState {
  isQueued: boolean
  isRunning: boolean
  isActive: boolean
  isSucceeded: boolean
  isFailed: boolean
  isCancelled: boolean
  isTerminal: boolean
  canCancel: boolean
  canRetry: boolean
}

export function resolveGenerationRunState(status: GenerationRunStatus): GenerationRunState {
  const isQueued = status === 'QUEUED'
  const isRunning = status === 'RUNNING'
  const isSucceeded = status === 'SUCCEEDED'
  const isFailed = status === 'FAILED'
  const isCancelled = status === 'CANCELLED'
  const isActive = isQueued || isRunning

  return {
    isQueued,
    isRunning,
    isActive,
    isSucceeded,
    isFailed,
    isCancelled,
    isTerminal: isSucceeded || isFailed || isCancelled,
    canCancel: isActive,
    canRetry: isFailed || isCancelled,
  }
}

export function isGenerationActive(status: GenerationRunStatus) {
  return resolveGenerationRunState(status).isActive
}

export function isGenerationTerminal(status: GenerationRunStatus) {
  return resolveGenerationRunState(status).isTerminal
}
