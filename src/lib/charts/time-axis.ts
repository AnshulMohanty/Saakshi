/**
 * An adaptive time axis for trends (pure). Photos of one spot come in runs, e.g. a clean-up
 * morning, then check-ins years later. One linear axis would squash each run into a dot, so:
 *
 *   - Times split into **runs** wherever a gap is over a quarter of the whole range and over a
 *     day. Each run gets its own stretch of the axis (width by its share of time, at least 15%),
 *     separated by a **break** of fixed width that the chart draws and labels ("2 years later").
 *   - Each run picks its own **tick unit** from its span: minutes (≤ 3 h), hours (≤ 3 days),
 *     days (≤ 90 days), months (≤ 3 years), years. Ticks fall on round local times.
 *   - Positions are 0–1, so any chart library (or SVG) can place them.
 *
 * Times display in a fixed UTC offset (the site's, default +05:30 India), never the viewer's
 * zone, so a 6 pm clean-up reads 18:15 everywhere.
 */
import type { CapturePrecision } from "../db/schema";

export type TimeUnit = "minute" | "hour" | "day" | "month" | "year";

export interface AxisRun {
  start: number;
  end: number;
  x0: number;
  x1: number;
  unit: TimeUnit;
  /** Date shown under minute/hour runs ("5 Sep 2017"), else null. */
  caption: string | null;
}

export interface AxisBreak {
  x0: number;
  x1: number;
  /** "2 years later", "9 months later". */
  label: string;
}

