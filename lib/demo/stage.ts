/**
 * "Live stage demo": a project for the live final (off by default; `pnpm demo:stage`).
 * A before photo of a littered table, clean it, an after photo: min_pair_gap_hours 0, so the
 * pair is measured within seconds. One spot (150 m) at the venue (STAGE_LAT/STAGE_LNG).
 */
import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { projects, spots } from "../db/schema";
import { isValidLatLng } from "../geo";
import { uuidv5 } from "./common";

export const STAGE_PROJECT_SLUG = "live-stage-demo";
export const STAGE_SPOT_SLUG = "live-stage-demo-table";

export interface StageResult {
  projectId: string;
  spotId: string;
  captureUrl: string;
  spotUrl: string;
}

export async function createStageProject(db: DB, { lat, lng, now = new Date() }: { lat: number; lng: number; now?: Date }): Promise<StageResult> {
  if (!isValidLatLng({ lat, lng })) throw new Error("Stage location is not a valid latitude/longitude.");
  const day = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10);
  const projectId = uuidv5(`project:${STAGE_PROJECT_SLUG}`);
  const values = {
    name: "Live stage demo",
    slug: STAGE_PROJECT_SLUG,
    type: "cleanup" as const,
    description:
      "Live demonstration: a littered table is photographed, cleaned, and photographed again. The before/after pair is measured in seconds.",
    centerLat: lat,
    centerLng: lng,
    radiusM: 150,
    startDate: day(-1),
    endDate: day(30),
    sdgs: [11, 12],
    minPairGapHours: 0,
    source: "user" as const,
    // Indoor venue GPS drifts tens of metres: labelled approximate, so the 150 m spot applies.
    locationApproximate: true,
  };
  await db.insert(projects).values({ id: projectId, ...values }).onConflictDoUpdate({ target: projects.id, set: { ...values, embedding: null } });
  const spotId = uuidv5(`spot:${STAGE_SPOT_SLUG}`);
  const sv = { projectId, name: "Stage table", slug: STAGE_SPOT_SLUG, lat, lng, radiusM: 150, createdFrom: "manual" as const };
  await db.insert(spots).values({ id: spotId, ...sv }).onConflictDoUpdate({ target: spots.id, set: sv });
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  return { projectId: p.id, spotId, captureUrl: `/capture?spot=${STAGE_SPOT_SLUG}`, spotUrl: `/spots/${STAGE_SPOT_SLUG}` };
}
