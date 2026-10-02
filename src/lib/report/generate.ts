/**
 * Impact Report generation: claims (SQL) → prose (writeWithPlaceholders, validated) → sections
 * → PDF (A4) uploaded as a raw authenticated file → campaign kit → audit row. Rendering fills
 * the placeholders from the claims; nothing a model wrote can add a number.
 */
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { appendAudit } from "../audit";
import { methodLabel, renderClaims, type Claim } from "../claims";
import type { DB } from "../db/client";
import { assets, comparisons, measurements, reports, spots, type Asset, type CampaignKit, type Report } from "../db/schema";
import { THUMB } from "../library";
import { captureDate, shortDate } from "../media/composite";
import type { Transform } from "../media/transform";
import { FRAME_KEY, METRIC_LABEL, METRICS, measureKind, unitOf } from "../measure/measure";
import type { AIProvider } from "../providers/ai";
import type { MediaProvider } from "../providers/media";
import { describeReason } from "../trust";
import { displayPolicy } from "../display-policy";
import { assetMode, combineModes, hidesMock, showClaim, showEstimate, showNumber, type DisplayPolicy } from "../provenance";
import { ensureQr } from "../evidence";
import { buildClaims } from "./claims";
import { renderReportPdf } from "./pdf";
import { buildReportSections, type ReportData } from "./sections";

export interface ReportDeps {
  db: DB;
  media: MediaProvider;
  ai: AIProvider;
  /** Absolute origin for links and QR codes. */
  appUrl: string;
  /** Default: from config (production hides mock-derived numbers). */
  policy?: DisplayPolicy;
}

export const reportPath = (id: string) => `/r/${id}`;
export const pdfPublicIdOf = (id: string) => `saakshi/reports/${id}.pdf`;

/** The same Transform, delivered as a JPEG (for embedding in the PDF). */
export const asJpg = (t: Transform): Transform => [...t.filter((s) => !("format" in s || "quality" in s)), { format: "jpg", quality: 80 }];

const STAT_ORDER = ["litter_cover_change", "green_cover_change", "photos_verified"];

