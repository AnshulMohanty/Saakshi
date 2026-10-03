/**
 * The OpenAI vision fallback for Cloudinary AI Vision (CLD_AI_VISION, providers/analysis/fallback.ts):
 * on / off / auto, one OpenAI call per image shared by tag() and moderate(), which errors switch,
 * and what the Trust Engine and the public screens make of fallback answers. Offline: Cloudinary
 * and OpenAI are fakes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answeredByNote, perceptionCode, perceptionCodeBlock } from "@/lib/ai/perception-copy";
import { MODERATION_QUESTIONS, screenState } from "@/lib/ai/questions";
import { TAXONOMY } from "@/lib/ai/taxonomy";
import { assets } from "@/lib/db/schema";
import { runPipeline } from "@/lib/pipeline/runner";
import type { AnalysisProvider, ModerationQuestion, TaxonomyEntry } from "@/lib/providers/analysis";
import { AnalysisWithFallback, FALLBACK_PROVIDER_ID, isAiVisionQuotaError, type AiVisionMode, type VisionLabeler } from "@/lib/providers/analysis/fallback";
import { ProviderHttpError } from "@/lib/providers/http";
import { analysisPathLabel } from "@/lib/services-check";
import { createTestContext, type TestContext } from "./helpers";

const QUOTA_BODY = JSON.stringify({ error: { message: "Monthly AI Vision token quota exceeded", code: "MA_00008" } });
const quotaError = (model = "ai_vision_tagging") => new ProviderHttpError("cloudinary", `analyze:${model}`, 429, QUOTA_BODY, false);

/** A Cloudinary stand-in: tag/moderate answer or throw what `fail` returns; counts every call. */
function fakeCloudinary(o: { fail?: () => Error | null; watermark?: boolean; delayMs?: number } = {}) {
  const calls = { tag: 0, moderate: 0, watermark: 0 };
  const wait = () => new Promise((r) => setTimeout(r, o.delayMs ?? 0));
  const provider: AnalysisProvider = {
    kind: "real",
    id: "cloudinary-analyze",
    async tag(_id, taxonomy) {
      calls.tag++;
      await wait();
      const e = o.fail?.();
      if (e) throw e;
      return taxonomy.slice(0, 1).map((t) => t.name);
    },
    async moderate(_id, questions) {
      calls.moderate++;
      await wait();
      const e = o.fail?.();
      if (e) throw e;
      return Object.fromEntries(questions.map((q) => [q.id, false]));
    },
    async detectWatermark() {
      calls.watermark++;
      return o.watermark ?? false;
    },
  };
  return { provider, calls };
}

/** An OpenAI stand-in: the labels it returns, every call recorded. */
function fakeLabeler(labels: (taxonomy: TaxonomyEntry[], questions: ModerationQuestion[]) => { tags: string[]; answers: Record<string, boolean> }) {
  const calls: Array<{ url: string; taxonomy: string[]; questions: string[] }> = [];
  const labeler: VisionLabeler = async (url, taxonomy, questions) => {
    calls.push({ url, taxonomy: taxonomy.map((t) => t.name), questions: questions.map((q) => q.id) });
    await new Promise((r) => setTimeout(r, 5));
    return labels(taxonomy, questions);
  };
  return { labeler, calls };
}

const clean = (_t: TaxonomyEntry[], questions: ModerationQuestion[]) => ({ tags: ["litter_or_waste", "not_a_real_tag"], answers: Object.fromEntries(questions.map((q) => [q.id, false])) });

function build(mode: AiVisionMode, cld: ReturnType<typeof fakeCloudinary>, lab: ReturnType<typeof fakeLabeler>) {
  const logs: string[] = [];
  const p = new AnalysisWithFallback(cld.provider, lab.labeler, mode, {
    sourceUrl: (id) => `https://res.cloudinary.com/demo/image/authenticated/s--sig--/c_limit,w_1600,h_1600/v1/${id}`,
    taxonomy: TAXONOMY,
    questions: MODERATION_QUESTIONS,
    log: (m) => void logs.push(m),
  });
  return { p, logs };
}

/** What the analyze step does: the three calls in parallel. */
const analyzeLike = (p: AnalysisProvider, id: string) => Promise.all([p.tag(id, TAXONOMY), p.moderate(id, MODERATION_QUESTIONS), p.detectWatermark(id)]);

