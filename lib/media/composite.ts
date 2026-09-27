/**
 * Side-by-side before/after as one Cloudinary Transform on the "before" photo: both halves
 * cropped to the same frame, faces blurred on each, the "after" photo as an authenticated image
 * layer, date labels burned in, f_auto/q_auto. Delivered only as a signed URL.
 */
import type { Transform } from "./transform";

export interface CompositeSide {
  publicId: string;
  /** Shown in the label, e.g. "5 Sep 2017". */
  label: string;
}

export interface CompositeOptions {
  /** Size of each half. */
  width?: number;
  height?: number;
}

const LABEL = { font: "Arial", size: 28, weight: "bold" as const, color: "#FFFFFF", background: "#000000A0" };

/** The same-frame crop both halves (and their masks) use. */
export const frameOf = (width = 800, height = 600): Transform => [{ crop: "fill", gravity: "auto", width, height }];

export function compositeTransform(before: CompositeSide, after: CompositeSide, { width = 800, height = 600 }: CompositeOptions = {}): Transform {
  return [
    ...frameOf(width, height),
    { effect: "blur_faces" },
    { crop: "pad", gravity: "west", width: width * 2, height, background: "#111111" },
    {
      overlay: { publicId: after.publicId, type: "authenticated", crop: "fill", gravity: "auto", width, height, effect: "blur_faces" },
      gravity: "east",
    },
    { overlay: { text: `Before · ${before.label}`, ...LABEL }, gravity: "south_west", x: 16, y: 16 },
    { overlay: { text: `After · ${after.label}`, ...LABEL }, gravity: "south_east", x: 16, y: 16 },
    { format: "auto", quality: "auto" },
  ];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Sep 2017" in UTC. A fixed table, not Intl, so labels (and URLs) are identical everywhere. */
export function shortDate(d: Date | string | null): string {
  if (!d) return "date unknown";
  const t = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return "date unknown";
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
