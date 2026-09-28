/**
 * One way to call an external API: timeout, retries with exponential backoff and jitter (Retry-After
 * wins when present), and a usage record for every call. Used by every real provider, so behaviour
 * is the same for Cloudinary and OpenAI, and contract tests can swap `fetch` for a recorder.
 *
 * Retried: network errors, 408, 409, 423 (Cloudinary "derived asset being generated"), 429 and
 * 5xx, except errors that need a human (OpenAI insufficient_quota and friends).
 */
import { recordUsage, type UsageEntry } from "../usage";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface CallOptions {
  provider: string;
  operation: string;
  model?: string | null;
  url: string;
  init: RequestInit;
  timeoutMs?: number;
  retries?: number;
  /** Units and cost from the parsed body (tokens, transformations, credits). */
  meter?: (body: unknown, res: Response) => { units?: Record<string, number>; costUsd?: number | null };
  assetId?: string | null;
  /** How to read the body. */
  as?: "json" | "buffer" | "text";
}

export interface HttpDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Where usage goes (default: lib/usage recordUsage). */
  onUsage?: (u: UsageEntry) => void;
}

export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly operation: string,
    readonly status: number | null,
    readonly body: string,
    readonly retryable: boolean,
  ) {
    super(`${provider} ${operation} failed${status ? ` (HTTP ${status})` : ""}: ${body.slice(0, 300)}`);
    this.name = "ProviderHttpError";
  }
}

/** OpenAI error codes that retrying won't fix (docs: error codes, rate limits). */
const NEEDS_A_HUMAN = /insufficient_quota|billing_hard_limit_reached|credit_balance_exhausted|account_deactivated|invalid_api_key/;

export const isRetryableStatus = (status: number) => status === 408 || status === 409 || status === 423 || status === 429 || status >= 500;

/** Retry-After in seconds or as an HTTP date → ms (null if absent or invalid). */
export function retryAfterMs(h: string | null, now = Date.now()): number | null {
  if (!h) return null;
  const s = Number(h);
  if (Number.isFinite(s) && s >= 0) return s * 1000;
  const t = Date.parse(h);
  return Number.isNaN(t) ? null : Math.max(0, t - now);
}

/** Exponential backoff with full jitter: attempt 1 → up to 0.5 s, 2 → 1 s, 3 → 2 s … capped at 20 s. */
export const backoffMs = (attempt: number, random = Math.random) => Math.min(20_000, 500 * 2 ** (attempt - 1)) * (0.5 + random() / 2);

export async function callWithRetry<T = unknown>(o: CallOptions, deps: HttpDeps = {}): Promise<{ body: T; status: number; headers: Headers; attempts: number }> {
  const doFetch = deps.fetch ?? ((u, i) => fetch(u, i));
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = deps.onUsage ?? recordUsage;
  const retries = o.retries ?? 3;
  const started = Date.now();
  let attempt = 0;
  let lastError: ProviderHttpError | null = null;
  while (attempt <= retries) {
    attempt++;
    let res: Response | null = null;
    try {
      res = await doFetch(o.url, { ...o.init, signal: AbortSignal.timeout(o.timeoutMs ?? 60_000) });
    } catch (err) {
      lastError = new ProviderHttpError(o.provider, o.operation, null, err instanceof Error ? err.message : String(err), true);
    }
    if (res) {
      if (res.ok) {
        const body = (o.as === "buffer" ? Buffer.from(await res.arrayBuffer()) : o.as === "text" ? await res.text() : await res.json()) as T;
        const m = o.meter?.(body, res) ?? {};
        log({ provider: o.provider, operation: o.operation, model: o.model ?? null, mode: "real", units: m.units ?? {}, latencyMs: Date.now() - started, costUsd: m.costUsd ?? null, ok: true, status: res.status, attempts: attempt, assetId: o.assetId ?? null, error: null });
        return { body, status: res.status, headers: res.headers, attempts: attempt };
      }
      const text = await res.text().catch(() => "");
      const retryable = isRetryableStatus(res.status) && !NEEDS_A_HUMAN.test(text);
      lastError = new ProviderHttpError(o.provider, o.operation, res.status, text, retryable);
      if (!retryable || attempt > retries) break;
      await sleep(retryAfterMs(res.headers.get("retry-after")) ?? backoffMs(attempt));
      continue;
    }
    if (attempt > retries) break;
    await sleep(backoffMs(attempt));
  }
  log({ provider: o.provider, operation: o.operation, model: o.model ?? null, mode: "real", units: {}, latencyMs: Date.now() - started, costUsd: null, ok: false, status: lastError?.status ?? null, attempts: attempt, assetId: o.assetId ?? null, error: lastError?.message.slice(0, 500) ?? "unknown" });
  throw lastError ?? new ProviderHttpError(o.provider, o.operation, null, "unknown error", false);
}
