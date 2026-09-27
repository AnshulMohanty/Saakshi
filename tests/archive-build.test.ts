import { describe, expect, it } from "vitest";
import { DEMO_DATASET, type DemoDatasetConfig } from "@/data/demo-dataset.config";
import { buildDemoDataset, pairability, preference, stageHint } from "@/lib/archive/build";
import { commonsUserAgent, packageRepoUrl } from "@/lib/archive/commons";
import { demoProjectId, uuidv5 } from "@/lib/demo/common";
import type { Candidate } from "@/lib/archive/candidates";
import { haversine } from "@/lib/geo";

let nextId = 1000;
function cand(p: Partial<Candidate> & { lat: number | null; lng: number | null; groups: string[] }): Candidate {
  const pageId = nextId++;
  return {
    pageId,
    externalId: `commons:${pageId}`,
    title: `File:Photo ${pageId}.jpg`,
    descriptionUrl: `https://commons.wikimedia.org/wiki/File:Photo_${pageId}.jpg`,
    thumbUrl: `https://upload.wikimedia.org/t/${pageId}.jpg`,
    thumbWidth: 1920,
    thumbHeight: 1440,
    width: 4000,
    height: 3000,
    mime: "image/jpeg",
    sha1: "0".repeat(40),
    author: "Tester",
    license: "CC BY-SA 4.0",
    licenseClass: "cc-by-sa",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    attributionRequired: true,
    description: null,
    date: { local: "2024-03-10T09:00:00", precision: "second", source: "exif" },
    gpsSource: "desc_page",
    make: "Canon",
    model: "EOS",
    ...p,
  };
}

/** n photos around (lat,lng) in `spots` tight groups ~120 m apart (each group within ~10 m). */
function scatter(n: number, lat: number, lng: number, spots: number, extra: Partial<Candidate>, groups: string[]): Candidate[] {
  return Array.from({ length: n }, (_, i) => {
    const s = i % spots;
    return cand({ lat: lat + s * 0.0011 + (i % 3) * 0.00003, lng: lng + (i % 2) * 0.00003, groups, ...extra });
  });
}

const litter = { title: "File:Plastic garbage on river bank.jpg", description: "Bank full of plastic garbage near the river" };
const lake = { title: "File:Rubbish dumped into the lake.jpg", description: "Rubbish dumped into a lake" };
const saplings = { title: "File:Planting saplings.jpg", description: "Volunteers planting saplings" };

// A: 24 litter photos by a river in city X (3 spots). C candidate: 12 lake-rubbish photos 600 km away (2 spots).
// A decoy litter cluster only 20 km from A (must not become C). B: 22 sapling photos. Plus noise.
const riverA = scatter(24, 11.1, 77.35, 3, litter, ["litter"]);
const decoyNearA = scatter(14, 11.28, 77.35, 1, litter, ["litter"]).map((c) => ({ ...c, date: null, make: null }));
const lakeC = scatter(12, 17.46, 78.37, 2, { ...lake, date: { local: "2025-11-02T11:00:00", precision: "second", source: "exif" } }, ["lake-cleanup"]);
const planting = scatter(22, 26.3, 89.45, 1, { ...saplings, date: { local: "2025-11-30T10:00:00", precision: "second", source: "exif" } }, ["tree-planting"]);
const irrelevant = scatter(40, 22.29, 82.16, 1, { title: "File:15th century temple.jpg", description: "Temple by the lake" }, ["lake-cleanup"]);
const noGps = [cand({ lat: null, lng: null, groups: ["litter"], ...litter })];
const candidates = [...riverA, ...decoyNearA, ...lakeC, ...planting, ...irrelevant, ...noGps];

