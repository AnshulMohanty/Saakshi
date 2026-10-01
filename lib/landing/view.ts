import "server-only";
/**
 * The landing's data from our database (B5.3, B5.4): every photo, name and number on / comes
 * from the demo projects. Numbers are SQL aggregates or stored measurements (rules 1–4), shown
 * under the display policy: tagged in development, withheld in production when mock-derived.
 * Where the design showed a sample and we have nothing, the chapter gets its designed empty
 * state instead (null here).
 */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import landDots from "../../data/land-dots.json";
import { fullDateTime, offsetMinutes } from "../charts/time-axis";
import { getConfig } from "../config";
import type { DB } from "../db/client";
import { assets, comparisons, duplicates, measurements, projects, reports, spots, type Asset } from "../db/schema";
import { heroProject } from "../demo/hero";
import { locationOf } from "../evidence";
import { hexToBits, LOGO_BITS } from "../glyph";
import { shortDate } from "../media/composite";
import { FRAME, PREVIEW, THUMB, VIEW } from "../media/derivatives";
import { linkChips } from "../media/link-chips";
import { compileTransform, type Transform } from "../media/transform";
import { FRAME_KEY, LITTER_PROMPTS } from "../measure/measure";
import { spotView } from "../measure/views";
import { FRAME as MAP_FRAME } from "../motion/scenes/landing";
import { AI_PENDING, aiPending, assetMode, combineModes, HIDDEN_MOCK, hidesMock, mockLabel, numberPolicy, type DisplayPolicy, type ProviderMode } from "../provenance";
import { maskTransform, type MediaProvider } from "../providers/media";
import { rankPairs, showcase } from "../showcase";
import { defaultTrustConfig, describeReason, scoreAsset } from "../trust";
import { ruleChips } from "../trust/labels";
import type { TrustSignals } from "../trust/types";
import { aiSentence, creditTitle, decisiveReason, flagTitle, placeShort, splitProjectName, stackLayout, yearRange } from "./copy";
import type { Credit, FieldTile, LandingData, LandingFlag, LandingHero, LandingNumber, LandingProject, Ledger, StormPhoto } from "./types";

/** Storm tiles: 420 px wide (D-0022 note), aspect kept, faces blurred. */
const TILE: Transform = [{ width: 420, crop: "limit" }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];
/** The hero at 1600×1200 on the measurement frame (FRAME is 800×600, same aspect), so its mask lines up. */
const HERO: Transform = [{ crop: "fill", gravity: "auto", width: 1600, height: 1200 }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];
const FLAG: Transform = [{ width: 900, crop: "limit" }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];
const PLANTED_ORDER = ["reused", "stock", "location_mismatch", "stamp_mismatch"];

export interface LandingOptions {
  appUrl: string;
  policy: DisplayPolicy;
  /** DEMO_PREVIEW=1: mock-derived measurements shown, badged "Prototype measurement" (Part D). */
  preview?: boolean;
}

