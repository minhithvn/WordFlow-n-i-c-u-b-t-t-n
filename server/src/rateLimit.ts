/** Tiny in-memory sliding-window limiter (per IP). Swap for Redis if you scale out. */
export function createRateLimiter(limitPerMinute: number) {
  const hits = new Map<string, number[]>();
  return function allow(key: string, now = Date.now()): boolean {
    const windowStart = now - 60_000;
    const list = (hits.get(key) ?? []).filter((t) => t > windowStart);
    if (list.length >= limitPerMinute) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 10_000) hits.clear(); // memory guard
    return true;
  };
}
