/** Fingerprint dust geometry (pure: lib/landing/dust.ts): the tile layout and the cursor reveal's nearest glyph. */
import { describe, expect, it } from "vitest";
import { GLYPH_SIDE, glyphOrigin, glyphPhoto, nearestGlyph } from "@/lib/landing/dust";
import { DUST } from "@/lib/motion/scenes/landing";

describe("glyphOrigin", () => {
  it("lays 20 glyphs in rows of 5, every other row shifted (the design's tile, L:dust)", () => {
    expect(glyphOrigin(0)).toEqual({ x: DUST.x0, y: DUST.y0 });
    expect(glyphOrigin(4)).toEqual({ x: 4 * DUST.colStep + DUST.x0, y: DUST.y0 });
    expect(glyphOrigin(5)).toEqual({ x: DUST.x0 + DUST.rowShift, y: DUST.rowStep + DUST.y0 });
    expect(glyphOrigin(10)).toEqual({ x: DUST.x0, y: 2 * DUST.rowStep + DUST.y0 });
    // Every glyph fits in the tile.
    for (let i = 0; i < DUST.glyphs; i++) {
      const o = glyphOrigin(i);
      expect(o.x + GLYPH_SIDE).toBeLessThanOrEqual(DUST.width);
      expect(o.y + GLYPH_SIDE).toBeLessThanOrEqual(DUST.height);
    }
  });

  it("picks photos in the tile's order", () => {
    expect([0, 1, 2, 3].map((i) => glyphPhoto(i, 5))).toEqual([0, 2, 4, 1]);
    expect(glyphPhoto(3, 1)).toBe(0);
  });
});

describe("nearestGlyph", () => {
  const centre = (i: number) => ({ x: glyphOrigin(i).x + GLYPH_SIDE / 2, y: glyphOrigin(i).y + GLYPH_SIDE / 2 });

  it("finds the glyph under the pointer and returns its centre", () => {
    const c = centre(7);
    expect(nearestGlyph(c.x + 3, c.y - 2, 56)).toEqual({ i: 7, x: c.x, y: c.y });
  });

  it("finds glyphs in repeated tiles, in the element's coordinates", () => {
    const c = centre(2);
    expect(nearestGlyph(c.x + 2 * DUST.width, c.y + DUST.height, 56)).toEqual({ i: 2, x: c.x + 2 * DUST.width, y: c.y + DUST.height });
  });

  it("reaches across the tile's edge to the next tile's glyph", () => {
    // Glyph 0 sits near the tile's top-left; from just inside the previous tile's right edge it is closest.
    const c = centre(0);
    const g = nearestGlyph(DUST.width - 4, c.y, 56)!;
    expect(g.i).toBe(0);
    expect(g.x).toBe(c.x + DUST.width);
  });

  it("returns null when no glyph is within reach", () => {
    const a = centre(0);
    const b = centre(1);
    // Halfway between two glyphs in a row is 56 px from each; a 20 px reach finds neither.
    expect(nearestGlyph((a.x + b.x) / 2, a.y, 20)).toBeNull();
  });
});
