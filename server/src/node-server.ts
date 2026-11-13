/**
 * Zero-dependency HTTP server.
 *   GET  /health      → { ok, provider }
 *   POST /api/chain   → ChainResult  (body: ChainRequest)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { config } from './config';
import { createChainHandler } from './handler';

const MAX_BODY = 32 * 1024;

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const allowAll = config.allowedOrigins.includes('*');
  const allowOrigin = allowAll ? '*' : origin && config.allowedOrigins.includes(origin) ? origin : '';
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(allowOrigin
      ? {
          'access-control-allow-origin': allowOrigin,
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type,x-app-token',
        }
      : {}),
  });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

export function startServer(port = config.port) {
  const chain = createChainHandler(config);

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') return send(res, 204, null, origin);
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, provider: chain.providerName }, origin);
    }
    if (req.method === 'POST' && url.pathname === '/api/chain') {
      let body: unknown;
      try {
        body = await readBody(req);
      } catch (e) {
        return send(res, 400, { error: (e as Error).message }, origin);
      }
      const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
      const out = await chain.handle(body, { ip, appToken: req.headers['x-app-token'] as string | undefined });
      return send(res, out.status, out.body, origin);
    }
    send(res, 404, { error: 'not_found' }, origin);
  });

  server.listen(port, () => {
    console.log(`WordFlow API on http://0.0.0.0:${port}  (provider: ${chain.providerName}, env: ${config.env})`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('node-server.ts')) {
  startServer();
}
