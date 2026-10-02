/**
 * 64-bit perceptual hash (DCT pHash), as 16 lowercase hex chars.
 *
 * Pipeline: auto-orient → flatten alpha on white → 32×32 grayscale → 2-D DCT-II →
 * keep the top-left 8×8 low frequencies → bit = coefficient > median of those 64.
 * Near-duplicates (resized, recompressed, lightly edited) land within a few bits;
 * unrelated images sit around 32. Mirrors the classic `imagehash.phash` definition.
 * The transform itself is in lib/phash-core.ts (pure, shared with the browser).
 */
import sharp from "sharp";
import { N, phashFromPixels } from "./phash-core";

export { dctLowFrequencies, grayscale32, phashFromPixels } from "./phash-core";

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
