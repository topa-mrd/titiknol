/**
 * Rate limit sederhana per IP (sliding window, di memori per instance).
 * Cukup untuk demo: melindungi kuota AI dari klik beruntun atau skrip iseng.
 */

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
    }
    recent.push(now);
    hits.set(key, recent);

    // Bersihkan kunci lama sesekali agar Map tidak tumbuh tanpa batas.
    if (hits.size > 5_000) {
      for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return { ok: true };
  };
}