describe("isAiVisionQuotaError", () => {
  it("only Cloudinary's 429 with code MA_00008", () => {
    expect(isAiVisionQuotaError(quotaError())).toBe(true);
    expect(isAiVisionQuotaError(new ProviderHttpError("cloudinary", "analyze:ai_vision_tagging", 429, '{"error":{"message":"Rate limit"}}', true))).toBe(false);
    expect(isAiVisionQuotaError(new ProviderHttpError("cloudinary", "analyze:ai_vision_tagging", 400, '{"error":{"code":"MA_00003"}}', false))).toBe(false);
    expect(isAiVisionQuotaError(new ProviderHttpError("openai", "describe_photo", 429, QUOTA_BODY, false))).toBe(false);
    expect(isAiVisionQuotaError(new Error("MA_00008"))).toBe(false);
  });
});

describe("CLD_AI_VISION=on: Cloudinary only", () => {
  it("throws the quota error and never calls OpenAI", async () => {
    const cld = fakeCloudinary({ fail: () => quotaError() });
    const lab = fakeLabeler(clean);
    const { p, logs } = build("on", cld, lab);
    await expect(p.tag("saakshi/a", TAXONOMY)).rejects.toThrow(/MA_00008/);
    await expect(p.moderate("saakshi/a", MODERATION_QUESTIONS)).rejects.toThrow(/MA_00008/);
    expect(lab.calls).toHaveLength(0);
    expect(logs).toHaveLength(0);
    expect(p.activePath).toBe("cloudinary");
    expect(p.id).toBe("cloudinary-analyze");
  });
});

describe("CLD_AI_VISION=off: OpenAI for tags and moderation", () => {
  it("never calls Cloudinary AI Vision; watermark detection stays on Cloudinary", async () => {
    const cld = fakeCloudinary({ watermark: true });
    const lab = fakeLabeler(clean);
    const { p } = build("off", cld, lab);
    const [tags, answers, watermark] = await analyzeLike(p, "saakshi/a");
    expect(tags).toEqual(["litter_or_waste"]); // the unknown name is dropped
    expect(answers).toEqual(Object.fromEntries(MODERATION_QUESTIONS.map((q) => [q.id, false])));
    expect(watermark).toBe(true);
    expect(cld.calls).toEqual({ tag: 0, moderate: 0, watermark: 1 });
    expect(p.id).toBe(FALLBACK_PROVIDER_ID);
    expect(p.providerFor("saakshi/a")).toBe(FALLBACK_PROVIDER_ID);
    expect(p.activePath).toBe("openai-fallback");
  });

  it("tag() and moderate() in parallel share ONE OpenAI call: the signed analysis copy, every tag and question", async () => {
    const lab = fakeLabeler(clean);
    const { p } = build("off", fakeCloudinary(), lab);
    await analyzeLike(p, "saakshi/a");
    expect(lab.calls).toHaveLength(1);
    expect(lab.calls[0]).toEqual({
      url: "https://res.cloudinary.com/demo/image/authenticated/s--sig--/c_limit,w_1600,h_1600/v1/saakshi/a",
      taxonomy: TAXONOMY.map((t) => t.name),
      questions: MODERATION_QUESTIONS.map((q) => q.id),
    });
    await analyzeLike(p, "saakshi/b");
    expect(lab.calls).toHaveLength(2); // one per image
  });

  it("a missing or non-true answer is false; a tag outside the requested list is dropped", async () => {
    const lab = fakeLabeler(() => ({ tags: ["litter_or_waste", "saplings"], answers: { unsafe_content: true } }));
    const { p } = build("off", fakeCloudinary(), lab);
    expect(await p.tag("saakshi/a", TAXONOMY.filter((t) => t.name === "litter_or_waste"))).toEqual(["litter_or_waste"]);
    const answers = await p.moderate("saakshi/a", MODERATION_QUESTIONS);
    expect(answers.unsafe_content).toBe(true);
    expect(answers.watermark_or_stock).toBe(false);
    expect(Object.keys(answers)).toEqual(MODERATION_QUESTIONS.map((q) => q.id));
  });

  it("keeps a result for a minute, then asks again", async () => {
    let now = 0;
    const lab = fakeLabeler(clean);
    const p = new AnalysisWithFallback(fakeCloudinary().provider, lab.labeler, "off", { sourceUrl: (id) => id, taxonomy: TAXONOMY, questions: MODERATION_QUESTIONS, now: () => now });
    await p.tag("saakshi/a", TAXONOMY);
    now = 59_000;
    await p.moderate("saakshi/a", MODERATION_QUESTIONS);
    expect(lab.calls).toHaveLength(1);
    now = 61_000;
    await p.tag("saakshi/a", TAXONOMY);
    expect(lab.calls).toHaveLength(2);
  });
});

