import type { Config } from '../config';
import { anthropicProvider } from './anthropic';
import { openAICompatibleProvider } from './openai';
import type { LLMProvider } from './types';

/** Returns null for demo mode (the chain service then uses the offline engine). */
export function createProvider(cfg: Config): LLMProvider | null {
  switch (cfg.provider) {
    case 'anthropic':
      if (!cfg.apiKey) throw new Error('AI_API_KEY is required for AI_PROVIDER=anthropic');
      return anthropicProvider({ apiKey: cfg.apiKey, model: cfg.model || 'claude-haiku-4-5', baseUrl: cfg.baseUrl });
    case 'openai':
      return openAICompatibleProvider({
        apiKey: cfg.apiKey,
        model: cfg.model || 'gpt-4o-mini',
        baseUrl: cfg.baseUrl,
        jsonMode: cfg.jsonMode,
      });
    case 'demo':
      return null;
    default:
      throw new Error(`Unknown AI_PROVIDER "${cfg.provider}" (use anthropic | openai | demo)`);
  }
}

export type { LLMProvider } from './types';
