/**
 * Demo import: archive candidates → 3 auto-built projects (+ spots) → assets → pipeline.
 * Idempotent: projects/spots upsert by stable id (UUIDv5 of the config slug), assets by
 * external_id ("commons:<pageid>").
 */
import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import { DEMO_DATASET, type DemoDatasetConfig } from "../../data/demo-dataset.config";
import { buildDemoDataset, type DatasetPlan, type ProjectPlan } from "../archive/build";
import type { Candidate } from "../archive/candidates";
import { appendAudit } from "../audit";
import type { DB } from "../db/client";
import { assets, projects, spots } from "../db/schema";
import type { GeocoderProvider } from "../providers/geocoder";
import type { MediaProvider } from "../providers/media";
import { attributionOf, commonsIngest, contextValue, demoProjectId, demoSpotId, demoSpotSlug, projectDescription, shortPlace, type Logger, type ThumbSource } from "./common";

export interface DemoDeps {
  db: DB;
  media: MediaProvider;
  geocoder: GeocoderProvider;
  thumbs: ThumbSource;
  /** Queue the evidence pipeline for an asset. */
  enqueue: (assetId: string) => Promise<void>;
  /** Called when a project's site (centre, radius or dates) changed: re-score its photos. */
  onSiteChanged?: (projectId: string) => Promise<void>;
  log?: Logger;
}

export interface ImportedProject {
  key: ProjectPlan["key"];
  id: string;
  name: string;
  slug: string;
  type: ProjectPlan["type"];
  photos: number;
  spots: Array<{ id: string; slug: string; photos: number }>;
}

export interface ImportReport {
  plan: DatasetPlan;
  projects: ImportedProject[];
  imported: number;
  skipped: number;
  requeued: number;
}

/** Name for a planned project: "<label>, <place>" from the (cached) reverse geocoder. */
export async function projectIdentity(geocoder: GeocoderProvider, p: ProjectPlan): Promise<{ id: string; name: string; slug: string; place: string }> {
  const place = shortPlace(await geocoder.reverse(p.center.lat, p.center.lng)) ?? `${p.center.lat.toFixed(3)}, ${p.center.lng.toFixed(3)}`;
  return { id: demoProjectId(p.slug), name: `${p.label}, ${place}`, slug: p.slug, place };
}

/**
 * Upserts a planned project and its spots with stable ids (UUIDv5 of the config slug), so a
 * re-import recreates the same ids and witness photos keep their project and spot links.
 */
async function upsertProject(deps: DemoDeps, p: ProjectPlan): Promise<ImportedProject> {
  const { id, name, slug, place } = await projectIdentity(deps.geocoder, p);
  const values = {
    name,
    slug,
    type: p.type,
    description: projectDescription(p.type, p.label, place),
    centerLat: p.center.lat,
    centerLng: p.center.lng,
    radiusM: p.radiusM,
    startDate: p.startDate,
    endDate: p.endDate,
    sdgs: p.sdgs,
    minPairGapHours: p.minPairGapHours,
    source: "demo_archive" as const,
  };
  const [before] = await deps.db.select().from(projects).where(eq(projects.id, id)).limit(1);
  const [row] = await deps.db.insert(projects).values({ id, ...values }).onConflictDoUpdate({ target: projects.id, set: { ...values, embedding: null } }).returning();
  const siteChanged = !!before && (before.radiusM !== row.radiusM || before.startDate !== row.startDate || before.endDate !== row.endDate || before.centerLat !== row.centerLat || before.centerLng !== row.centerLng);

  const spotRows = [];
  const keep = new Set<string>();
  for (const s of p.spots) {
    const spotSlug = demoSpotSlug(slug, s.index);
    const spotId = demoSpotId(spotSlug);
    keep.add(spotId);
    const sv = { projectId: row.id, name: `${place} · spot ${s.index + 1}`, slug: spotSlug, lat: s.center.lat, lng: s.center.lng, radiusM: s.radiusM, createdFrom: "auto_cluster" as const };
    await deps.db.insert(spots).values({ id: spotId, ...sv }).onConflictDoUpdate({ target: spots.id, set: sv });
    spotRows.push({ id: spotId, slug: spotSlug, photos: s.pageIds.length });
  }
  // Auto spots no longer in the plan go; photos linked to them keep their project (spot → null).
  const stale = (await deps.db.select({ id: spots.id }).from(spots).where(and(eq(spots.projectId, row.id), eq(spots.createdFrom, "auto_cluster")))).filter((x) => !keep.has(x.id));
  if (stale.length) await deps.db.delete(spots).where(inArray(spots.id, stale.map((x) => x.id)));
  if (siteChanged) await deps.onSiteChanged?.(row.id);
  return { key: p.key, id: row.id, name, slug, type: p.type, photos: p.files.length, spots: spotRows };
}