describe("buildDemoDataset", () => {
  const plan = buildDemoDataset(candidates, DEMO_DATASET);
  const [A, B, C] = plan.projects;

  it("builds three projects in rule order with the right types and labels", () => {
    expect(plan.projects.map((p) => [p.key, p.type, p.label])).toEqual([
      ["A", "cleanup", "River clean-up"],
      ["B", "plantation", "Sapling planting"],
      ["C", "water", "Lake clean-up"],
    ]);
    expect(B.sdgs).toEqual([13, 15]);
    expect(C.sdgs).toEqual([6, 14]);
  });

  it("picks the densest relevant cluster, skipping irrelevant and non-geotagged files", () => {
    const ids = new Set(A.files.map((f) => f.pageId));
    expect([...ids].every((id) => riverA.some((r) => r.pageId === id))).toBe(true);
    expect(plan.projects.flatMap((p) => p.files).some((f) => irrelevant.includes(f) || noGps.includes(f))).toBe(false);
  });

  it("puts C in a different city (≥50 km from A), not the nearby decoy", () => {
    expect(haversine(A.center, C.center)).toBeGreaterThan(50_000);
    expect(C.files.every((f) => lakeC.includes(f))).toBe(true);
  });

  it("respects targets and holdBack, keeping held-back photos in the reserve", () => {
    expect(A.files).toHaveLength(Math.min(25, riverA.length - 1)); // 24 eligible − 1 held back
    expect(B.files).toHaveLength(20);
    expect(C.files).toHaveLength(12);
    expect(A.reserve.length).toBeGreaterThanOrEqual(1);
    expect(A.reserve.every((r) => !A.files.includes(r))).toBe(true);
    expect(plan.warnings.join()).toMatch(/Project A: 23\/25/);
  });

  it("uses a clamped 90% radius that contains every selected photo", () => {
    for (const p of plan.projects) {
      expect(p.radiusM).toBeGreaterThanOrEqual(300);
      expect(p.radiusM).toBeLessThanOrEqual(3000);
      for (const f of p.files) expect(haversine(p.center, { lat: f.lat!, lng: f.lng! })).toBeLessThanOrEqual(p.radiusM);
    }
  });

  it("derives the date window from capture dates ± 7 days", () => {
    expect([A.startDate, A.endDate]).toEqual(["2024-03-03", "2024-03-17"]);
    expect([C.startDate, C.endDate]).toEqual(["2025-10-26", "2025-11-09"]);
    expect(A.minPairGapHours).toBe(0.5); // clean-up: a same-evening pair is genuine
    expect(plan.projects.find((p) => p.key === "B")!.minPairGapHours).toBe(336);
    expect(plan.projects.map((p) => p.slug)).toEqual(["demo-hero-cleanup", "demo-tree-planting", "demo-second-cleanup"]);
  });

  it("creates up to 5 spots and places every selected photo in exactly one spot within its radius", () => {
    expect(A.spots).toHaveLength(3);
    expect(C.spots).toHaveLength(2);
    expect(B.spots).toHaveLength(1);
    for (const p of plan.projects) {
      const inSpots = p.spots.flatMap((s) => s.pageIds);
      expect(new Set(inSpots).size).toBe(inSpots.length);
      expect(inSpots.sort()).toEqual(p.files.map((f) => f.pageId).sort());
      for (const s of p.spots) {
        expect(s.radiusM).toBeGreaterThanOrEqual(30);
        for (const id of s.pageIds) {
          const f = p.files.find((x) => x.pageId === id)!;
          expect(haversine(s.center, { lat: f.lat!, lng: f.lng! })).toBeLessThanOrEqual(s.radiusM);
        }
      }
    }
  });

  it("is deterministic and never reuses a file across projects", () => {
    expect(buildDemoDataset(candidates, DEMO_DATASET)).toEqual(plan);
    const all = plan.projects.flatMap((p) => p.files.map((f) => f.pageId));
    expect(new Set(all).size).toBe(all.length);
  });

  it("prefers dated photos with camera make", () => {
    const dated = cand({ lat: 0, lng: 0, groups: [] });
    expect(preference(dated)).toBeGreaterThan(preference({ ...dated, make: null }));
    expect(preference({ ...dated, make: null })).toBeGreaterThan(preference({ ...dated, date: null, make: null }));
  });

  it("warns instead of failing when a project has no usable cluster", () => {
    const cfg: DemoDatasetConfig = { ...DEMO_DATASET };
    const p = buildDemoDataset([...riverA, ...lakeC], cfg);
    expect(p.projects.map((x) => x.key)).toEqual(["A", "C"]);
    expect(p.warnings.join()).toMatch(/Project B: no cluster/);
  });
});

