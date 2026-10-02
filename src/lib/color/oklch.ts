/**
 * OKLCH ↔ sRGB (pure), for reconciling the prototype's hard-coded hex colours with the
 * handoff's OKLCH tokens. Björn Ottosson's OKLab matrices (https://bottosson.github.io/posts/oklab/),
 * sRGB transfer function, gamut-clipped. Used by the design inventory and its tests, not at runtime.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clip = (c: number) => Math.min(1, Math.max(0, c));

export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bb = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  return { r: Math.round(clip(fromLinear(r)) * 255), g: Math.round(clip(fromLinear(g)) * 255), b: Math.round(clip(fromLinear(bb)) * 255) };
}

export function rgbToOklch({ r, g, b }: Rgb): { l: number; c: number; h: number } {
  const [R, G, B] = [r, g, b].map((v) => toLinear(v / 255));
  const l_ = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m_ = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s_ = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const Bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.hypot(A, Bb);
  let H = (Math.atan2(Bb, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: H };
}

export const hex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export function parseHex(s: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const v = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

/** "oklch(0.395 0.148 293)" → sRGB hex. */
export function oklchCssToHex(css: string): string | null {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(css);
  return m ? hex(oklchToRgb(+m[1], +m[2], +m[3])) : null;
}

/** Perceptual distance between two colours (Euclidean in OKLab, ×100; < 1 is hard to see, < 2.3 is a "just noticeable" step). */
export function deltaE(a: Rgb, b: Rgb): number {
  const lab = (c: Rgb) => {
    const o = rgbToOklch(c);
    return [o.l, o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)];
  };
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

export const JND = 2.3;
/** A colour with at least this chroma carries a hue worth keeping (status tints are ≈ 0.02). */
export const TINT_CHROMA = 0.012;
export const MAX_HUE_SHIFT = 45;

export interface Reconciled {
  token: string;
  deltaE: number;
  hueShift: number;
  useToken: boolean;
  reason: string;
}

/**
 * Nearest token for a prototype colour. The token wins when ΔE < JND, unless the colour is tinted
 * (chroma ≥ TINT_CHROMA) and the token would move its hue by more than MAX_HUE_SHIFT degrees
 * (a pale green "verified" chip background is not the blue-grey page background).
 */
export function reconcile(value: Rgb, tokens: ReadonlyArray<{ token: string; rgb: Rgb }>): Reconciled {
  const o = rgbToOklch(value);
  const best = tokens.map((t) => ({ ...t, d: deltaE(value, t.rgb) })).sort((a, b) => a.d - b.d)[0];
  const h = rgbToOklch(best.rgb).h;
  const hueShift = Math.round(Math.min(Math.abs(o.h - h), 360 - Math.abs(o.h - h)));
  const tinted = o.c >= TINT_CHROMA && hueShift > MAX_HUE_SHIFT;
  const useToken = best.d < JND && !tinted;
  const d = best.d.toFixed(2);
  const reason = useToken
    ? `handoff token wins, ΔE ${d} < ${JND}`
    : best.d < JND
      ? `kept exact: a tint (chroma ${o.c.toFixed(3)}) the token would shift ${hueShift}° in hue, ΔE ${d}`
      : `kept exact: ΔE ${d} ≥ ${JND}, not a handoff token; the rendered prototype wins`;
  return { token: best.token, deltaE: Math.round(best.d * 100) / 100, hueShift, useToken, reason };
}