export async function landingView(db: DB, media: MediaProvider, o: LandingOptions): Promise<LandingData> {
  const cfg = getConfig();
  const off = offsetMinutes(cfg.env.EXIF_DEFAULT_UTC_OFFSET);
  const policy: DisplayPolicy = { ...o.policy, preview: !!(o.preview || o.policy.preview) };
  const mockTag = mockLabel(policy);
  let anyMock = false;
  const shown = (value: number | null, mode: ProviderMode, fmt: (v: number) => string = (v) => v.toFixed(1)): LandingNumber => {
    if (value === null) return { value: null, text: "Not measured", mock: false };
    const p = numberPolicy(mode, policy);
    if (p === "hide") return { value: null, text: HIDDEN_MOCK, mock: false };
    if (p === "tag") anyMock = true;
    return { value: +fmt(value), text: fmt(value), mock: p === "tag" };
  };
  const signed = (a: Pick<Asset, "cldPublicId">, t: Transform) => media.url(a.cldPublicId, t, { signed: true });

  const hero = await heroProject(db);
  const demo = await db.select().from(projects).where(eq(projects.source, "demo_archive")).orderBy(asc(projects.createdAt), asc(projects.id));
  const demoIds = demo.map((p) => p.id);
  const all = demoIds.length ? await db.select().from(assets).where(and(inArray(assets.projectId, demoIds), isNotNull(assets.trustBand))).orderBy(asc(assets.projectId), asc(assets.capturedAt), asc(assets.id)) : [];
  const heroId = hero.project?.id ?? null;
  const ms = all.length ? await db.select().from(measurements).where(and(inArray(measurements.assetId, all.map((a) => a.id)), eq(measurements.frame, FRAME_KEY))) : [];
  const primaryOf = (id: string) => ms.find((m) => m.assetId === id && (m.metric === "litter_cover" || m.metric === "green_cover") && m.maskUrl);

  // ---------- the hero photo: verified, located, fingerprinted and measured; best score first
  const heroPhoto =
    all
      .filter((a) => a.projectId === heroId && a.trustBand === "VERIFIED" && a.phash && locationOf(a) && a.testCase === null)
      .sort((a, b) => (b.trustScore ?? 0) - (a.trustScore ?? 0) || Number(!!primaryOf(b.id)) - Number(!!primaryOf(a.id)) || (primaryOf(b.id)?.value ?? 0) - (primaryOf(a.id)?.value ?? 0) || a.id.localeCompare(b.id))[0] ?? null;
  const credit = (a: Asset) => a.attribution;
  const heroView = heroPhoto ? heroOf(heroPhoto) : null;

  function heroOf(a: Asset): LandingHero {
    const loc = locationOf(a)!;
    const m = primaryOf(a.id);
    const place = placeShort(a.placeName) ?? hero.project?.name ?? "The demo site";
    const mode = assetMode(a.provenance);
    const tp = numberPolicy(mode, policy);
    if (tp === "tag") anyMock = true;
    const at = credit(a);
    const labels = a.ai?.visibleCounts?.length ? a.ai.visibleCounts.map((c) => c.label) : a.cldTags.filter((t) => !/^(saakshi|planted|sandbox)/.test(t));
    return {
      assetId: a.id,
      src: signed(a, HERO),
      w: 1600,
      h: 1200,
      alt: `${a.caption ?? "Demo photo"} ${place}. Faces blurred.`.replace(/\.\s*(\w)/, ". $1"),
      mask: m?.maskUrl ?? null,
      maskMode: "luminance",
      bits: hexToBits(a.phash!),
      hex: a.phash!,
      lat: loc.lat,
      lng: loc.lng,
      when: a.capturedAt ? fullDateTime(a.capturedAt.getTime(), a.capturedAtPrecision, off, { seconds: true }) : "Capture time not recorded",
      extra: a.cameraModel ? `camera ${[a.cameraMake, a.cameraModel].filter(Boolean).join(" ")}` : null,
      locationNote: a.source === "witness" ? `Live device fix${a.deviceAccuracyM ? `, ±${Math.round(a.deviceAccuracyM)} m` : ""}.` : a.exifSource === "commons_api" ? "From the Wikimedia Commons record. Accuracy not recorded." : "From the camera file. Accuracy not recorded.",
      photoNote: `${place}. Faces blurred.`,
      // The preview never shows tags a mock made up.
      aiText: aiPending(mode, policy) ? AI_PENDING : aiSentence(labels),
      aiBoxes: [],
      cover: m ? shown(m.value, m.providerMode) : null,
      metric: m?.metric === "green_cover" ? "green" : "litter",
      trust: tp === "hide" || a.trustScore === null || !a.trustBand ? null : { score: a.trustScore, band: a.trustBand, chips: ruleChips(a.trustReasons ?? []), mock: tp === "tag" },
      credit: `${place}, ${a.capturedAt ? shortDate(a.capturedAt) : "date unknown"}. Photo: ${at?.author ?? "unknown"}, ${at?.license ?? "licence unknown"}, Wikimedia Commons. Faces blurred.`,
      evidenceUrl: `${o.appUrl}/e/${a.id}`,
    };
  }

  // ---------- projects and the storm
  const storm = all.filter((a) => a.id !== heroPhoto?.id);
  const keyOf = (a: Asset) => demo.find((p) => p.id === a.projectId)?.slug ?? heroId ?? "";
  const projectsView: LandingProject[] = stackLayout(
    demo
      .filter((p) => p.centerLat !== null && p.centerLng !== null && all.some((a) => a.projectId === p.id))
      .sort((a, b) => Number(b.id === heroId) - Number(a.id === heroId))
      .map((p) => {
        const mine = all.filter((a) => a.projectId === p.id);
        const n = splitProjectName(p.name);
        return { key: p.slug ?? p.id, name: n.name, city: n.city, lat: p.centerLat!, lng: p.centerLng!, count: mine.length, range: yearRange(mine.map((a) => a.capturedAt)), isHero: p.id === heroId };
      }),
  );
  const stormPhotos: StormPhoto[] = storm.map((a) => {
    const l = locationOf(a);
    return { id: a.id, src: signed(a, TILE), w: a.width ?? 4, h: a.height ?? 3, lat: l?.lat ?? null, lng: l?.lng ?? null, project: keyOf(a) };
  });

  // ---------- chapter 3: planted fakes, the grid they hide in, a photo from the internet
  const planted = all.filter((a) => a.testCase && a.trustBand === "FLAGGED").sort((a, b) => PLANTED_ORDER.indexOf(a.testCase!) - PLANTED_ORDER.indexOf(b.testCase!));
  const dupRows = planted.length ? await db.select().from(duplicates).where(inArray(duplicates.assetId, planted.map((a) => a.id))) : [];
  const matchIds = dupRows.map((d) => d.matchAssetId);
  const matches = matchIds.length ? await db.select({ id: assets.id, phash: assets.phash }).from(assets).where(inArray(assets.id, matchIds)) : [];
  const flags: LandingFlag[] = planted.slice(0, 4).map((a) => {
    const r = decisiveReason(a.trustReasons ?? []);
    const title = r ? flagTitle(r) : "Flagged";
    const reused = r?.code === "REUSED" ? dupRows.filter((d) => d.assetId === a.id).sort((x, y) => x.hamming - y.hamming)[0] : undefined;
    const other = reused ? matches.find((m) => m.id === reused.matchAssetId)?.phash : null;
    return {
      id: a.id,
      src: signed(a, FLAG),
      alt: `Planted test photo: ${title}`,
      reason: title,
      detail: r ? describeReason(r) : "",
      diff: a.phash && other ? { bits: hexToBits(a.phash), other: hexToBits(other), text: `${reused!.hamming} of 64 cells differ. Same photo.` } : null,
      evidenceUrl: `${o.appUrl}/e/${a.id}`,
    };
  });
  const heroVerified = all.filter((a) => a.projectId === heroId && a.trustBand === "VERIFIED" && a.id !== heroPhoto?.id && !a.testCase);
  const grid = heroVerified.slice(0, 20).map((a) => ({ src: signed(a, THUMB), hole: "" }));
  [3, 9, 14, 20].forEach((at, k) => flags[k] && grid.splice(Math.min(at, grid.length), 0, { src: flags[k].src, hole: String(k) }));
  const internet = await internetLedger(db, media, heroId);

  // ---------- chapter 4: the best measured pair across projects (lib/showcase.ts)
  const sc = await showcase(db, policy);
  let measurement: LandingData["measurement"] = null;
  if (sc.measurement) {
    const c = sc.measurement.comparison;
    const pair = await db.select().from(assets).where(inArray(assets.id, [c.beforeAssetId, c.afterAssetId]));
    const b = pair.find((x) => x.id === c.beforeAssetId);
    const a = pair.find((x) => x.id === c.afterAssetId);
    if (b && a) {
      const side = (x: Asset, mask: string | null, v: number | null) => ({ src: signed(x, VIEW), mask, maskMode: "luminance" as const, value: shown(v, c.providerMode, (n) => String(Math.round(n))), alt: `${x.caption ?? "Demo photo"}. Faces blurred.`, credit: `Photo: ${x.attribution?.author ?? "unknown"}, ${x.attribution?.license ?? "licence unknown"}` });
      measurement = { project: sc.measurement.project.name, place: sc.measurement.project.name, metric: c.metric === "green_cover" ? "green" : "litter", before: side(b, c.maskBeforeUrl, c.beforeValue), after: side(a, c.maskAfterUrl, c.afterValue), isHero: sc.measurement.isHero };
    }
  }

  // ---------- chapter 5: the hero project's report card and the photos behind each number
  const heroRows = all.filter((a) => a.projectId === heroId);
  const countOf = (band: "VERIFIED" | "FLAGGED") => {
    const rows = heroRows.filter((a) => a.trustBand === band);
    const counted = hidesMock(policy) ? rows.filter((a) => assetMode(a.provenance) === "real") : rows;
    const mode = combineModes(counted.map((a) => assetMode(a.provenance)));
    return { rows: counted, n: shown(counted.length, counted.length ? mode : "real", (v) => String(Math.round(v))) };
  };
  const verified = countOf("VERIFIED");
  const flagged = countOf("FLAGGED");
  const heroPairs = heroId ? await db.select().from(comparisons).where(eq(comparisons.projectId, heroId)) : [];
  const heroPair = rankPairs(heroPairs, policy, { minAbsDelta: 0 })[0] ?? null;
  const [latestReport] = heroId ? await db.select({ id: reports.id }).from(reports).where(eq(reports.projectId, heroId)).orderBy(desc(reports.createdAt)).limit(1) : [];
  const heroName = hero.project?.name ?? "The demo project";
  const report: LandingData["report"] = heroId
    ? {
        title: heroName,
        kind: latestReport ? "Its report" : "Demo archive report",
        verified: verified.n,
        flagged: flagged.n,
        before: heroPair ? shown(heroPair.beforeValue, heroPair.providerMode, (v) => String(Math.round(v))) : null,
        after: heroPair ? shown(heroPair.afterValue, heroPair.providerMode, (v) => String(Math.round(v))) : null,
        metric: heroPair?.metric === "green_cover" ? "green" : "litter",
        url: latestReport ? `/r/${latestReport.id}` : null,
      }
    : null;
  const pairPhotos = heroPair ? await db.select().from(assets).where(inArray(assets.id, [heroPair.beforeAssetId, heroPair.afterAssetId])) : [];
  const field: FieldTile[] = [
    ...verified.rows.filter((a) => !pairPhotos.some((p) => p.id === a.id)).map((a) => ({ src: signed(a, THUMB), k: "verified" as const })),
    ...flagged.rows.map((a) => ({ src: signed(a, THUMB), k: "flagged" as const })),
    ...(heroPair ? pairPhotos.filter((p) => p.id === heroPair.beforeAssetId).map((p) => ({ src: signed(p, THUMB), k: "before" as const })) : []),
    ...(heroPair ? pairPhotos.filter((p) => p.id === heroPair.afterAssetId).map((p) => ({ src: signed(p, THUMB), k: "after" as const })) : []),
  ];
  // The prototype's shuffle (L:1139-1140): the after tile to position 9, the before tile to 4.
  if (heroPair && field.length > 10) {
    field.splice(9, 0, field.pop()!);
    field.splice(4, 0, field.splice(field.length - 1, 1)[0]);
  }

  // ---------- chapter 6: a photo with faces, its real signed link as chips
  const withFaces = heroRows.filter((a) => (a.facesCount ?? 0) > 0 && a.trustBand === "VERIFIED").sort((a, b) => (b.facesCount ?? 0) - (a.facesCount ?? 0))[0] ?? heroPhoto;
  const tamperUrl = withFaces ? signed(withFaces, PREVIEW) : null;
  const chips = tamperUrl ? linkChips(tamperUrl) : null;
  const tamper: LandingData["tamper"] = withFaces && tamperUrl && chips ? { base: chips.base, chips: chips.chips, assetId: withFaces.id, photo: tamperUrl, bgSize: "cover", bgPosition: "50% 50%" } : null;

  // ---------- chapter 7: the spot with the most measured photos over time
  const checkins = await checkinsOf(db, media, demo.filter((p) => p.id === heroId).concat(demo.filter((p) => p.id !== heroId)).map((p) => p.id), policy, off);
  if (checkins?.points.some((p) => p.value.mock)) anyMock = true;

  // ---------- chapter 9, 10, footer
  const nodes = pipelineNodes(heroPhoto, heroView, (a, t) => signed(a, t));
  const credits: Credit[] = [];
  const seen = new Set<string>();
  const add = (a: Asset | undefined | null, note = "") => {
    if (!a || seen.has(a.id) || !a.attribution) return;
    seen.add(a.id);
    const at = a.attribution;
    credits.push({ title: creditTitle(at.title), author: at.author ?? "unknown", license: at.license ?? "licence unknown", page: at.source_url, note: note || (a.testCase ? ". Planted copy." : "") });
  };
  add(heroPhoto, ". Hero photo.");
  if (sc.measurement) {
    const pair = await db.select().from(assets).where(inArray(assets.id, [sc.measurement.before.id, sc.measurement.after.id]));
    add(pair.find((p) => p.id === sc.measurement!.before.id), ". Before photo.");
    add(pair.find((p) => p.id === sc.measurement!.after.id), ". After photo.");
  }
  for (const a of all) add(a);
  const repoUrl = cfg.env.APP_REPO_URL ?? null;

  return {
    frame: { ...MAP_FRAME },
    land: landDots.dots as Array<[number, number]>,
    hero: heroView,
    projects: projectsView,
    storm: stormPhotos,
    stormCount: stormPhotos.length + (heroPhoto ? 1 : 0),
    grid,
    flags,
    internet,
    measurement,
    report,
    field,
    tamper,
    checkins,
    witness: { url: `${o.appUrl}/capture`, label: `${o.appUrl.replace(/^https?:\/\//, "")}/capture`, spots: projectsView.map((p) => ({ lat: p.lat, lng: p.lng, city: p.city || p.name })), live: true },
    nodes,
    dust: all.filter((a) => a.phash).map((a) => hexToBits(a.phash!)),
    dustThumbs: all.filter((a) => a.phash).map((a) => signed(a, THUMB)),
    credits,
    footer: {
      repoUrl,
      built: "Built for Code Cubicle 6.0 (PS02, Cloudinary track).",
      disclaimer: "Swachhata Hi Seva is the Government of India's annual cleanliness campaign, held each year from mid-September to 2 October. Saakshi is an independent project and is not affiliated with it. Every number on this page comes from the demo archive.",
    },
    mock: anyMock,
    mockTag,
    copy: {
      dropHint: "or choose a file. It runs on the live pipeline in a sandbox that is deleted within a day.",
      ledgerHint: "The fingerprint is computed on the server and compared with every photo in the demo archive.",
      nodesNote: "Each stage is a call Saakshi makes; the parameters are the ones in the code (docs/external-apis.md).",
      liveCaption: "Live: Witness photos appear as they arrive",
    },
  };
}

