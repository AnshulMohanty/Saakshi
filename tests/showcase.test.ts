/** Showcase selection: the hero for one-project chapters, the best measured pair for the measurement chapter. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, comparisons, projects } from "@/lib/db/schema";
import { rankPairs, showcase, type PairCandidate } from "@/lib/showcase";
import { createTestContext, type TestContext } from "./helpers";

const dev = { production: false, minConfidence: 0.5 };
const prod = { production: true, minConfidence: 0.5 };
const c = (id: string, over: Partial<PairCandidate> = {}): PairCandidate => ({ id, metric: "litter_cover", method: "measured", delta: -10, confidence: null, providerMode: "real", updatedAt: new Date("2026-01-01"), ...over });

describe("rankPairs", () => {
  it("keeps measured primary metrics with |delta| ≥ 5, ranked by confidence then |delta|", () => {
    const ranked = rankPairs(
      [
        c("small", { delta: 3.6 }),
        c("items", { metric: "items_visible", delta: -30 }),
        c("ai", { method: "ai_estimated", delta: -40 }),
        c("lowconf-big", { metric: "green_cover", delta: -44.5, confidence: 0.4 }),
        c("measured-mid", { delta: -12 }),
        c("measured-big", { delta: 20 }),
      ],
      dev,
    ).map((x) => x.id);
    // A measured value with no confidence recorded counts as full confidence, so it beats 0.4.
    expect(ranked).toEqual(["measured-big", "measured-mid", "lowconf-big"]);
  });

  it("never picks a mock-derived pair in production; development may (it is tagged there)", () => {
    const cs = [c("mock", { providerMode: "mock", delta: -30 })];
    expect(rankPairs(cs, prod)).toEqual([]);
    expect(rankPairs(cs, dev).map((x) => x.id)).toEqual(["mock"]);
  });

  it("|delta| exactly 5 qualifies; newest breaks ties", () => {
    const ranked = rankPairs([c("old", { delta: 5, updatedAt: new Date("2025-01-01") }), c("new", { delta: -5, updatedAt: new Date("2026-02-01") })], dev);
    expect(ranked.map((x) => x.id)).toEqual(["new", "old"]);
  });
});

describe("showcase against the database", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  it("labels the measurement pair with its own project, even when it isn't the hero", async () => {
    const [hero] = await ctx.db.insert(projects).values({ name: "River clean-up, Tiruppur North", slug: "demo-hero-cleanup", type: "cleanup" }).returning();
    const [other] = await ctx.db.insert(projects).values({ name: "Tree planting, Pimpri-Chinchwad", slug: "demo-tree-planting", type: "plantation" }).returning();
    const mk = async (projectId: string, ext: string) =>
      (await ctx.db.insert(assets).values({ projectId, source: "archive", externalId: ext, cldPublicId: `saakshi/t/${ext}`, cldAssetId: ext, capturedAt: new Date("2020-11-20T03:41:00Z") }).returning())[0];
    const [hb, ha, ob, oa] = [await mk(hero.id, "hb"), await mk(hero.id, "ha"), await mk(other.id, "ob"), await mk(other.id, "oa")];
    await ctx.db.insert(comparisons).values([
      { projectId: hero.id, beforeAssetId: hb.id, afterAssetId: ha.id, metric: "litter_cover", beforeValue: 6, afterValue: 9.6, delta: 3.6, method: "measured", providerMode: "mock" },
      { projectId: other.id, beforeAssetId: ob.id, afterAssetId: oa.id, metric: "green_cover", beforeValue: 50.6, afterValue: 6.1, delta: -44.5, method: "measured", confidence: 0.4, providerMode: "mock" },
    ]);
    const s = await showcase(ctx.db, dev);
    expect(s.hero.project?.name).toBe("River clean-up, Tiruppur North");
    expect(s.measurement).toMatchObject({ project: { name: "Tree planting, Pimpri-Chinchwad" }, isHero: false, comparison: { delta: -44.5 } });
    // Production: both are mock-derived, so the chapter shows its empty state.
    expect((await showcase(ctx.db, prod)).measurement).toBeNull();
  });
});
