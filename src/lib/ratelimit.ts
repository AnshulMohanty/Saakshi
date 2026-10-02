/**
 * In-memory sliding-window rate limiter, per key (usually the client IP). Enough for one Node
 * instance; a multi-instance deploy would move this to Redis/Upstash.
 */
export interface RateLimiter {
  /** Records a hit; returns whether it is allowed and, if not, seconds until it would be. */
  hit(key: string, now?: number): { ok: true } | { ok: false; retryAfterS: number };
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterS: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      return { ok: true };
    },
  };
}

/**
 * Client key: the IP the platform vouches for (Vercel sets x-vercel-forwarded-for and x-real-ip
 * and overwrites x-forwarded-for), else the first X-Forwarded-For hop, else "local". Behind another
 * proxy, configure it to set X-Real-IP.
 */
export function clientKey(request: Request): string {
  const h = request.headers;
  return h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function tooMany(retryAfterS: number): Response {
  return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(retryAfterS) } });
}
