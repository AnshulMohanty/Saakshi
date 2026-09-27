/**
 * Structured image transforms → Cloudinary transformation strings and delivery URLs.
 *
 * A Transform is a list of steps. The same objects are stored in the DB as an image's edit
 * history, compiled here into URL segments ("c_fill,g_auto,w_800,h_600/e_blur_faces/…"),
 * and parsed back by the mock media server, which applies them with sharp.
 *
 * Every media URL in the app is built by `buildCloudinaryUrl` or `buildMockUrl` below.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// ---------------------------------------------------------------------------------------------
// Schema

export const Gravity = z.enum([
  "auto", "center", "north", "north_east", "east", "south_east", "south", "south_west", "west",
  "north_west", "face", "faces",
]);
export type Gravity = z.infer<typeof Gravity>;

export const CropMode = z.enum(["fill", "fit", "limit", "scale", "crop", "thumb", "pad", "lfill"]);
export type CropMode = z.infer<typeof CropMode>;

const Px = z.number().int().positive().max(10_000);
const Offset = z.number().int().min(-10_000).max(10_000);
/** "#RRGGBB", "#RRGGBBAA" or a CSS/Cloudinary colour name. */
export const Color = z.string().regex(/^(#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?|[a-z]+)$/);

/** Public IDs: path segments of [A-Za-z0-9_-]; no extensions, no "v123" segments. */
export const PUBLIC_ID_RE = /^(?!v\d+(\/|$))[A-Za-z0-9_-]+(\/(?!v\d+(\/|$))[A-Za-z0-9_-]+)*$/;
export const PublicId = z.string().max(255).regex(PUBLIC_ID_RE);

export const ResizeStep = z
  .strictObject({
    crop: CropMode.optional(),
    gravity: Gravity.optional(),
    width: Px.optional(),
    height: Px.optional(),
    x: Offset.optional(),
    y: Offset.optional(),
    /** Padding colour, for crop "pad". */
    background: Color.optional(),
  })
  .refine((s) => s.width !== undefined || s.height !== undefined, "resize needs a width or height");

export const StrengthEffectStep = z.strictObject({
  effect: z.enum(["blur", "blur_faces", "pixelate", "pixelate_faces", "sharpen"]),
  strength: z.number().int().min(1).max(2000).optional(),
});

export const SimpleEffectStep = z.strictObject({
  effect: z.enum(["grayscale", "improve"]),
});

const PromptText = z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N} '-]{0,99}$/u);

/**
 * Cloudinary AI extraction (e_extract). One prompt or several (prompt_(a;b)); `multiple` extracts
 * every instance, not only the most prominent; mode "mask" returns a black/white mask.
 */
export const ExtractStep = z.strictObject({
  effect: z.literal("extract"),
  prompt: z.union([PromptText, z.array(PromptText).min(1).max(8)]),
  multiple: z.boolean().optional(),
  mode: z.enum(["mask", "content"]).optional(),
});

export const TextOverlay = z.strictObject({
  text: z.string().min(1).max(500),
  font: z.string().regex(/^[A-Za-z0-9 -]{1,64}$/),
  size: z.number().int().min(4).max(500),
  weight: z.enum(["normal", "bold"]).optional(),
  color: Color.optional(),
  background: Color.optional(),
});

export const ImageOverlay = z.strictObject({
  publicId: PublicId,
  /** Delivery type of the layer asset: evidence is "authenticated" (l_authenticated:…). */
  type: z.literal("authenticated").optional(),
  crop: CropMode.optional(),
  /** Crop gravity inside the layer (placement gravity belongs to the overlay step). */
  gravity: Gravity.optional(),
  width: Px.optional(),
  height: Px.optional(),
  opacity: z.number().int().min(0).max(100).optional(),
  /** Face blur applied to the layer itself. */
  effect: z.literal("blur_faces").optional(),
});

export const OverlayStep = z.strictObject({
  overlay: z.union([TextOverlay, ImageOverlay]),
  gravity: Gravity.optional(),
  x: Offset.optional(),
  y: Offset.optional(),
});

export const DeliveryStep = z
  .strictObject({
    format: z.enum(["auto", "jpg", "png", "webp", "avif"]).optional(),
    quality: z.union([z.enum(["auto", "auto:best", "auto:good", "auto:eco", "auto:low"]), z.number().int().min(1).max(100)]).optional(),
  })
  .refine((s) => s.format !== undefined || s.quality !== undefined, "delivery step needs format or quality");

export const AngleStep = z.strictObject({ angle: z.number().int().min(-360).max(360) });

/** Escape hatch for transformations we don't model. Compiled verbatim; the mock ignores them. */
export const RawStep = z.strictObject({ raw: z.string().regex(/^[^/\s?#]+$/) });

export const TransformStep = z.union([
  ResizeStep, StrengthEffectStep, SimpleEffectStep, ExtractStep, OverlayStep, DeliveryStep, AngleStep, RawStep,
]);
export type TransformStep = z.infer<typeof TransformStep>;
export const Transform = z.array(TransformStep);
export type Transform = z.infer<typeof Transform>;

export type ResizeStep = z.infer<typeof ResizeStep>;
export type EffectStep = z.infer<typeof StrengthEffectStep> | z.infer<typeof SimpleEffectStep>;
export type ExtractStep = z.infer<typeof ExtractStep>;
export type OverlayStep = z.infer<typeof OverlayStep>;
export type TextOverlay = z.infer<typeof TextOverlay>;
export type ImageOverlay = z.infer<typeof ImageOverlay>;
export type DeliveryStep = z.infer<typeof DeliveryStep>;

// ---------------------------------------------------------------------------------------------
// Compile

/** URL-encode overlay text the way Cloudinary expects: commas and slashes double-escaped. */
export function encodeLayerText(text: string): string {
  return encodeURIComponent(text).replace(/%2C/gi, "%252C").replace(/%2F/gi, "%252F");
}

function decodeLayerText(encoded: string): string {
  return decodeURIComponent(encoded.replace(/%252C/gi, "%2C").replace(/%252F/gi, "%2F"));
}

const colorParam = (c: string) => (c.startsWith("#") ? `rgb:${c.slice(1).toUpperCase()}` : c);
const parseColor = (v: string) => (v.startsWith("rgb:") ? `#${v.slice(4).toUpperCase()}` : v);

function params(pairs: Array<[string, string | number | undefined]>): string {
  return pairs.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}_${v}`).join(",");
}

function placement(step: { gravity?: Gravity; x?: number; y?: number }): string {
  return params([["fl", "layer_apply"], ["g", step.gravity], ["x", step.x], ["y", step.y]]);
}

function compileStep(step: TransformStep): string {
  if ("raw" in step) return step.raw;
  if ("angle" in step) return `a_${step.angle}`;
  if ("overlay" in step) {
    const o = step.overlay;
    if ("text" in o) {
      const style = [encodeURIComponent(o.font), o.size, o.weight === "bold" ? "bold" : undefined].filter((v) => v !== undefined).join("_");
      const layer = [
        `l_text:${style}:${encodeLayerText(o.text)}`,
        o.color ? `co_${colorParam(o.color)}` : undefined,
        o.background ? `b_${colorParam(o.background)}` : undefined,
      ].filter(Boolean).join(",");
      return `${layer}/${placement(step)}`;
    }
    const id = (o.type ? `${o.type}:` : "") + o.publicId.replaceAll("/", ":");
    const layer = params([["l", id], ["c", o.crop], ["g", o.gravity], ["w", o.width], ["h", o.height], ["o", o.opacity], ["e", o.effect]]);
    return `${layer}/${placement(step)}`;
  }
  if ("effect" in step) {
    if (step.effect === "extract") {
      const s = step as ExtractStep;
      const prompt = Array.isArray(s.prompt) ? `(${s.prompt.map(encodeURIComponent).join(";")})` : encodeURIComponent(s.prompt);
      return `e_extract:prompt_${prompt}${s.multiple ? ";multiple_true" : ""}${s.mode ? `;mode_${s.mode}` : ""}`;
    }
    return "strength" in step && step.strength !== undefined ? `e_${step.effect}:${step.strength}` : `e_${step.effect}`;
  }
  if ("format" in step || "quality" in step) {
    const d = step as DeliveryStep;
    return params([["f", d.format], ["q", d.quality]]);
  }
  const r = step as ResizeStep;
  return params([
    ["c", r.crop], ["g", r.gravity], ["w", r.width], ["h", r.height], ["x", r.x], ["y", r.y],
    ["b", r.background ? colorParam(r.background) : undefined],
  ]);
}

/** Compiles a Transform to a Cloudinary transformation string (components joined by "/"). */
export function compileTransform(transform: Transform): string {
  return Transform.parse(transform).map(compileStep).join("/");
}

// ---------------------------------------------------------------------------------------------
// Parse (inverse of compile; used by the mock media server)

function splitParams(component: string): Map<string, string> | null {
  const out = new Map<string, string>();
  for (const part of component.split(",")) {
    const i = part.indexOf("_");
    if (i <= 0 || out.has(part.slice(0, i))) return null;
    out.set(part.slice(0, i), part.slice(i + 1));
  }
  return out;
}

const int = (v: string | undefined) => (v === undefined ? undefined : /^-?\d+$/.test(v) ? Number(v) : Number.NaN);

function onlyKeys(p: Map<string, string>, allowed: string[]): boolean {
  return [...p.keys()].every((k) => allowed.includes(k));
}

function parseComponent(c: string): unknown {
  const p = splitParams(c);
  if (!p) return null;
  if (p.has("e")) {
    if (p.size !== 1) return null;
    const e = p.get("e")!;
    if (e.startsWith("extract:")) {
      const m = /^extract:prompt_(\([^)]+\)|[^;()]+)(;multiple_true)?(?:;mode_(\w+))?$/.exec(e);
      if (!m) return null;
      const prompt = m[1].startsWith("(") ? m[1].slice(1, -1).split(";").map(decodeURIComponent) : decodeURIComponent(m[1]);
      return { effect: "extract", prompt, ...(m[2] ? { multiple: true } : {}), ...(m[3] ? { mode: m[3] } : {}) };
    }
    const [name, strength, ...rest] = e.split(":");
    if (rest.length) return null;
    return strength === undefined ? { effect: name } : { effect: name, strength: int(strength) };
  }
  if (p.has("a")) return p.size === 1 ? { angle: int(p.get("a")) } : null;
  if (p.has("f") || p.has("q")) {
    if (!onlyKeys(p, ["f", "q"])) return null;
    const q = p.get("q");
    return { ...(p.has("f") ? { format: p.get("f") } : {}), ...(q !== undefined ? { quality: /^\d+$/.test(q) ? Number(q) : q } : {}) };
  }
  if (!onlyKeys(p, ["c", "g", "w", "h", "x", "y", "b"])) return null;
  const step: Record<string, unknown> = {};
  if (p.has("c")) step.crop = p.get("c");
  if (p.has("g")) step.gravity = p.get("g");
  for (const k of ["w", "h", "x", "y"] as const) {
    if (p.has(k)) step[{ w: "width", h: "height", x: "x", y: "y" }[k]] = int(p.get(k));
  }
  if (p.has("b")) step.background = parseColor(p.get("b")!);
  return step;
}

function parseOverlay(layer: string, apply: string): unknown {
  const a = splitParams(apply);
  if (!a || a.get("fl") !== "layer_apply" || !onlyKeys(a, ["fl", "g", "x", "y"])) return null;
  const place = {
    ...(a.has("g") ? { gravity: a.get("g") } : {}),
    ...(a.has("x") ? { x: int(a.get("x")) } : {}),
    ...(a.has("y") ? { y: int(a.get("y")) } : {}),
  };
  const l = splitParams(layer);
  if (!l) return null;
  const lv = l.get("l")!;
  if (lv.startsWith("text:")) {
    const m = /^text:([^:]+):(.+)$/.exec(lv);
    if (!m || !onlyKeys(l, ["l", "co", "b"])) return null;
    const [font, size, weight, ...extra] = m[1].split("_");
    if (extra.length || (weight !== undefined && weight !== "bold")) return null;
    return {
      overlay: {
        text: decodeLayerText(m[2]),
        font: decodeURIComponent(font),
        size: int(size),
        ...(weight ? { weight } : {}),
        ...(l.has("co") ? { color: parseColor(l.get("co")!) } : {}),
        ...(l.has("b") ? { background: parseColor(l.get("b")!) } : {}),
      },
      ...place,
    };
  }
  if (!onlyKeys(l, ["l", "c", "g", "w", "h", "o", "e"])) return null;
  const authenticated = lv.startsWith("authenticated:");
  return {
    overlay: {
      publicId: (authenticated ? lv.slice("authenticated:".length) : lv).replaceAll(":", "/"),
      ...(authenticated ? { type: "authenticated" } : {}),
      ...(l.has("c") ? { crop: l.get("c") } : {}),
      ...(l.has("g") ? { gravity: l.get("g") } : {}),
      ...(l.has("w") ? { width: int(l.get("w")) } : {}),
      ...(l.has("h") ? { height: int(l.get("h")) } : {}),
      ...(l.has("o") ? { opacity: int(l.get("o")) } : {}),
      ...(l.has("e") ? { effect: l.get("e") } : {}),
    },
    ...place,
  };
}

/**
 * Parses a transformation string back into steps. Components we can't model become
 * `{ raw }` steps rather than errors, so callers can ignore and log them.
 */
export function parseTransformation(transformation: string): Transform {
  if (transformation === "") return [];
  const comps = transformation.split("/");
  const steps: Transform = [];
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    let candidate: unknown;
    if (c.startsWith("l_") && comps[i + 1]?.startsWith("fl_layer_apply")) {
      candidate = parseOverlay(c, comps[i + 1]);
      if (candidate) i++;
    } else {
      candidate = parseComponent(c);
    }
    const parsed = TransformStep.safeParse(candidate);
    steps.push(parsed.success ? parsed.data : { raw: c });
  }
  return steps;
}

// ---------------------------------------------------------------------------------------------
// Delivery URLs

/** Delivery path after "<resource>/<type>/[signature/]": "<transformation>/v1/<publicId>". */
function deliveryTail(transformation: string, publicId: string): string {
  return [transformation, "v1", publicId].filter(Boolean).join("/");
}

/** Cloudinary URL signature (matches the official SDK: sha1, 8 chars, URL-safe base64). */
export function cloudinarySignature(transformation: string, publicId: string, apiSecret: string): string {
  const toSign = [transformation, publicId].filter(Boolean).join("/");
  const digest = createHash("sha1").update(toSign + apiSecret).digest("base64");
  return `s--${digest.slice(0, 8).replace(/\//g, "_").replace(/\+/g, "-")}--`;
}

export interface CloudinaryUrlOptions {
  cloudName: string;
  publicId: string;
  transforms: Transform;
  /** Present → signed URL. */
  apiSecret?: string;
  /** "authenticated" assets (Witness uploads) are only deliverable through signed URLs. */
  deliveryType?: "upload" | "authenticated";
}

export function buildCloudinaryUrl({ cloudName, publicId, transforms, apiSecret, deliveryType = "upload" }: CloudinaryUrlOptions): string {
  PublicId.parse(publicId);
  const t = compileTransform(transforms);
  const sig = apiSecret ? cloudinarySignature(t, publicId, apiSecret) : undefined;
  return `https://res.cloudinary.com/${cloudName}/image/${deliveryType}/${[sig, deliveryTail(t, publicId)].filter(Boolean).join("/")}`;
}

/** Route prefix served by app/api/media/mock/[...path]/route.ts. */
export const MOCK_MEDIA_PREFIX = "/api/media/mock";

/** Mock signature: HMAC-SHA256 over the whole delivery path, 32 URL-safe chars (like Cloudinary's long signatures). */
export function mockSignature(tail: string, key: string): string {
  const mac = createHmac("sha256", key).update(`image/upload/${tail}`).digest("base64url");
  return `s--${mac.slice(0, 32)}--`;
}

export interface MockUrlOptions {
  baseUrl: string;
  publicId: string;
  transforms: Transform;
  /** Present → signed URL. */
  signingKey?: string;
}

export function buildMockUrl({ baseUrl, publicId, transforms, signingKey }: MockUrlOptions): string {
  PublicId.parse(publicId);
  const tail = deliveryTail(compileTransform(transforms), publicId);
  const sig = signingKey ? mockSignature(tail, signingKey) : undefined;
  return `${baseUrl.replace(/\/$/, "")}${MOCK_MEDIA_PREFIX}/image/upload/${[sig, tail].filter(Boolean).join("/")}`;
}

export interface DeliveryPath {
  signature: string | null;
  transformation: string;
  publicId: string;
  /** The signed portion: "<transformation>/v1/<publicId>". */
  tail: string;
}

/**
 * Splits "image/upload/[s--sig--/]<transformation>/v<n>/<publicId>" (URL-encoded, as received).
 * Returns null when the path isn't a delivery path.
 */
export function parseDeliveryPath(path: string): DeliveryPath | null {
  const segs = path.replace(/^\/+/, "").split("/");
  if (segs[0] !== "image" || segs[1] !== "upload") return null;
  let rest = segs.slice(2);
  let signature: string | null = null;
  if (rest[0]?.startsWith("s--")) {
    signature = rest[0];
    rest = rest.slice(1);
  }
  const v = rest.findIndex((s) => /^v\d+$/.test(s));
  if (v < 0) return null;
  const publicId = rest.slice(v + 1).join("/");
  if (!PUBLIC_ID_RE.test(publicId)) return null;
  const transformation = rest.slice(0, v).join("/");
  return { signature, transformation, publicId, tail: rest.join("/") };
}

/** Constant-time check of a mock signature against its delivery path. */
export function verifyMockSignature(parsed: DeliveryPath, key: string): boolean {
  if (!parsed.signature) return false;
  const expected = Buffer.from(mockSignature(parsed.tail, key));
  const actual = Buffer.from(parsed.signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
