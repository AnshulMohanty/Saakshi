import { describe, expect, it, vi } from "vitest";
import { validateProse } from "@/lib/claims";
import { openPglite } from "@/lib/db/client";
import { buildCloudinaryUrl } from "@/lib/media/transform";
import { withGuards, type AIProvider } from "@/lib/providers/ai";
import { hashEmbedding, MockAIProvider, parseSearchQuery, publicIdFromUrl } from "@/lib/providers/ai/mock";
import { MockAnalysisProvider } from "@/lib/providers/analysis/mock";
import { withGeocache, type GeocoderProvider } from "@/lib/providers/geocoder";
import { MockGeocoder } from "@/lib/providers/geocoder/mock";
import { formatPlace } from "@/lib/providers/geocoder/real";
import { CloudinaryMediaProvider } from "@/lib/providers/media/real";
import { HandlerRegistry } from "@/lib/providers/queue";
import { InlineQueue } from "@/lib/providers/queue/mock";

const HAYSTACKS: Record<string, string> = {
  "saakshi/p/before": "saakshi p before cubbon gate litter before cleanup volunteers",
  "saakshi/p/after": "saakshi p after cubbon gate after cleanup",
  "saakshi/p/school": "saakshi p school students planting saplings at school",
  "saakshi/p/stock": "saakshi p stock shutterstock watermark",
};
const describeAsset = async (id: string) => HAYSTACKS[id] ?? id;

describe("MockAnalysisProvider", () => {
  const analysis = new MockAnalysisProvider(describeAsset);
  const taxonomy = [
    { name: "litter", description: "Visible trash, plastic or garbage" },
    { name: "saplings", description: "Newly planted trees" },
    { name: "water_point", description: "A well, pump or tap" },
  ];

  it("tags by keyword and synonym, deterministically", async () => {
    expect(await analysis.tag("saakshi/p/before", taxonomy)).toEqual(["litter"]);
    expect(await analysis.tag("saakshi/p/school", taxonomy)).toEqual(["saplings"]);
    expect(await analysis.tag("saakshi/p/after", taxonomy)).toEqual([]);
    expect(await analysis.tag("saakshi/p/before", taxonomy)).toEqual(await analysis.tag("saakshi/p/before", taxonomy));
  });

  it("treats negated words in a description as exclusions", async () => {
    const t = [{ name: "clean_space", description: "A tidy park with no visible litter or garbage" }];
    expect(await analysis.tag("saakshi/p/before", t)).toEqual([]); // mentions litter → excluded
    expect(await analysis.tag("saakshi/p/after", t)).toEqual(["clean_space"]); // after the clean-up, no litter words
  });

  it("answers moderation questions and detects watermarks", async () => {
    const qs = [
      { id: "children", text: "Are children visible?" },
      { id: "nudity", text: "Does the image contain nudity?" },
    ];
    expect(await analysis.moderate("saakshi/p/school", qs)).toEqual({ children: true, nudity: false });
    expect(await analysis.moderate("saakshi/p/before", qs)).toEqual({ children: false, nudity: false });
    expect(await analysis.detectWatermark("saakshi/p/stock")).toBe(true);
    expect(await analysis.detectWatermark("saakshi/p/before")).toBe(false);
  });
});

