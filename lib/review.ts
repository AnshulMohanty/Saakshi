/**
 * Review queue: photos the Trust Engine did not verify, for a person to approve or reject.
 * A decision never changes the score or band (the engine's reading stays on record); it sets the
 * asset's status and moderation, Cloudinary's moderation status, and appends an audit row with
 * the reviewer's note. A person can also ask for a second look at any scored photo (requestReview):
 * it joins the queue until someone decides.
 */
import { and, asc, desc, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { appendAudit } from "./audit";
import type { DB } from "./db/client";
import { assets, duplicates, projects, type ReviewDecision } from "./db/schema";
import { similarityPct } from "./hamming";
import { PREVIEW, THUMB } from "./library";
import type { MediaProvider } from "./providers/media";
import { describeReason, type ReasonCode, type TrustBand, type TrustReason } from "./trust";

export const MIN_NOTE_LENGTH = 3;
/** The recorded actor for reviews in demo mode (no accounts). */
export const DEMO_VISITOR = "Demo visitor";

export interface ReviewItem {
  id: string;
  caption: string | null;
  source: string;
  testCase: string | null;
  project: { id: string; name: string } | null;
  capturedAt: string | null;
  score: number | null;
  band: TrustBand | null;
  flags: ReasonCode[];
  reasons: Array<TrustReason & { sentence: string }>;
  thumbUrl: string;
  previewUrl: string;
  /** The closest near-duplicate, shown side by side. */
  duplicate: { id: string; previewUrl: string; project: string | null; hamming: number; exact: boolean; similarityPct: number; isLater: boolean; capturedAt: string | null } | null;
}

const withSentences = (rs: TrustReason[] | null) => (rs ?? []).map((r) => ({ ...r, sentence: describeReason(r) }));
const flagsOf = (rs: TrustReason[] | null) => (rs ?? []).filter((r) => r.kind === "hard" || r.kind === "review").map((r) => r.code);

/** Photos awaiting review (status flagged), newest first; `reason` filters to one reason code. */
export async function listReviewQueue(db: DB, media: MediaProvider, { reason, limit = 200 }: { reason?: string | null; limit?: number } = {}) {
  const rows = await db
    .select()
    .from(assets)
    .where(or(and(eq(assets.status, "flagged"), inArray(assets.trustBand, ["NEEDS_REVIEW", "FLAGGED"])), and(isNotNull(assets.reviewRequestedAt), isNotNull(assets.trustScore))))
    .orderBy(desc(assets.uploadedAt), assets.id)
    .limit(1000);
  const names = new Map((await db.select({ id: projects.id, name: projects.name }).from(projects)).map((p) => [p.id, p.name]));

  const counts: Record<string, number> = {};
  // Filterable reasons: flags and point losses (not the cap, which only follows a flag).
  const filterable = (x: TrustReason) => x.kind === "hard" || x.kind === "review" || (x.kind === "points" && x.points < 0 && x.code !== "HARD_FLAG_CAP");
  for (const r of rows) for (const code of new Set((r.trustReasons ?? []).filter(filterable).map((x) => x.code))) counts[code] = (counts[code] ?? 0) + 1;

  const shown = rows.filter((r) => !reason || (r.trustReasons ?? []).some((x) => x.code === reason)).slice(0, limit);
  const dupRows = shown.length
    ? await db
        .select({ assetId: duplicates.assetId, id: duplicates.matchAssetId, hamming: duplicates.hamming, exact: duplicates.exact, isLater: duplicates.matchIsLater, publicId: assets.cldPublicId, capturedAt: assets.capturedAt, projectId: assets.projectId })
        .from(duplicates)
        .innerJoin(assets, eq(assets.id, duplicates.matchAssetId))
        .where(inArray(duplicates.assetId, shown.map((r) => r.id)))
        .orderBy(asc(duplicates.hamming), asc(duplicates.matchAssetId))
    : [];
  const closest = new Map<string, (typeof dupRows)[number]>();
  for (const d of dupRows) if (!closest.has(d.assetId)) closest.set(d.assetId, d);

  const items: ReviewItem[] = shown.map((r) => {
    const d = closest.get(r.id);
    return {
      id: r.id,
      caption: r.caption,
      source: r.source,
      testCase: r.testCase,
      project: r.projectId ? { id: r.projectId, name: names.get(r.projectId) ?? "?" } : null,
      capturedAt: r.capturedAt?.toISOString() ?? null,
      score: r.trustScore,
      band: r.trustBand,
      flags: flagsOf(r.trustReasons),
      reasons: withSentences(r.trustReasons),
      thumbUrl: media.url(r.cldPublicId, THUMB, { signed: true }),
      previewUrl: media.url(r.cldPublicId, PREVIEW, { signed: true }),
      duplicate: d
        ? {
            id: d.id,
            previewUrl: media.url(d.publicId, PREVIEW, { signed: true }),
            project: d.projectId ? (names.get(d.projectId) ?? null) : null,
            hamming: d.hamming,
            exact: d.exact,
            similarityPct: similarityPct(d.hamming),
            isLater: d.isLater,
            capturedAt: d.capturedAt?.toISOString() ?? null,
          }
        : null,
    };
  });
  return { items, total: rows.length, counts };
}

export type ReviewQueue = Awaited<ReturnType<typeof listReviewQueue>>;

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

export async function decideReview(
  db: DB,
  media: MediaProvider,
  { assetId, decision, note, actor = "reviewer" }: { assetId: string; decision: "approve" | "reject"; note: string; actor?: string },
) {
  const text = note.trim();
  if (text.length < MIN_NOTE_LENGTH) throw new ReviewError(`A note of at least ${MIN_NOTE_LENGTH} characters is required`, 400);
  if (decision !== "approve" && decision !== "reject") throw new ReviewError("decision must be approve or reject", 400);
  const [a] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!a) throw new ReviewError("Not found", 404);
  if (a.trustScore === null) throw new ReviewError("Not scored yet", 409);

  const status = decision === "approve" ? "approved" : "rejected";
  const review: ReviewDecision = { decision, note: text.slice(0, 1000), actor: actor.slice(0, 80), at: new Date().toISOString(), band: a.trustBand, score: a.trustScore };
  await media.setModeration(a.cldPublicId, status);
  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ status, review, reviewRequestedAt: null, moderation: { ...(a.moderation ?? {}), status, checkedAt: review.at } })
      .where(eq(assets.id, a.id));
    await appendAudit(tx as unknown as DB, {
      assetId: a.id,
      actor: `reviewer:${review.actor}`,
      action: `review.${decision}`,
      detail: { note: review.note, band: a.trustBand, score: a.trustScore, flags: flagsOf(a.trustReasons) },
    });
  });
  return { id: a.id, status, review, score: a.trustScore, band: a.trustBand };
}

/**
 * "Send to review": asks for a second look at scored photos. They join the queue (the score and
 * band are unchanged) until a reviewer decides; each request is an audit row. Photos not scored
 * yet are skipped. Returns how many were queued.
 */
export async function requestReview(db: DB, ids: string[], { actor = "reviewer" }: { actor?: string } = {}): Promise<number> {
  const unique = [...new Set(ids)].slice(0, 500);
  if (!unique.length) return 0;
  const rows = await db.select({ id: assets.id }).from(assets).where(and(inArray(assets.id, unique), isNotNull(assets.trustScore), ne(assets.status, "processing")));
  const at = new Date();
  for (const r of rows) {
    await db.transaction(async (tx) => {
      await tx.update(assets).set({ reviewRequestedAt: at }).where(eq(assets.id, r.id));
      await appendAudit(tx as unknown as DB, { assetId: r.id, actor: `reviewer:${actor.slice(0, 80)}`, action: "review.requested", detail: {} });
    });
  }
  return rows.length;
}