/**
 * "A photo found on the internet" (chapter 3's close): the latest photo someone dropped into
 * "Try to fool it", with its real ledger. With none, the engine's answer for such a file (no
 * location, upload time only, new fingerprint, nothing found) and no image.
 */
async function internetLedger(db: DB, media: MediaProvider, heroId: string | null): Promise<Ledger | null> {
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, "try-to-fool-it")).limit(1);
  const [a] = p ? await db.select().from(assets).where(and(eq(assets.projectId, p.id), isNotNull(assets.trustBand))).orderBy(desc(assets.createdAt)).limit(1) : [];
  const [hp] = heroId ? await db.select().from(projects).where(eq(projects.id, heroId)).limit(1) : [];
  const reasons =
    a?.trustReasons ??
    scoreAsset(
      { assetId: "internet", source: "upload", exifSource: "none", deviceFix: null, attested: false, exifLocation: null, uploaderLocation: null, capturedAt: null, capturedAtTzAssumed: false, capturedAtPrecision: null, uploadedAt: new Date().toISOString(), moderation: {}, watermark: false, textInImage: null, childrenVisible: false, qualityScore: 0.8, cameraMake: null, cameraModel: null } satisfies TrustSignals,
      hp ? { id: hp.id, name: hp.name, center: hp.centerLat !== null && hp.centerLng !== null ? { lat: hp.centerLat, lng: hp.centerLng } : null, radiusM: hp.radiusM, startDate: hp.startDate, endDate: hp.endDate, monitoringEndsAt: hp.monitoringEndsAt, minPairGapHours: hp.minPairGapHours } : null,
      null,
      [],
    ).reasons;
  const score = a?.trustScore ?? Math.max(0, Math.min(100, reasons.reduce((n, r) => n + r.points, 0)));
  const band = a?.trustBand ?? (score >= defaultTrustConfig.verifiedMin ? "VERIFIED" : score >= defaultTrustConfig.reviewMin ? "NEEDS_REVIEW" : "FLAGGED");
  const SIGNAL: Record<string, string> = { location: "Location", time: "Time", uniqueness: "Fingerprint", authenticity: "No watermark or edits", quality: "Quality", provenance: "Camera" };
  const chips = ruleChips(reasons);
  return {
    src: a ? media.url(a.cldPublicId, THUMB, { signed: true }) : "",
    caption: a ? "A photo someone dropped into Try to fool it" : "A photo found on the internet",
    score,
    band,
    rows: chips.slice(0, 6).map((c) => ({ label: SIGNAL[reasons.find((r) => r.code === c.code)?.signal ?? ""] ?? c.text.split(",")[0], value: c.text, tone: c.tone })),
    note: "It stays out of reports until someone confirms it with proof. It never counts toward a number on its own.",
  };
}

