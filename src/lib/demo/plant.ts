/**
 * Planted test inputs (source = planted_test, test_case set, original Commons attribution kept).
 * Each is built from real Commons photos so the Trust Engine has something to catch:
 *   1. reused:            a project-A photo, lightly re-cropped + re-encoded, uploaded into C
 *   2. stock:             an A-style photo with a tiled "© STOCKIMAGES" watermark, into A
 *   3. location_mismatch: a geotagged photo from > 500 km away, into A
 *   4. stamp_mismatch:    an A photo with a burned-in GPS-camera stamp pointing to another city, into A
 * Watermark and stamp are rendered with our Transform objects (sharp in mock, Cloudinary in real).
 * Mock mode only: the stamp text is also stored in context so the mock AI can "read" it.
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { DEMO_DATASET } from "../../../data/demo-dataset.config";
import { preference, type DatasetPlan, type ProjectPlan } from "../archive/build";
import type { Candidate } from "../archive/candidates";
import { ArchiveOfflineError } from "../archive/commons";
import { appendAudit } from "../audit";
import { assets, projects, type TestCase } from "../db/schema";
import { haversine } from "../geo";
import type { Transform } from "../media/transform";
import { INDIAN_CITIES } from "../providers/geocoder/mock";
import { attributionOf, commonsIngest, contextValue, demoProjectId, type Logger } from "./common";
import type { DemoDeps } from "./import";

/** Corners + centre: a tiled look that can't collide at any aspect ratio. */
const POSITIONS = ["north_west", "north_east", "center", "south_west", "south_east"] as const;

/** Semi-transparent "© STOCKIMAGES" marks tiled over the photo. */
export const WATERMARK_TRANSFORM: Transform = [
  { width: 1600, crop: "limit" },
  ...POSITIONS.map((gravity) => ({
    overlay: { text: "© STOCKIMAGES", font: "Arial", size: 52, weight: "bold" as const, color: "#FFFFFF8C" },
    gravity,
    x: gravity === "center" ? 0 : 36,
    y: gravity === "center" ? 0 : 36,
  })),
  { format: "jpg", quality: 85 },
];

/** GPS-camera-app style stamp box, bottom-left. */
export function stampTransform(text: string): Transform {
  return [
    { width: 1600, crop: "limit" },
    { overlay: { text, font: "Arial", size: 30, color: "#FFFFFF", background: "#000000B3" }, gravity: "south_west", x: 24, y: 24 },
    { format: "jpg", quality: 88 },
  ];
}