export async function generateReport(deps: ReportDeps, projectId: string, opts: { from?: string | null; to?: string | null; now?: Date; actor?: string } = {}) {
  const now = opts.now ?? new Date();
  const { db, media, ai, appUrl } = deps;
  const policy = deps.policy ?? displayPolicy();
  const c = await buildClaims(db, projectId, { from: opts.from, to: opts.to, now });
  const { project, claims, notes, photos, period } = c;
  const refs = claims.map((x) => ({ id: x.id, label: x.label }));
  const prose = await ai.writeWithPlaceholders(
    `Write a short impact summary (three or four sentences, plain English, for donors and volunteers) of the project "${project.name}". ` +
      "Refer to numbers only through the given claims. Say which numbers are AI estimates. Do not add any other numbers.",
    refs,
  );

  const id = randomUUID();
  const reportUrl = `${appUrl}${reportPath(id)}`;
  const title = `${project.name}: impact report`;
  const providerMode = combineModes(claims.map((x) => x.provider_mode));
  await db.insert(reports).values({ id, projectId, kind: "impact", title, periodFrom: period.from, periodTo: period.to, claims, prose, notes, providerMode });

  // --- Sections -------------------------------------------------------------------------------
  const byId = new Map(photos.map((p) => [p.id, p]));
  const kind = measureKind(project.type);
  const cs = (await db.select().from(comparisons).where(eq(comparisons.projectId, projectId))).filter((x) => byId.has(x.beforeAssetId));
  const pairAssetIds = [...new Set(cs.flatMap((x) => [x.beforeAssetId, x.afterAssetId]))];
  const pairAssets = new Map((pairAssetIds.length ? await db.select().from(assets).where(inArray(assets.id, pairAssetIds)) : []).map((a) => [a.id, a]));
  const spotRows = await db.select().from(spots).where(eq(spots.projectId, projectId));
  const spotName = (sid: string | null) => spotRows.find((s) => s.id === sid)?.name ?? null;
  const images = new Map<string, Buffer>();

  const pairs: ReportData["pairs"] = [];
  for (const primary of cs.filter((x) => kind && x.metric === METRICS[kind].primary && x.compositeTransforms)) {
    const before = pairAssets.get(primary.beforeAssetId)!;
    const after = pairAssets.get(primary.afterAssetId)!;
    const key = `pair:${primary.beforeAssetId}>${primary.afterAssetId}`;
    images.set(key, await media.fetchDerived(primary.detail?.compositePublicId ?? before.cldPublicId, asJpg(primary.compositeTransforms as Transform)));
    const rows = cs.filter((x) => x.beforeAssetId === primary.beforeAssetId && x.afterAssetId === primary.afterAssetId);
    pairs.push({
      key,
      spot: spotName(primary.spotId),
      before: { id: before.id, date: captureDate(before.capturedAt, before.capturedAtPrecision) },
      after: { id: after.id, date: captureDate(after.capturedAt, after.capturedAtPrecision) },
      image: key,
      metrics: rows.map((r) => {
        const unit = unitOf(r.metric as keyof typeof METRIC_LABEL);
        const f = (v: number | null) => (v === null ? "?" : unit === "%" ? `${v.toFixed(1)}%` : `${Math.round(v)}`);
        const method = r.method === "measured" ? "measured on photo pixels" : `AI estimate${r.confidence !== null ? `, confidence ${Math.round(r.confidence * 100)}%` : ""}`;
        const label = METRIC_LABEL[r.metric as keyof typeof METRIC_LABEL] ?? r.metric;
        // Same rule as claims: mock-derived values never ship; weak AI estimates aren't shown as numbers.
        const shown = r.method === "ai_estimated" ? showEstimate(r.delta ?? 0, r.confidence, r.providerMode, policy) : showNumber(r.delta, r.providerMode, policy);
        if (shown?.kind === "hidden") return { label, before: "", after: "", delta: shown.text, method, hidden: true };
        return {
          label: `${label}${shown?.kind === "value" && shown.mock ? " (mock output)" : ""}`,
          before: f(r.beforeValue),
          after: f(r.afterValue),
          delta: `${r.delta! > 0 ? "+" : ""}${unit === "%" ? `${r.delta} points` : r.delta}`,
          method,
          hidden: false,
        };
      }),
      lowConfidence: !!primary.detail?.agreement?.lowConfidence,
    });
  }

  let trend: ReportData["trend"] = null;
  const trendAllowed = !hidesMock(policy) || photos.every((p) => p.provenance && assetMode(p.provenance) === "real");
  if (!pairs.length && kind && trendAllowed) {
    const metric = METRICS[kind].primary;
    const ms = photos.length ? await db.select().from(measurements).where(inArray(measurements.assetId, photos.map((p) => p.id))) : [];
    const best = spotRows
      .map((s) => ({ s, pts: ms.filter((m) => m.metric === metric && m.frame === FRAME_KEY && byId.get(m.assetId)?.spotId === s.id && byId.get(m.assetId)?.capturedAt) }))
      .sort((a, b) => b.pts.length - a.pts.length)[0];
    if (best?.pts.length) {
      trend = {
        spot: best.s.name,
        metric: METRIC_LABEL[metric],
        unit: unitOf(metric),
        points: best.pts.map((m) => ({ t: byId.get(m.assetId)!.capturedAt!.getTime(), value: m.value })).sort((a, b) => a.t - b.t),
      };
    }
  }

  const verifiedIds = new Set(claims.find((x) => x.id === "photos_verified")?.asset_ids ?? []);
  const gallery: ReportData["gallery"] = [];
  const galleryAssets = photos
    .filter((p) => verifiedIds.has(p.id))
    .sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0) || (a.capturedAt?.getTime() ?? 0) - (b.capturedAt?.getTime() ?? 0))
    .slice(0, 12);
  for (const a of galleryAssets) {
    const key = `thumb:${a.id}`;
    images.set(key, await media.fetchDerived(a.cldPublicId, asJpg(THUMB)));
    gallery.push({ id: a.id, image: key, band: a.trustBand ?? "", caption: a.caption, date: captureDate(a.capturedAt, a.capturedAtPrecision) });
  }

  const excluded: ReportData["excluded"] = photos
    .filter((p) => p.status === "rejected" || (p.trustBand !== "VERIFIED" && p.status !== "approved"))
    .map((p) => {
      const flags = (p.trustReasons ?? []).filter((r) => r.kind === "hard" || r.kind === "review");
      return {
        id: p.id,
        band: p.trustBand,
        status: p.status,
        testCase: p.testCase,
        reasons: flags.length ? flags.map((r) => describeReason(r)) : [`Trust score ${p.trustScore ?? "?"} of 100, below the verified threshold.`],
        date: p.capturedAt ? captureDate(p.capturedAt, p.capturedAtPrecision) : shortDate(p.uploadedAt),
      };
    });

  const creditAssets = new Map<string, Asset>([...photos, ...pairAssets.values()].filter((a) => a.attribution).map((a) => [a.id, a]));
  const credits: ReportData["credits"] = [...creditAssets.values()]
    .sort((a, b) => (a.attribution?.title ?? "").localeCompare(b.attribution?.title ?? ""))
    .map((a) => ({ id: a.id, title: a.attribution!.title, author: a.attribution!.author, license: a.attribution!.license, url: a.attribution!.source_url, testCase: a.testCase }));

  const data: ReportData = {
    reportId: id,
    reportUrl,
    appUrl,
    generatedAt: now.toISOString(),
    policy,
    project: { name: project.name, type: project.type, description: project.description, place: photos.find((p) => p.placeName)?.placeName ?? null, locationApproximate: project.locationApproximate },
    period,
    claims,
    prose: renderClaims(prose, claims, { format: (c) => showClaim(c, policy).text }),
    notes,
    pairs,
    trend,
    gallery,
    excluded,
    credits,
  };
  const sections = buildReportSections(data);
  const pdf = await renderReportPdf(sections, images);
  const pdfPublicId = pdfPublicIdOf(id);
  await media.uploadRaw({ publicId: pdfPublicId, bytes: pdf, contentType: "application/pdf" });

  // --- Campaign kit ---------------------------------------------------------------------------
  const stat = STAT_ORDER.map((k) => claims.find((x) => x.id === k)).find((x): x is Claim => !!x) ?? null;
  const verified = claims.find((x) => x.id === "photos_verified");
  const captionRefs = [stat, verified].filter((x, i, xs): x is Claim => !!x && xs.indexOf(x) === i).map((x) => ({ id: x.id, label: x.label }));
  const caption = await ai.writeWithPlaceholders(
    `Write an Instagram caption in English (two short sentences, warm, no hashtags) about "${project.name}", using only the given claims for numbers.`,
    captionRefs,
  );
  const pair = pairs[0] ? { beforeAssetId: pairs[0].before.id, afterAssetId: pairs[0].after.id } : null;
  const photo = galleryAssets[0] ?? null;
  if (photo) await ensureQr(media, photo.id, appUrl); // the proof template layers it
  const campaign: CampaignKit = {
    caption,
    statClaimId: stat?.id ?? null,
    pair,
    photoAssetId: photo?.id ?? null,
    alts: {
      stat: stat ? `${stat.label}: ${showClaim(stat, policy).text} (${methodLabel(stat)}), ${project.name}.` : `${project.name}.`,
      split: pairs[0]
        ? `Before (${pairs[0].before.date}) and after (${pairs[0].after.date}) at ${pairs[0].spot ?? "the spot"}: ${pairs[0].metrics.map((m) => (m.hidden ? `${m.label.toLowerCase()}: ${m.delta.toLowerCase()}` : `${m.label.toLowerCase()} ${m.before} to ${m.after}, ${m.method}`)).join("; ")}.`
        : "No before/after pair meets the rules for this project yet.",
      proof: photo ? `Verified photo from ${photo.placeName ?? project.name}, ${captureDate(photo.capturedAt, photo.capturedAtPrecision)}, with a Saakshi proof strip and QR code.` : "No verified photo yet.",
    },
  };
  const [report] = await db.update(reports).set({ pdfPublicId, campaign }).where(eq(reports.id, id)).returning();
  await appendAudit(db, {
    assetId: null,
    actor: opts.actor ?? "report",
    action: "report.generated",
    detail: { reportId: id, projectId, period: `${period.from}..${period.to}`, claims: Object.fromEntries(claims.map((x) => [x.id, x.value])), pdfPublicId },
  });
  return { report: report as Report, pdfUrl: media.rawUrl(pdfPublicId), sections, pdfBytes: pdf.length };
}
