type RateLimitBucket = { count: number; resetAt: number };

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 10_000;

function makeRoom(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;
  const oldestKey = buckets.keys().next().value as string | undefined;
  if (oldestKey) buckets.delete(oldestKey);
}

export function hitTelegramRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (existing) buckets.delete(key);
    makeRoom(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  return {
    limited: existing.count > limit,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function resetTelegramRateLimits() {
  buckets.clear();
}
