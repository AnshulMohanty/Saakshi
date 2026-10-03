/**
 * "Built on Cloudinary" (landing chapter 10): each parameter of a call or URL with a short label in
 * plain words, so the parameters can be read without knowing Cloudinary (pure, tested).
 */
export interface Param {
  code: string;
  label: string;
}

/** One URL component ("c_fill,g_auto,w_800,h_600") → its plain-words label. */
export function paramLabel(component: string): string {
  const c = component.trim();
  if (/^s--.+--$/.test(c)) return "Signature: change one character and Cloudinary refuses the link";
  if (/^v\d+$/.test(c)) return "Version: pins the exact file a report counted";
  if (c.startsWith("e_extract")) return "Segments litter into a mask (AI), one per prompt";
  if (c.startsWith("e_blur_faces")) return "Blurs every face, on every public copy";
  if (/^c_fill/.test(c)) {
    const w = /w_(\d+)/.exec(c)?.[1];
    const h = /h_(\d+)/.exec(c)?.[1];
    return w && h ? `The same ${w}×${h} frame for every photo, centred on the subject` : "Crops to one fixed frame";
  }
  if (/^c_limit/.test(c)) return `Public size, at most ${/w_(\d+)/.exec(c)?.[1] ?? "?"} px wide`;
  if (/^f_auto/.test(c)) return "Smallest good format and quality for each browser";
  if (/^f_png/.test(c)) return "Lossless PNG, so mask pixels can be counted";
  if (/^f_jpg/.test(c)) return "JPEG";
  return "Part of the signed transformation";
}

/** A compiled transformation ("a/b/c") → its components with labels. */
export function urlParams(compiled: string): Param[] {
  return compiled
    .split("/")
    .filter(Boolean)
    .map((code) => ({ code, label: paramLabel(code) }));
}

/** Upload options → labels (the intake call). */
export const UPLOAD_PARAMS: Param[] = [
  { code: 'type: "authenticated"', label: "Stored private: only signed links can show it" },
  { code: "media_metadata: true", label: "Reads GPS, capture time and camera from the file" },
  { code: "phash: true", label: "A 64-bit fingerprint of the pixels, to catch reuse" },
  { code: "faces: true", label: "Finds faces, so they can be blurred" },
  { code: "quality_analysis: true", label: "Scores sharpness and exposure" },
];

/** Analyze API models → labels (perception). */
export const ANALYZE_PARAMS: Param[] = [
  { code: "ai_vision_tagging", label: "Tags what is in the frame (AI-estimated)" },
  { code: "ai_vision_moderation", label: "Yes/no checks: a screen, a print, edits, unsafe content" },
  { code: "watermark_detection", label: "Finds watermarks and stock branding" },
];

/** Perception's calls as configured (CLD_AI_VISION): Cloudinary AI Vision, with OpenAI vision standing in when its quota is used up (auto) or always (off). */
export function perceptionParams(mode: "auto" | "on" | "off"): Param[] {
  const fallback = { code: "OpenAI vision (fallback)", label: "Answers the tags and checks once the AI Vision quota is used up" };
  if (mode === "off") return [{ code: "OpenAI vision", label: "Tags and yes/no checks, one call per photo" }, ANALYZE_PARAMS[2]];
  return mode === "auto" ? [...ANALYZE_PARAMS, fallback] : ANALYZE_PARAMS;
}
