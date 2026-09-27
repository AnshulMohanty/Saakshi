/**
 * Project edits. Changing where or when a project happened changes what its photos prove, so
 * any change to the centre, radius, dates or pair gap re-scores every photo in it.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { appendAudit } from "./audit";
import type { DB } from "./db/client";
import { projects, type Project } from "./db/schema";
import { rescoreProject } from "./pipeline/score";
import type { MediaProvider } from "./providers/media";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const ProjectPatch = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(4000).nullable(),
    centerLat: z.number().min(-90).max(90),
    centerLng: z.number().min(-180).max(180),
    radiusM: z.number().positive().max(50_000),
    startDate: day.nullable(),
    endDate: day.nullable(),
    minPairGapHours: z.number().min(0).max(24 * 365),
  })
  .partial()
  .strict();
export type ProjectPatch = z.infer<typeof ProjectPatch>;

/** Fields the Trust Engine reads. */
const TRUST_FIELDS = ["centerLat", "centerLng", "radiusM", "startDate", "endDate", "minPairGapHours"] as const;

export async function updateProject(db: DB, media: MediaProvider, id: string, patch: ProjectPatch, actor = "user") {
  const [before] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!before) return null;
  const next = { ...before, ...patch };
  if (next.startDate && next.endDate && next.startDate > next.endDate) throw new RangeError("startDate must be on or before endDate");

  const changed = (Object.keys(patch) as (keyof ProjectPatch)[]).filter((k) => patch[k] !== undefined && patch[k] !== before[k as keyof Project]);
  if (!changed.length) return { project: before, changed, rescore: null };
  const [project] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning();
  await appendAudit(db, { assetId: null, actor, action: "project.updated", detail: { projectId: id, changed, before: pick(before, changed), after: pick(project, changed) } });

  const trustChanged = changed.some((k) => (TRUST_FIELDS as readonly string[]).includes(k));
  const rescore = trustChanged ? await rescoreProject(db, media, id, `project ${changed.join(", ")} changed`) : null;
  return { project, changed, rescore: rescore && { rescored: rescore.rescored, changed: rescore.changed } };
}

function pick(p: Project, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, (p as Record<string, unknown>)[k] ?? null])) as Record<string, string | number | null>;
}
