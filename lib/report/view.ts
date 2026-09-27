/**
 * Read model for the public report page (/r/[reportId]) and the campaign-kit downloads.
 * Numbers are rendered from the stored claims; the prose and caption keep their placeholders
 * until here.
 */
import { eq, inArray } from "drizzle-orm";
import { claimParts, formatClaimValue, methodLabel, renderClaims, type Claim } from "../claims";
import type { DB } from "../db/client";
import { assets, projects, reports, type Asset, type Report } from "../db/schema";
import { THUMB } from "../library";
import { shortDate } from "../media/composite";
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
export async function campaignTemplate(db: DB, report: Report, template: TemplateId, download = false): Promise<{ publicId: string; transform: Transform; filename: string } | null> {
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
    return { publicId: photo.cldPublicId, transform: statCardTransform({ value: formatClaimValue(claim), label: claim.label, method: methodLabel(claim) }, download), filename };
  }
  if (template === "split") {
    const before = get(kit.pair?.beforeAssetId);
    const after = get(kit.pair?.afterAssetId);
    if (!before || !after) return null;
    const change = claims.find((c) => c.id === "litter_cover_change" || c.id === "green_cover_change");
    const headline = change ? `${change.label}: ${formatClaimValue(change)}` : "Before and after, verified";
    return {
      publicId: before.cldPublicId,
      transform: splitTransform({ afterPublicId: after.cldPublicId, beforeLabel: `Before · ${shortDate(before.capturedAt)}`, afterLabel: `After · ${shortDate(after.capturedAt)}`, headline }, download),
      filename,
    };
  }
  const photo = get(kit.photoAssetId);
  if (!photo) return null;
  return { publicId: photo.cldPublicId, transform: proofTemplateTransform({ assetId: photo.id, place: photo.placeName, date: shortDate(photo.capturedAt), band: photo.trustBand }, download), filename };
}

export async function reportView(db: DB, media: MediaProvider, id: string) {
  const report = await loadReport(db, id);
  if (!report) return null;
  const [project] = await db.select({ id: projects.id, name: projects.name, slug: projects.slug, type: projects.type }).from(projects).where(eq(projects.id, report.projectId));
  const claims = report.claims as Claim[];
  const ids = [...new Set(claims.flatMap((c) => c.asset_ids))];
  const rows = ids.length ? await db.select().from(assets).where(inArray(assets.id, ids)) : [];
  const byId = new Map<string, Asset>(rows.map((a) => [a.id, a]));
  const templates = [];
  for (const t of TEMPLATES) {
    const tpl = await campaignTemplate(db, report, t);
    if (tpl) templates.push({ id: t, previewUrl: media.url(tpl.publicId, tpl.transform, { signed: true }), downloadPath: `/api/campaign/${report.id}/${t}`, alt: report.campaign?.alts[t] ?? "", ...IG });
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
    prose: report.prose ? claimParts(report.prose, claims) : [],
    claims: claims.map((c) => ({
      ...c,
      formatted: formatClaimValue(c),
      methodText: methodLabel(c),
      evidence: c.asset_ids
        .map((aid) => byId.get(aid))
        .filter((a): a is Asset => !!a)
        .slice(0, 12)
        .map((a) => ({ id: a.id, thumbUrl: media.url(a.cldPublicId, THUMB, { signed: true }), band: a.trustBand, date: shortDate(a.capturedAt), testCase: a.testCase })),
      more: Math.max(0, c.asset_ids.length - 12),
    })),
    campaign: report.campaign ? { caption: renderClaims(report.campaign.caption, claims), templates } : null,
  };
}

export type ReportView = NonNullable<Awaited<ReturnType<typeof reportView>>>;
