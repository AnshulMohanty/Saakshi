/**
 * Applies Transform steps with sharp, approximating what Cloudinary would deliver.
 * Deliberate simplifications: blur_faces/pixelate_faces affect the whole image when the asset
 * has faces and do nothing when it has none (no face detection to localise them), g_auto/g_face use sharp's attention strategy, e_extract uses colour-index masks.
 * Unknown ({ raw }) steps are ignored and logged.
 */
import sharp, { type ResizeOptions, type Sharp } from "sharp";
import { computeMask, maskKindForPrompt } from "../../media/mask";
import type {
  DeliveryStep,
  ExtractStep,
  Gravity,
  ImageOverlay,
  OverlayStep,
  ResizeStep,
  TextOverlay,
  Transform,
  TransformStep,
} from "../../media/transform";

export interface RenderContext {
  /** Original bytes of another asset (and its known face count), for image layers. */
  loadOverlay: (publicId: string) => Promise<{ bytes: Buffer; facesCount: number } | null>;
  /** Request Accept header, used to resolve f_auto. */
  accept?: string | null;
  /** Faces the asset is known to contain. blur_faces/pixelate_faces are no-ops at 0, as on Cloudinary. */
  facesCount?: number;
  log?: (message: string) => void;
}

export interface Rendered {
  body: Buffer;
  contentType: string;
  format: "jpg" | "png" | "webp" | "avif";
}

interface Img {
  data: Buffer;
  width: number;
  height: number;
}

const toImg = async (s: Sharp): Promise<Img> => {
  const { data, info } = await s.toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
const fromImg = (img: Img): Sharp => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

const POSITION: Partial<Record<Gravity, string>> = {
  center: "centre",
  north: "north",
  north_east: "northeast",
  east: "east",
  south_east: "southeast",
  south: "south",
  south_west: "southwest",
  west: "west",
  north_west: "northwest",
};

function position(g: Gravity | undefined): string {
  if (g === "auto" || g === "face" || g === "faces") return sharp.strategy.attention as unknown as string;
  return (g && POSITION[g]) || "centre";
}

function rgba(color: string | undefined, fallback = { r: 0, g: 0, b: 0, alpha: 1 }) {
  if (!color) return fallback;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(color);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
    return { r, g, b, alpha: m[4] ? parseInt(m[4], 16) / 255 : 1 };
  }
  return color; // named colour; sharp/libvips understands CSS names
}

/** Top-left of a w×h box placed on a W×H canvas by gravity + offsets (Cloudinary semantics). */
export function place(W: number, H: number, w: number, h: number, g: Gravity = "center", x = 0, y = 0) {
  const horiz = g.includes("west") ? "w" : g.includes("east") ? "e" : "c";
  const vert = g.startsWith("north") ? "n" : g.startsWith("south") ? "s" : "c";
  const left = horiz === "w" ? x : horiz === "e" ? W - w - x : Math.round((W - w) / 2) + x;
  const top = vert === "n" ? y : vert === "s" ? H - h - y : Math.round((H - h) / 2) + y;
  return {
    left: Math.max(0, Math.min(W - w, left)),
    top: Math.max(0, Math.min(H - h, top)),
  };
}

