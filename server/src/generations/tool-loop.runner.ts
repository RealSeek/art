import { Injectable } from '@nestjs/common'

export type ToolLoopCall = { key: string; input: Record<string, unknown> }
export type ToolLoopResult = { tool: string; status: string; output: string }

export type ToolLoopOptions = {
  maxRounds?: number
  maxCallsPerRound?: number
  maxTotalCalls?: number
  timeoutMs?: number
  plan: (round: number, context: string, signal?: AbortSignal) => Promise<ToolLoopCall[]>
  execute: (calls: ToolLoopCall[], round: number, signal?: AbortSignal) => Promise<ToolLoopResult[]>
  formatContext?: (results: ToolLoopResult[]) => string
  onRound?: (event: { round: number; calls: number; results: number; exhausted: boolean }) => void | Promise<void>
}

export type ToolLoopOutcome = {
  results: ToolLoopResult[]
  rounds: number
  calls: number
  exhausted: boolean
}

@Injectable()
export class ToolLoopRunner {
  async run(options: ToolLoopOptions): Promise<ToolLoopOutcome> {
    const maxRounds = this.clamp(options.maxRounds, 1, 6, 3)
    const maxCallsPerRound = this.clamp(options.maxCallsPerRound, 1, 8, 4)
    const maxTotalCalls = this.clamp(options.maxTotalCalls, 1, 24, 8)
    // A tool itself is capped at 30s by the executor, so the loop needs a
    // larger default to permit a small sequential batch before settling.
    const timeoutMs = this.clamp(options.timeoutMs, 1_000, 120_000, 90_000)
    const deadline = Date.now() + timeoutMs
    const controller = new AbortController()
    const results: ToolLoopResult[] = []
    let context = ''
    let rounds = 0
    let calls = 0
    let exhausted = false

    while (rounds < maxRounds && calls < maxTotalCalls && Date.now() < deadline) {
      const round = rounds + 1
      const planned = await this.withTimeout(options.plan(round, context, controller.signal), Math.max(1, deadline - Date.now()), controller)
      const remainingCalls = maxTotalCalls - calls
      const selected = planned.slice(0, Math.min(maxCallsPerRound, remainingCalls))
      if (!selected.length) {
        await options.onRound?.({ round, calls: 0, results: 0, exhausted: false })
        break
      }
      calls += selected.length
      const roundResults = await this.withTimeout(options.execute(selected, round, controller.signal), Math.max(1, deadline - Date.now()), controller)
      results.push(...roundResults)
      rounds = round
      context = options.formatContext ? options.formatContext(roundResults) : JSON.stringify(roundResults).slice(0, 12_000)
      exhausted = calls >= maxTotalCalls || rounds >= maxRounds || Date.now() >= deadline
      await options.onRound?.({ round, calls: selected.length, results: roundResults.length, exhausted })
      if (!roundResults.length) break
    }
    return { results, rounds, calls, exhausted }
  }

  private clamp(value: number | undefined, min: number, max: number, fallback: number) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { controller.abort(); reject(new Error('工具循环超出时间预算')) }, timeoutMs)
      promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
    })
  }
}
