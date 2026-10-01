/**
 * The spot page's litter trend as SVG geometry (pure), in the design's 560 × 240 box (SP:359-367:
 * baseline at y 210 from x 20 to 540, 180 px of height, values over a fixed max). x positions come
 * from the adaptive time axis (lib/charts/time-axis.ts, Phase 8 A3): runs of photos get their own
 * stretch, breaks between distant runs are drawn and labelled, ticks fall on round local times.
 */
import { buildTimeAxis } from "./time-axis";

export const TREND_BOX = { w: 560, h: 240, x0: 20, x1: 540, base: 210, height: 180 } as const;

export interface TrendGeometry {
  pts: Array<{ x: number; y: number; run: number }>;
  ticks: Array<{ x: number; label: string; anchor: "start" | "middle" | "end" }>;
  breaks: Array<{ x0: number; x1: number; label: string }>;
  /** Dates under minute/hour runs ("5 Sep 2017 (IST)"). */
  captions: string[];
  /** The top of the value scale (at least 10, else the next multiple of 10). */
  max: number;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function trendGeometry(points: Array<{ t: number; value: number }>, { offsetMinutes = 330 }: { offsetMinutes?: number } = {}): TrendGeometry {
  const { x0, x1, base, height } = TREND_BOX;
  const w = x1 - x0;
  const axis = buildTimeAxis(points.map((p) => p.t), { offsetMinutes });
  const max = Math.max(10, Math.ceil(Math.max(0, ...points.map((p) => p.value)) / 10) * 10);
  const runOf = (t: number) => Math.max(0, axis.runs.findIndex((r) => t >= r.start && t <= r.end));
  const edge = 30;
  return {
    pts: points.map((p) => ({ x: round(x0 + axis.x(p.t) * w), y: round(base - (Math.min(p.value, max) / max) * height), run: runOf(p.t) })),
    ticks: axis.ticks.map((t) => {
      const x = round(x0 + t.x * w);
      return { x, label: t.label, anchor: x - x0 < edge ? "start" : x1 - x < edge ? "end" : "middle" };
    }),
    breaks: axis.breaks.map((b) => ({ x0: round(x0 + b.x0 * w), x1: round(x0 + b.x1 * w), label: b.label })),
    captions: axis.runs.filter((r) => r.caption).map((r) => r.caption!),
    max,
  };
}

/** The line through points 0..upTo (SP:416), solid within a run; a new run starts a new subpath. */
export function trendPath(g: TrendGeometry, upTo: number): string {
  return g.pts
    .slice(0, upTo + 1)
    .map((p, k, all) => `${k && all[k - 1].run === p.run ? "L" : "M"}${p.x} ${p.y}`)
    .join(" ");
}

/** Dashed joins across breaks, for the part of the line drawn so far. */
export function breakJoins(g: TrendGeometry, upTo: number): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let k = 1; k <= Math.min(upTo, g.pts.length - 1); k++) {
    const a = g.pts[k - 1];
    const b = g.pts[k];
    if (a.run !== b.run) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return out;
}