export function stampText(city: { name: string; lat: number; lng: number }, localTime: string | null): string {
  const d = localTime ? new Date(`${localTime}Z`) : new Date(Date.UTC(2024, 0, 15, 10, 42));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = d.getUTCHours();
  const time = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(((h + 11) % 12) + 1)}:${pad(d.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
  // "GMT +05:30" like a real GPS Map Camera stamp: text layers double-escape ":" and "+" (media/transform.ts).
  return [`GPS Map Camera`, city.name, `Lat ${city.lat.toFixed(6)}° Long ${city.lng.toFixed(6)}°`, `${time} GMT +05:30`].join("\n");
}

export interface PlantPicks {
  reused: Candidate;
  stock: Candidate;
  locationMismatch: Candidate;
  stampMismatch: Candidate;
  stampCity: { name: string; lat: number; lng: number };
}

const pos = (c: Candidate) => (c.lat === null || c.lng === null ? null : { lat: c.lat, lng: c.lng });

/** Pure: which Commons files each planted test is built from. */
export function pickPlantInputs(plan: DatasetPlan, candidates: Candidate[]): PlantPicks {
  const A = plan.projects.find((p) => p.key === "A");
  if (!A || A.files.length === 0) throw new Error("Planting needs project A; run the import first.");
  const ruleA = DEMO_DATASET.projects.find((r) => r.key === "A")!;
  const used = new Set(plan.projects.flatMap((p) => p.files.map((f) => f.pageId)));
  const aStyle = (c: Candidate) => !used.has(c.pageId) && c.groups.some((g) => ruleA.groups.includes(g)) && ruleA.relevant.test(`${c.title} ${c.description ?? ""}`) && !ruleA.exclude?.test(`${c.title} ${c.description ?? ""}`);
  const dist = (c: Candidate) => (pos(c) ? haversine(A.center, pos(c)!) : Number.POSITIVE_INFINITY);

  const stampMismatch = A.reserve[0] ?? A.files.at(-1)!;
  const relevantToA = (c: Candidate) => ruleA.relevant.test(`${c.title} ${c.description ?? ""}`);
  const far = (c: Candidate) => pos(c) !== null && dist(c) > 500_000 && c.pageId !== stampMismatch.pageId;
  // Prefer a spare, relevant photo from another demo project (a real clean-up photo from a real
  // demo place); otherwise the best-ranked, nearest far-away clean-up photo.
  const fromOtherReserves = plan.projects
    .filter((p) => p.key !== "A")
    .flatMap((p) => p.reserve)
    .filter((c) => !used.has(c.pageId) && relevantToA(c) && far(c));
  const locationMismatch =
    fromOtherReserves[0] ??
    candidates.filter((c) => aStyle(c) && far(c)).sort((a, b) => preference(b) - preference(a) || dist(a) - dist(b) || a.pageId - b.pageId)[0];
  if (!locationMismatch) throw new Error("No geotagged clean-up photo more than 500 km from project A.");
  const stock = candidates
    .filter((c) => aStyle(c) && c.pageId !== stampMismatch.pageId && c.pageId !== locationMismatch.pageId)
    .sort((a, b) => dist(a) - dist(b) || a.pageId - b.pageId)[0];
  if (!stock) throw new Error("No spare clean-up photo for the stock test.");
  const [name, lat, lng] = INDIAN_CITIES.find(([, la, ln]) => haversine(A.center, { lat: la, lng: ln }) > 500_000)!;
  return { reused: A.files[0], stock, locationMismatch, stampMismatch, stampCity: { name, lat, lng } };
}

export interface PlantedAsset {
  testCase: TestCase;
  assetId: string;
  created: boolean;
  from: string;
  project: string;
}

async function demoProject(deps: DemoDeps, plan: ProjectPlan) {
  const [p] = await deps.db.select().from(projects).where(eq(projects.id, demoProjectId(plan.slug))).limit(1);
  if (!p) throw new Error(`Demo project ${plan.key} (${plan.slug}) not found; run demo:import first.`);
  return p;
}

export async function plantDemo(
  deps: DemoDeps,
  plan: DatasetPlan,
  candidates: Candidate[],
  log: Logger = () => {},
): Promise<PlantedAsset[]> {
  const picks = pickPlantInputs(plan, candidates);
  const A = await demoProject(deps, plan.projects.find((p) => p.key === "A")!);
  const planC = plan.projects.find((p) => p.key === "C") ?? plan.projects.find((p) => p.key !== "A")!;
  const C = await demoProject(deps, planC);

  /** Uploads a derivative of `c` rendered with `transform` (via a hidden source upload). */
  async function derived(c: Candidate, transform: Transform): Promise<Buffer> {
    const src = await deps.media.upload({ file: await deps.thumbs.downloadThumb(c), folder: "saakshi/planted-source", tags: ["planted-source"] });
    return deps.media.fetchDerived(src.publicId, transform);
  }

  const cases: Array<{
    testCase: TestCase;
    from: Candidate;
    project: typeof A;
    bytes: () => Promise<Buffer>;
    commons: boolean;
    context: Record<string, string>;
    /** How the planted file was made from the Commons photo (the evidence page lists it). */
    edit: { steps: Transform; note: string } | null;
  }> = [
    {
      testCase: "reused",
      from: picks.reused,
      project: C,
      commons: false, // a re-shared copy: EXIF gone
      context: { filename: "reused-cleanup-photo.jpg" },
      edit: {
        steps: [{ crop: "crop", gravity: "center", width: 1843, height: 1382 }, { width: 1600 }, { format: "jpg", quality: 72 }],
        note: "Planted test input: a project-A photo re-cropped 2% on each side and re-encoded, then submitted to another project. (Crop size shown for a 1920×1440 source.)",
      },
      bytes: async () => {
        const buf = await deps.thumbs.downloadThumb(picks.reused);
        const m = await sharp(buf).metadata();
        const w = m.width ?? 1920;
        const h = m.height ?? 1280;
        // 2% off each side: visibly a different file, still within pHash match range (≤ 8 bits;
        // 4% drifted up to 14 bits on smooth scenes). See docs/trust.md.
        return sharp(buf)
          .extract({ left: Math.round(w * 0.02), top: Math.round(h * 0.02), width: Math.round(w * 0.96), height: Math.round(h * 0.96) })
          .resize({ width: 1600 })
          .jpeg({ quality: 72 })
          .toBuffer();
      },
    },
    {
      testCase: "stock",
      from: picks.stock,
      project: A,
      commons: false, // stock downloads carry no camera metadata
      context: { filename: "stock-watermarked-cleanup.jpg", watermark_text: "© STOCKIMAGES" },
      edit: { steps: WATERMARK_TRANSFORM, note: "Planted test input: a tiled “© STOCKIMAGES” watermark over a Commons photo." },
      bytes: () => derived(picks.stock, WATERMARK_TRANSFORM),
    },
    {
      testCase: "location_mismatch",
      from: picks.locationMismatch,
      project: A,
      commons: true, // keeps its real GPS, far from project A
      context: { filename: "cleanup-photo.jpg" },
      edit: null, // the untouched Commons photo; only the project it was submitted to is wrong
      bytes: () => deps.thumbs.downloadThumb(picks.locationMismatch),
    },
    {
      testCase: "stamp_mismatch",
      from: picks.stampMismatch,
      project: A,
      commons: true, // real GPS says project A; the burned-in stamp says another city
      context: { filename: "gps-camera-stamp.jpg", burned_text: stampText(picks.stampCity, picks.stampMismatch.date?.local ?? null) },
      edit: {
        steps: stampTransform(stampText(picks.stampCity, picks.stampMismatch.date?.local ?? null)),
        note: `Planted test input: a GPS-camera stamp naming ${picks.stampCity.name} burned into a photo taken at project A.`,
      },
      bytes: () => derived(picks.stampMismatch, stampTransform(stampText(picks.stampCity, picks.stampMismatch.date?.local ?? null))),
    },
  ];

  const out: PlantedAsset[] = [];
  for (const t of cases) {
    const externalId = `planted:${t.testCase}`;
    const [existing] = await deps.db.select({ id: assets.id }).from(assets).where(eq(assets.externalId, externalId)).limit(1);
    if (existing) {
      out.push({ testCase: t.testCase, assetId: existing.id, created: false, from: t.from.externalId, project: t.project.name });
      continue;
    }
    let bytes: Buffer;
    try {
      bytes = await t.bytes();
    } catch (err) {
      // Offline reset with a source photo that was never cached: skip this case, keep the rest.
      if (err instanceof ArchiveOfflineError) {
        log(`  ! skipped ${t.testCase}: ${t.from.externalId} is not in the archive cache (run \`pnpm demo:plant\` online once)`);
        continue;
      }
      throw err;
    }
    const up = await deps.media.upload({
      file: bytes,
      folder: "saakshi/planted",
      tags: ["saakshi", "planted_test", t.testCase],
      context: {
        ...t.context,
        // What the photo shows (the mocks' stand-in for looking at pixels), from the source file.
        title: contextValue(t.from.title.replace(/^File:/, "")),
        description: contextValue(t.from.description),
        test_case: t.testCase,
        source: "planted_test",
        project_hint: t.project.slug ?? "",
      },
    });
    const [row] = await deps.db
      .insert(assets)
      .values({
        source: "planted_test",
        testCase: t.testCase,
        externalId,
        cldPublicId: up.publicId,
        cldAssetId: up.assetId,
        etag: up.etag,
        phash: up.phash,
        width: up.width,
        height: up.height,
        facesCount: up.facesCount,
        qualityScore: up.qualityScore,
        exifSource: t.commons ? "commons_api" : "none",
        attribution: attributionOf(t.from),
        transforms: t.edit ? [{ at: new Date().toISOString(), actor: "demo:plant", steps: t.edit.steps, note: t.edit.note }] : [],
        pipeline: {
          ingest: { ...(t.commons ? { commons: commonsIngest(t.from) } : {}), mediaMetadata: up.mediaMetadata, hint: { projectId: t.project.id } },
          steps: {},
        },
      })
      .returning();
    await appendAudit(deps.db, {
      assetId: row.id,
      actor: "demo:plant",
      action: "demo.planted",
      detail: { testCase: t.testCase, from: t.from.externalId, project: t.project.slug },
    });
    await deps.enqueue(row.id);
    log(`  planted ${t.testCase.padEnd(18)} from ${t.from.externalId} → ${t.project.name}`);
    out.push({ testCase: t.testCase, assetId: row.id, created: true, from: t.from.externalId, project: t.project.name });
  }
  return out;
}