describe("MockAIProvider (guarded)", () => {
  const ai: AIProvider = withGuards(new MockAIProvider(describeAsset));
  const url = (id: string) => `http://localhost:3000/api/media/mock/image/upload/s--x--/w_800/v1/${id}`;

  it("describes photos deterministically, marked ai_estimated with confidence", async () => {
    const before = await ai.describePhoto(url("saakshi/p/before"));
    expect(before).toMatchObject({ activity: "cleanup", stage: "before", method: "ai_estimated", childrenVisible: false, sdgs: [11, 12, 14] });
    expect(before.confidence).toBeGreaterThanOrEqual(0.55);
    expect(before.confidence).toBeLessThan(0.9);
    for (const c of before.visibleCounts) expect(c.confidence).toBeGreaterThan(0);
    expect(() => validateProse(before.caption)).not.toThrow();
    expect(await ai.describePhoto(url("saakshi/p/before"))).toEqual(before);

    expect(await ai.describePhoto(url("saakshi/p/after"))).toMatchObject({ activity: "cleanup", stage: "after" });
    expect(await ai.describePhoto(url("saakshi/p/school"))).toMatchObject({ childrenVisible: true, activity: "plantation" });
  });

  it("extracts public ids from mock and Cloudinary URLs", () => {
    expect(publicIdFromUrl(url("saakshi/p/before"))).toBe("saakshi/p/before");
    expect(publicIdFromUrl(buildCloudinaryUrl({ cloudName: "demo", publicId: "saakshi/x/y", transforms: [{ width: 5 }], apiSecret: "s" }))).toBe(
      "saakshi/x/y",
    );
    expect(publicIdFromUrl("/api/media/mock/image/upload/s--x--/w_5/v1/saakshi/rel")).toBe("saakshi/rel");
    expect(publicIdFromUrl("not a url")).toBe("not a url");
  });

  it("writes placeholder-only prose that passes validation, even with numeric labels", async () => {
    const claims = [
      { id: "bags", label: "Bags removed in 2025" },
      { id: "spots", label: "Twelve spots cleaned" },
    ];
    const text = await ai.writeWithPlaceholders("Summarise the drive in 3 sentences", claims);
    expect(text).toContain("{{claim:bags}}");
    expect(text).toContain("{{claim:spots}}");
    expect(() => validateProse(text, { claimIds: ["bags", "spots"] })).not.toThrow();
  });

  it("rejects provider output that breaks the rules", async () => {
    const leaky: AIProvider = {
      kind: "mock",
      models: { vision: "leaky", text: "leaky", embed: "leaky" },
      describePhoto: async () => ({ ...(await new MockAIProvider(describeAsset).describePhoto("x")), caption: "About 40 bags of litter." }),
      writeWithPlaceholders: async () => "We removed 1,240 bags.",
      parseSearch: async () => ({ semantic: "", filters: {} }) as never,
      embed: async () => [1, 2, 3],
    };
    const guarded = withGuards(leaky);
    await expect(guarded.describePhoto("x")).rejects.toThrow(/claim/);
    await expect(guarded.writeWithPlaceholders("", [])).rejects.toThrow(/claim/);
    await expect(guarded.parseSearch("")).rejects.toThrow();
    await expect(guarded.embed("")).rejects.toThrow(/1536/);
  });

  it("parses search queries into semantic text + filters", () => {
    expect(parseSearchQuery("high trust litter photos in March 2025")).toEqual({
      semantic: "litter",
      filters: { project: null, band: "VERIFIED", source: null, activity: null, from: "2025-03-01", to: "2025-03-31" },
      rewrites: [],
    });
    expect(parseSearchQuery("witness saplings since 2024-06-01 before 2025")).toMatchObject({
      semantic: "saplings",
      filters: { source: "witness", from: "2024-06-01", to: "2024-12-31" },
    });
    expect(parseSearchQuery("flagged uploads in 2024").filters).toMatchObject({ band: "FLAGGED", source: "upload", from: "2024-01-01", to: "2024-12-31" });
    expect(parseSearchQuery("project 3f2a1b4c-0000-4000-8000-000000000001 river bank").filters.project).toBe("3f2a1b4c-0000-4000-8000-000000000001");
    expect(parseSearchQuery("project:demo-hero-cleanup litter")).toMatchObject({ semantic: "litter", filters: { project: "demo-hero-cleanup" } });
  });

  it("embeds deterministically into unit vectors where shared words mean closer vectors", async () => {
    const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    const a = await ai.embed("plastic bottles on the river bank");
    const b = await ai.embed("river bank covered with plastic bottle litter");
    const c = await ai.embed("students planting saplings at school");
    expect(a).toHaveLength(1536);
    expect(Math.hypot(...a)).toBeCloseTo(1, 10);
    expect(await ai.embed("plastic bottles on the river bank")).toEqual(a);
    expect(cos(a, b)).toBeGreaterThan(cos(a, c) + 0.3);
    expect(Math.hypot(...hashEmbedding(""))).toBeCloseTo(1, 10);
  });
});