async function resize(img: Img, s: ResizeStep): Promise<Img> {
  const crop = s.crop ?? "scale";
  const { width: w, height: h } = s;
  if (crop === "crop") {
    const cw = Math.min(w ?? img.width, img.width);
    const ch = Math.min(h ?? img.height, img.height);
    const at =
      s.x !== undefined || s.y !== undefined
        ? { left: Math.min(s.x ?? 0, img.width - cw), top: Math.min(s.y ?? 0, img.height - ch) }
        : place(img.width, img.height, cw, ch, s.gravity ?? "center");
    return toImg(fromImg(img).extract({ left: Math.max(0, at.left), top: Math.max(0, at.top), width: cw, height: ch }));
  }
  const both = w !== undefined && h !== undefined;
  const opts: ResizeOptions = { width: w, height: h };
  switch (crop) {
    case "fill":
    case "lfill":
    case "thumb":
      Object.assign(opts, { fit: "cover", position: position(s.gravity), withoutEnlargement: crop === "lfill" });
      break;
    case "fit":
      opts.fit = "inside";
      break;
    case "limit":
      Object.assign(opts, { fit: "inside", withoutEnlargement: true });
      break;
    case "pad":
      Object.assign(opts, { fit: "contain", position: position(s.gravity), background: rgba(s.background, { r: 0, g: 0, b: 0, alpha: 0 }) });
      break;
    case "scale":
      opts.fit = both ? "fill" : "inside";
      break;
  }
  return toImg(fromImg(img).resize(opts));
}

