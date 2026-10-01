/**
 * Fingerprint glyphs (pure, browser-safe): the 8×8 grid of a 64-bit pHash, as in the design's
 * SK.glyph (saakshi-kit.js:7-17) but from our pHash hex (B5.2). Cell geometry is the design's:
 * each cell at (col + 0.1, row + 0.1), 0.8 wide, corner radius 0.16, in a 0 0 8 8 viewBox.
 */

/** 16 hex digits → 64 "0"/"1" characters, most significant bit first. */
export function hexToBits(hex: string): string {
  if (!/^[0-9a-f]{16}$/i.test(hex)) throw new Error(`Not a 64-bit hex hash: ${hex}`);
  return [...hex.toLowerCase()].map((c) => parseInt(c, 16).toString(2).padStart(4, "0")).join("");
}

/** SK.hex: 64 bits → 16 hex digits. */
export function bitsToHex(bits: string): string {
  if (!/^[01]{64}$/.test(bits)) throw new Error("Not 64 bits");
  return (bits.match(/.{4}/g) ?? []).map((b) => parseInt(b, 2).toString(16)).join("");
}

/** SK.diff: cells that differ (the hamming distance). */
export function diffCells(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) n++;
  return n;
}

/** SK.logoCells: the indelible-ink stroke of the logo, lit on an 8×8 grid. */
export const LOGO_BITS = "0000100000001000000110000001100000011000001110000011100000010000";

export interface GlyphCell {
  x: number;
  y: number;
  on: boolean;
  /** Differs from the comparison hash (diff glyph). */
  diff: boolean;
}

export const CELL = { inset: 0.1, size: 0.8, radius: 0.16 } as const;

export function glyphCells(bits: string, diffWith?: string | null): GlyphCell[] {
  const out: GlyphCell[] = [];
  for (let i = 0; i < 64; i++) {
    const r = Math.floor(i / 8);
    const c = i % 8;
    out.push({ x: c + CELL.inset, y: r + CELL.inset, on: bits[i] === "1", diff: !!diffWith && diffWith[i] !== bits[i] });
  }
  return out;
}

/** The glyph as SVG markup with literal colours, for canvas and texture drawing (DOM uses <Glyph>). */
export function glyphSvg(bits: string, o: { on: string; off: string; hi?: string; diffWith?: string | null }): string {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="geometricPrecision">`;
  for (const cell of glyphCells(bits, o.diffWith)) {
    const fill = cell.diff ? (o.hi ?? o.on) : cell.on ? o.on : o.off;
    s += `<rect x="${cell.x}" y="${cell.y}" width="${CELL.size}" height="${CELL.size}" rx="${CELL.radius}" fill="${fill}"/>`;
  }
  return s + "</svg>";
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
