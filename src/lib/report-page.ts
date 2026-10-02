import "server-only";
/**
 * The report page's model (ReportPageData): the report's claims as number cards (SQL only,
 * lib/report/claims.ts), every photo behind them as a tile keyed by the claims it supports (the
 * threads), the flagged photos with the rule that caught them, and the Method text from our
 * config. Below the design: the summary prose ({{claim:id}} filled from the same claims) and the
 * campaign kit.
 */
import { eq, inArray } from "drizzle-orm";
import type { ReportPageData } from "@/components/report/report-page";
import { claimParts, type Claim } from "./claims";
import type { DB } from "./db/client";
import { assets, projects, type Asset } from "./db/schema";
import { decisiveReason, flagTitle, placeShort } from "./landing/copy";
import { THUMB } from "./library";
import { captureDate } from "./media/composite";
import { MASK_THRESHOLD } from "./measure/cover";
import { EVENT_WORD } from "./measure/timeline";
import { mockLabel, showClaim, type DisplayPolicy } from "./provenance";
import type { MediaProvider } from "./providers/media";
import { methodLines, numberCards, periodLabel } from "./report/numbers";
import { loadReport, reportView } from "./report/view";

export async function reportPageData(db: DB, media: MediaProvider, id: string, policy: DisplayPolicy): Promise<ReportPageData | null> {
  const v = await reportView(db, media, id, policy);
  const report = await loadReport(db, id);
  if (!v || !report) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, report.projectId));
  const claims = report.claims as Claim[];
  const cards = numberCards(claims, (c) => showClaim(c, policy), EVENT_WORD[project?.type ?? "other"] ?? "event", mockLabel(policy));
  const shownIds = new Set(cards.map((c) => c.key));
  const keysOf = new Map<string, string[]>();
  for (const c of claims) if (shownIds.has(c.id)) for (const a of c.asset_ids) keysOf.set(a, [...(keysOf.get(a) ?? []), c.id]);
  const rows: Asset[] = keysOf.size ? await db.select().from(assets).where(inArray(assets.id, [...keysOf.keys()])) : [];
  const t = (a: Asset) => a.capturedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  rows.sort((a, b) => t(a) - t(b) || a.id.localeCompare(b.id));
  const thumb = (a: Asset) => media.url(a.cldPublicId, THUMB, { signed: true });
  const where = (a: Asset) => placeShort(a.placeName) ?? project?.name ?? "Photo";
  const flagged = claims.find((c) => c.id === "photos_flagged");
  const flaggedRows = rows.filter((a) => flagged?.asset_ids.includes(a.id));
  const metric = claims.some((c) => c.id === "green_cover_change") && !claims.some((c) => c.id === "litter_cover_change") ? "green" : "litter";
  return {
    kicker: [project?.source === "demo_archive" ? "Demo archive report" : "Impact report", ...(v.report.period.from || v.report.period.to ? [periodLabel((v.report.period.from ?? v.report.period.to)!, (v.report.period.to ?? v.report.period.from)!)] : [])].join(", "),
    title: project?.name ?? v.report.title,
    intro: "Every number below is linked to the photos behind it. Hover, tap or tab to a number and its threads draw to its photos.",
    numbers: cards.map((c) => ({ ...c, basis: claims.find((x) => x.id === c.key)?.detail?.basis ?? null })),
    tiles: rows.map((a) => ({ key: a.id, keys: keysOf.get(a.id)!, src: thumb(a), alt: a.trustBand === "FLAGGED" ? "Flagged photo" : `${where(a)}, ${captureDate(a.capturedAt, a.capturedAtPrecision)}. Faces blurred.`, href: `/e/${a.id}` })),
    flags: flaggedRows.map((a) => {
      const r = decisiveReason(a.trustReasons ?? []);
      return { key: a.id, src: thumb(a), reason: r ? flagTitle(r) : "Flagged by the fixed rules", href: `/e/${a.id}` };
    }),
    method: methodLines({ metric, threshold: Math.round((MASK_THRESHOLD / 255) * 100) / 100, archive: project?.source === "demo_archive", planted: flagged?.detail?.testInputs?.length ?? 0 }),
    pdfHref: v.report.pdfPath,
    homeHref: "/",
    banner: v.mockShown ? "Generated with mock providers. These numbers are for development only; in production they are not shown until real providers have re-measured the photos." : null,
    summary: v.prose.length
      ? {
          parts: claimParts(report.prose!, claims, "en-IN", (c) => showClaim(c, policy).text).map((p) => (typeof p === "string" ? p : { text: p.formatted, claim: p.claim.id, title: p.claim.label })),
          notes: v.report.notes,
        }
      : null,
    campaign: v.campaign ? { caption: v.campaign.caption, templates: v.campaign.templates.map((x) => ({ id: x.id, src: x.previewUrl, alt: x.alt, width: x.width, height: x.height, href: x.downloadPath, label: x.id === "stat" ? "stat card" : x.id === "split" ? "before/after" : "verified photo" })) } : null,
  };
}
