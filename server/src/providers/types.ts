/**
 * Minimal contract for an LLM provider. Add a new vendor by implementing
 * `complete()` and registering it in providers/index.ts — nothing else changes.
 */
export interface LLMProvider {
  readonly name: string;
  complete(input: { system: string; user: string; signal: AbortSignal; temperature: number }): Promise<string>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = true,
  ) {
    super(message);
  }
}
