/**
 * Read model for the public report page (/r/[reportId]) and the campaign-kit downloads.
 * Numbers are rendered from the stored claims; the prose and caption keep their placeholders
 * until here.
 */
import { eq, inArray } from "drizzle-orm";
import { claimParts, methodLabel, renderClaims, type Claim } from "../claims";
import { displayPolicy } from "../display-policy";
import { hidesMock, mockLabel, showClaim, type DisplayPolicy } from "../provenance";
import type { DB } from "../db/client";
import { assets, projects, reports, type Asset, type Report } from "../db/schema";
import { THUMB } from "../library";
import { captureDate } from "../media/composite";
import type { Transform } from "../media/transform";
import type { MediaProvider } from "../providers/media";
import { IG, proofTemplateTransform, splitTransform, statCardTransform, TEMPLATES, type TemplateId } from "./campaign";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadReport(db: DB, id: string): Promise<Report | null> {
  if (!UUID.test(id)) return null;
  const [r] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return r ?? null;
}

/** The base photo and Transform of one campaign template, or null if the report has no data for it. */
export async function campaignTemplate(
  db: DB,
  report: Report,
  template: TemplateId,
  download = false,
  policy: DisplayPolicy = displayPolicy(),
): Promise<{ publicId: string; transform: Transform; filename: string; mock: boolean } | null> {
  const kit = report.campaign;
  if (!kit) return null;
  const ids = [kit.photoAssetId, kit.pair?.beforeAssetId, kit.pair?.afterAssetId].filter((x): x is string => !!x);
  const rows = ids.length ? await db.select().from(assets).where(inArray(assets.id, ids)) : [];
  const get = (id: string | null | undefined) => rows.find((a) => a.id === id) ?? null;
  const claims = report.claims as Claim[];
  const filename = `saakshi-${template}-${report.id.slice(0, 8)}.png`;
  if (template === "stat") {
    const photo = get(kit.photoAssetId);
    const claim = claims.find((c) => c.id === kit.statClaimId);
    if (!photo || !claim) return null;
    // A stat card is a number: no card when the policy hides it (mock in production, low confidence).
    const shown = showClaim(claim, policy);
    if (shown.kind === "hidden") return null;
    return { publicId: photo.cldPublicId, transform: withMockTag(statCardTransform({ value: shown.text, label: claim.label, method: methodLabel(claim) }, download), shown.mock, mockLabel(policy)), filename, mock: shown.mock };
  }
  if (template === "split") {
    const before = get(kit.pair?.beforeAssetId);
    const after = get(kit.pair?.afterAssetId);
    if (!before || !after) return null;
    const change = claims.find((c) => c.id === "litter_cover_change" || c.id === "green_cover_change");
    const shown = change ? showClaim(change, policy) : null;
    const headline = change && shown?.kind === "value" ? `${change.label}: ${shown.text}` : "Before and after, verified";
    const mock = shown?.kind === "value" && shown.mock;
    return {
      publicId: before.cldPublicId,
      transform: withMockTag(splitTransform({ afterPublicId: after.cldPublicId, beforeLabel: `Before · ${captureDate(before.capturedAt, before.capturedAtPrecision)}`, afterLabel: `After · ${captureDate(after.capturedAt, after.capturedAtPrecision)}`, headline }, download), mock, mockLabel(policy)),
      filename,
      mock,
    };
  }
  const photo = get(kit.photoAssetId);
  if (!photo) return null;
  return { publicId: photo.cldPublicId, transform: proofTemplateTransform({ assetId: photo.id, place: photo.placeName, date: captureDate(photo.capturedAt, photo.capturedAtPrecision), band: photo.trustBand }, download), filename, mock: false };
}

/** A visible badge burned into a template that shows a mock-derived number ("Mock output" in development, "Prototype measurement" in the preview). */
function withMockTag(t: Transform, mock: boolean, label = "Mock output"): Transform {
  if (!mock) return t;
  return [...t.slice(0, -1), { overlay: { text: label, font: "Arial", size: 36, weight: "bold", color: "#FFFFFF", background: "#B45309" }, gravity: "north_east", x: 30, y: 30 }, ...t.slice(-1)];
}

export async function reportView(db: DB, media: MediaProvider, id: string, policy: DisplayPolicy = displayPolicy()) {
  const report = await loadReport(db, id);
  if (!report) return null;
  const [project] = await db.select({ id: projects.id, name: projects.name, slug: projects.slug, type: projects.type }).from(projects).where(eq(projects.id, report.projectId));
  const claims = report.claims as Claim[];
  const ids = [...new Set(claims.flatMap((c) => c.asset_ids))];
  const rows = ids.length ? await db.select().from(assets).where(inArray(assets.id, ids)) : [];
  const byId = new Map<string, Asset>(rows.map((a) => [a.id, a]));
  const templates = [];
  for (const t of TEMPLATES) {
    const tpl = await campaignTemplate(db, report, t, false, policy);
    if (tpl) templates.push({ id: t, previewUrl: media.url(tpl.publicId, tpl.transform, { signed: true }), downloadPath: `/api/campaign/${report.id}/${t}`, alt: report.campaign?.alts[t] ?? "", mock: tpl.mock, ...IG });
  }
  return {
    report: {
      id: report.id,
      title: report.title ?? "Impact report",
      period: { from: report.periodFrom, to: report.periodTo },
      generatedAt: report.createdAt.toISOString(),
      notes: report.notes,
      pdfPath: report.pdfPublicId ? `/api/reports/${report.id}/pdf` : null,
    },
    project: project ?? null,
    prose: report.prose ? claimParts(report.prose, claims, "en-IN", (c) => showClaim(c, policy).text) : [],
    providerMode: report.providerMode,
    mockShown: !hidesMock(policy) && claims.some((c) => (c.provider_mode ?? "mock") === "mock"),
    claims: claims.map((c) => ({
      ...c,
      ...(({ shown }) => ({ formatted: shown.text, hidden: shown.kind === "hidden", mock: shown.kind === "value" && shown.mock }))({ shown: showClaim(c, policy) }),
      methodText: methodLabel(c),
      evidence: c.asset_ids
        .map((aid) => byId.get(aid))
        .filter((a): a is Asset => !!a)
        .slice(0, 12)
        .map((a) => ({ id: a.id, thumbUrl: media.url(a.cldPublicId, THUMB, { signed: true }), band: a.trustBand, date: captureDate(a.capturedAt, a.capturedAtPrecision), testCase: a.testCase })),
      more: Math.max(0, c.asset_ids.length - 12),
    })),
    campaign: report.campaign ? { caption: renderClaims(report.campaign.caption, claims, { format: (c) => showClaim(c, policy).text }), templates } : null,
  };
}

export type ReportView = NonNullable<Awaited<ReturnType<typeof reportView>>>;
