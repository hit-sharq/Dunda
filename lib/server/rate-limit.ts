import { RateLimitError } from "@/lib/errors.server";

interface RateLimiterEntry {
  count: number;
  resetAt: number;
}

const limiters = new Map<string, RateLimiterEntry>();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupScheduled = false;

function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setTimeout(() => {
    const now = Date.now();
    for (const [key, entry] of limiters.entries()) {
      if (entry.resetAt < now) limiters.delete(key);
    }
    cleanupScheduled = false;
  }, CLEANUP_INTERVAL_MS);
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): void {
  const now = Date.now();
  const entry = limiters.get(key);

  if (!entry || entry.resetAt < now) {
    limiters.set(key, { count: 1, resetAt: now + windowMs });
    scheduleCleanup();
    return;
  }

  if (entry.count >= maxRequests) {
    throw new RateLimitError(
      `Too many requests. Try again in ${Math.ceil((entry.resetAt - now) / 1000)} seconds.`,
    );
  }

  entry.count++;
}

export function rateLimit(
  maxRequests: number,
  windowMs: number,
  keyExtractor: (request: Request) => string,
) {
  return (request: Request): void => {
    const key = keyExtractor(request);
    checkRateLimit(key, maxRequests, windowMs);
  };
}

export function clientIpKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return `ip:${ip}`;
}