describe("pairability", () => {
  const at = (iso: string) => ({ local: iso, precision: "second" as const, source: "exif" as const });
  // One spot, photos 10 minutes apart then one 3 hours later.
  const evening = ["2024-01-05T17:00:00", "2024-01-05T17:10:00", "2024-01-05T20:00:00"].map((d) =>
    cand({ lat: 11.1, lng: 77.35, groups: ["litter"], ...litter, date: at(d) }),
  );
  const spotOf = new Map(evening.map((c) => [c.pageId, 0]));

  it("counts same-spot pairs in time order that meet the gap, with a before→after bonus", () => {
    expect(pairability(evening, spotOf, 0.5, 0.5)).toMatchObject({ pairs: 2, bonus: 0, score: 2 }); // 17:00→20:00, 17:10→20:00
    expect(pairability(evening, spotOf, 336, 0.5).pairs).toBe(0); // a plantation needs two weeks
    const hinted = [
      { ...evening[0], title: "File:Beach before the clean-up.jpg" },
      evening[1],
      { ...evening[2], title: "File:Beach after the clean-up.jpg" },
    ];
    expect(pairability(hinted, spotOf, 0.5, 0.5)).toMatchObject({ pairs: 2, bonus: 0.5, score: 2.5 });
    expect(stageHint(hinted[0])).toBe("before");
    expect(stageHint(hinted[2])).toBe("after");
  });

  it("ranks clusters by pairability before photo count", () => {
    // 10 photos over two evenings (pairs) vs 16 photos within one minute (no pairs).
    const revisited = Array.from({ length: 10 }, (_, i) =>
      cand({ lat: 17.46 + (i % 2) * 0.00002, lng: 78.37, groups: ["litter"], ...litter, date: at(i < 5 ? "2024-02-01T09:00:00" : "2024-02-01T15:00:00") }),
    );
    const burst = Array.from({ length: 16 }, (_, i) => cand({ lat: 26.3 + (i % 2) * 0.00002, lng: 89.45, groups: ["litter"], ...litter, date: at("2024-02-01T10:00:00") }));
    const p = buildDemoDataset([...burst, ...revisited], DEMO_DATASET);
    expect(p.projects[0].files.every((f) => revisited.includes(f))).toBe(true);
    expect(p.ranking.A.map((r) => r.pairability.score)).toEqual([25, 0]);
    expect(p.projects[0].pairability.selected.pairs).toBeGreaterThan(0);
  });

  it("holds back the photo that forms the fewest pairs, not the one that makes the pairs", () => {
    // 9 burst frames and a single later revisit: holding back the revisit would kill every pair.
    const frames = Array.from({ length: 9 }, (_, i) => cand({ lat: 11.1, lng: 77.35 + (i % 3) * 0.00001, groups: ["litter"], ...litter, date: at("2017-09-05T18:15:00") }));
    const revisit = cand({ lat: 11.1, lng: 77.35, groups: ["litter"], ...litter, date: at("2020-03-30T09:22:00"), make: null });
    const p = buildDemoDataset([...frames, revisit], DEMO_DATASET);
    const A = p.projects[0];
    expect(A.files).toContain(revisit);
    expect(A.reserve.some((r) => frames.includes(r))).toBe(true);
    expect(A.pairability.selected.pairs).toBe(8);
  });

  it("excludes themed events and exhibitions from clean-up projects", () => {
    const events = Array.from({ length: 12 }, () =>
      cand({ lat: 27.35, lng: 95.32, groups: ["swachh-bharat"], title: "File:Walkathon on the theme of Swachh Bharat.jpg", description: "Science exhibition on the theme of Waste Management" }),
    );
    const p = buildDemoDataset([...events, ...riverA], DEMO_DATASET);
    expect(p.projects.flatMap((x) => x.files).some((f) => events.includes(f))).toBe(false);
  });
});

describe("helpers", () => {
  it("makes RFC 4122 v5 ids (stable demo ids)", () => {
    expect(uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
    expect(demoProjectId("demo-hero-cleanup")).toBe(demoProjectId("demo-hero-cleanup"));
    expect(demoProjectId("demo-hero-cleanup")).not.toBe(demoProjectId("demo-tree-planting"));
  });

  it("builds the Wikimedia User-Agent from a contact email, else the repo URL, never an invented address", () => {
    expect(commonsUserAgent({ contactEmail: "team@example.org" })).toContain("+team@example.org");
    expect(commonsUserAgent({ repoUrl: "https://github.com/org/saakshi" })).toContain("+https://github.com/org/saakshi");
    expect(commonsUserAgent({})).toMatch(/no contact configured/);
    expect(commonsUserAgent({})).not.toMatch(/@/);
    expect(packageRepoUrl({ repository: { url: "git+https://github.com/org/saakshi.git" } })).toBe("https://github.com/org/saakshi");
    expect(packageRepoUrl({ repository: "https://github.com/org/x" })).toBe("https://github.com/org/x");
    expect(packageRepoUrl({})).toBeUndefined();
  });
});
