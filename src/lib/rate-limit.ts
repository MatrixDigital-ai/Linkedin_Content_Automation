/**
 * Simple in-memory sliding-window rate limiter.
 * Suitable for single-instance Vercel deployments.
 */

const windowMs = 60_000; // 1 minute
const maxRequests = 10;

const hits = new Map<string, number[]>();

export function rateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const timestamps = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    hits.set(ip, timestamps);
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  hits.set(ip, timestamps);
  return { allowed: true, remaining: maxRequests - timestamps.length };
}
