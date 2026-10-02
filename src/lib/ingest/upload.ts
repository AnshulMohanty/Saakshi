/**
 * The one ingest path for browser uploads, shared by POST /api/uploads/confirm and the
 * Cloudinary webhook: verify-then-upsert an asset from a provider upload response, check the
 * capture token, record capture attestation, audit, and queue the pipeline.
 * Idempotent on the public id (confirm and webhook may both arrive).
 */
import { eq } from "drizzle-orm";
import { appendAudit } from "../audit";
import { validateCapture, verifyCaptureToken, type CaptureReason } from "../capture/token";
import type { DB } from "../db/client";
import { assets, captureTokens, projects, spots, uploadTickets, type CaptureInfo, type DeviceFix } from "../db/schema";
import type { UploadResponse } from "./verify";

export interface IngestDeps {
  db: DB;
  captureSecret: string;
  enqueue: (assetId: string) => Promise<void>;
}

export interface IngestResult {
  assetId: string;
  created: boolean;
  source: "witness" | "upload";
  attested: boolean;
  reasons: CaptureReason[];
}

const num = (v: string | undefined) => (v === undefined || v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function fixFrom(ctx: Record<string, string>, prefix: "device" | "uploader"): DeviceFix | null {
  const lat = num(ctx[`${prefix}_lat`]);
  const lng = num(ctx[`${prefix}_lng`]);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracyM: num(ctx[`${prefix}_accuracy_m`]), fixTimestamp: ctx.fix_timestamp || null };
}

async function resolveHint(db: DB, ctx: Record<string, string>): Promise<{ projectId: string | null; spotId: string | null }> {
  let projectId: string | null = null;
  let spotId: string | null = null;
  if (ctx.spot) {
    const [s] = await db.select({ id: spots.id, projectId: spots.projectId }).from(spots).where(eq(spots.slug, ctx.spot)).limit(1);
    if (s) [spotId, projectId] = [s.id, s.projectId];
  }
  if (!projectId && ctx.project) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, ctx.project)).limit(1);
    projectId = p?.id ?? null;
  }
  return { projectId, spotId };
}

export async function ingestUpload(deps: IngestDeps, response: UploadResponse, receivedAt: Date): Promise<IngestResult> {
  // Trusted context: the ticket we stored when the shutter was pressed. What the browser forwards
  // in the provider response is not signed beyond public_id/version, so it is ignored.
  const [ticket] = await deps.db.select().from(uploadTickets).where(eq(uploadTickets.publicId, response.public_id)).limit(1);
  const ctx = ticket?.context ?? {};
  const source = ticket && ctx.source === "witness" ? "witness" : "upload";

  const [existing] = await deps.db.select().from(assets).where(eq(assets.cldPublicId, response.public_id)).limit(1);
  if (existing) {
    return { assetId: existing.id, created: false, source, attested: existing.capture?.attested ?? false, reasons: existing.capture?.reasons as CaptureReason[] ?? [] };
  }

  const urlHint = await resolveHint(deps.db, ctx);
  const claims = ctx.token ? verifyCaptureToken(ctx.token, deps.captureSecret) : null;
  const [row] = claims ? await deps.db.select().from(captureTokens).where(eq(captureTokens.id, claims.tid)).limit(1) : [];
  const deviceFix = fixFrom(ctx, "device");

  let attested = false;
  let reasons: CaptureReason[];
  if (source === "witness") {
    const check = validateCapture({
      token: ctx.token,
      secret: deps.captureSecret,
      row: row ?? null,
      clientCapturedAt: ctx.client_captured_at,
      ticketIssuedAt: ticket?.issuedAt ?? null,
      confirmedAt: receivedAt,
      fixTimestamp: ctx.fix_timestamp,
      accuracyM: deviceFix?.accuracyM ?? null,
      hint: urlHint,
      takenOffline: ctx.taken_offline === "1",
    });
    attested = check.attested;
    reasons = check.reasons;
  } else {
    reasons = ticket
      ? [{ code: "no_token", message: "Uploaded from the gallery, not captured live with Witness Capture." }]
      : [{ code: "no_ticket", message: "No upload ticket on record for this photo." }];
  }

  // Token scope wins over URL hints for where the photo belongs.
  const hint = row ? { projectId: row.projectId ?? urlHint.projectId, spotId: row.spotId ?? urlHint.spotId } : urlHint;
  const capture: CaptureInfo = {
    tokenId: row?.id ?? null,
    clientCapturedAt: ctx.client_captured_at || null,
    ticketIssuedAt: ticket?.issuedAt.toISOString() ?? null,
    serverReceivedAt: receivedAt.toISOString(),
    deviceFix: source === "witness" ? deviceFix : null,
    uploaderLocation: source === "upload" ? fixFrom(ctx, "uploader") : null,
    attested,
    reasons,
  };

  const [inserted] = await deps.db
    .insert(assets)
    .values({
      source,
      cldPublicId: response.public_id,
      cldAssetId: response.asset_id ?? null,
      etag: response.etag ?? null,
      phash: response.phash ?? null,
      width: response.width ?? null,
      height: response.height ?? null,
      facesCount: response.faces?.length ?? null,
      qualityScore: response.quality_analysis?.focus ?? null,
      deviceLat: capture.deviceFix?.lat ?? null,
      deviceLng: capture.deviceFix?.lng ?? null,
      deviceAccuracyM: capture.deviceFix?.accuracyM ?? null,
      captureTokenId: row?.id ?? null,
      capture,
      uploadedAt: receivedAt,
      pipeline: { ingest: { mediaMetadata: response.media_metadata ?? response.image_metadata ?? {}, hint }, steps: {} },
    })
    .onConflictDoNothing({ target: assets.cldPublicId })
    .returning();
  if (!inserted) {
    const [again] = await deps.db.select().from(assets).where(eq(assets.cldPublicId, response.public_id)).limit(1);
    return { assetId: again.id, created: false, source, attested: again.capture?.attested ?? false, reasons: (again.capture?.reasons as CaptureReason[]) ?? [] };
  }

  if (row && !row.usedAt) await deps.db.update(captureTokens).set({ usedAt: receivedAt }).where(eq(captureTokens.id, row.id));
  if (ticket) await deps.db.update(uploadTickets).set({ confirmedAt: receivedAt }).where(eq(uploadTickets.id, ticket.id));
  await appendAudit(deps.db, {
    assetId: inserted.id,
    actor: source === "witness" ? "witness:capture" : "user:upload",
    action: "asset.ingested",
    detail: { source, publicId: response.public_id, attested, reasons: reasons.map((r) => r.code), tokenId: row?.id ?? null },
  });
  await deps.enqueue(inserted.id);
  return { assetId: inserted.id, created: true, source, attested, reasons };
}
