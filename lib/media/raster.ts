/**
 * Server-side raster fallbacks (sharp), used only when a Cloudinary feature is switched off:
 *  - unionMasks: CLD_EXTRACT_MODE=union, one e_extract per prompt, then the union of the masks.
 *  - sideBySide: CLD_COMPOSITE_MODE=server, the before/after halves joined here instead of an
 *    l_authenticated layer; the labels are still drawn by Cloudinary (compositeLabels, eager).
 */
import sharp from "sharp";

/** Pixel-wise maximum of grayscale masks (white = selected), resized to the first mask's size. */
export async function unionMasks(masks: Buffer[]): Promise<Buffer> {
  if (!masks.length) throw new Error("unionMasks needs at least one mask");
  const first = sharp(masks[0]).greyscale();
  const { width, height } = await first.metadata();
  if (!width || !height) throw new Error("mask has no size");
  const raws = await Promise.all(
    masks.map((m) => sharp(m).greyscale().resize(width, height, { fit: "fill" }).extractChannel(0).raw().toBuffer()),
  );
  const out = Buffer.alloc(width * height);
  for (const r of raws) for (let i = 0; i < out.length; i++) if (r[i] > out[i]) out[i] = r[i];
  return sharp(out, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

/** Two halves side by side on a dark background, as JPEG (each half resized to width × height). */
export async function sideBySide(before: Buffer, after: Buffer, { width = 800, height = 600 } = {}): Promise<Buffer> {
  const half = (b: Buffer) => sharp(b).resize(width, height, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
  const [l, r] = await Promise.all([half(before), half(after)]);
  return sharp({ create: { width: width * 2, height, channels: 3, background: "#111111" } })
    .composite([{ input: l, left: 0, top: 0 }, { input: r, left: width, top: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}