export interface TimeAxis {
  runs: AxisRun[];
  breaks: AxisBreak[];
  ticks: Array<{ x: number; label: string }>;
  /** Position (0–1) of a time. */
  x(t: number): number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const BREAK_WIDTH = 0.05;
export const MIN_RUN_SHARE = 0.15;
const MAX_TICKS_PER_RUN = 4;

export interface AxisOptions {
  /** Display offset from UTC in minutes (India +330). */
  offsetMinutes?: number;
}

/** Wall-clock parts in the display offset. */
function parts(t: number, off: number) {
  const d = new Date(t + off * MIN);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
/** Epoch ms of a wall-clock time in the display offset. */
const at = (off: number, y: number, mo = 0, d = 1, h = 0, mi = 0) => Date.UTC(y, mo, d, h, mi) - off * MIN;

const pad = (n: number) => String(n).padStart(2, "0");

/** "+05:30" → 330 (the EXIF_DEFAULT_UTC_OFFSET format); invalid → 330. */
export function offsetMinutes(offset: string | null | undefined): number {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset?.trim() ?? "");
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 330;
}
export const dayLabel = (t: number, off = 330) => {
  const p = parts(t, off);
  return `${p.d} ${MONTHS[p.mo]} ${p.y}`;
};
export const zoneLabel = (off = 330) => (off === 330 ? "IST" : `UTC${off < 0 ? "−" : "+"}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`);

/** Full date and time for a tooltip, honest about precision: "5 Sep 2017, 18:15 IST", "5 Sep 2017 (date only)". */
/** "5 Sep 2017, 18:15 IST"; with `seconds` and second precision, "5 Sep 2017, 18:15:10 IST". */
export function fullDateTime(t: number, precision: CapturePrecision | null | undefined = "second", off = 330, { seconds = false } = {}): string {
  const p = parts(t, off);
  if (precision === "year") return `${p.y} (year only)`;
  if (precision === "month") return `${MONTHS[p.mo]} ${p.y} (month only)`;
  if (precision === "day") return `${dayLabel(t, off)} (date only)`;
  return `${dayLabel(t, off)}, ${pad(p.h)}:${pad(p.mi)}${seconds && (precision ?? "second") === "second" ? `:${pad(p.s)}` : ""} ${zoneLabel(off)}`;
}

/** "5 days later", "9 months later", "2.6 years later" (never rounded up past the truth by much). */
export function gapLabel(ms: number): string {
  const days = ms / DAY;
  const n = (v: number, u: string) => `${v} ${u}${v === 1 ? "" : "s"} later`;
  if (days < 1) return n(Math.max(1, Math.round(ms / HOUR)), "hour");
  if (days < 45) return n(Math.round(days), "day");
  if (days < 548) return n(Math.round(days / 30.44), "month");
  const years = Math.round((days / 365.25) * 10) / 10;
  return `${Number.isInteger(years) ? years : years.toFixed(1)} years later`;
}

export function unitFor(span: number): TimeUnit {
  if (span <= 3 * HOUR) return "minute";
  if (span <= 3 * DAY) return "hour";
  if (span <= 90 * DAY) return "day";
  if (span <= 3 * 365.25 * DAY) return "month";
  return "year";
}

/** Round tick times inside [start, end] for a unit, at most MAX_TICKS_PER_RUN. */
function tickTimes(start: number, end: number, unit: TimeUnit, off: number): number[] {
  const span = Math.max(end - start, 1);
  const steps: Record<TimeUnit, number[]> = { minute: [1, 2, 5, 10, 15, 30, 60], hour: [1, 2, 3, 6, 12, 24], day: [1, 2, 7, 14, 30], month: [1, 2, 3, 6, 12], year: [1, 2, 5, 10, 20] };
  const unitMs: Record<TimeUnit, number> = { minute: MIN, hour: HOUR, day: DAY, month: 30.44 * DAY, year: 365.25 * DAY };
  const step = steps[unit].find((s) => span / (s * unitMs[unit]) <= MAX_TICKS_PER_RUN) ?? steps[unit].at(-1)!;
  const s = parts(start, off);
  let t: number;
  const next = (v: number): number => {
    const p = parts(v, off);
    if (unit === "minute") return v + step * MIN;
    if (unit === "hour") return v + step * HOUR;
    if (unit === "day") return at(off, p.y, p.mo, p.d + step);
    if (unit === "month") return at(off, p.y, p.mo + step, 1);
    return at(off, p.y + step, 0, 1);
  };
  if (unit === "minute") t = at(off, s.y, s.mo, s.d, s.h, Math.ceil(s.mi / step) * step);
  else if (unit === "hour") t = at(off, s.y, s.mo, s.d, Math.ceil((s.h + (s.mi > 0 ? 1 : 0)) / step) * step);
  else if (unit === "day") t = at(off, s.y, s.mo, s.d + (s.h || s.mi ? 1 : 0));
  else if (unit === "month") t = at(off, s.y, s.mo + (s.d > 1 || s.h || s.mi ? 1 : 0), 1);
  else {
    const firstYear = s.mo || s.d > 1 || s.h || s.mi ? s.y + 1 : s.y;
    t = at(off, Math.ceil(firstYear / step) * step, 0, 1);
  }
  const out: number[] = [];
  for (; t <= end && out.length <= MAX_TICKS_PER_RUN; t = next(t)) if (t >= start) out.push(t);
  return out;
}

function tickLabel(t: number, unit: TimeUnit, off: number): string {
  const p = parts(t, off);
  if (unit === "minute" || unit === "hour") return `${pad(p.h)}:${pad(p.mi)}`;
  if (unit === "day") return `${p.d} ${MONTHS[p.mo]}`;
  if (unit === "month") return `${MONTHS[p.mo]} ${p.y}`;
  return String(p.y);
}

export function buildTimeAxis(times: number[], { offsetMinutes: off = 330 }: AxisOptions = {}): TimeAxis {
  const ts = [...new Set(times.filter(Number.isFinite))].sort((a, b) => a - b);
  if (!ts.length) return { runs: [], breaks: [], ticks: [], x: () => 0.5 };
  const total = ts.at(-1)! - ts[0];

  // Runs: split at gaps over a quarter of the range and over a day.
  const groups: number[][] = [[ts[0]]];
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1];
    if (gap > total * 0.25 && gap > DAY) groups.push([ts[i]]);
    else groups.at(-1)!.push(ts[i]);
  }

  // Widths: each run's share of the time covered, but never under MIN_RUN_SHARE (short runs are
  // pinned at the floor and the rest is shared out again), after the breaks take theirs.
  const spans = groups.map((g) => g.at(-1)! - g[0]);
  const covered = spans.reduce((s, v) => s + v, 0);
  const share = spans.map((v) => (covered ? v / covered : 1 / groups.length));
  const floor = Math.min(MIN_RUN_SHARE, 1 / groups.length);
  const pinned = new Set<number>();
  let frac = share;
  for (let changed = true; changed; ) {
    changed = false;
    const rest = 1 - floor * pinned.size;
    const free = share.reduce((acc, v, i) => (pinned.has(i) ? acc : acc + v), 0);
    frac = share.map((v, i) => (pinned.has(i) ? floor : free ? (v / free) * rest : rest / (groups.length - pinned.size)));
    frac.forEach((v, i) => {
      if (!pinned.has(i) && v < floor) {
        pinned.add(i);
        changed = true;
      }
    });
  }
  const avail = 1 - BREAK_WIDTH * (groups.length - 1);
  const widths = frac.map((w) => w * avail);

  const runs: AxisRun[] = [];
  const breaks: AxisBreak[] = [];
  let x = 0;
  groups.forEach((g, i) => {
    const start = g[0];
    const end = g.at(-1)!;
    const unit = unitFor(end - start);
    runs.push({ start, end, x0: x, x1: x + widths[i], unit, caption: unit === "minute" || unit === "hour" ? `${dayLabel(start, off)} (${zoneLabel(off)})` : null });
    x += widths[i];
    if (i < groups.length - 1) {
      breaks.push({ x0: x, x1: x + BREAK_WIDTH, label: gapLabel(groups[i + 1][0] - end) });
      x += BREAK_WIDTH;
    }
  });

  const pos = (t: number): number => {
    const r = runs.find((run) => t >= run.start && t <= run.end) ?? runs.reduce((best, run) => (Math.abs(t - (run.start + run.end) / 2) < Math.abs(t - (best.start + best.end) / 2) ? run : best));
    if (r.end === r.start) return (r.x0 + r.x1) / 2;
    return r.x0 + ((Math.min(Math.max(t, r.start), r.end) - r.start) / (r.end - r.start)) * (r.x1 - r.x0);
  };

  const ticks = runs.flatMap((r) => {
    // A single photo: its date. Otherwise round ticks in the run's unit (or its start, if none fall inside).
    if (r.end === r.start) return [{ x: pos(r.start), label: dayLabel(r.start, off) }];
    const tt = tickTimes(r.start, r.end, r.unit, off);
    return (tt.length ? tt : [r.start]).map((t) => ({ x: pos(t), label: tickLabel(t, r.unit, off) }));
  });
  return { runs, breaks, ticks, x: pos };
}
