export class ProviderRequestError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

export class TerminalProviderJobError extends ProviderRequestError {}

