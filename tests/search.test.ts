import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, projects } from "@/lib/db/schema";
import { searchAssets } from "@/lib/db/search";
import { parseSearchQuery } from "@/lib/providers/ai/mock";
import { runSearch, validateFilters } from "@/lib/search";
import { correctTypo, editDistance, normaliseQuery } from "@/lib/search/normalize";
import { createTestContext, type TestContext } from "./helpers";

describe("normaliseQuery: Hinglish and typos", () => {
  it("maps Hinglish words and drops glue words", () => {
    expect(normaliseQuery("paudhe")).toEqual({ text: "saplings", rewrites: [{ from: "paudhe", to: "saplings" }] });
    expect(normaliseQuery("nadi ke kinare ka kachra").text).toBe("river bank garbage");
    expect(normaliseQuery("jheel mein plastik").text).toBe("lake plastic");
  });

  it("corrects typos within 1 edit (5–6 letters) or 2 (7+), never short words", () => {
    expect(editDistance("sapplings", "saplings")).toBe(1);
    expect(editDistance("garbgae", "garbage")).toBe(1); // transposition
    expect(correctTypo("sapplings")).toBe("saplings");
    expect(correctTypo("garbge")).toBe("garbage");
    expect(correctTypo("plastik")).toBe("plastic");
    expect(correctTypo("rivr")).toBeNull(); // too short to guess
    expect(correctTypo("litter")).toBeNull(); // already a word
    expect(correctTypo("kolkata")).toBeNull(); // nothing close
  });

  it("leaves dates, slugs and ids untouched", () => {
    expect(normaliseQuery("since 2024-06-01 project:demo-hero-cleanup").text).toBe("since 2024-06-01 project:demo-hero-cleanup");
  });

  it("the mock parser reports rewrites and extracts filters after normalising", () => {
    expect(parseSearchQuery("verified paudhe in 2021")).toEqual({
      semantic: "saplings",
      filters: { project: null, band: "VERIFIED", source: null, activity: null, from: "2021-01-01", to: "2021-12-31" },
      rewrites: [{ from: "paudhe", to: "saplings" }],
    });
    expect(parseSearchQuery("flaged test inputs").filters).toMatchObject({ band: "FLAGGED", source: "planted_test" });
    expect(parseSearchQuery("river cleanup kachra").filters.activity).toBe("cleanup");
  });
});

describe("search against the database", () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    [{ id: projectId }] = await ctx.db.insert(projects).values({ name: "Tree planting, Pune", slug: "pune-trees", type: "plantation" }).returning();
    const row = (publicId: string, o: Partial<typeof assets.$inferInsert>) => ({ source: "archive" as const, cldPublicId: publicId, projectId, trustBand: "VERIFIED" as const, status: "ready" as const, ...o });
    await ctx.db.insert(assets).values([
      row("s/saplings", { caption: "Young saplings planted and staked in rows.", cldTags: ["saplings_or_young_trees"], placeName: "Pimpri-Chinchwad, Maharashtra", capturedAt: new Date("2021-11-20T09:00:00Z"), ai: { activity: "plantation" } as never }),
      row("s/river", { caption: "A littered river bank before a community cleanup.", cldTags: ["litter_or_waste", "water_body_or_shore"], placeName: "Tiruppur, Tamil Nadu", capturedAt: new Date("2017-09-05T12:45:00Z"), projectId: null, ai: { activity: "cleanup" } as never }),
      row("s/flagged", { caption: "Stock photo of plastic bottles.", cldTags: ["litter_or_waste"], trustBand: "FLAGGED", status: "flagged", source: "planted_test", testCase: "stock", projectId: null }),
    ]);
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("validation keeps known values and rejects unknown ones with a reason", async () => {
    const v = await validateFilters(ctx.db, { project: "pune-trees", band: "verified", source: "test inputs", activity: "plantation", from: "2021-01-01", to: "2021-12-31" });
    expect(v.filters).toEqual({ projectId, band: "VERIFIED", source: "planted_test", activity: "plantation", from: "2021-01-01", to: "2021-12-31" });
    expect(v.rejected).toEqual([]);
    expect(v.chips.map((c) => c.label)).toEqual(["Project: Tree planting, Pune", "Verified", "Test inputs", "Activity: plantation", "From 2021-01-01", "Until 2021-12-31"]);

    const bad = await validateFilters(ctx.db, { project: "atlantis", band: "PLATINUM", source: "satellite", activity: "mining", from: "2021-13-45", to: "yesterday" });
    expect(bad.filters).toEqual({});
    expect(bad.rejected.map((r) => r.field)).toEqual(["project", "band", "source", "activity", "from", "to"]);
    expect(bad.chips.every((c) => c.kind === "rejected")).toBe(true);

    const reversed = await validateFilters(ctx.db, { project: null, band: null, source: null, activity: null, from: "2022-01-01", to: "2021-01-01" });
    expect(reversed.filters).toEqual({ from: "2022-01-01" });
    expect(reversed.rejected).toEqual([{ field: "to", value: "2021-01-01", reason: "before 2022-01-01" }]);
  });

  it("full-text fallback ranks over caption, tags and place; all words first, then any", async () => {
    const all = await searchAssets(ctx.db, { text: "river litter" });
    expect(all.map((r) => r.asset.cldPublicId)).toEqual(["s/river"]);
    expect(all[0].mode).toBe("fulltext");
    const any = await searchAssets(ctx.db, { text: "saplings volcano" });
    expect(any.map((r) => r.asset.cldPublicId)).toEqual(["s/saplings"]);
    expect((await searchAssets(ctx.db, { text: "pimpri" })).map((r) => r.asset.cldPublicId)).toEqual(["s/saplings"]); // place
    expect((await searchAssets(ctx.db, { text: "plastic", filters: { band: "FLAGGED" } })).map((r) => r.asset.cldPublicId)).toEqual(["s/flagged"]);
  });

  it("runSearch: Hinglish in, chips out, full-text with the mock AI", async () => {
    const r = await runSearch({ db: ctx.db, ai: ctx.deps.ai, media: ctx.media }, "verified paudhe project:pune-trees");
    expect(r.mode).toBe("fulltext");
    expect(r.results.map((x) => x.id)).toEqual([(await ctx.db.select().from(assets).where(eq(assets.cldPublicId, "s/saplings")))[0].id]);
    expect(r.chips.map((c) => [c.kind, c.label])).toEqual([
      ["rewrite", "“paudhe” → saplings"],
      ["project", "Project: Tree planting, Pune"],
      ["band", "Verified"],
      ["text", "About: saplings"],
    ]);
    const unknown = await runSearch({ db: ctx.db, ai: ctx.deps.ai, media: ctx.media }, "project:atlantis litter");
    expect(unknown.rejected).toEqual([{ field: "project", value: "atlantis", reason: "no such project" }]);
    expect(unknown.results.length).toBeGreaterThan(0); // the rest of the query still runs
  });
});
