import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateChain, parseModelJson } from '../src/chainService';
import { createChainHandler } from '../src/handler';
import { buildSystemPrompt, buildUserPrompt } from '../src/prompt';
import { ProviderError, type LLMProvider } from '../src/providers/types';
import { config } from '../src/config';
import type { ChainRequest } from '../../app/shared/src/index';

const opts = { callTimeoutMs: 300, turnBudgetMs: 5000, maxAttempts: 3, temperature: 0.9 };
const viReq: ChainRequest = { language: 'vi', topic: 'random', action: 'next', keyword: 'Tôi thích uống cà phê.', history: [] };

function scripted(replies: (string | Error | 'hang')[]): LLMProvider & { calls: number; prompts: string[] } {
  const p = {
    name: 'mock',
    calls: 0,
    prompts: [] as string[],
    async complete({ user, signal }: { user: string; signal: AbortSignal }) {
      p.prompts.push(user);
      const r = replies[Math.min(p.calls++, replies.length - 1)];
      if (r === 'hang') {
        return new Promise<string>((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
      }
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return p;
}

test('parseModelJson tolerates code fences and chatter', () => {
  assert.equal(parseModelJson('Sure!\n```json\n{"sentence":"Hi there friend"}\n```')?.sentence, 'Hi there friend');
  assert.equal(parseModelJson('nope'), null);
});

test('valid model output is accepted; keyword/next_word recomputed, hints cleaned', async () => {
  const p = scripted([JSON.stringify({ sentence: 'Cà phê giúp tôi tỉnh táo mỗi buổi sáng', keyword: 'x', next_word: 'WRONG', hint_words: ['Sáng', 'bình minh', 'sáng', ''] })]);
  const r = await generateChain(viReq, p, opts);
  assert.equal(r.source, 'ai');
  assert.equal(r.sentence, 'Cà phê giúp tôi tỉnh táo mỗi buổi sáng.');
  assert.equal(r.keyword, 'phê');
  assert.equal(r.next_word, 'sáng');
  assert.deepEqual(r.hint_words.slice(0, 2), ['sáng', 'bình minh']);
});

test('invalid output → retry with feedback → success', async () => {
  const p = scripted([
    '{"sentence":"Coffee keeps me awake every morning."}', // wrong language
    '{"sentence":"Trời hôm nay đẹp quá đi thôi."}', // does not link
    '{"sentence":"Phê pha nhất là ly cà phê sữa đá buổi sáng."}',
  ]);
  const r = await generateChain(viReq, p, opts);
  assert.equal(p.calls, 3);
  assert.match(p.prompts[1], /not entirely in the required language/);
  assert.match(p.prompts[2], /did not start with the anchor/);
  assert.equal(r.source, 'ai');
});

test('hanging provider times out and falls back to demo', async () => {
  const p = scripted(['hang']);
  const t0 = Date.now();
  const r = await generateChain(viReq, p, { ...opts, turnBudgetMs: 2500 });
  assert.equal(r.source, 'fallback');
  assert.ok(r.sentence && r.next_word);
  assert.ok(Date.now() - t0 < 3000);
});

test('non-retryable provider error (401) falls back immediately', async () => {
  const p = scripted([new ProviderError('bad key', 401, false)]);
  const r = await generateChain(viReq, p, opts);
  assert.equal(p.calls, 1);
  assert.equal(r.source, 'fallback');
});

test('prompts mention language, anchor, compound, history', () => {
  assert.match(buildSystemPrompt('vi'), /Vietnamese/);
  const u = buildUserPrompt({ ...viReq, keyword: 'học sinh', history: ['Câu cũ.'] });
  assert.match(u, /Anchor word: "sinh" \(it comes from the word "học sinh"\)/);
  assert.match(u, /- Câu cũ\./);
});

test('handler: validation, auth token, rate limit', async () => {
  const h = createChainHandler({ ...config, rateLimitPerMin: 2, appToken: 'secret' }, null);
  assert.equal((await h.handle({ language: 'en', keyword: 'cat' }, { ip: '1', appToken: 'bad' })).status, 401);
  assert.equal((await h.handle({ language: 'xx' }, { ip: '1', appToken: 'secret' })).status, 400);
  const ok = await h.handle({ language: 'en', keyword: 'cat', action: 'next', topic: 'animals' }, { ip: '1', appToken: 'secret' });
  assert.equal(ok.status, 200);
  assert.equal((await h.handle({ language: 'en', keyword: 'cat' }, { ip: '1', appToken: 'secret' })).status, 429);
});

test('HTTP server end-to-end (demo provider)', async () => {
  process.env.AI_PROVIDER = 'demo';
  const { startServer } = await import('../src/node-server');
  const server = startServer(0);
  await new Promise((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  try {
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.ok, true);
    const res = await fetch(`http://127.0.0.1:${port}/api/chain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'en', topic: 'food', action: 'next', keyword: 'I love coffee.', history: [] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.sentence && body.next_word && Array.isArray(body.hint_words));
    const bad = await fetch(`http://127.0.0.1:${port}/api/chain`, { method: 'POST', body: '{oops' });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});