async function pixelate(img: Img, block: number): Promise<Img> {
  const size = Math.max(1, block);
  const small = await fromImg(img)
    .resize(Math.max(1, Math.round(img.width / size)), Math.max(1, Math.round(img.height / size)), { kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return toImg(
    sharp(small.data, { raw: { width: small.info.width, height: small.info.height, channels: 4 } }).resize(img.width, img.height, {
      kernel: "nearest",
      fit: "fill",
    }),
  );
}

async function extract(img: Img, step: ExtractStep): Promise<Img> {
  const png = await fromImg(img).png().toBuffer();
  const mask = await computeMask(png, maskKindForPrompt(step.prompt));
  if ((step.mode ?? "mask") === "mask") return toImg(sharp(mask.png));
  // content: keep the selected pixels, make the rest transparent
  const rgb = await fromImg(img).removeAlpha().toBuffer();
  return toImg(sharp(rgb, { raw: { width: img.width, height: img.height, channels: 3 } }).joinChannel(await sharp(mask.png).extractChannel(0).toBuffer()));
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function svgPaint(color: string | undefined, fallback: string): string {
  const c = rgba(color);
  if (typeof c === "string") return `fill="${escapeXml(c)}"`;
  if (!color) return `fill="${fallback}"`;
  return `fill="rgb(${c.r},${c.g},${c.b})" fill-opacity="${c.alpha.toFixed(3)}"`;
}

async function textLayer(o: TextOverlay): Promise<Buffer> {
  const lines = o.text.split("\n");
  const pad = Math.round(o.size * 0.3);
  const lineH = Math.round(o.size * 1.25);
  const width = Math.ceil(Math.max(...lines.map((l) => [...l].length)) * o.size * 0.6) + pad * 2;
  const height = lineH * lines.length + pad * 2;
  const bg = o.background ? `<rect width="100%" height="100%" ${svgPaint(o.background, "none")}/>` : "";
  const text = lines
    .map((l, i) => `<tspan x="${pad}" y="${pad + Math.round(o.size * 0.95) + i * lineH}">${escapeXml(l)}</tspan>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${bg}<text font-family="${escapeXml(o.font)}" font-size="${o.size}" font-weight="${o.weight ?? "normal"}" ${svgPaint(o.color, "#000")}>${text}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function imageLayer(o: ImageOverlay, ctx: RenderContext): Promise<Buffer | null> {
  const src = await ctx.loadOverlay(o.publicId);
  if (!src) {
    ctx.log?.(`overlay asset "${o.publicId}" not found; layer skipped`);
    return null;
  }
  let layer = await toImg(sharp(src.bytes).rotate());
  if (o.width || o.height) layer = await resize(layer, { crop: o.crop, gravity: o.gravity, width: o.width, height: o.height });
  if (o.effect === "blur_faces" && src.facesCount > 0) layer = await toImg(fromImg(layer).blur(12.5));
  let s = fromImg(layer);
  if (o.opacity !== undefined) s = s.linear([1, 1, 1, o.opacity / 100], [0, 0, 0, 0]);
  return s.png().toBuffer();
}

async function overlay(img: Img, step: OverlayStep, ctx: RenderContext): Promise<Img> {
  const buf = "text" in step.overlay ? await textLayer(step.overlay) : await imageLayer(step.overlay, ctx);
  if (!buf) return img;
  let layer = sharp(buf);
  let meta = await layer.metadata();
  if ((meta.width ?? 0) > img.width || (meta.height ?? 0) > img.height) {
    const fitted = await layer.resize(img.width, img.height, { fit: "inside" }).png().toBuffer();
    layer = sharp(fitted);
    meta = await layer.metadata();
  }
  const { left, top } = place(img.width, img.height, meta.width!, meta.height!, step.gravity ?? "center", step.x, step.y);
  return toImg(fromImg(img).composite([{ input: await layer.png().toBuffer(), left, top }]));
}

async function applyStep(img: Img, step: TransformStep, ctx: RenderContext): Promise<Img> {
  if ("raw" in step) {
    ctx.log?.(`unsupported transformation "${step.raw}" ignored by the mock`);
    return img;
  }
  if ("angle" in step) return toImg(fromImg(img).rotate(step.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }));
  if ("overlay" in step) return overlay(img, step, ctx);
  if ("format" in step || "quality" in step) return img; // handled at encode time
  if ("effect" in step) {
    const strength = "strength" in step ? step.strength : undefined;
    switch (step.effect) {
      case "blur":
        return toImg(fromImg(img).blur(Math.min(1000, Math.max(0.3, (strength ?? 100) / 20))));
      case "blur_faces": // mock: no face localisation, so blur everything when there are faces
        if ((ctx.facesCount ?? 1) === 0) return img;
        return toImg(fromImg(img).blur(Math.max(10, (strength ?? 500) / 40)));
      case "pixelate_faces":
        if ((ctx.facesCount ?? 1) === 0) return img;
        return pixelate(img, strength ?? 20);
      case "pixelate":
        return pixelate(img, strength ?? 20);
      case "sharpen":
        return toImg(fromImg(img).sharpen({ sigma: 0.5 + (strength ?? 100) / 100 }));
      case "grayscale":
        return toImg(fromImg(img).grayscale());
      case "improve":
        return toImg(fromImg(img).normalise());
      case "extract":
        return extract(img, step as ExtractStep);
    }
  }
  return resize(img, step as ResizeStep);
}

const QUALITY: Record<string, number> = { auto: 80, "auto:best": 92, "auto:good": 82, "auto:eco": 70, "auto:low": 55 };

export async function renderTransform(original: Buffer, originalFormat: string, steps: Transform, ctx: RenderContext): Promise<Rendered> {
  let img = await toImg(sharp(original).rotate());
  let delivery: DeliveryStep = {};
  let producedMask = false;
  for (const step of steps) {
    img = await applyStep(img, step, ctx);
    if ("format" in step || "quality" in step) delivery = { ...delivery, ...(step as DeliveryStep) };
    producedMask ||= "effect" in step && step.effect === "extract";
  }

  let format: Rendered["format"];
  if (delivery.format && delivery.format !== "auto") format = delivery.format;
  else if (delivery.format === "auto") format = ctx.accept?.includes("image/webp") ? "webp" : producedMask ? "png" : "jpg";
  else format = producedMask ? "png" : originalFormat === "png" || originalFormat === "webp" ? originalFormat : "jpg";

  const quality = typeof delivery.quality === "number" ? delivery.quality : QUALITY[delivery.quality ?? "auto"];
  const s = fromImg(img);
  const body =
    format === "jpg"
      ? await s.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer()
      : format === "png"
        ? await s.png().toBuffer()
        : format === "webp"
          ? await s.webp({ quality }).toBuffer()
          : await s.avif({ quality, effort: 2 }).toBuffer();
  const contentType = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" }[format];
  return { body, contentType, format };
}
