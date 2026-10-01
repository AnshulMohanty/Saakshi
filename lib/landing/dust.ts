/**
 * Fingerprint dust on the landing's night stickies (D-0029) and its cursor reveal (D-0088, C26):
 * where each glyph sits in the repeating tile, and which glyph is nearest a pointer. Pure.
 */
import { DUST } from "../motion/scenes/landing";

/** Glyph i's 8 × 8 cell block: top-left corner in the tile. */
export function glyphOrigin(i: number): { x: number; y: number } {
  const row = Math.floor(i / DUST.cols);
  return { x: (i % DUST.cols) * DUST.colStep + DUST.x0 + (row % 2) * DUST.rowShift, y: row * DUST.rowStep + DUST.y0 };
}

/** The reveal (ours; the design names the effect, not its numbers): reach from a glyph's centre, thumbnail side, fade. */
export const DUST_REVEAL = { reach: 56, side: 40, fadeMs: 160 } as const;

/** Side of a glyph in px (8 cells). */
export const GLYPH_SIDE = 8 * DUST.cell;

/** Which of the n distinct photos glyph i draws (the tile repeats them in this order). */
export const glyphPhoto = (i: number, n: number) => (i * 7) % n;

const wrap = (d: number, span: number) => d - span * Math.round(d / span);

/**
 * The glyph nearest (x, y), a point in the dusted element (the tile repeats from its top-left),
 * within `reach` px of the glyph's centre: its index and centre in the element's coordinates.
 */
export function nearestGlyph(x: number, y: number, reach: number): { i: number; x: number; y: number } | null {
  let best: { i: number; x: number; y: number; d: number } | null = null;
  for (let i = 0; i < DUST.glyphs; i++) {
    const o = glyphOrigin(i);
    const dx = wrap(o.x + GLYPH_SIDE / 2 - x, DUST.width);
    const dy = wrap(o.y + GLYPH_SIDE / 2 - y, DUST.height);
    const d = Math.hypot(dx, dy);
    if (d <= reach && (!best || d < best.d)) best = { i, x: x + dx, y: y + dy, d };
  }
  return best && { i: best.i, x: best.x, y: best.y };
}
