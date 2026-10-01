import "server-only";
/**
 * The app's data from the database (AppData; the parity fixture builds the same from the
 * prototype's archive, lib/app/fixture.ts). Photos are scored assets with their real ledger,
 * fingerprint, nearest match, audit history and layer inputs; projects are ours, placed on the
 * B5.10 dot field; the overview's numbers are SQL counts and the project's best measured pair;
 * Studio shows the latest report's claims and the campaign kit (B5.4). Mock-derived numbers follow
 * the display policy: tagged in development, hidden in production.
 */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { AppData, AppPhoto, AppProject, Kpi, ProjectScreen, StudioScreen, Tone } from "@/components/app/types";
import landDots from "../../data/land-dots.json";
import { fullDateTime, offsetMinutes } from "../charts/time-axis";
import type { Claim } from "../claims";
import { getConfig } from "../config";
import type { DB } from "../db/client";
import { assets, auditLog, comparisons, duplicates, measurements, projects, reports, spots, type Asset } from "../db/schema";
import { heroProject } from "../demo/hero";
import { hexToBits } from "../glyph";
import { hamming } from "../hamming";
import { decisiveReason, flagTitle, placeShort, splitProjectName } from "../landing/copy";
import { PREVIEW, THUMB, VIEW } from "../media/derivatives";
import { MASK_THRESHOLD } from "../measure/cover";
import { CAVEAT } from "../measure/measure";
import { spotView } from "../measure/views";
import { assetMode, showClaim, showNumber, type DisplayPolicy } from "../provenance";
import type { MediaProvider } from "../providers/media";
import { methodLines, numberCards, periodLabel } from "../report/numbers";
import { reportView } from "../report/view";
import { rankPairs } from "../showcase";
import { defaultTrustConfig, describeReason } from "../trust";
import { ledgerRows } from "../trust/labels";
import { auditLabel } from "../audit-labels";
import { areaFor, cardSides } from "./map";

