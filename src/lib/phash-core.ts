/**
 * The pure core of the 64-bit perceptual hash (DCT pHash), shared by the server (lib/phash.ts,
 * sharp decodes) and the browser (lib/client/phash.ts, a canvas decodes; B5.2). No imports, so
 * it is browser-safe.
 *
 * 32×32 grayscale → 2-D DCT-II → the top-left 8×8 low frequencies → bit = coefficient > median.
 * The browser's preview resamples differently from sharp, so its hash is close to the server's
 * (a few bits), not equal: the capture screen shows it until the server's hash arrives.
 */

export const N = 32;
const K = 8;

/** COS[u * N + x] = cos((2x + 1) · u · π / 2N), for u < K. */
const COS = (() => {
  const t = new Float64Array(K * N);
  for (let u = 0; u < K; u++) {
    for (let x = 0; x < N; x++) t[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  }
  return t;
})();

/** Low-frequency 8×8 block of the 2-D DCT of a 32×32 row-major grayscale image. */
export function dctLowFrequencies(pixels: ArrayLike<number>): Float64Array {
  if (pixels.length !== N * N) throw new RangeError(`Expected ${N * N} pixels, got ${pixels.length}`);
  // Separable transform: rows first (32 rows × 8 freqs), then columns.
  const rows = new Float64Array(N * K);
  for (let y = 0; y < N; y++) {
    for (let v = 0; v < K; v++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += pixels[y * N + x] * COS[v * N + x];
      rows[y * K + v] = s;
    }
  }
  const out = new Float64Array(K * K);
  for (let u = 0; u < K; u++) {
    for (let v = 0; v < K; v++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += rows[y * K + v] * COS[u * N + y];
      out[u * K + v] = s;
    }
  }
  return out;
}

function median(values: Float64Array): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** pHash of already-prepared 32×32 grayscale pixels. */
export function phashFromPixels(pixels: ArrayLike<number>): string {
  const coeffs = dctLowFrequencies(pixels);
  const med = median(coeffs);
  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let n = 0;
    for (let b = 0; b < 4; b++) n = (n << 1) | (coeffs[nibble * 4 + b] > med ? 1 : 0);
    hex += n.toString(16);
  }
  return hex;
}

/**
 * RGBA (row-major, `w` × `h`) → 32×32 grayscale by area averaging, alpha flattened on white
 * (as lib/phash.ts flattens before resizing). Luma uses Rec. 709 weights.
 */
export function grayscale32(rgba: ArrayLike<number>, w: number, h: number): Float64Array {
  if (rgba.length < w * h * 4) throw new RangeError(`Expected ${w * h * 4} RGBA values, got ${rgba.length}`);
  const out = new Float64Array(N * N);
  const area = new Float64Array(N * N);
  for (let y = 0; y < h; y++) {
    const y0 = (y * N) / h;
    const y1 = ((y + 1) * N) / h;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = rgba[i + 3] / 255;
      const luma = 0.2126 * (rgba[i] * a + 255 * (1 - a)) + 0.7152 * (rgba[i + 1] * a + 255 * (1 - a)) + 0.0722 * (rgba[i + 2] * a + 255 * (1 - a));
      const x0 = (x * N) / w;
      const x1 = ((x + 1) * N) / w;
      // Spread this source pixel over the target cells it overlaps, by overlap area.
      for (let ty = Math.floor(y0); ty < Math.min(N, Math.ceil(y1)); ty++) {
        const oy = Math.min(y1, ty + 1) - Math.max(y0, ty);
        if (oy <= 0) continue;
        for (let tx = Math.floor(x0); tx < Math.min(N, Math.ceil(x1)); tx++) {
          const ox = Math.min(x1, tx + 1) - Math.max(x0, tx);
          if (ox <= 0) continue;
          out[ty * N + tx] += luma * ox * oy;
          area[ty * N + tx] += ox * oy;
        }
      }
    }
  }
  for (let i = 0; i < N * N; i++) out[i] = area[i] ? out[i] / area[i] : 255;
  return out;
}
