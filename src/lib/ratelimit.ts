// Sliding-window rate limiter (in-memory, per instance).
// For multi-instance deployments swap the Map for Redis/Upstash – the API is the same.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterMs: windowMs - (now - hits[0]) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterMs: 0 };
}

export const LIMITS = {
  search: { limit: 20, windowMs: 60 * 60_000 },
  ai: { limit: 120, windowMs: 60 * 60_000 },
  contacts: { limit: 60, windowMs: 60 * 60_000 },
  send: { limit: 20, windowMs: 24 * 60 * 60_000 }, // protects against accidental mass sending
  upload: { limit: 10, windowMs: 60 * 60_000 },
};
