/**
 * Cover measurements on image buffers (deterministic, no AI).
 *
 * - maskCover: % of a segmentation mask's pixels above 128 (white = selected). Masks come from
 *   Cloudinary e_extract (real) or colour-index masks (mock).
 * - exgCover: % of pixels that are green by the Excess Green index, ExG = 2g − r − b on
 *   chromatic coordinates (r = R/(R+G+B), …), > 0.05, at 256 px on the long side. A second,
 *   independent reading of vegetation cover.
 * Both return percentages (0–100, one decimal).
 */
import sharp from "sharp";

export const MASK_THRESHOLD = 128;
export const EXG_THRESHOLD = 0.05;
export const EXG_SIZE = 256;

const pct = (on: number, total: number) => (total === 0 ? 0 : Math.round((on / total) * 1000) / 10);

/** Percentage of mask pixels brighter than `threshold` (first channel; alpha ignored). */
export async function maskCover(mask: Buffer, threshold = MASK_THRESHOLD): Promise<number> {
  const { data, info } = await sharp(mask).removeAlpha().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  let on = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > threshold) on++;
  return pct(on, info.width * info.height);
}

/** ExG of one pixel on chromatic coordinates (0 for black). */
export function exg(r: number, g: number, b: number): number {
  const sum = r + g + b;
  return sum === 0 ? 0 : (2 * g - r - b) / sum;
}

/** Percentage of pixels with ExG above `threshold`, measured at `size` px on the long side. */
export async function exgCover(image: Buffer, { threshold = EXG_THRESHOLD, size = EXG_SIZE } = {}): Promise<number> {
  const { data, info } = await sharp(image)
    .rotate()
    .resize(size, size, { fit: "inside" })
    .flatten({ background: "#000000" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  let on = 0;
  for (let i = 0; i < data.length; i += info.channels) if (exg(data[i], data[i + 1], data[i + 2]) > threshold) on++;
  return pct(on, info.width * info.height);
}

/** Two readings disagreeing by more than this many points → low confidence. */
export const DISAGREEMENT_POINTS = 15;
