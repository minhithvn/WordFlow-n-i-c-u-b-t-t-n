/**
 * Framework-agnostic request handler. Used by the Node server (node-server.ts)
 * and by serverless adapters (api/chain.ts). No user data is stored or logged.
 */
import { sanitizeRequest } from '../../app/shared/src/index';
import { generateChain } from './chainService';
import { config as defaultConfig, type Config } from './config';
import { createProvider, type LLMProvider } from './providers';
import { createRateLimiter } from './rateLimit';

export interface HandlerResponse {
  status: number;
  body: unknown;
}

export function createChainHandler(cfg: Config = defaultConfig, providerOverride?: LLMProvider | null) {
  const provider = providerOverride !== undefined ? providerOverride : createProvider(cfg);
  const allow = createRateLimiter(cfg.rateLimitPerMin);
  const log = cfg.env === 'production' ? undefined : (m: string) => console.log(`[chain] ${m}`);

  return {
    providerName: provider?.name ?? 'demo',

    async handle(rawBody: unknown, ctx: { ip: string; appToken?: string }): Promise<HandlerResponse> {
      if (cfg.appToken && ctx.appToken !== cfg.appToken) {
        return { status: 401, body: { error: 'unauthorized' } };
      }
      if (!allow(ctx.ip)) return { status: 429, body: { error: 'rate_limited' } };

      let req;
      try {
        req = sanitizeRequest(rawBody);
      } catch (e) {
        return { status: 400, body: { error: 'bad_request', message: (e as Error).message } };
      }

      try {
        const result = await generateChain(req, provider, {
          callTimeoutMs: cfg.callTimeoutMs,
          turnBudgetMs: cfg.turnBudgetMs,
          maxAttempts: cfg.maxAttempts,
          temperature: cfg.temperature,
          log,
        });
        return { status: 200, body: result };
      } catch (e) {
        log?.(`unexpected: ${(e as Error).message}`);
        return { status: 500, body: { error: 'server_error' } };
      }
    },
  };
}
