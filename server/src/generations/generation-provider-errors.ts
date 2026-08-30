export class ProviderRequestError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

export class TerminalProviderJobError extends ProviderRequestError {}

export class TerminalSettlementError extends Error {}

/** The Provider may already have accepted billable work; retries may only reconcile local state. */
export class ReconciliationRequiredError extends TerminalSettlementError {}
