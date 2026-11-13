/**
 * Orchestrates one game turn: prompt → LLM → validate → retry → fallback.
 * The player ALWAYS gets a playable sentence: if the LLM fails or keeps
 * producing invalid output, we fall back to the offline demo engine.
 */
import {
  demoGenerate,
  finalizeResult,
  rejectReason,
  type ChainRequest,
  type ChainResult,
  type Rejection,
} from '../../app/shared/src/index';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { ProviderError, type LLMProvider } from './providers/types';

export interface ChainServiceOptions {
  callTimeoutMs: number;
  turnBudgetMs: number;
  maxAttempts: number;
  temperature: number;
  log?: (msg: string) => void;
}

interface ModelJson {
  sentence?: unknown;
  hint_words?: unknown;
}

/** Extract the first JSON object from a model reply (tolerates ```json fences / chatter). */
export function parseModelJson(text: string): ModelJson | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as ModelJson;
  } catch {
    return null;
  }
}

export async function generateChain(
  req: ChainRequest,
  provider: LLMProvider | null,
  opts: ChainServiceOptions,
): Promise<ChainResult> {
  if (!provider) return demoGenerate(req);

  const deadline = Date.now() + opts.turnBudgetMs;
  const system = buildSystemPrompt(req.language);
  let rejection: Rejection | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(opts.callTimeoutMs, remaining));
    try {
      const text = await provider.complete({
        system,
        user: buildUserPrompt(req, rejection),
        signal: controller.signal,
        // a bit more creative on retries
        temperature: Math.min(1.2, opts.temperature + (attempt - 1) * 0.1),
      });
      const json = parseModelJson(text);
      const sentence = typeof json?.sentence === 'string' ? json.sentence : '';
      rejection = rejectReason(sentence, req) ?? undefined;
      if (!rejection) {
        const hints = Array.isArray(json?.hint_words) ? json!.hint_words.filter((h): h is string => typeof h === 'string') : [];
        return finalizeResult(sentence, req, hints, 'ai');
      }
      opts.log?.(`attempt ${attempt} rejected: ${rejection}`);
    } catch (err) {
      const e = err as Error;
      opts.log?.(`attempt ${attempt} failed: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
      if (err instanceof ProviderError && !err.retryable) break; // e.g. 401 bad key — retrying will not help
    } finally {
      clearTimeout(timer);
    }
  }

  return { ...demoGenerate(req), source: 'fallback' };
}