const BAND = { VERIFIED: "Verified", NEEDS_REVIEW: "Needs review", FLAGGED: "Flagged" } as const;
const coord = (v: number, dir: [string, string]) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? dir[0] : dir[1]}`;
const pct = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;

export async function appView(db: DB, media: MediaProvider, o: { policy: DisplayPolicy; project?: string | null }): Promise<AppData> {
  const off = offsetMinutes(getConfig().env.EXIF_DEFAULT_UTC_OFFSET);
  const when = (d: Date | null) => (d ? fullDateTime(d.getTime(), "second", off, { seconds: true }) : null);
  const rows = (await db.select().from(assets).where(isNotNull(assets.trustBand)).orderBy(desc(assets.uploadedAt), assets.id).limit(500)) as Asset[];
  const ps = await db.select().from(projects).orderBy(asc(projects.name));
  const ss = await db.select().from(spots);
  const keyOf = new Map(ps.map((p) => [p.id, p.slug ?? p.id]));
  const ids = rows.map((r) => r.id);
  const [audits, dups, masks] = ids.length
    ? await Promise.all([
        db.select({ assetId: auditLog.assetId, action: auditLog.action, at: auditLog.at, detail: auditLog.detail }).from(auditLog).where(inArray(auditLog.assetId, ids)).orderBy(asc(auditLog.seq)),
        db
          .select({ assetId: duplicates.assetId, matchId: duplicates.matchAssetId, hamming: duplicates.hamming, isLater: duplicates.matchIsLater, publicId: assets.cldPublicId, phash: assets.phash, projectId: assets.projectId })
          .from(duplicates)
          .innerJoin(assets, eq(assets.id, duplicates.matchAssetId))
          .where(inArray(duplicates.assetId, ids))
          .orderBy(asc(duplicates.hamming)),
        db.select({ assetId: measurements.assetId, maskUrl: measurements.maskUrl, metric: measurements.metric }).from(measurements).where(and(inArray(measurements.assetId, ids), isNotNull(measurements.maskUrl))),
      ])
    : [[], [], []];
  const historyOf = new Map<string, AppPhoto["history"]>();
  for (const a of audits) if (a.assetId) historyOf.set(a.assetId, [...(historyOf.get(a.assetId) ?? []), { what: auditLabel(a.action, a.detail as Record<string, unknown> | null), when: fullDateTime(a.at.getTime(), "minute", off) }]);
  const dupOf = new Map<string, (typeof dups)[number]>();
  for (const d of dups) if (!dupOf.has(d.assetId)) dupOf.set(d.assetId, d);
  const maskOf = new Map<string, string>();
  for (const m of masks) if ((m.metric === "litter_cover" || m.metric === "green_cover") && m.maskUrl && !maskOf.has(m.assetId)) maskOf.set(m.assetId, m.maskUrl);
  const nameOf = new Map(ps.map((p) => [p.id, p.name]));

  const photos: AppPhoto[] = rows.map((a) => {
    const reasons = a.trustReasons ?? [];
    const band = BAND[a.trustBand!];
    const shown = showNumber(a.trustScore, assetMode(a.provenance), o.policy);
    const decisive = decisiveReason(reasons);
    const ledger = ledgerRows(reasons, describeReason);
    const fix = a.source === "witness" ? a.capture?.deviceFix : null;
    const lat = fix?.lat ?? a.exifLat;
    const lng = fix?.lng ?? a.exifLng;
    const gps = lat !== null && lng !== null && lat !== undefined && lng !== undefined;
    const allGood = ["location", "time", "uniqueness"].every((s) => ledger.find((r) => r.signal === s)?.tone === "good");
    const reason = decisive ? (decisive.kind === "hard" ? flagTitle(decisive) : describeReason(decisive)) : allGood ? "Location, time and fingerprint check out" : (ledger.find((r) => r.tone !== "good")?.note ?? "Checked by the fixed rules");
    const d = dupOf.get(a.id);
    const title = a.caption ?? a.attribution?.title?.replace(/\.(jpe?g|png)$/i, "") ?? placeShort(a.placeName) ?? "Photo";
    const taken = when(a.capturedAt);
    return {
      id: a.id,
      code: a.id.slice(0, 8),
      title,
      src: media.url(a.cldPublicId, THUMB, { signed: true }),
      preview: media.url(a.cldPublicId, PREVIEW, { signed: true }),
      band,
      score: shown?.kind === "value" ? a.trustScore : null,
      scoreHidden: shown?.kind === "hidden" ? shown.text : null,
      reason,
      project: a.projectId ? (keyOf.get(a.projectId) ?? null) : null,
      source: a.source,
      spot: a.spotId,
      year: a.capturedAt ? String(new Date(a.capturedAt.getTime() + off * 60_000).getUTCFullYear()) : "",
      gps,
      lat: gps ? lat! : null,
      lng: gps ? lng! : null,
      hash: a.phash ? hexToBits(a.phash) : null,
      date: taken,
      w: a.width,
      h: a.height,
      credit: a.attribution?.source_url ? { title: a.attribution.title ?? "Wikimedia Commons file", author: a.attribution.author?.trim() || "unknown", license: a.attribution.license || "licence unknown", page: a.attribution.source_url } : null,
      rows: ledger.map((r) => ({ label: r.label, note: r.note, pts: r.pts, max: r.max, tone: r.tone as Tone })),
      hard: reasons.filter((r) => r.kind === "hard").map((r) => flagTitle(r)),
      queue: (a.status === "flagged" && a.trustBand !== "VERIFIED") || (a.reviewRequestedAt !== null && a.status !== "approved" && a.status !== "rejected"),
      overlay: null,
      dup:
        d && d.hamming <= defaultTrustConfig.matchHamming && d.phash
          ? { src: media.url(d.publicId, PREVIEW, { signed: true }), caption: `${d.isLater ? "Later copy" : "Original"}, filed in ${d.projectId ? (nameOf.get(d.projectId) ?? "another project") : "no project"}`, hash: hexToBits(d.phash), text: `${d.hamming} of 64 cells differ. ${d.hamming === 0 ? "The same file." : "Same photo."}` }
          : null,
      nearest: null,
      planted: !!a.testCase,
      history: historyOf.get(a.id) ?? [],
      evidenceHref: `/e/${a.id}`,
      layer: a.phash ? { input: { bits: hexToBits(a.phash), lat: gps ? lat! : null, lng: gps ? lng! : null, when: taken ?? `Uploaded ${fullDateTime(a.uploadedAt.getTime(), "minute", off)}`, extra: a.cameraModel ? `camera ${[a.cameraMake, a.cameraModel].filter(Boolean).join(" ")}` : null, aiBoxes: [], aiTags: (a.ai?.visibleCounts ?? []).map((c) => c.label).slice(0, 8) }, mask: maskOf.get(a.id) ?? null } : null,
      facts: [
        { k: "Project", v: a.projectId ? (nameOf.get(a.projectId) ?? "Unknown") : "Not assigned" },
        { k: "Coordinates", v: gps ? `${coord(lat!, ["N", "S"])}, ${coord(lng!, ["E", "W"])}` : "Not recorded" },
        { k: "Location source", v: fix ? "Phone GPS at capture" : gps ? "Camera file" : "None" },
        { k: "Taken", v: taken ?? "Not recorded" },
        { k: "Fingerprint", v: a.phash ?? "Not fingerprinted yet" },
        { k: "Size", v: a.width && a.height ? `${a.width} × ${a.height}` : "Unknown" },
      ],
    };
  });
  // Nearest fingerprint among the loaded photos (the duplicates table keeps matches only).
  for (const p of photos) {
    const a = rows.find((r) => r.id === p.id)!;
    if (!a.phash) continue;
    let near: { n: number; q: AppPhoto; hash: string } | null = null;
    for (const q of rows) {
      if (q.id === a.id || !q.phash) continue;
      const n = hamming(a.phash, q.phash);
      if (!near || n < near.n) near = { n, q: photos.find((x) => x.id === q.id)!, hash: q.phash };
    }
    p.nearest = near ? { src: near.q.src, hash: hexToBits(near.hash), cells: near.n } : null;
  }

  // Projects: centre, else the mean of their spots; card sides by longitude (lib/app/map.ts).
  const placed = ps.flatMap((p) => {
    const sp = ss.filter((s) => s.projectId === p.id);
    const lat = p.centerLat ?? (sp.length ? sp.reduce((n, s) => n + s.lat, 0) / sp.length : null);
    const lng = p.centerLng ?? (sp.length ? sp.reduce((n, s) => n + s.lng, 0) / sp.length : null);
    if (lat === null || lng === null) return [];
    const { name, city } = splitProjectName(p.name);
    return [{ key: p.slug ?? p.id, id: p.id, name, city, lat, lng }];
  });
  const sides = cardSides(placed);
  const projectsOut: AppProject[] = placed.map((p) => ({ key: p.key, name: p.name, city: p.city, lat: p.lat, lng: p.lng, card: sides[p.key], href: `/projects/${p.key}`, aliases: [] }));

  const projectScreens: Record<string, ProjectScreen> = {};
  for (const p of placed) projectScreens[p.key] = await projectScreen(db, media, p, photos, o.policy);

  const hero = await heroProject(db);
  const studioKey = o.project ?? hero.project?.slug ?? hero.project?.id ?? placed[0]?.key ?? null;
  const studioProject = placed.find((p) => p.key === studioKey) ?? null;
  return {
    banner: "Demo workspace. Photos come from Wikimedia Commons.",
    photos,
    projects: projectsOut,
    area: areaFor(placed),
    land: landDots.dots as Array<[number, number]>,
    projectScreens,
    studio: studioProject ? await studioScreen(db, media, studioProject, photos, projectScreens[studioProject.key], o.policy) : null,
    captureHref: "/capture",
    importToast: `${photos.length} photos sorted into ${placed.length} projects by place and date`,
    areaCaption: "Demo area: coastline dots, no boundaries drawn",
    errorDetail: "",
    projectIds: Object.fromEntries(placed.map((p) => [p.key, p.id])),
    studioKey: studioProject?.key ?? null,
    studioPlace: studioProject?.name ?? "",
  };
}

async function projectScreen(db: DB, media: MediaProvider, p: { id: string; key: string; name: string; city: string }, photos: AppPhoto[], policy: DisplayPolicy): Promise<ProjectScreen> {
  const pp = photos.filter((x) => x.project === p.key);
  const sp = await db.select().from(spots).where(eq(spots.projectId, p.id)).orderBy(asc(spots.name));
  const cs = await db.select().from(comparisons).where(eq(comparisons.projectId, p.id));
  const best = rankPairs(cs, policy, { minAbsDelta: 0 })[0] ?? null;
  const pair = best ? await db.select().from(assets).where(inArray(assets.id, [best.beforeAssetId, best.afterAssetId])) : [];
  const before = pair.find((a) => a.id === best?.beforeAssetId);
  const after = pair.find((a) => a.id === best?.afterAssetId);
  const val = (v: number | null) => {
    if (!best || v === null) return { value: "no data", tag: null };
    const s = showNumber(v, best.providerMode ?? "mock", policy);
    return s?.kind === "hidden" ? { value: "–", tag: "Not shown: mock providers" } : { value: pct(v), tag: s?.mock ? "Mock output" : null };
  };
  const word = best?.metric === "green_cover" ? "green" : "litter";
  const bv = val(best?.beforeValue ?? null);
  const av = val(best?.afterValue ?? null);
  const checkins = pp.filter((x) => x.source === "witness").length;
  const kpis: Kpi[] = [
    { k: "verified", value: String(pp.filter((x) => x.band === "Verified").length), label: "photos verified", color: "var(--verified)", tag: null },
    { k: "flagged", value: String(pp.filter((x) => x.band === "Flagged").length), label: "photos flagged, with reasons", color: "var(--flagged)", tag: null },
    { k: "spots", value: String(sp.length), label: sp.length === 1 ? "spot monitored" : "spots monitored", color: "var(--foreground)", tag: null },
    { k: "before", value: bv.value, label: `${word} cover before, Measured`, color: "var(--measured)", tag: bv.tag },
    { k: "after", value: av.value, label: `${word} cover after, Measured`, color: "var(--measured)", tag: av.tag },
    { k: "checkins", value: String(checkins), label: checkins === 1 ? "check-in since the clean-up" : "check-ins since the clean-up", color: "var(--foreground)", tag: null },
  ];
  const spotIds = new Set(sp.map((s) => s.id));
  const tiles = pp.map((x) => ({
    id: x.id,
    src: x.src,
    keys: [x.band === "Verified" ? "verified" : x.band === "Flagged" ? "flagged" : "review", ...(x.spot && spotIds.has(x.spot) ? ["spots"] : []), ...(x.id === before?.id ? ["before"] : []), ...(x.id === after?.id ? ["after"] : []), ...(x.source === "witness" ? ["checkins"] : [])],
  }));
  const spotsRows: ProjectScreen["spots"] = [];
  for (const s of sp) {
    const v = await spotView(db, media, s.slug ?? s.id, policy);
    const trend = v?.trend ?? [];
    const lastCheckin = v?.checkins.find((t) => t !== null) ?? null;
    spotsRows.push({
      name: s.name,
      photos: v?.photos ?? 0,
      points: trend.map((t) => t.value),
      trendAria: trend.length >= 2 ? `From ${pct(trend[0].value)} to ${pct(trend.at(-1)!.value)}` : trend.length ? `${pct(trend[0].value)}, one photo` : "Nothing measured yet",
      last: lastCheckin ? fullDateTime(lastCheckin, "day", 330) : "No check-ins yet",
    });
  }
  return {
    kpis,
    tiles,
    before: before && best ? { src: media.url(before.cldPublicId, VIEW, { signed: true }), mask: best.maskBeforeUrl, maskMode: "luminance", label: `Before ${bv.value}` } : null,
    after: after && best ? { src: media.url(after.cldPublicId, VIEW, { signed: true }), label: `After ${av.value}` } : null,
    caveat: `Measured on photo pixels at threshold ${(Math.round((MASK_THRESHOLD / 255) * 100) / 100).toFixed(2)}. ${CAVEAT.replace("Measured on photo pixels. ", "")}`,
    flags: pp.filter((x) => x.band === "Flagged").map((x) => ({ id: x.id, src: x.src, reason: x.reason })),
    spots: spotsRows,
    trendLabel: `${word === "green" ? "Green" : "Litter"} cover trend`,
    samplesNote: null,
  };
}

async function studioScreen(db: DB, media: MediaProvider, p: { id: string; key: string; name: string; city: string }, photos: AppPhoto[], ps: ProjectScreen, policy: DisplayPolicy): Promise<StudioScreen> {
  const [latest] = await db.select().from(reports).where(eq(reports.projectId, p.id)).orderBy(desc(reports.createdAt)).limit(1);
  const pp = photos.filter((x) => x.project === p.key);
  const verified = pp.filter((x) => x.band === "Verified");
  const v = latest ? await reportView(db, media, latest.id, policy) : null;
  const claims = (latest?.claims ?? []) as Claim[];
  const cards = latest ? numberCards(claims, (c) => showClaim(c, policy)) : [];
  const KEY: Record<string, string> = { photos_verified: "v", photos_flagged: "f", litter_cover_change: "b", green_cover_change: "b", spots_monitored: "s" };
  const COLOR: Record<string, string> = { verified: "var(--l-verified)", flagged: "var(--l-destructive)", measured: "var(--l-measured)", estimated: "var(--l-estimated)", count: "var(--l-foreground)" };
  const asset = (id: string) => photos.find((x) => x.id === id);
  const tilesFor = (id: string, k: string) => (claims.find((c) => c.id === id)?.asset_ids ?? []).map(asset).filter((x): x is AppPhoto => !!x).map((x) => ({ src: x.src, k }));
  const tiles = latest ? [...tilesFor("photos_verified", "v").slice(0, 8), ...tilesFor("photos_flagged", "f").slice(0, 3), ...(tilesFor("litter_cover_change", "b").length ? tilesFor("litter_cover_change", "b") : tilesFor("green_cover_change", "b")).slice(0, 1)] : [];
  const verifiedClaim = claims.find((c) => c.id === "photos_verified");
  const shownVerified = verifiedClaim ? showClaim(verifiedClaim, policy) : null;
  const best = verified.find((x) => x.score !== null) ?? null;
  const templates = Object.fromEntries((v?.campaign?.templates ?? []).map((t) => [t.id, t.downloadPath])) as Partial<Record<"stat" | "split" | "photo", string>>;
  return {
    report: latest
      ? {
          kicker: `${latest.periodFrom && latest.periodTo ? `Report, ${periodLabel(latest.periodFrom, latest.periodTo)}` : "Report"}`,
          title: p.city ? `${p.name}, ${p.city}` : p.name,
          numbers: cards.slice(0, 4).map((c) => ({ key: KEY[c.key] ?? c.key, value: c.value, label: c.label, color: c.hidden ? "var(--l-muted-foreground)" : COLOR[c.kind], labelColor: c.tag ? "var(--l-review)" : null })),
          tiles,
          method: `Method: ${methodLines({ metric: claims.some((c) => c.id === "green_cover_change") ? "green" : "litter", threshold: Math.round((MASK_THRESHOLD / 255) * 100) / 100, archive: true, planted: 0 })[0]}`,
          href: `/r/${latest.id}`,
        }
      : null,
    posts: {
      stat: shownVerified?.kind === "value" && verifiedClaim ? { value: String(verifiedClaim.value), line: `photos verified at ${p.name}`, foot: "Every one checked for place, time and reuse. Tap the link to see them." } : null,
      split: ps.before && ps.after ? { before: ps.before, after: ps.after } : null,
      photo: best ? { src: best.preview, score: String(best.score), band: best.band, meta: [placeShort(p.city || p.name, 1), best.date?.split(",")[0]].filter(Boolean).join(", "), chips: best.rows.filter((r) => r.tone === "good").map((r) => r.label).slice(0, 4) } : null,
    },
    caption: v?.campaign?.caption ?? `${p.city ? `${p.name}, ${p.city}` : p.name}. ${verified.length} photos from our work, each one checked for where and when it was taken, and whether it was used before.`,
    exports: { stat: templates.stat ?? null, split: templates.split ?? null, photo: templates.photo ?? null },
  };
}

