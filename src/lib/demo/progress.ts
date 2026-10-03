/**
 * Progress for in-process pipeline runs (demo scripts): one line per asset as it finishes, and a
 * heartbeat while waiting, so a long run is never silent. Pure apart from the timer; the clock
 * is injectable for tests.
 */
export interface AssetOutcome {
  label: string;
  /** "ready", "flagged", … or null when a step failed. */
  status: string | null;
  band?: string | null;
  score?: number | null;
  /** The step that failed, with its error. */
  failed?: { step: string; error: string } | null;
  /** e.g. "measured", "cached", "unmeasurable: …", "skipped: flagged". */
  measure?: string | null;
  /** How long its pipeline took. */
  ms?: number;
}

export function outcomeLine(o: AssetOutcome): string {
  const took = o.ms != null ? ` (${(o.ms / 1000).toFixed(0)} s)` : "";
  if (o.failed) return `  ✗ ${o.label}  ${o.failed.step} failed: ${o.failed.error.slice(0, 240)}${took}`;
  const trust = o.band ? ` ${o.band}${o.score != null ? ` ${o.score}` : ""}` : "";
  return `  ✓ ${o.label}  ${o.status ?? "?"}${trust}${o.measure ? `  · measure: ${o.measure.slice(0, 160)}` : ""}${took}`;
}

export class PipelineProgress {
  private started: number;
  private running = new Map<string, number>();
  done = 0;
  failed = 0;
  queued = 0;

  constructor(
    private readonly log: (m: string) => void,
    private readonly now: () => number = Date.now,
  ) {
    this.started = now();
  }

  enqueue() {
    this.queued++;
  }
  start(id: string) {
    this.queued = Math.max(0, this.queued - 1);
    this.running.set(id, this.now());
  }
  finish(id: string, o: AssetOutcome) {
    const from = this.running.get(id);
    this.running.delete(id);
    if (from !== undefined && o.ms === undefined) o = { ...o, ms: this.now() - from };
    if (o.failed) this.failed++;
    else this.done++;
    this.log(outcomeLine(o));
  }

  line(): string {
    const s = Math.round((this.now() - this.started) / 1000);
    const elapsed = s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
    return `  … done ${this.done} / error ${this.failed} / running ${this.running.size} / queued ${this.queued}, ${elapsed} elapsed`;
  }

  /** Logs `line()` every `everyMs` until the promise settles. */
  async heartbeat<T>(work: Promise<T>, everyMs = 30_000): Promise<T> {
    const timer = setInterval(() => this.log(this.line()), everyMs);
    try {
      return await work;
    } finally {
      clearInterval(timer);
    }
  }
}
