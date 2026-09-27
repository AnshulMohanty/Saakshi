/**
 * The public evidence page's read model (/e/[assetId]): the proof-strip image, the trust ledger,
 * capture facts and attestation, duplicates, comparisons, every edit (stored and derived) in
 * plain words with its URL segment, the audit chain with its verification, and credits.
 */
import { asc, eq, or } from "drizzle-orm";
import QRCode from "qrcode";
import { verifyChain } from "./audit";
import type { DB } from "./db/client";
import { assets, auditLog, comparisons, duplicates, measurements, projects, spots, type Asset } from "./db/schema";
import { haversine } from "./geo";
import { similarityPct } from "./hamming";
import { PREVIEW } from "./library";
import { shortDate } from "./media/composite";
import { describeTransform, type DescribedStep } from "./media/describe";
import { proofStripTransform, qrPublicId } from "./media/proof";
import type { Transform } from "./media/transform";
import { FRAME, GREEN_PROMPTS, LITTER_PROMPTS, METRIC_LABEL, VIEW } from "./measure/measure";
import { maskTransform, type MediaProvider } from "./providers/media";
import { describeReason } from "./trust";

export const evidencePath = (assetId: string) => `/e/${assetId}`;

/** Uploads the QR for an asset's evidence page once (saakshi/qr/<assetId>). */
export async function ensureQr(media: MediaProvider, assetId: string, appUrl: string): Promise<string> {
  const publicId = qrPublicId(assetId);
  if (!(await media.exists(publicId))) {
    const png = await QRCode.toBuffer(`${appUrl}${evidencePath(assetId)}`, { type: "png", margin: 1, width: 360, errorCorrectionLevel: "M" });
    await media.upload({ file: png, folder: "saakshi/qr", publicId, tags: ["saakshi", "qr"] });
  }
  return publicId;
}

export function locationOf(a: Pick<Asset, "source" | "capture" | "exifLat" | "exifLng">) {
  const fix = a.source === "witness" ? a.capture?.deviceFix : null;
  if (fix) return { lat: fix.lat, lng: fix.lng, from: "Witness Capture device fix" };
  if (a.exifLat !== null && a.exifLng !== null) return { lat: a.exifLat, lng: a.exifLng, from: "photo GPS" };
  return null;
}

export interface EditEntry {
  title: string;
  who: string;
  when: string | null;
  note: string | null;
  steps: DescribedStep[];
}

