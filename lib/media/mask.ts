/**
 * Colour-index segmentation masks, used by the mock `extractMask` (standing in for Cloudinary's
 * AI e_extract) and available as a cheap, explainable fallback measurement.
 *
 * - vegetation: Excess Green index on chromatic coordinates, ExG = 2g − r − b > threshold, green dominant.
 * - litter: non-green pixels that are strongly saturated or near-white (plastic, wrappers, paper).
 * A proxy, not a detector: it will flag sky, clothing and signage too.
 */
import sharp from "sharp";

export type MaskKind = "vegetation" | "litter";

const VEGETATION_WORDS = /\b(green|grass|tree|trees|plant|plants|vegetation|sapling|saplings|leaf|leaves|canopy|shrub|shrubs|garden|foliage)\b/i;

export function maskKindForPrompt(prompt: string | string[]): MaskKind {
  return VEGETATION_WORDS.test([prompt].flat().join(" ")) ? "vegetation" : "litter";
}

export interface MaskResult {
  /** 8-bit single-channel PNG: 255 = selected. */
  png: Buffer;
  width: number;
  height: number;
  /** Fraction of pixels selected, 0–1. */
  coverage: number;
}

/** Per-pixel classifier on 0–255 RGB. Exported for tests. */
export function classifyPixel(r: number, g: number, b: number, kind: MaskKind): boolean {
  const sum = r + g + b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const value = max / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  const exg = sum === 0 ? 0 : (2 * g - r - b) / sum;
  // Green must also be the dominant channel, so yellows (road paint, marigolds) are not "vegetation".
  if (kind === "vegetation") return exg > 0.08 && value > 0.08 && g >= r && g >= b;
  if (exg > 0.03) return false;
  return (saturation > 0.45 && value > 0.25) || (value > 0.8 && saturation < 0.2);
}

export async function computeMask(input: Buffer, kind: MaskKind): Promise<MaskResult> {
  const { data, info } = await sharp(input)
    .rotate()
    .flatten({ background: "#000000" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const mask = Buffer.alloc(width * height);
  for (let i = 0, p = 0; p < mask.length; i += channels, p++) {
    mask[p] = classifyPixel(data[i], data[i + 1], data[i + 2], kind) ? 255 : 0;
  }
  // Median filter removes salt-and-pepper noise from JPEG artefacts.
  const out = await sharp(mask, { raw: { width, height, channels: 1 } })
    .median(3)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cleaned = Buffer.alloc(width * height);
  for (let p = 0; p < cleaned.length; p++) cleaned[p] = out.data[p * out.info.channels];
  let on = 0;
  for (const v of cleaned) if (v > 127) on++;
  const png = await sharp(cleaned, { raw: { width, height, channels: 1 } }).toColourspace("b-w").png().toBuffer();
  return { png, width, height, coverage: on / (width * height) };
}
