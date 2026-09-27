/** Shared test context: in-memory PGlite + mock providers on a temp media dir. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { openPglite } from "@/lib/db/client";
import type { PipelineDeps } from "@/lib/pipeline/steps";
import { withGuards } from "@/lib/providers/ai";
import { MockAIProvider } from "@/lib/providers/ai/mock";
import { MockAnalysisProvider } from "@/lib/providers/analysis/mock";
import { withGeocache } from "@/lib/providers/geocoder";
import { MockGeocoder } from "@/lib/providers/geocoder/mock";
import { MockMediaProvider } from "@/lib/providers/media/mock";

export interface TestContext {
  deps: PipelineDeps;
  media: MockMediaProvider;
  db: PipelineDeps["db"];
  close: () => Promise<void>;
}

export async function createTestContext(overrides: Partial<PipelineDeps> = {}): Promise<TestContext> {
  const dir = await mkdtemp(path.join(tmpdir(), "saakshi-test-"));
  const h = await openPglite();
  const media = new MockMediaProvider({ dir, baseUrl: "", signingKey: "test-key" });
  const deps: PipelineDeps = {
    db: h.db,
    media,
    analysis: new MockAnalysisProvider((id) => media.haystack(id)),
    ai: withGuards(new MockAIProvider((id) => media.haystack(id), (id) => media.contextValue(id, "burned_text"))),
    geocoder: withGeocache(new MockGeocoder(), async () => h.db),
    exifDefaultOffset: "+05:30",
    similarityThreshold: 0.45,
    ...overrides,
  };
  return {
    deps,
    media,
    db: h.db,
    close: async () => {
      await h.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A smooth synthetic "scene" (gradient + soft blobs) unique to `seed`: distinct seeds sit far
 * apart in pHash, while a light crop or re-encode of one stays within a few bits, like a photo.
 */
export async function synthScene(seed: number, width = 640, height = 480): Promise<Buffer> {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const colour = () => [rand() * 255, rand() * 255, rand() * 255];
  const [c0, c1] = [colour(), colour()];
  const angle = rand() * Math.PI * 2;
  const blobs = Array.from({ length: 5 }, () => ({ x: rand() * width, y: rand() * height, r: (0.12 + rand() * 0.25) * width, c: colour() }));
  const px = Buffer.alloc(width * height * 3);
  const diag = Math.hypot(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const g = 0.5 + ((x - width / 2) * Math.cos(angle) + (y - height / 2) * Math.sin(angle)) / diag;
      let rgb = c0.map((v, i) => v * (1 - g) + c1[i] * g);
      for (const b of blobs) {
        const w = Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * (b.r / 2) ** 2));
        rgb = rgb.map((v, i) => v * (1 - w) + b.c[i] * w);
      }
      const o = (y * width + x) * 3;
      px[o] = rgb[0];
      px[o + 1] = rgb[1];
      px[o + 2] = rgb[2];
    }
  }
  return sharp(px, { raw: { width, height, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
}
