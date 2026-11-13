/** Server configuration — everything comes from environment variables (.env in dev). */
try {
  // Node ≥ 21.7: load .env if present (ignored in production containers that inject env vars).
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  /* no .env file — fine */
}

export type ProviderName = 'anthropic' | 'openai' | 'demo';

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 8787),
  env: process.env.NODE_ENV ?? 'development',

  provider: (process.env.AI_PROVIDER ?? 'demo').toLowerCase() as ProviderName,
  apiKey: process.env.AI_API_KEY ?? '',
  model: process.env.AI_MODEL ?? '',
  /** OpenAI-compatible base URL: OpenAI, Gemini (openai compat), OpenRouter, Groq, Ollama, LM Studio… */
  baseUrl: process.env.AI_BASE_URL ?? '',
  jsonMode: (process.env.AI_JSON_MODE ?? 'true') !== 'false',
  temperature: num(process.env.AI_TEMPERATURE, 0.9),

  /** Per-LLM-call timeout and total budget for one game turn (incl. retries). */
  callTimeoutMs: num(process.env.AI_TIMEOUT_MS, 8000),
  turnBudgetMs: num(process.env.AI_TURN_BUDGET_MS, 13000),
  maxAttempts: num(process.env.AI_MAX_ATTEMPTS, 3),

  /** Comma separated, "*" allows all (fine for a native app; restrict for web). */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  rateLimitPerMin: num(process.env.RATE_LIMIT_PER_MIN, 40),
  /** Optional shared token the app sends in `x-app-token` — deters casual abuse of your endpoint. */
  appToken: process.env.APP_TOKEN ?? '',
};

export type Config = typeof config;