describe("CLD_AI_VISION=auto", () => {
  it("Cloudinary while it answers; no OpenAI call", async () => {
    const cld = fakeCloudinary();
    const lab = fakeLabeler(clean);
    const { p } = build("auto", cld, lab);
    await analyzeLike(p, "saakshi/a");
    expect(cld.calls).toEqual({ tag: 1, moderate: 1, watermark: 1 });
    expect(lab.calls).toHaveLength(0);
    expect(p.providerFor("saakshi/a")).toBe("cloudinary-analyze");
    expect(p.activePath).toBe("cloudinary");
  });

  it("after 429 MA_00008: OpenAI for the rest of the process, logged once, one call per image", async () => {
    const cld = fakeCloudinary({ fail: () => quotaError(), watermark: false, delayMs: 2 });
    const lab = fakeLabeler(clean);
    const { p, logs } = build("auto", cld, lab);

    // Both Cloudinary calls hit the quota error at slightly different times: still ONE OpenAI call.
    const [tags, answers] = await analyzeLike(p, "saakshi/a");
    expect(tags).toEqual(["litter_or_waste"]);
    expect(answers.watermark_or_stock).toBe(false);
    expect(lab.calls).toHaveLength(1);
    expect(cld.calls).toEqual({ tag: 1, moderate: 1, watermark: 1 });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/MA_00008.*OpenAI vision for the rest of this process.*Watermark detection stays on Cloudinary/);
    expect(p.activePath).toBe("openai-fallback");
    expect(p.providerFor("saakshi/a")).toBe(FALLBACK_PROVIDER_ID);

    // Memoised: the next image goes straight to OpenAI; Cloudinary only sees the watermark check.
    await analyzeLike(p, "saakshi/b");
    expect(cld.calls).toEqual({ tag: 1, moderate: 1, watermark: 2 });
    expect(lab.calls).toHaveLength(2);
    expect(logs).toHaveLength(1);
    expect(p.providerFor("saakshi/b")).toBe(FALLBACK_PROVIDER_ID);
  });

  it("any other Cloudinary error is thrown as before and doesn't switch", async () => {
    for (const err of [
      new ProviderHttpError("cloudinary", "analyze:ai_vision_tagging", 400, '{"error":{"message":"Invalid tag name","code":"MA_00003"}}', false),
      new ProviderHttpError("cloudinary", "analyze:ai_vision_tagging", 429, '{"error":{"message":"Rate limit exceeded"}}', true),
      new ProviderHttpError("cloudinary", "analyze:ai_vision_tagging", 503, "unavailable", true),
      new Error("network down"),
    ]) {
      const cld = fakeCloudinary({ fail: () => err });
      const lab = fakeLabeler(clean);
      const { p, logs } = build("auto", cld, lab);
      await expect(p.tag("saakshi/a", TAXONOMY)).rejects.toBe(err);
      await expect(p.moderate("saakshi/a", MODERATION_QUESTIONS)).rejects.toBe(err);
      expect(lab.calls).toHaveLength(0);
      expect(logs).toHaveLength(0);
      expect(p.activePath).toBe("cloudinary");
    }
  });

  it("an OpenAI failure in the fallback is the step's error (it retries like any step)", async () => {
    const cld = fakeCloudinary({ fail: () => quotaError() });
    const boom = new ProviderHttpError("openai", "vision_fallback", 429, '{"error":{"code":"insufficient_quota"}}', false);
    const { p } = build("auto", cld, { labeler: async () => Promise.reject(boom), calls: [] });
    await expect(p.tag("saakshi/a", TAXONOMY)).rejects.toBe(boom);
    expect(p.providerFor("saakshi/a")).toBe("cloudinary-analyze"); // nothing answered
  });
});

describe("what the pages say answered", () => {
  it("the evidence page names the service from the photo's provenance", () => {
    expect(answeredByNote(FALLBACK_PROVIDER_ID)).toMatch(/^Tags and moderation by OpenAI vision.*the watermark check by Cloudinary\.$/);
    expect(answeredByNote("cloudinary-analyze")).toBe("Tags, moderation and the watermark check by Cloudinary AI.");
    expect(answeredByNote("mock-keywords")).toBeNull();
    expect(answeredByNote(undefined)).toBeNull();
  });

  it("How it works and the landing follow CLD_AI_VISION", () => {
    expect(perceptionCode("on")).toBe("analyze/ai_vision_tagging, ai_vision_moderation, watermark_detection");
    expect(perceptionCode("auto")).toMatch(/OpenAI vision for tags and moderation once the AI Vision quota runs out/);
    expect(perceptionCode("off")).toMatch(/^OpenAI vision: tags \+ moderation in one call; analyze\/watermark_detection$/);
    expect(perceptionCodeBlock("on")).not.toMatch(/OpenAI/);
    expect(perceptionCodeBlock("auto")).toMatch(/quota used up: OpenAI vision/);
    expect(perceptionCodeBlock("off")).not.toMatch(/ai_vision_/);
    expect(perceptionCodeBlock("off")).toMatch(/watermark_detection/);
  });
});

