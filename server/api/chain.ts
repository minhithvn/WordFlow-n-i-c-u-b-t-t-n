/**
 * Optional serverless adapter (Vercel / Netlify-style `(req, res)` functions).
 * Deploy the `server/` folder and set the same environment variables as .env.example.
 * The endpoint becomes https://<your-app>/api/chain
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createChainHandler } from '../src/handler';

const chain = createChainHandler();

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type,x-app-token');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method !== 'POST') return res.writeHead(405).end();
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0] || 'unknown';
  const out = await chain.handle(req.body ?? {}, { ip, appToken: req.headers['x-app-token'] as string | undefined });
  res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(out.body));
}