export async function evidenceView(db: DB, media: MediaProvider, assetId: string, { appUrl }: { appUrl: string }) {
  const [a] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!a) return null;
  const [[project], [spot]] = await Promise.all([
    a.projectId ? db.select().from(projects).where(eq(projects.id, a.projectId)).limit(1) : Promise.resolve([]),
    a.spotId ? db.select().from(spots).where(eq(spots.id, a.spotId)).limit(1) : Promise.resolve([]),
  ]);

  await ensureQr(media, a.id, appUrl);
  const date = shortDate(a.capturedAt ?? a.uploadedAt);
  const proof = proofStripTransform({ assetId: a.id, place: a.placeName, date, band: a.trustBand });
  const loc = locationOf(a);

  const [dups, comps, ms, chain, audit] = await Promise.all([
    db
      .select({ id: duplicates.matchAssetId, hamming: duplicates.hamming, exact: duplicates.exact, sameProject: duplicates.sameProject, isLater: duplicates.matchIsLater, capturedAt: assets.capturedAt, projectName: projects.name })
      .from(duplicates)
      .innerJoin(assets, eq(assets.id, duplicates.matchAssetId))
      .leftJoin(projects, eq(projects.id, assets.projectId))
      .where(eq(duplicates.assetId, a.id))
      .orderBy(asc(duplicates.hamming)),
    db.select().from(comparisons).where(or(eq(comparisons.beforeAssetId, a.id), eq(comparisons.afterAssetId, a.id))),
    db.select().from(measurements).where(eq(measurements.assetId, a.id)),
    verifyChain(db, a.id),
    db.select({ seq: auditLog.seq, at: auditLog.at, actor: auditLog.actor, action: auditLog.action, hash: auditLog.hash, detail: auditLog.detail }).from(auditLog).where(eq(auditLog.assetId, a.id)).orderBy(asc(auditLog.seq)),
  ]);

  // Every edit: what was stored on the photo, then every derivative Saakshi delivers of it.
  const edits: EditEntry[] = a.transforms.map((e) => ({ title: "Edit recorded on this photo", who: e.actor, when: e.at, note: e.note ?? null, steps: describeTransform(e.steps) }));
  const derived = (title: string, steps: Transform, note: string | null = null): EditEntry => ({ title, who: "Saakshi (delivery)", when: null, note, steps: describeTransform(steps) });
  edits.push(derived("This page's image, with the proof strip", proof));
  edits.push(derived("Library and review preview", PREVIEW));
  const primary = ms.find((m) => m.metric === "litter_cover" || m.metric === "green_cover");
  if (primary) {
    edits.push(derived("Measured frame (what the before/after slider shows)", VIEW));
    const prompts = primary.metric === "green_cover" ? GREEN_PROMPTS : LITTER_PROMPTS;
    edits.push(derived(`Segmentation mask for ${METRIC_LABEL[primary.metric]}`, maskTransform(prompts, { multiple: true, frame: FRAME }), `${primary.value}% of the frame.`));
  }
  for (const c of comps.filter((c) => c.compositeTransforms && (c.metric === "litter_cover" || c.metric === "green_cover"))) {
    edits.push(derived("Before/after side-by-side", c.compositeTransforms as Transform, c.beforeAssetId === a.id ? "This photo is the “before”." : "This photo is the “after”."));
  }

  const toSpot = spot && loc ? Math.round(haversine(loc, { lat: spot.lat, lng: spot.lng })) : null;
  const toSite = project?.centerLat != null && project.centerLng != null && loc ? Math.round(haversine(loc, { lat: project.centerLat, lng: project.centerLng })) : null;

  return {
    id: a.id,
    caption: a.caption,
    source: a.source,
    testCase: a.testCase,
    status: a.status,
    imageUrl: media.url(a.cldPublicId, proof, { signed: true }),
    pageUrl: `${appUrl}${evidencePath(a.id)}`,
    trust: {
      score: a.trustScore,
      band: a.trustBand,
      scoredAt: a.scoredAt?.toISOString() ?? null,
      reasons: (a.trustReasons ?? []).map((r) => ({ ...r, sentence: describeReason(r) })),
    },
    review: a.review,
    facts: {
      capturedAt: a.capturedAt?.toISOString() ?? null,
      tzNote: a.capturedAtTzAssumed ? "The source gave no time zone; +05:30 (IST) was assumed." : a.source === "witness" ? "Device time, checked against the server's clock." : null,
      uploadedAt: a.uploadedAt.toISOString(),
      device: a.source === "witness" ? `Witness Capture${a.capture?.deviceFix?.accuracyM ? `, location ±${Math.round(a.capture.deviceFix.accuracyM)} m` : ""}` : [a.cameraMake, a.cameraModel].filter(Boolean).join(" ") || null,
      location: loc,
      place: a.placeName,
      distanceToSpotM: toSpot,
      distanceToSiteM: toSite,
      metadataSource: a.exifSource === "commons_api" ? "Wikimedia Commons API (the file itself carries none)" : a.exifSource === "file" ? "the photo's own EXIF" : "none",
      pHash: a.phash,
      etag: a.etag,
    },
    attestation: a.capture
      ? {
          attested: a.capture.attested,
          clientCapturedAt: a.capture.clientCapturedAt,
          ticketIssuedAt: a.capture.ticketIssuedAt,
          serverReceivedAt: a.capture.serverReceivedAt,
          reasons: a.capture.reasons,
        }
      : null,
    project: project ? { id: project.id, name: project.name, slug: project.slug } : null,
    spot: spot ? { name: spot.name, slug: spot.slug, radiusM: spot.radiusM } : null,
    duplicates: dups.map((d) => ({ ...d, capturedAt: d.capturedAt?.toISOString() ?? null, similarityPct: similarityPct(d.hamming), href: evidencePath(d.id) })),
    comparisons: comps.map((c) => ({
      id: c.id,
      metric: METRIC_LABEL[c.metric as keyof typeof METRIC_LABEL] ?? c.metric,
      role: c.beforeAssetId === a.id ? ("before" as const) : ("after" as const),
      other: c.beforeAssetId === a.id ? c.afterAssetId : c.beforeAssetId,
      before: c.beforeValue,
      after: c.afterValue,
      delta: c.delta,
      method: c.method,
      unit: c.metric === "items_visible" ? "items" : "%",
      caveat: c.detail?.caveat ?? null,
    })),
    edits,
    history: { intact: chain.intact, entries: chain.entries, firstBrokenAt: chain.firstBrokenAt },
    audit: audit.map((r) => ({ ...r, at: r.at.toISOString(), hash: r.hash.slice(0, 16) })),
    attribution: a.attribution,
    previewUrl: media.url(a.cldPublicId, PREVIEW, { signed: true }),
  };
}

export type EvidenceView = NonNullable<Awaited<ReturnType<typeof evidenceView>>>;
