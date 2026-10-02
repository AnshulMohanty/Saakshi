/**
 * The proof strip: a white band under the (face-blurred, same-frame) photo with a QR code to the
 * evidence page and the photo's place, date and trust band, all as Cloudinary layers. The QR is a
 * PNG uploaded once per asset to saakshi/qr/<assetId>.
 */
import type { Transform } from "./transform";

export const qrPublicId = (assetId: string) => `saakshi/qr/${assetId}`;

export interface ProofStripInput {
  assetId: string;
  place: string | null;
  /** "5 Sep 2017" */
  date: string;
  band: "VERIFIED" | "NEEDS_REVIEW" | "FLAGGED" | null;
  width?: number;
  height?: number;
  strip?: number;
}

const BAND_TEXT = { VERIFIED: "Verified", NEEDS_REVIEW: "Needs review", FLAGGED: "Flagged" } as const;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function proofStripTransform({ assetId, place, date, band, width = 1200, height = 900, strip = 150 }: ProofStripInput): Transform {
  const qr = strip - 24;
  const x = strip + 8;
  return [
    { crop: "fill", gravity: "auto", width, height },
    { effect: "blur_faces" },
    { crop: "pad", gravity: "north", width, height: height + strip, background: "#FFFFFF" },
    { overlay: { publicId: qrPublicId(assetId), crop: "fit", width: qr, height: qr }, gravity: "south_west", x: 12, y: 12 },
    { overlay: { text: `Saakshi · ${band ? BAND_TEXT[band] : "Not scored"}`, font: "Arial", size: 34, weight: "bold", color: "#111111" }, gravity: "south_west", x, y: 88 },
    { overlay: { text: clip(place ?? "Place unknown", 60), font: "Arial", size: 28, color: "#333333" }, gravity: "south_west", x, y: 50 },
    { overlay: { text: `${date} · scan to check this photo`, font: "Arial", size: 24, color: "#555555" }, gravity: "south_west", x, y: 16 },
    { format: "auto", quality: "auto" },
  ];
}
