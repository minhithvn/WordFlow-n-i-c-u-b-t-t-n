import { ProviderError, type LLMProvider } from './types';

/** Anthropic Messages API (Claude). */
export function anthropicProvider(opts: { apiKey: string; model: string; baseUrl?: string }): LLMProvider {
  const url = `${(opts.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`;
  return {
    name: `anthropic:${opts.model}`,
    async complete({ system, user, signal, temperature }) {
      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: 300,
          temperature,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) {
        throw new ProviderError(`Anthropic HTTP ${res.status}`, res.status, res.status === 429 || res.status >= 500);
      }
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    },
  };
}
