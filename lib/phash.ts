/**
 * 64-bit perceptual hash (DCT pHash), as 16 lowercase hex chars.
 *
 * Pipeline: auto-orient → flatten alpha on white → 32×32 grayscale → 2-D DCT-II →
 * keep the top-left 8×8 low frequencies → bit = coefficient > median of those 64.
 * Near-duplicates (resized, recompressed, lightly edited) land within a few bits;
 * unrelated images sit around 32. Mirrors the classic `imagehash.phash` definition.
 */
import sharp from "sharp";

const N = 32;
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

/** 32×32 grayscale pixels of an encoded image (any format sharp reads). */
export async function hashPixels(input: Buffer): Promise<Uint8Array> {
  const { data, info } = await sharp(input)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(N, N, { fit: "fill" })
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels === 1) return new Uint8Array(data.buffer, data.byteOffset, N * N);
  const gray = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) gray[i] = data[i * info.channels];
  return gray;
}

export async function phash(input: Buffer): Promise<string> {
  return phashFromPixels(await hashPixels(input));
}

export { hamming } from "./hamming";
