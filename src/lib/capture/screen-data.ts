import "server-only";
/**
 * Server data for the capture screen: the spot a check-in is for (its name and site radius, for
 * the HUD and mini-map), and, in development only, the review states (`?state=`, B5.11) on our
 * own demo data: the hero project's best verified photo as the feed (signed, face-blurred), its
 * fingerprint, and the simulator's score from lib/trust (bands 75/45, B5.1).
 */
import { and, asc, desc, eq, isNotNull, or } from "drizzle-orm";
import type { SimConfig } from "@/components/capture/use-sim-capture";
import type { DB } from "../db/client";
import { assets, spots } from "../db/schema";
import { heroProject } from "../demo/hero";
import { hexToBits } from "../glyph";
import { PREVIEW } from "../media/derivatives";
import { SIM } from "../motion/scenes/capture";
import type { MediaProvider } from "../providers/media";
import { defaultTrustConfig } from "../trust/config";
import { ruleChips } from "../trust/labels";
import { SIM_PRESETS, simulate } from "../trust/simulate";
import { coordsText, spotShort } from "./hud";
import type { SimMode } from "./sim-states";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function captureSpot(db: DB, slugOrId: string | null): Promise<{ name: string; lat: number; lng: number; radiusM: number } | null> {
  if (!slugOrId) return null;
  const [s] = await db
    .select({ name: spots.name, lat: spots.lat, lng: spots.lng, radiusM: spots.radiusM })
    .from(spots)
    .where(UUID.test(slugOrId) ? or(eq(spots.id, slugOrId), eq(spots.slug, slugOrId)) : eq(spots.slug, slugOrId))
    .limit(1);
  return s ?? null;
}

export async function devSimConfig(db: DB, media: MediaProvider, mode: SimMode): Promise<SimConfig | null> {
  const hero = await heroProject(db);
  if (!hero.project) return null;
  const [photo] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, hero.project.id), eq(assets.trustBand, "VERIFIED"), isNotNull(assets.phash)))
    .orderBy(desc(assets.trustScore), assets.id)
    .limit(1);
  if (!photo) return null;
  const [spot] = await db.select().from(spots).where(eq(spots.projectId, hero.project.id)).orderBy(asc(spots.name)).limit(1);
  const result = (loc: "witness" | "none") => {
    const r = simulate({ ...SIM_PRESETS.witness, loc });
    return { score: r.score, rows: ruleChips(r.reasons).map((c) => ({ label: c.text, full: c.tone === "good" })) };
  };
  return {
    mode,
    spotName: spot?.name ?? hero.project.name,
    spotShort: spotShort(spot?.name ?? null),
    coords: coordsText(spot ? { lat: spot.lat, lng: spot.lng } : null),
    feed: media.url(photo.cldPublicId, PREVIEW, { signed: true }),
    hash: hexToBits(photo.phash!),
    results: { witness: result("witness"), none: result("none") },
    bands: { verified: defaultTrustConfig.verifiedMin, review: defaultTrustConfig.reviewMin },
    dots: { live: { x: 52, y: 51 }, low: { x: 62, y: 38 } },
    seeHref: `/e/${photo.id}`,
    lowAccNote: `Location was weak, ±${SIM.floor.low} m`,
  };
}
