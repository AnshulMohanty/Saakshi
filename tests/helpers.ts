/** Shared test context: in-memory PGlite + mock providers on a temp media dir. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