async function checkinsOf(db: DB, media: MediaProvider, projectIds: string[], policy: DisplayPolicy, off: number): Promise<LandingData["checkins"]> {
  for (const pid of projectIds) {
    const ss = await db.select({ slug: spots.slug, id: spots.id }).from(spots).where(eq(spots.projectId, pid));
    let best: Awaited<ReturnType<typeof spotView>> = null;
    for (const s of ss) {
      const v = await spotView(db, media, s.slug ?? s.id, policy);
      if (v && v.trend.length >= 3 && (!best || v.trend.length > best.trend.length)) best = v;
    }
    if (!best) continue;
    const photos = await db.select({ id: assets.id, cldPublicId: assets.cldPublicId }).from(assets).where(inArray(assets.id, best.trend.map((t) => t.assetId)));
    const mode: ProviderMode = best.trendMock ? "mock" : "real";
    const pts = best.trend.slice(-6);
    const multiYear = new Date(pts[0].t).getUTCFullYear() !== new Date(pts.at(-1)!.t).getUTCFullYear();
    return {
      spot: best.spot.name,
      photo: null,
      points: pts.map((t, i) => {
        const ph = photos.find((p) => p.id === t.assetId);
        const day = fullDateTime(t.t, "day", off).replace(" (date only)", "");
        return {
          label: i === 0 ? `First measured photo, ${day}` : `Photo ${i + 1}, ${day}`,
          // "5 Sep", or "5 Sep 17" when the points span years.
          short: multiYear ? day.replace(/ \d\d(\d\d)$/, " $1") : day.replace(/ \d{4}$/, ""),
          value: numberPolicy(mode, policy) === "hide" ? { value: null, text: HIDDEN_MOCK, mock: false } : { value: Math.round(t.value), text: String(Math.round(t.value)), mock: mode === "mock" },
          photo: ph ? media.url(ph.cldPublicId, VIEW, { signed: true }) : null,
        };
      }),
    };
  }
  return null;
}

