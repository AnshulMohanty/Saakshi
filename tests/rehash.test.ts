/** media:rehash: stored fingerprints recomputed with lib/phash, audited, duplicates rebuilt; idempotent. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyAllChains } from "@/lib/audit";
import { assets, auditLog } from "@/lib/db/schema";
import { FINGERPRINT_ALGORITHM, rehashAll } from "@/lib/media/rehash";
import { phash } from "@/lib/phash";
import { runPipeline } from "@/lib/pipeline/runner";
import { createTestContext, type TestContext } from "./helpers";

describe("rehashAll", () => {
  let ctx: TestContext;
  const fixture = readFileSync(path.join(__dirname, "fixtures", "geotagged.jpg"));

  beforeAll(async () => {
    ctx = await createTestContext();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("replaces a foreign fingerprint with ours, audits it, and changes nothing on a second run", async () => {
    const up = await ctx.media.upload({ file: fixture, folder: "saakshi/test", context: { filename: "gate-litter.jpg" } });
    // As if real mode had stored Cloudinary's phash.
    const [row] = await ctx.db
      .insert(assets)
      .values({ source: "upload", cldPublicId: up.publicId, etag: up.etag, phash: "ba19c8ab5fa05a59", width: up.width, height: up.height, pipeline: { ingest: { mediaMetadata: up.mediaMetadata }, steps: {} } })
      .returning();
    await runPipeline(ctx.deps, row.id);

    const ours = await phash(await ctx.media.fetchDerived(up.publicId, []));
    const first = await rehashAll(ctx.db, ctx.media);
    expect(first).toMatchObject({ assets: 1, changed: 1, failed: 0 });
    const [after] = await ctx.db.select().from(assets).where(eq(assets.id, row.id));
    expect(after.phash).toBe(ours);
    const [audit] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.assetId, row.id), eq(auditLog.action, "asset.fingerprint_recomputed")));
    expect(audit).toMatchObject({ actor: "media:rehash", detail: { from: "ba19c8ab5fa05a59", to: ours, algorithm: FINGERPRINT_ALGORITHM } });
    expect((await verifyAllChains(ctx.db)).ok).toBe(true);

    expect(await rehashAll(ctx.db, ctx.media)).toMatchObject({ changed: 0, failed: 0 });
  });
});
