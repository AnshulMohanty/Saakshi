/**
 * The claims ledger for a project and period, built ONLY from SQL over stored rows: trust bands,
 * reasons, spots, comparisons and check-ins. Every claim carries the asset ids it rests on.
 * Prose may reference a claim only as {{claim:id}} (lib/claims.ts); numbers never come from a model.
 *
 * - photos_verified, photos_flagged (top reason codes; planted inputs listed as test inputs)
 * - spots_monitored
 * - litter_cover_change / green_cover_change: median of measured deltas (omitted without pairs)
 * - items_visible_change: AI-estimated, with confidence
 * - checkins_after_cleanup, days_since_last_checkin: only with check-ins in the last 90 days;
 *   otherwise a note ("Archive project: no recent check-ins"), with no number.
 */
import { eq, inArray } from "drizzle-orm";
import { ClaimSchema, type Claim } from "../claims";
import type { DB } from "../db/client";
import { assets, comparisons, projects, type Asset, type Project } from "../db/schema";
import { exclusionsOf } from "../measure/pairing";
import { pairPhotoOf } from "../measure/measure";

export const RECENT_CHECKIN_DAYS = 90;
const DAY = 86_400_000;

export interface Period {
  from: string;
  to: string;
}

export interface ClaimsResult {
  project: Project;
  period: Period;
  claims: Claim[];
  notes: string[];
  /** The photos the claims were computed over (in project and period). */
  photos: Asset[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
};
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Default period: the project's dates, else the span of its photos, else today. */
function periodOf(project: Project, photos: Asset[], from?: string | null, to?: string | null): Period {
  const times = photos.map((p) => p.capturedAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  return {
    from: from ?? project.startDate ?? (times[0] ? day(times[0]) : day(new Date())),
    to: to ?? project.endDate ?? (times.at(-1) ? day(times.at(-1)!) : day(new Date())),
  };
}

export async function buildClaims(db: DB, projectId: string, opts: { from?: string | null; to?: string | null; now?: Date } = {}): Promise<ClaimsResult> {
  const now = opts.now ?? new Date();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error(`Project ${projectId} not found`);
  const all = await db.select().from(assets).where(eq(assets.projectId, projectId));
  const period = periodOf(project, all, opts.from, opts.to);
  const start = Date.parse(`${period.from}T00:00:00Z`);
  const end = Date.parse(`${period.to}T00:00:00Z`) + DAY;
  // Photos without a capture time can't be placed in time; they stay in (and are usually flagged).
  const inPeriod = (a: Asset) => !a.capturedAt || (a.capturedAt.getTime() >= start && a.capturedAt.getTime() < end);
  const photos = all.filter((a) => a.source !== "witness" && inPeriod(a));
  const claims: Claim[] = [];
  const notes: string[] = [];

  const verified = photos.filter((a) => a.trustBand === "VERIFIED" && a.status !== "rejected");
  claims.push({ id: "photos_verified", label: "Photos verified", value: verified.length, unit: "photos", method: "measured", asset_ids: verified.map((a) => a.id), detail: { basis: "Trust Engine band VERIFIED, not rejected by a reviewer" } });

  const flagged = photos.filter((a) => a.trustBand === "FLAGGED" && a.status !== "approved");
  const codes = new Map<string, number>();
  for (const a of flagged) for (const r of a.trustReasons ?? []) if (r.kind === "hard" || r.kind === "review") codes.set(r.code, (codes.get(r.code) ?? 0) + 1);
  claims.push({
    id: "photos_flagged",
    label: "Photos flagged",
    value: flagged.length,
    unit: "photos",
    method: "measured",
    asset_ids: flagged.map((a) => a.id),
    detail: {
      topReasons: [...codes.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 4).map(([code, n]) => ({ code, n })),
      testInputs: flagged.filter((a) => a.testCase).map((a) => a.testCase!),
    },
  });

  const spotPhotos = verified.filter((a) => a.spotId);
  const spotIds = [...new Set(spotPhotos.map((a) => a.spotId!))];
  claims.push({ id: "spots_monitored", label: "Spots monitored", value: spotIds.length, unit: "spots", method: "measured", asset_ids: spotPhotos.map((a) => a.id), detail: { basis: "Spots with at least one verified photo" } });

  // Before/after: comparisons whose "before" photo is in the period.
  const inIds = new Set(photos.map((a) => a.id));
  const cs = (await db.select().from(comparisons).where(eq(comparisons.projectId, projectId))).filter((c) => inIds.has(c.beforeAssetId));
  for (const [metric, id, label] of [
    ["litter_cover", "litter_cover_change", "Median change in litter cover"],
    ["green_cover", "green_cover_change", "Median change in green cover"],
  ] as const) {
    const rows = cs.filter((c) => c.metric === metric && c.method === "measured" && c.delta !== null);
    if (!rows.length) continue;
    const confs = rows.map((c) => c.confidence).filter((x): x is number => x !== null);
    claims.push({
      id,
      label,
      value: median(rows.map((c) => c.delta!)),
      unit: "points",
      method: "measured",
      asset_ids: [...new Set(rows.flatMap((c) => [c.beforeAssetId, c.afterAssetId]))],
      ...(confs.length ? { confidence: Math.min(...confs) } : {}),
      detail: { pairs: rows.length, basis: "Percentage points of the frame, median over before/after pairs, measured on photo pixels" },
    });
  }
  const items = cs.filter((c) => c.metric === "items_visible" && c.delta !== null);
  if (items.length) {
    const confs = items.map((c) => c.confidence ?? 0.5);
    claims.push({
      id: "items_visible_change",
      label: "Median change in items visible",
      value: median(items.map((c) => c.delta!)),
      unit: "items",
      method: "ai_estimated",
      confidence: Math.round(Math.min(...confs) * 100) / 100,
      asset_ids: [...new Set(items.flatMap((c) => [c.beforeAssetId, c.afterAssetId]))],
      detail: { pairs: items.length, basis: "Counts by the vision model, not measured" },
    });
  }

  // Check-ins: eligible Witness photos at the project's spots.
  const checkins = all.filter((a) => a.source === "witness" && a.spotId && a.capturedAt && exclusionsOf(pairPhotoOf(a)).length === 0);
  const recent = checkins.filter((a) => now.getTime() - a.capturedAt!.getTime() <= RECENT_CHECKIN_DAYS * DAY);
  if (recent.length) {
    const after = checkins.filter((a) => a.capturedAt!.getTime() >= end - DAY);
    claims.push({ id: "checkins_after_cleanup", label: "Check-ins after the clean-up", value: after.length, unit: "check-ins", method: "measured", asset_ids: after.map((a) => a.id), detail: { basis: "Attested Witness Capture photos at the project's spots, on or after the last day" } });
    const last = checkins.reduce((m, a) => (a.capturedAt!.getTime() > m.capturedAt!.getTime() ? a : m));
    claims.push({ id: "days_since_last_checkin", label: "Days since the last check-in", value: Math.floor((now.getTime() - last.capturedAt!.getTime()) / DAY), unit: "days", method: "measured", asset_ids: [last.id] });
  } else {
    notes.push(project.source === "demo_archive" ? "Archive project: no recent check-ins." : "No check-ins in the last three months.");
  }

  return { project, period, claims: claims.map((c) => ClaimSchema.parse(c) as Claim), notes, photos };
}

/** Assets referenced by any claim, for the report's evidence lists. */
export async function claimAssets(db: DB, claims: Claim[]) {
  const ids = [...new Set(claims.flatMap((c) => c.asset_ids))];
  if (!ids.length) return [];
  return db.select().from(assets).where(inArray(assets.id, ids));
}
