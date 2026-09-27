/**
 * Transforms in plain words (pure), for "Every edit made to this photo". Each step is paired
 * with its URL segment, so a reader can match the sentence to the signed URL.
 */
import { compileTransform, type Gravity, type ResizeStep, type Transform, type TransformStep } from "./transform";

const PLACE: Record<Gravity, string> = {
  auto: "the most important part", center: "the centre", north: "the top", north_east: "the top right", east: "the right",
  south_east: "the bottom right", south: "the bottom", south_west: "the bottom left", west: "the left", north_west: "the top left",
  face: "the face", faces: "the faces",
};
const at = (g: Gravity | undefined) => PLACE[g ?? "center"];
const size = (w?: number, h?: number) => (w && h ? `${w}×${h} px` : w ? `${w} px wide` : `${h} px tall`);

export function describeStep(step: TransformStep): string {
  if ("raw" in step) return `A step Saakshi doesn't model (${step.raw}), passed through unchanged`;
  if ("angle" in step) return `Rotate ${step.angle}°`;
  if ("overlay" in step) {
    const o = step.overlay;
    if ("text" in o) return `Add the text “${o.text.replaceAll("\n", " / ")}” at ${at(step.gravity)}`;
    if (o.publicId.startsWith("saakshi/qr/")) return `Place the QR code linking to this photo's evidence page (${o.publicId}) at ${at(step.gravity)}`;
    const extras = [o.effect === "blur_faces" ? "with faces blurred" : null, o.width || o.height ? `sized to ${size(o.width, o.height)}` : null, o.opacity !== undefined ? `at ${o.opacity}% opacity` : null].filter(Boolean);
    return `Place ${o.type === "authenticated" ? "the private photo" : "the image"} ${o.publicId} on ${at(step.gravity)}${extras.length ? `, ${extras.join(", ")}` : ""}`;
  }
  if ("effect" in step) {
    switch (step.effect) {
      case "blur_faces":
        return "Blur every face";
      case "pixelate_faces":
        return "Pixelate every face";
      case "blur":
        return "Blur the whole image";
      case "pixelate":
        return "Pixelate the whole image";
      case "sharpen":
        return "Sharpen";
      case "grayscale":
        return "Convert to black and white";
      case "improve":
        return "Auto-improve colour and contrast";
      case "extract": {
        const prompts = Array.isArray(step.prompt) ? step.prompt.join(", ") : step.prompt;
        return `Find ${prompts}${step.multiple ? " (every instance)" : ""} and return ${step.mode === "content" ? "only those pixels" : "a black-and-white mask of them"}`;
      }
    }
  }
  if ("format" in step || "quality" in step) {
    const parts = [
      step.format ? (step.format === "auto" ? "the best format for the viewer's browser" : `${step.format.toUpperCase()} format`) : null,
      step.quality !== undefined ? (typeof step.quality === "number" ? `quality ${step.quality}` : "automatic quality") : null,
    ].filter(Boolean);
    return `Deliver in ${parts.join(" and ")}`;
  }
  const r = step as ResizeStep;
  switch (r.crop) {
    case "fill":
    case "lfill":
    case "thumb":
      return `Crop to fill ${size(r.width, r.height)}, keeping ${at(r.gravity)}`;
    case "limit":
      return `Scale down to at most ${size(r.width, r.height)} (never up)`;
    case "fit":
      return `Scale to fit within ${size(r.width, r.height)}`;
    case "pad":
      return `Pad to ${size(r.width, r.height)}${r.background ? ` with ${r.background}` : ""}, image at ${at(r.gravity)}`;
    case "crop":
      return `Cut out ${size(r.width, r.height)} from ${r.x !== undefined || r.y !== undefined ? `x ${r.x ?? 0}, y ${r.y ?? 0}` : at(r.gravity)}`;
    default:
      return `Resize to ${size(r.width, r.height)}`;
  }
}

export interface DescribedStep {
  words: string;
  /** The URL segment this step compiles to. */
  segment: string;
}

export function describeTransform(t: Transform): DescribedStep[] {
  return t.map((step) => ({ words: describeStep(step), segment: compileTransform([step]) }));
}