describe("analysisPathLabel (services:check)", () => {
  it("says which service answers", () => {
    expect(analysisPathLabel("auto", { fallbackReady: true, quotaUsedUp: false })).toMatch(/^auto: Cloudinary AI Vision, OpenAI vision fallback if its quota runs out/);
    expect(analysisPathLabel("auto", { fallbackReady: true, quotaUsedUp: true })).toMatch(/quota is used up, so the OpenAI vision fallback answers/);
    expect(analysisPathLabel("off", { fallbackReady: true, quotaUsedUp: false })).toMatch(/OpenAI vision fallback only/);
    expect(analysisPathLabel("on", { fallbackReady: false, quotaUsedUp: true })).toMatch(/Cloudinary AI Vision only \(CLD_AI_VISION=on\)/);
    expect(analysisPathLabel("auto", { fallbackReady: false, quotaUsedUp: false })).toMatch(/the fallback needs OpenAI/);
  });
});

// ---------------------------------------------------------------------------------------------
// Through the pipeline: answers from the fallback, the watermark check from Cloudinary.

describe("pipeline with the fallback answering", () => {
  let ctx: TestContext;
  const fixture = readFileSync(path.join(__dirname, "fixtures", "geotagged.jpg"));

  beforeAll(async () => {
    ctx = await createTestContext();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  async function run(watermark: boolean, filename: string, labels = clean) {
    const cld = fakeCloudinary({ fail: () => quotaError(), watermark });
    const lab = fakeLabeler(labels);
    const { p } = build("auto", cld, lab);
    const up = await ctx.media.upload({ file: fixture, folder: "saakshi/test", context: { filename } });
    const [row] = await ctx.db
      .insert(assets)
      .values({ source: "upload", cldPublicId: up.publicId, cldAssetId: up.assetId, etag: up.etag, phash: up.phash, width: up.width, height: up.height, pipeline: { ingest: { mediaMetadata: up.mediaMetadata }, steps: {} } })
      .returning();
    await runPipeline({ ...ctx.deps, analysis: p }, row.id);
    const [done] = await ctx.db.select().from(assets).where(eq(assets.id, row.id));
    return { done, lab };
  }

  it("the planted stock photo is still flagged: Cloudinary's watermark check and the fallback's answer agree", async () => {
    const sees = (t: TaxonomyEntry[], q: ModerationQuestion[]) => ({ ...clean(t, q), answers: { ...clean(t, q).answers, watermark_or_stock: true } });
    const { done, lab } = await run(true, "stock-photo.jpg", sees);
    expect(lab.calls).toHaveLength(1);
    expect(done.watermark).toBe(true);
    expect(done.moderation?.answers?.watermark_or_stock).toBe(true);
    expect(done.provenance.analysis).toEqual({ mode: "real", provider: FALLBACK_PROVIDER_ID });
    expect(done.pipeline.steps.analyze?.output).toMatchObject({ provider: FALLBACK_PROVIDER_ID, watermark: true });
    const stock = done.trustReasons?.find((r) => r.code === "STOCK_SUSPECTED");
    expect(stock).toMatchObject({ kind: "hard" });
    expect(done.trustBand).toBe("FLAGGED");
  });

  it("the watermark detector alone (clean fallback answers): a person looks, no hard flag", async () => {
    const { done } = await run(true, "river-bank.jpg");
    expect(done.watermark).toBe(true);
    expect(done.trustReasons?.find((r) => r.code === "WATERMARK_UNCONFIRMED")).toMatchObject({ kind: "review", detail: { watermark: true, branding: false } });
    expect(done.trustReasons?.some((r) => r.code === "STOCK_SUSPECTED")).toBe(false);
    // (The fixture file is reused across these tests, so uniqueness may flag it; authenticity must not.)
    expect(done.trustReasons?.filter((r) => r.signal === "authenticity" && r.kind === "hard")).toEqual([]);
  });

  it("clean fallback answers: fit for the public screens, tags stored", async () => {
    const { done } = await run(false, "gate-litter.jpg");
    expect(done.cldTags).toEqual(["litter_or_waste"]);
    expect(done.moderation?.answers).toEqual(Object.fromEntries(MODERATION_QUESTIONS.map((q) => [q.id, false])));
    expect(done.moderation?.answers?.unsafe_content).toBe(false);
    expect(screenState(done)).toBe("fit");
    expect(done.trustReasons?.some((r) => r.code === "STOCK_SUSPECTED")).toBe(false);
  });
});
