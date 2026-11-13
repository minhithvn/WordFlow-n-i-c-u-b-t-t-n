import { ProviderError, type LLMProvider } from './types';

/**
 * Any OpenAI-compatible Chat Completions endpoint:
 * OpenAI, Google Gemini (…/v1beta/openai), OpenRouter, Groq, Together, Ollama, LM Studio…
 */
export function openAICompatibleProvider(opts: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  jsonMode: boolean;
}): LLMProvider {
  const url = `${(opts.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
  return {
    name: `openai-compatible:${opts.model}`,
    async complete({ system, user, signal, temperature }) {
      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: opts.model,
          temperature,
          max_tokens: 300,
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        throw new ProviderError(`LLM HTTP ${res.status}`, res.status, res.status === 429 || res.status >= 500);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}
