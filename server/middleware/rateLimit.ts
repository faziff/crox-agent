import { NextFunction, Request, RequestHandler, Response } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 10_000;
let operationsSinceCleanup = 0;

/**
 * Fixed-window counter shared by middleware instances in this Node process.
 * This is a useful single-instance protection layer; horizontally scaled
 * deployments should replace the backing store with Redis or another shared
 * atomic counter without changing route contracts.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitDecision {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindowMs = Math.max(1_000, Math.floor(windowMs));
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + safeWindowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  operationsSinceCleanup += 1;

  if (operationsSinceCleanup >= 256 || buckets.size > MAX_BUCKETS) {
    operationsSinceCleanup = 0;
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    while (buckets.size > MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  }

  const remaining = Math.max(0, safeLimit - bucket.count);
  return {
    allowed: bucket.count <= safeLimit,
    limit: safeLimit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function createRateLimiter(options: {
  name: string;
  limit: number;
  windowMs: number;
  message?: string;
}): RequestHandler {
  const name = options.name.trim() || 'api';
  const message = options.message || 'Too many requests. Please try again later.';

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const decision = consumeRateLimit(`${name}:${clientIp}`, options.limit, options.windowMs);

    res.setHeader('RateLimit-Limit', String(decision.limit));
    res.setHeader('RateLimit-Remaining', String(decision.remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(decision.resetAt / 1000)));

    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      res.status(429).json({
        error: message,
        retryAfterSeconds: decision.retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