/** Demo projects from earlier plans: removed when empty, kept (with a warning) if they still hold photos. */
async function retireStaleProjects(deps: DemoDeps, keepIds: string[], log: Logger) {
  const rows = await deps.db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.source, "demo_archive"), notInArray(projects.id, keepIds)));
  for (const p of rows) {
    const [{ n }] = await deps.db.select({ n: count() }).from(assets).where(eq(assets.projectId, p.id));
    if (n === 0) await deps.db.delete(projects).where(eq(projects.id, p.id));
    else log(`  ! kept old demo project "${p.name}": it still holds ${n} photo(s)`);
  }
}

/** Imports one Commons file as an archive asset. Returns the asset id, or null if it already existed. */
export async function importCandidate(deps: DemoDeps, c: Candidate): Promise<{ assetId: string; created: boolean }> {
  const [existing] = await deps.db.select({ id: assets.id, status: assets.status }).from(assets).where(eq(assets.externalId, c.externalId)).limit(1);
  if (existing) return { assetId: existing.id, created: false };

  const bytes = await deps.thumbs.downloadThumb(c);
  const up = await deps.media.upload({
    file: bytes,
    folder: "saakshi/archive",
    tags: ["saakshi", "archive"],
    context: {
      external_id: c.externalId,
      source: "archive",
      title: contextValue(c.title.replace(/^File:/, "")),
      description: contextValue(c.description),
      license: contextValue(c.license),
    },
  });
  const [row] = await deps.db
    .insert(assets)
    .values({
      source: "archive",
      externalId: c.externalId,
      cldPublicId: up.publicId,
      cldAssetId: up.assetId,
      etag: up.etag,
      phash: up.phash,
      width: up.width,
      height: up.height,
      facesCount: up.facesCount,
      qualityScore: up.qualityScore,
      // Thumbnails carry no EXIF: metadata comes from the Commons API and is labelled as such.
      exifSource: "commons_api",
      attribution: attributionOf(c),
      pipeline: { ingest: { commons: commonsIngest(c), mediaMetadata: up.mediaMetadata }, steps: {} },
    })
    .onConflictDoNothing({ target: assets.externalId })
    .returning();
  if (!row) {
    const [again] = await deps.db.select({ id: assets.id }).from(assets).where(eq(assets.externalId, c.externalId)).limit(1);
    return { assetId: again.id, created: false };
  }
  await appendAudit(deps.db, {
    assetId: row.id,
    actor: "demo:import",
    action: "archive.imported",
    detail: { externalId: c.externalId, publicId: up.publicId, license: c.license, source: c.descriptionUrl },
  });
  return { assetId: row.id, created: true };
}

export async function importDemo(deps: DemoDeps, candidates: Candidate[], cfg: DemoDatasetConfig = DEMO_DATASET): Promise<ImportReport> {
  const log = deps.log ?? (() => {});
  const plan = buildDemoDataset(candidates, cfg);
  for (const w of plan.warnings) log(`  ! ${w}`);

  const report: ImportReport = { plan, projects: [], imported: 0, skipped: 0, requeued: 0 };
  const total = plan.projects.reduce((n, p) => n + p.files.length, 0);
  let i = 0;
  for (const p of plan.projects) {
    const project = await upsertProject(deps, p);
    report.projects.push(project);
    log(
      `Project ${p.key}: ${project.name} [${p.slug}] (${p.type}, r=${p.radiusM} m, ${p.startDate} → ${p.endDate}, ` +
        `${p.spots.length} spot(s), pairability ${p.pairability.selected.score}, pair gap ${p.minPairGapHours} h)`,
    );
    for (const f of p.files) {
      i++;
      const { assetId, created } = await importCandidate(deps, f);
      if (created) {
        report.imported++;
        log(`  [${String(i).padStart(2)}/${total}] ${f.externalId}  ${f.title.replace(/^File:/, "").slice(0, 60)}`);
        await deps.enqueue(assetId);
      } else {
        report.skipped++;
        const [a] = await deps.db.select({ status: assets.status }).from(assets).where(eq(assets.id, assetId));
        if (a?.status === "processing") {
          report.requeued++;
          await deps.enqueue(assetId); // resume an interrupted pipeline (steps are idempotent)
        }
      }
    }
  }
  await retireStaleProjects(deps, report.projects.map((p) => p.id), log);
  return report;
}
