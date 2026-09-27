/**
 * One background demo-reset job per server process, with a small log for the UI to poll.
 * Rate-limited: one start per minute.
 */
import "server-only";
import { runDemoReset, type DemoSummary } from "./run";

export interface DemoJob {
  id: string;
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  log: string[];
  error: string | null;
  summary: { imported: number; planted: number; statuses: DemoSummary["statuses"]; audit: DemoSummary["audit"]; projects: Array<{ name: string; slug: string; photos: number; spots: number }> } | null;
}

export const RATE_LIMIT_MS = 60_000;
const g = globalThis as typeof globalThis & { __saakshiDemoJob?: DemoJob; __saakshiDemoLastStart?: number };

export function currentDemoJob(): DemoJob | null {
  return g.__saakshiDemoJob ?? null;
}

export type StartResult = { ok: true; job: DemoJob } | { ok: false; reason: "busy" | "rate_limited"; retryAfterS: number };

export function startDemoReset(now = Date.now(), { includeWitness = false }: { includeWitness?: boolean } = {}): StartResult {
  if (g.__saakshiDemoJob?.running) return { ok: false, reason: "busy", retryAfterS: 10 };
  const last = g.__saakshiDemoLastStart ?? 0;
  if (now - last < RATE_LIMIT_MS) return { ok: false, reason: "rate_limited", retryAfterS: Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000) };
  g.__saakshiDemoLastStart = now;

  const job: DemoJob = { id: String(now), running: true, startedAt: new Date(now).toISOString(), finishedAt: null, log: [], error: null, summary: null };
  g.__saakshiDemoJob = job;
  const log = (m: string) => {
    job.log.push(m);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  // Cache-first; fetches from Commons only what the cache lacks.
  void runDemoReset({ offline: false, includeWitness, log })
    .then((s) => {
      job.summary = {
        imported: s.import?.imported ?? 0,
        planted: s.planted?.filter((p) => p.created).length ?? 0,
        statuses: s.statuses,
        audit: s.audit,
        projects: (s.import?.projects ?? []).map((p) => ({ name: p.name, slug: p.slug, photos: p.photos, spots: p.spots.length })),
      };
      log(`Done: ${job.summary.imported} imported, ${job.summary.planted} planted.`);
    })
    .catch((err) => {
      job.error = err instanceof Error ? err.message : String(err);
      log(`Failed: ${job.error}`);
    })
    .finally(() => {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    });
  return { ok: true, job };
}