/** Chapter 10 (B5.5): each stage shows the call we make, compiled by our own transform code. */
function pipelineNodes(hero: Asset | null, h: LandingHero | null, url: (a: Asset, t: Transform) => string): LandingData["nodes"] {
  const pid = hero?.cldPublicId ?? "saakshi/archive/<public id>";
  const mask = compileTransform(maskTransform(LITTER_PROMPTS, { multiple: true, frame: FRAME }));
  const preview = compileTransform(PREVIEW);
  const signedUrl = hero ? url(hero, PREVIEW) : null;
  const sig = signedUrl ? (/\/(s--[^/]+--)\//.exec(signedUrl)?.[1] ?? "s--…--") : "s--…--";
  return [
    { name: "Intake forensics", what: "Reads the camera file for location and time, and fingerprints the pixels so reused photos are caught.", code: 'cloudinary.uploader.upload(file, {\n  type: "authenticated",\n  media_metadata: true,\n  phash: true,\n  faces: true,\n  quality_analysis: true\n})', preview: h ? { kind: "glyph", bits: h.bits, variant: "night" } : null, caption: "pHash of the hero photo", alt: "Fingerprint glyph" },
    { name: "Perception", what: "Tags what is in the frame and checks it for screens, stock watermarks and edits. Tags are AI-estimated and always carry a confidence.", code: "POST /v2/analysis/<cloud>/analyze/\n  ai_vision_tagging\n  ai_vision_moderation\n  watermark_detection", preview: h ? { kind: "image", src: h.src, fit: "cover" } : null, caption: "Tagged frame", alt: "Hero photo" },
    { name: "Measurement", what: "Segments litter and counts its pixels, so cover is a measured share of the photo.", code: `/image/authenticated/\n  ${mask.split("/").join("/\n  ")}/\n  ${pid}`, preview: h?.mask ? { kind: "image", src: h.mask, fit: "cover" } : null, caption: "Litter mask, hero photo", alt: "Litter mask" },
    { name: "Privacy", what: "Blurs every face before a photo is public, on a signed link that cannot be edited.", code: `/image/authenticated/${sig}/\n  ${preview.split("/").join("/\n  ")}/\n  v1/${pid}`, preview: h ? { kind: "image", src: h.src, fit: "cover" } : null, caption: "Public copy, faces blurred", alt: "Blurred public photo" },
    { name: "Provenance", what: "Pins each photo to a version and a signature, so a report always opens the exact file it counted.", code: `/${sig}/\n  v1/${pid}`, preview: { kind: "glyph", bits: LOGO_BITS, variant: "plain" }, caption: "Versioned, signed asset", alt: "Saakshi glyph" },
  ];
}
