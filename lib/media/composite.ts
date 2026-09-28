/**
 * Side-by-side before/after as one Cloudinary Transform on the "before" photo: both halves
 * cropped to the same frame, faces blurred on each, the "after" photo as an authenticated image
 * layer, date labels burned in, f_auto/q_auto. Delivered only as a signed URL.
 */
import { createHash } from "node:crypto";
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
  /** Delivery type of the "after" layer (the provider's evidence type). */
  layerType?: "authenticated" | "private";
}

const LABEL = { font: "Arial", size: 28, weight: "bold" as const, color: "#FFFFFF", background: "#000000A0" };

/** The same-frame crop both halves (and their masks) use. */
export const frameOf = (width = 800, height = 600): Transform => [{ crop: "fill", gravity: "auto", width, height }];

export function compositeTransform(before: CompositeSide, after: CompositeSide, { width = 800, height = 600, layerType = "authenticated" }: CompositeOptions = {}): Transform {
  return [
    ...frameOf(width, height),
    { effect: "blur_faces" },
    { crop: "pad", gravity: "west", width: width * 2, height, background: "#111111" },
    {
      overlay: { publicId: after.publicId, type: layerType, crop: "fill", gravity: "auto", width, height, effect: "blur_faces" },
      gravity: "east",
    },
    ...compositeLabels(before, after),
  ];
}

/** The date labels and delivery format, alone: applied to a composite rendered server-side (CLD_COMPOSITE_MODE=server). */
export function compositeLabels(before: CompositeSide, after: CompositeSide): Transform {
  return [
    { overlay: { text: `Before · ${before.label}`, ...LABEL }, gravity: "south_west", x: 16, y: 16 },
    { overlay: { text: `After · ${after.label}`, ...LABEL }, gravity: "south_east", x: 16, y: 16 },
    { format: "auto", quality: "auto" },
  ];
}

/** Each half of a server-side composite: the same frame, faces blurred, as JPEG bytes. */
export const compositeHalf = (width = 800, height = 600): Transform => [...frameOf(width, height), { effect: "blur_faces" }, { format: "jpg", quality: 90 }];

/** Public id of a server-rendered composite (stable per pair, so re-rendering overwrites). */
export const compositePublicId = (beforePublicId: string, afterPublicId: string) =>
  `saakshi/composites/${createHash("sha1").update(`${beforePublicId}|${afterPublicId}`).digest("hex").slice(0, 24)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Sep 2017" in UTC. A fixed table, not Intl, so labels (and URLs) are identical everywhere. */
export function shortDate(d: Date | string | null): string {
  if (!d) return "date unknown";
  const t = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return "date unknown";
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

/** A capture date as the source knows it: "5 Sep 2017", "5 Sep 2017 (date only)", "Sep 2017 (month only)". */
export function captureDate(d: Date | string | null, precision?: string | null): string {
  if (!d) return "date unknown";
  const t = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return "date unknown";
  if (precision === "year") return `${t.getUTCFullYear()} (year only)`;
  if (precision === "month") return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()} (month only)`;
  return precision === "day" ? `${shortDate(t)} (date only)` : shortDate(t);
}
