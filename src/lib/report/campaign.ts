/**
 * Campaign kit: three Instagram 4:5 (1080×1350) templates built only from Cloudinary Transforms
 * (signed, face-blurred): a stat card from one claim, a before/after split, and a verified photo
 * with its proof strip. Numbers on the images come from claims (formatClaimValue), with the
 * method label beside them.
 */
import type { Transform } from "../media/transform";
import { proofStripTransform, type ProofStripInput } from "../media/proof";

export const IG = { width: 1080, height: 1350 };
export type TemplateId = "stat" | "split" | "proof";
export const TEMPLATES: TemplateId[] = ["stat", "split", "proof"];

const BOX = "#000000B3";
const text = (t: string, size: number, o: { weight?: "bold"; color?: string; background?: string } = {}) => ({
  text: t,
  font: "Arial",
  size,
  ...(o.weight ? { weight: o.weight } : {}),
  color: o.color ?? "#FFFFFF",
  ...(o.background !== undefined ? { background: o.background } : { background: BOX }),
});

/** Delivery step: f_auto,q_auto to preview, PNG to download. */
const deliver = (download: boolean): Transform => [download ? { format: "png" } : { format: "auto", quality: "auto" }];

export function statCardTransform(i: { value: string; label: string; method: string }, download = false): Transform {
  return [
    { crop: "fill", gravity: "auto", width: IG.width, height: IG.height },
    { effect: "blur_faces" },
    { overlay: text(i.value, 150, { weight: "bold" }), gravity: "north_west", x: 60, y: 360 },
    { overlay: text(i.label, 52), gravity: "north_west", x: 60, y: 580 },
    { overlay: text(i.method, 34, { color: "#E5E7EB" }), gravity: "north_west", x: 60, y: 668 },
    { overlay: text("Saakshi · verified evidence", 40, { weight: "bold" }), gravity: "south_west", x: 60, y: 60 },
    ...deliver(download),
  ];
}

export function splitTransform(i: { afterPublicId: string; beforeLabel: string; afterLabel: string; headline: string }, download = false): Transform {
  const half = IG.height / 2;
  return [
    { crop: "fill", gravity: "auto", width: IG.width, height: half },
    { effect: "blur_faces" },
    { crop: "pad", gravity: "north", width: IG.width, height: IG.height, background: "#111111" },
    { overlay: { publicId: i.afterPublicId, type: "authenticated", crop: "fill", gravity: "auto", width: IG.width, height: half, effect: "blur_faces" }, gravity: "south" },
    { overlay: text(i.beforeLabel, 40, { weight: "bold" }), gravity: "north_west", x: 40, y: 40 },
    { overlay: text(i.afterLabel, 40, { weight: "bold" }), gravity: "south_west", x: 40, y: half - 100 },
    { overlay: text(i.headline, 44, { weight: "bold" }), gravity: "south_west", x: 40, y: 40 },
    ...deliver(download),
  ];
}

export function proofTemplateTransform(i: Omit<ProofStripInput, "width" | "height" | "strip">, download = false): Transform {
  const steps = proofStripTransform({ ...i, width: IG.width, height: IG.height - 180, strip: 180 });
  return [...steps.slice(0, -1), ...deliver(download)];
}
