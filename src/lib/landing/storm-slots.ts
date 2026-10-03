/**
 * Which grid cell each storm photo lands in (pure). The WebGL stage flies tile i to the cell
 * `${project}:${slot}` and the DOM grid on the map draws the same cells, so both must agree:
 * photos keep their order within a project, the hero project's slot 0 is the hero photo, and a
 * photo whose project isn't on the map joins the hero project.
 */
import type { LandingProject, StormPhoto } from "./types";

export interface StormSlot {
  /** LandingProject.key the photo lands in. */
  k: string;
  slot: number;
}

export function heroKeyOf(projects: LandingProject[]): string {
  return projects.find((p) => p.isHero)?.key ?? projects[0]?.key ?? "";
}

export function stormSlots(tiles: StormPhoto[], projects: LandingProject[]): { slots: StormSlot[]; counts: Record<string, number> } {
  const keys = new Set(projects.map((p) => p.key));
  const hero = heroKeyOf(projects);
  const counts: Record<string, number> = Object.fromEntries(projects.map((p) => [p.key, p.key === hero ? 1 : 0]));
  const slots = tiles.map((t) => {
    const k = keys.has(t.project) ? t.project : hero;
    return { k, slot: counts[k]++ };
  });
  return { slots, counts };
}

export const cellId = (k: string, slot: number) => `${k}:${slot}`;

/** The middle of India (longitude): sites west of it open their grid westward, the rest eastward. */
export const INDIA_MID_LNG = 79.5;

export interface GridBlock {
  key: string;
  pin: { x: number; y: number };
  side: -1 | 1;
  cols: number;
  left: number;
  top: number;
  w: number;
  h: number;
}

/**
 * Where each project's photo grid sits beside its pin (px). Largest project first, each grid takes
 * the side (toward the nearer sea first) where it overlaps the grids already placed the least,
 * vertically centred on its pin; then grids are nudged apart and kept inside the box.
 */
export function gridBlocks(sites: Array<{ key: string; x: number; y: number; n: number }>, o: { cs: number; gap: number; cols: number; midX: number; labelH: number; W: number; H: number; offset?: number }): GridBlock[] {
  const off = o.offset ?? 26;
  const margin = 4;
  const overlap = (a: GridBlock, b: GridBlock) => {
    const x = Math.min(a.left + a.w, b.left + b.w) + 12 - Math.max(a.left, b.left);
    const y = Math.min(a.top + a.h, b.top + b.h) + 10 - Math.max(a.top - o.labelH, b.top - o.labelH);
    return x > 0 && y > 0 ? x * y : 0;
  };
  const clampX = (b: GridBlock) => Math.max(margin, Math.min(o.W - margin - b.w, b.left));
  const placed: GridBlock[] = [];
  for (const s of [...sites].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))) {
    const cols = Math.min(o.cols, Math.max(1, s.n));
    const rows = Math.max(1, Math.ceil(s.n / cols));
    const w = cols * o.cs + (cols - 1) * o.gap;
    const h = rows * o.cs + (rows - 1) * o.gap;
    const pref: -1 | 1 = s.x < o.midX ? -1 : 1;
    let best: GridBlock | null = null;
    let bestCost = Infinity;
    for (const side of [pref, -pref as -1 | 1]) {
      const b: GridBlock = { key: s.key, pin: { x: s.x, y: s.y }, side, cols, left: side < 0 ? s.x - off - w : s.x + off, top: s.y - h / 2, w, h };
      // Pushed back inside the box: a grid that had to move far from its side costs that distance.
      const inside = clampX(b);
      const cost = placed.reduce((n, p) => n + overlap({ ...b, left: inside }, p), 0) + Math.abs(inside - b.left) * h * 0.5 + (side === pref ? 0 : 1);
      if (cost < bestCost) {
        bestCost = cost;
        best = { ...b, left: inside };
      }
    }
    placed.push(best!);
  }
  const order = [...placed].sort((a, b) => a.top - b.top);
  for (let i = 1; i < order.length; i++) for (let j = 0; j < i; j++) if (overlap(order[j], order[i]) > 0) order[i].top = order[j].top + order[j].h + 10 + o.labelH;
  for (const b of order) b.top = Math.max(o.labelH + margin, Math.min(o.H - margin - b.h, b.top));
  return sites.map((s) => placed.find((b) => b.key === s.key)!);
}
