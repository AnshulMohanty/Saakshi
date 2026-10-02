import "server-only";
/**
 * The QR poster's model (PosterData): the spot's short link as a level-Q QR (D-1157), the three
 * steps with step 2 from spots.framing_note or, without one, "Stand where this photo was taken"
 * with the baseline thumbnail (B5.13), and the footer facts.
 */
import type { PosterData } from "@/components/poster/qr-poster";
import type { DB } from "./db/client";
import { splitProjectName } from "./landing/copy";
import { spotView } from "./measure/views";
import type { MediaProvider } from "./providers/media";
import { qrSvg } from "./qr";
import { shortLink } from "./short-link";

const coord = (v: number, dir: [string, string]) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? dir[0] : dir[1]}`;

export const POSTER_FALLBACK = "Stand where this photo was taken";
export const POSTER_PRIVACY = "Faces are blurred before any photo is public. Your location and time are recorded with the photo.";

const WATCH: Record<string, string> = {
  cleanup: "Your photo is checked and measured, and shows if this spot stays clean.",
  water: "Your photo is checked and measured, and shows if this spot stays clean.",
  plantation: "Your photo is checked and measured, and shows how the planting grows.",
};

export async function posterData(db: DB, media: MediaProvider, slug: string, origin: string): Promise<PosterData | null> {
  const v = await spotView(db, media, slug);
  if (!v) return null;
  const link = shortLink(origin, v.spot.id);
  const note = v.spot.framingNote?.trim().replace(/[.。।]+$/, "") || null;
  const framing = note ?? POSTER_FALLBACK;
  return {
    project: splitProjectName(v.project.name),
    qrSvg: await qrSvg(link.url, { level: "Q", color: "var(--foreground)" }),
    steps: [
      { title: "1. Scan", body: "No app, no login. स्कैन करें।" },
      {
        title: "2. Photograph the spot",
        body: `${framing}, so every check-in matches. उसी जगह से फ़ोटो लें।`,
        thumb: !note && v.baseline ? { src: v.baseline.thumbUrl, alt: "The baseline photo: frame your check-in like this. Faces blurred." } : null,
      },
      { title: "3. Watch it count", body: WATCH[v.project.type] ?? "Your photo is checked and measured, and shows how this spot changes." },
    ],
    spot: { name: v.spot.name, coords: `${coord(v.spot.lat, ["N", "S"])}, ${coord(v.spot.lng, ["E", "W"])}`, short: link.text },
    privacy: POSTER_PRIVACY,
  };
}
