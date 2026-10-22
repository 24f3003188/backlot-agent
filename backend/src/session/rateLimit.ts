/**
 * Minimal in-memory rate limiting for a single-instance demo server.
 * Protects the Qloo quota and Bedrock credits from abuse of a public URL.
 */
interface Bucket { count: number; resetAt: number }

const perKey = new Map<string, Bucket>();

/** Returns null when allowed, or seconds until the limit resets. */
export function hit(key: string, limit: number, windowMs: number): number | null {
  const now = Date.now();
  const b = perKey.get(key);
  if (!b || b.resetAt <= now) {
    perKey.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (b.count >= limit) return Math.ceil((b.resetAt - now) / 1000);
  b.count++;
  return null;
}

// Drop expired buckets so memory stays flat
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of perKey) if (b.resetAt <= now) perKey.delete(k);
}, 10 * 60 * 1000).unref();

export const LIMITS = {
  liveRunsPerIpPerHour: Number(process.env.LIVE_RUNS_PER_IP_PER_HOUR) || 6,
  liveRunsPerDay: Number(process.env.LIVE_RUNS_PER_DAY) || 40,
  briefParsesPerIpPerHour: Number(process.env.BRIEF_PARSES_PER_IP_PER_HOUR) || 30,
};
