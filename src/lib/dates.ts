/**
 * Capture-time precision and event windows (pure).
 *
 * A timestamp with day precision says "some time that day", so two day-precision photos on the
 * same day have an unknown gap and an unknown order. Everything that compares capture times
 * (pairing, bursts, revisits) works on the interval a timestamp stands for, not the point.
 */
export type Precision = "second" | "minute" | "hour" | "day" | "month" | "year";

const MS: Record<Exclude<Precision, "month" | "year">, number> = { second: 1_000, minute: 60_000, hour: 3_600_000, day: 86_400_000 };
const DAY = 86_400_000;

export interface Moment {
  at: string;
  precision: Precision | null;
}

/** [start, end) of what a timestamp can mean. Unknown precision is treated as exact (second). */
export function interval({ at, precision }: Moment): [number, number] {
  const t = Date.parse(at);
  const p = precision ?? "second";
  if (p === "month") {
    const d = new Date(t);
    return [t, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())];
  }
  if (p === "year") {
    const d = new Date(t);
    return [t, Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())];
  }
  return [t, t + MS[p]];
}

export interface Gap {
  /** Smallest and largest possible time from a to b, in hours (b later than a means positive). */
  minHours: number;
  maxHours: number;
  /** a is certainly before b. */
  ordered: boolean;
  /** Both precisions are finer than a day, so the gap is known to within an hour. */
  known: boolean;
}

/** The possible gap from a to b given both timestamps' precision. */
export function gapBetween(a: Moment, b: Moment): Gap {
  const [a0, a1] = interval(a);
  const [b0, b1] = interval(b);
  // The earliest b can be after the latest a, and vice versa.
  const minMs = b0 - (a1 - 1);
  const maxMs = b1 - 1 - a0;
  return {
    minHours: minMs / 3_600_000,
    maxHours: maxMs / 3_600_000,
    ordered: minMs > 0,
    known: a1 - a0 < DAY && b1 - b0 < DAY,
  };
}

/** Absolute gap in hours when both are exact enough, else null (unknown). */
export function knownGapHours(a: Moment, b: Moment): number | null {
  const g = gapBetween(a, b);
  if (!g.known) return null;
  return Math.abs(Date.parse(b.at) - Date.parse(a.at)) / 3_600_000;
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * The event window: the densest run of capture days (consecutive days no more than
 * `maxGapDays` apart, most photos wins, then the earliest), padded by `padDays` on each side.
 */
export function eventWindow(localDates: string[], { padDays = 7, maxGapDays = 7 } = {}): { startDate: string; endDate: string; run: { start: string; end: string; photos: number } } | null {
  const days = localDates.map((d) => d.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!days.length) return null;
  const runs: Array<{ start: string; end: string; photos: number }> = [];
  for (const d of days) {
    const last = runs.at(-1);
    if (last && (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${last.end}T00:00:00Z`)) / DAY <= maxGapDays) {
      last.end = d;
      last.photos++;
    } else runs.push({ start: d, end: d, photos: 1 });
  }
  const best = runs.reduce((a, b) => (b.photos > a.photos ? b : a));
  return {
    startDate: ymd(Date.parse(`${best.start}T00:00:00Z`) - padDays * DAY),
    endDate: ymd(Date.parse(`${best.end}T00:00:00Z`) + padDays * DAY),
    run: best,
  };
}

/** True when a timestamp only gives a date (or less). */
export const dateOnly = (p: Precision | null | undefined) => p === "day" || p === "month" || p === "year";
