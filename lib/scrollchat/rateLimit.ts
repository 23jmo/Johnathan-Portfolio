/**
 * Sliding-window rate limiter for the public AI chat endpoint.
 *
 * `/api/chat` is unauthenticated and every request spends real money on the
 * model provider, so the limit exists to cap abuse cost — not to police
 * genuine visitors, whose limits are set well above normal reading pace.
 *
 * State is per-instance and in-memory. On Vercel's Fluid Compute a warm
 * instance is reused across many requests, so this holds in practice, but a
 * scale-out event gives each new instance a fresh counter. That makes the
 * effective ceiling `limit x instances` rather than `limit` — enough to blunt
 * a runaway script by orders of magnitude, but not a hard global guarantee.
 * Swap `recordRequest` for a shared store (Redis/KV) if that ever matters.
 */

export interface RateLimitRule {
  /** Human-readable name, surfaced in server logs when a rule trips. */
  readonly label: string;
  /** Maximum requests permitted inside the window. */
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Seconds until the caller's oldest counted request leaves the window. */
  readonly retryAfterSeconds: number;
  /** The rule that rejected the request, if any. */
  readonly violatedRule: RateLimitRule | null;
}

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

/**
 * Burst catches double-submits and rapid-fire scripts; the hourly ceiling is
 * what actually bounds a patient attacker's spend. A real visitor reads each
 * answer before asking again, so neither is reachable by hand.
 */
const RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  { label: "burst", limit: 5, windowMs: 30 * SECOND_MS },
  { label: "hourly", limit: 40, windowMs: 60 * MINUTE_MS },
];

const LONGEST_WINDOW_MS = Math.max(
  ...RATE_LIMIT_RULES.map((rule) => rule.windowMs)
);

/**
 * Hard cap on tracked clients so a spray of spoofed forwarded-for values can't
 * grow the map without bound. Well above plausible concurrent traffic.
 */
const MAX_TRACKED_CLIENTS = 5_000;

/** clientId -> ascending timestamps of its recent allowed requests. */
const requestTimestampsByClient = new Map<string, number[]>();

/**
 * Identify the caller. On Vercel the platform sets `x-forwarded-for` itself and
 * the client cannot forge it, so the leftmost entry is the real peer address.
 */
export function getClientIdentifier(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const originatingAddress = forwardedFor.split(",")[0]?.trim();
    if (originatingAddress) return originatingAddress;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Drop clients with no activity inside the longest window. */
function evictInactiveClients(now: number): void {
  const cutoff = now - LONGEST_WINDOW_MS;
  for (const [clientId, timestamps] of requestTimestampsByClient) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
      requestTimestampsByClient.delete(clientId);
    }
  }
}

/**
 * Decide whether `clientId` may make a request right now, recording it if so.
 *
 * Rejected requests are deliberately *not* recorded: counting them would let a
 * hammering client extend its own lockout indefinitely, which would strand
 * every innocent visitor sharing that IP behind a NAT with no way to recover.
 */
export function checkRateLimit(
  clientId: string,
  now: number = Date.now()
): RateLimitDecision {
  const staleCutoff = now - LONGEST_WINDOW_MS;
  const recentTimestamps = (
    requestTimestampsByClient.get(clientId) ?? []
  ).filter((timestamp) => timestamp > staleCutoff);

  for (const rule of RATE_LIMIT_RULES) {
    const windowStart = now - rule.windowMs;
    const timestampsInWindow = recentTimestamps.filter(
      (timestamp) => timestamp > windowStart
    );

    if (timestampsInWindow.length >= rule.limit) {
      // Persist the pruned list so the filtering work isn't repeated.
      requestTimestampsByClient.set(clientId, recentTimestamps);
      const oldestInWindow = timestampsInWindow[0];
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((oldestInWindow + rule.windowMs - now) / SECOND_MS)
        ),
        violatedRule: rule,
      };
    }
  }

  recentTimestamps.push(now);
  requestTimestampsByClient.set(clientId, recentTimestamps);

  if (requestTimestampsByClient.size > MAX_TRACKED_CLIENTS) {
    evictInactiveClients(now);
  }

  return { allowed: true, retryAfterSeconds: 0, violatedRule: null };
}

/** Test-only hook so suites don't leak counter state between cases. */
export function resetRateLimitState(): void {
  requestTimestampsByClient.clear();
}
