/**
 * The How it works threshold demo (pure): the design's SK.litterScores (saakshi-kit.js:61-74), a
 * colour heuristic that scores each pixel 0–1 for "looks like litter", smoothed over a 7×7 box.
 * It illustrates what a threshold does; Saakshi's own measurements use segmentation masks
 * (lib/measure/measure.ts) at a fixed threshold. Runs in the browser on canvas pixels.
 */

/** Pixels that are litter-like: white, strongly coloured (not sand hues), or bright and not sand/water. */
export function litterScores(rgba: Uint8ClampedArray | Uint8Array, W: number, H: number, excl?: (x: number, y: number) => boolean): Float32Array {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let X = 0; X < W; X++) {
      const i = y * W + X;
      if (excl && excl(X / W, y / H)) continue;
      const r = rgba[i * 4] / 255;
      const g = rgba[i * 4 + 1] / 255;
      const b = rgba[i * 4 + 2] / 255;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const s = mx ? (mx - mn) / mx : 0;
      let h = 0;
      if (mx !== mn) {
        h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
        h *= 60;
        if (h < 0) h += 360;
      }
      const sand = h > 12 && h < 50 && s < 0.5 && mx < 0.85;
      const water = s < 0.12 && mx < 0.75;
      const white = mx > 0.8 && s < 0.2;
      const colorful = s > 0.35 && !(h > 12 && h < 45);
      m[i] = white || colorful || (!sand && !water && mx > 0.6) ? 1 : 0;
    }
  const out = new Float32Array(W * H);
  const R = 3;
  for (let y = 0; y < H; y++)
    for (let X = 0; X < W; X++) {
      let s = 0;
      let n = 0;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const yy = y + dy;
          const xx = X + dx;
          if (yy >= 0 && yy < H && xx >= 0 && xx < W) {
            s += m[yy * W + xx];
            n++;
          }
        }
      out[y * W + X] = s / n;
    }
  return out;
}

/** Share of pixels scoring above the threshold (0–1). */
export function coverAt(scores: Float32Array, threshold: number): number {
  let n = 0;
  for (let i = 0; i < scores.length; i++) if (scores[i] > threshold) n++;
  return scores.length ? n / scores.length : 0;
}

/** Mask tint (#2F6BEA at 80%, the design's L:523 blend) over the pixels above the threshold, in place. */
export function tintAbove(rgba: Uint8ClampedArray, scores: Float32Array, threshold: number, rgb: [number, number, number] = [47, 107, 234], alpha = 0.8): number {
  let n = 0;
  for (let i = 0; i < scores.length; i++)
    if (scores[i] > threshold) {
      n++;
      rgba[i * 4] = rgba[i * 4] * (1 - alpha) + rgb[0] * alpha;
      rgba[i * 4 + 1] = rgba[i * 4 + 1] * (1 - alpha) + rgb[1] * alpha;
      rgba[i * 4 + 2] = rgba[i * 4 + 2] * (1 - alpha) + rgb[2] * alpha;
    }
  return n;
}