describe("geocoder", () => {
  it("mock names the nearest city", async () => {
    const g = new MockGeocoder();
    expect(await g.reverse(12.9763, 77.5929)).toBe("Bengaluru, Karnataka, India");
    expect(await g.reverse(13.35, 77.1)).toBe("Near Bengaluru, Karnataka, India");
    expect(await g.reverse(-33.87, 151.21)).toBeNull();
  });

  it("caches results by 3 dp key (including 'no place') and doesn't cache failures", async () => {
    const h = await openPglite();
    try {
      const inner: GeocoderProvider = { kind: "mock", reverse: vi.fn(async () => "Cubbon Park, Bengaluru") };
      const g = withGeocache(inner, async () => h.db);
      expect(await g.reverse(12.97631, 77.59291)).toBe("Cubbon Park, Bengaluru");
      expect(await g.reverse(12.97634, 77.59288)).toBe("Cubbon Park, Bengaluru"); // same key
      expect(inner.reverse).toHaveBeenCalledTimes(1);

      const nowhere: GeocoderProvider = { kind: "mock", reverse: vi.fn(async () => null) };
      const none = withGeocache(nowhere, async () => h.db);
      expect(await none.reverse(0.5, 0.5)).toBeNull();
      expect(await none.reverse(0.5, 0.5)).toBeNull();
      expect(nowhere.reverse).toHaveBeenCalledTimes(1); // "no place" is cached too

      const flaky = { kind: "real" as const, reverse: vi.fn(async (): Promise<string | null> => Promise.reject(new Error("HTTP 429"))) };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const g2 = withGeocache(flaky, async () => h.db);
      expect(await g2.reverse(20.1, 80.1)).toBeNull();
      expect(await g2.reverse(20.1, 80.1)).toBeNull();
      expect(flaky.reverse).toHaveBeenCalledTimes(2);
      warn.mockRestore();

      expect(await g.reverse(Number.NaN, 0)).toBeNull();
    } finally {
      await h.close();
    }
  });

  it("formats Nominatim addresses", () => {
    expect(
      formatPlace({ address: { park: "Cubbon Park", suburb: "Sampangi Rama Nagara", city: "Bengaluru", state: "Karnataka", country: "India" } }),
    ).toBe("Cubbon Park, Bengaluru, Karnataka, India");
    expect(formatPlace({ error: "Unable to geocode" })).toBeNull();
    expect(formatPlace({ display_name: "Somewhere" })).toBe("Somewhere");
  });
});

describe("queue", () => {
  it("inline runner calls registered handlers in order, and unsubscribes", async () => {
    const registry = new HandlerRegistry();
    const calls: string[] = [];
    registry.on("asset.uploaded", async ({ assetId }) => void calls.push(`a:${assetId}`));
    const off = registry.on("asset.uploaded", async ({ assetId }) => void calls.push(`b:${assetId}`));
    const q = new InlineQueue(registry);
    await q.send("asset.uploaded", { assetId: "1" });
    await q.drain();
    off();
    await q.send("asset.uploaded", { assetId: "2" });
    await q.drain();
    expect(calls).toEqual(["a:1", "b:1", "a:2"]);
  });

  it("returns from send immediately, caps concurrency at 4, and drain waits for everything", async () => {
    const registry = new HandlerRegistry();
    let running = 0;
    let peak = 0;
    const done: string[] = [];
    registry.on("asset.uploaded", async ({ assetId }) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 15));
      running--;
      done.push(assetId);
    });
    const q = new InlineQueue(registry, { concurrency: 4 });
    for (let i = 0; i < 10; i++) await q.send("asset.uploaded", { assetId: String(i) });
    expect(done).toHaveLength(0); // nothing awaited yet
    await q.drain();
    expect(done).toHaveLength(10);
    expect(peak).toBe(4);
  });

  it("keeps going when a handler throws (errors are reported, not raised)", async () => {
    const registry = new HandlerRegistry();
    const errors: string[] = [];
    registry.on("asset.uploaded", async ({ assetId }) => {
      if (assetId === "bad") throw new Error("boom");
    });
    const q = new InlineQueue(registry, { onError: (_e, err) => errors.push((err as Error).message) });
    await q.send("asset.uploaded", { assetId: "bad" });
    await q.send("asset.uploaded", { assetId: "ok" });
    await expect(q.drain()).resolves.toBeUndefined();
    expect(errors).toEqual(["boom"]);
  });
});

describe("real providers", () => {
  it("Cloudinary URLs are built by lib/media/transform; evidence is always signed, QR codes are public", () => {
    const cld = new CloudinaryMediaProvider({ cloudName: "demo", apiKey: "k", apiSecret: "s" });
    const t = [{ width: 400 }, { effect: "blur_faces" as const }];
    const signed = buildCloudinaryUrl({ cloudName: "demo", publicId: "saakshi/a", transforms: t, apiSecret: "s", deliveryType: "authenticated" });
    expect(cld.url("saakshi/a", t, { signed: true })).toBe(signed);
    expect(cld.url("saakshi/a", t)).toBe(signed); // an unsigned evidence URL would not be served anyway
    expect(cld.url("saakshi/qr/a", t)).toBe("https://res.cloudinary.com/demo/image/upload/w_400/e_blur_faces/v1/saakshi/qr/a");
    const priv = new CloudinaryMediaProvider({ cloudName: "demo", apiKey: "k", apiSecret: "s", deliveryType: "private" });
    expect(priv.url("saakshi/a", t)).toContain("/image/private/s--");
  });
});
