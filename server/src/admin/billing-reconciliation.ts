export type ReconciliationLedgerEntry = {
  type: string
  amount: number
  referenceId: string | null
}

export type JobLedger = { spent: number; refunded: number }

export function buildJobLedgers(entries: ReconciliationLedgerEntry[]) {
  const ledgers = new Map<string, JobLedger>()
  for (const entry of entries) {
    if (!entry.referenceId) continue
    const current = ledgers.get(entry.referenceId) || { spent: 0, refunded: 0 }
    if (entry.type === 'SPEND') current.spent += Math.max(0, -entry.amount)
    if (entry.type === 'REFUND') current.refunded += Math.max(0, entry.amount)
    ledgers.set(entry.referenceId, current)
  }
  return ledgers
}

export function reconcileJobLedger(status: string, creditCost: number, ledger?: JobLedger) {
  const current = ledger || { spent: 0, refunded: 0 }
  const expectedNetCharge = status === 'SUCCEEDED' ? Math.max(0, creditCost) : 0
  const netLedgerCharge = current.spent - current.refunded
  const expectedRefund = Math.max(0, current.spent - expectedNetCharge)
  const issues: Array<{
    code: 'REFUND_MISMATCH' | 'MISSING_SPEND' | 'LEDGER_MISMATCH'
    severity: 'CRITICAL'
    message: string
  }> = []
  if (current.spent !== 0 && current.refunded !== expectedRefund) {
    issues.push({
      code: 'REFUND_MISMATCH',
      severity: 'CRITICAL',
      message: `应退款 ${expectedRefund} 点，实际退款 ${current.refunded} 点`
    })
  }
  if (netLedgerCharge !== expectedNetCharge) {
    issues.push({
      code: current.spent === 0 && expectedNetCharge > 0 ? 'MISSING_SPEND' : 'LEDGER_MISMATCH',
      severity: 'CRITICAL',
      message: `任务应净扣 ${expectedNetCharge} 点，账本实际净扣 ${netLedgerCharge} 点`
    })
  }
  return {
    ...current,
    expectedNetCharge,
    expectedRefund,
    netLedgerCharge,
    issues
  }
}
