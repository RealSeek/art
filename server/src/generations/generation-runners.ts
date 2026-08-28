import type { GenerationJob } from '@prisma/client'

export type GenerationKind = 'CHAT' | 'IMAGE' | 'VIDEO' | 'COMMERCE'

export type GenerationRunner = {
  readonly kind: GenerationKind
  run(task: GenerationJob): Promise<void>
}

export class GenerationJobCancelledError extends Error {
  constructor(message = 'Generation job was cancelled') { super(message) }
}

export class GenerationRunnerRegistry {
  private readonly runners = new Map<GenerationKind, GenerationRunner>()

  constructor(runners: GenerationRunner[] = []) {
    for (const runner of runners) this.register(runner)
  }

  register(runner: GenerationRunner) {
    this.runners.set(runner.kind, runner)
    return this
  }

  get(kind: GenerationKind) {
    const runner = this.runners.get(kind)
    if (!runner) throw new Error(`No generation runner registered for ${kind}`)
    return runner
  }

  run(task: GenerationJob) { return this.get(task.kind).run(task) }
}
