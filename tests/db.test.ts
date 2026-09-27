import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAudit, chainRows, verifyAllChains, verifyChain, verifySystem } from "@/lib/audit";
import { runDataMigrations } from "@/lib/db/data-migrations";
import { append, GENESIS_HASH } from "@/lib/hashchain";
import { openPglite } from "@/lib/db/client";
import { assets, auditLog, dataMigrations, geocache, projects, spots } from "@/lib/db/schema";
import { searchAssets } from "@/lib/db/search";

type Handle = Awaited<ReturnType<typeof openPglite>>;
let h: Handle;

beforeAll(async () => {
  h = await openPglite(); // in-memory, migrations applied
}, 60_000);
afterAll(async () => {
  await h?.close();
});

/** Unit vector mixing basis directions, e.g. basis([0, 1]) = (e0 + e1)/√2. */
function basis(dims: number[]): number[] {
  const v = new Array(1536).fill(0);
  for (const d of dims) v[d] = 1 / Math.sqrt(dims.length);
  return v;
}

describe("migrations", () => {
  it("installs pgvector and creates every table", async () => {
    const ext = await h.client.query<{ extversion: string }>(`select extversion from pg_extension where extname = 'vector'`);
    expect(ext.rows).toHaveLength(1);
    const tables = await h.client.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public' order by 1`);
    expect(tables.rows.map((r) => r.tablename)).toEqual([
      "assets", "audit_log", "capture_tokens", "comparisons", "data_migrations", "duplicates", "geocache", "projects", "reports", "spots", "upload_tickets",
    ]);
  });

  it("is idempotent", async () => {
    const [{ drizzle }, { migrate }] = await Promise.all([import("drizzle-orm/pglite"), import("drizzle-orm/pglite/migrator")]);
    await expect(migrate(drizzle({ client: h.client }), { migrationsFolder: "drizzle" })).resolves.not.toThrow();
  });
});

describe("schema", () => {
  let projectId: string;
  beforeAll(async () => {
    const [p] = await h.db.insert(projects).values({ name: "Cubbon Park cleanup", type: "cleanup", sdgs: [11, 12] }).returning();
    projectId = p.id;
  });

  it("applies defaults and supports the spot ⇄ baseline asset cycle", async () => {
    const [p] = await h.db.select().from(projects).where(eq(projects.id, projectId));
    expect(p.minPairGapHours).toBe(24);
    expect(p.sdgs).toEqual([11, 12]);

    const [spot] = await h.db.insert(spots).values({ projectId, name: "Gate 2", lat: 12.9763, lng: 77.5929 }).returning();
    expect(spot.radiusM).toBe(30);
    const [asset] = await h.db
      .insert(assets)
      .values({ projectId, spotId: spot.id, source: "upload", cldPublicId: "saakshi/test/baseline" })
      .returning();
    expect(asset.status).toBe("processing");
    expect(asset.transforms).toEqual([]);
    expect(asset.cldTags).toEqual([]);
    await h.db.update(spots).set({ baselineAssetId: asset.id }).where(eq(spots.id, spot.id));
    const [updated] = await h.db.select().from(spots).where(eq(spots.id, spot.id));
    expect(updated.baselineAssetId).toBe(asset.id);
  });

  it("enforces unique public ids and geocache keys", async () => {
    await expect(h.db.insert(assets).values({ source: "upload", cldPublicId: "saakshi/test/baseline" })).rejects.toThrow();
    await h.db.insert(geocache).values({ key: "12.976,77.593", placeName: "Cubbon Park" });
    await expect(h.db.insert(geocache).values({ key: "12.976,77.593", placeName: "dup" })).rejects.toThrow();
  });
});

describe("searchAssets", () => {
  let projectId: string;
  beforeAll(async () => {
    const [p] = await h.db.insert(projects).values({ name: "Search project", type: "plantation" }).returning();
    projectId = p.id;
    await h.db.insert(assets).values([
      { projectId, source: "witness", cldPublicId: "s/near", trustBand: "high", capturedAt: new Date("2025-03-01T10:00:00Z"), embedding: basis([0]) },
      { projectId, source: "upload", cldPublicId: "s/mid", trustBand: "medium", capturedAt: new Date("2025-03-10T10:00:00Z"), embedding: basis([0, 1]) },
      { projectId, source: "archive", cldPublicId: "s/far", trustBand: "high", capturedAt: new Date("2025-04-01T10:00:00Z"), embedding: basis([7]) },
      { projectId, source: "upload", cldPublicId: "s/none", trustBand: "low", capturedAt: new Date("2025-05-01T10:00:00Z") },
    ]);
  });

  const ids = (rows: Awaited<ReturnType<typeof searchAssets>>) => rows.map((r) => r.asset.cldPublicId);

  it("ranks by cosine distance and skips assets without embeddings", async () => {
    const rows = await searchAssets(h.db, { embedding: basis([0]), filters: { projectId } });
    expect(ids(rows)).toEqual(["s/near", "s/mid", "s/far"]);
    expect(rows[0].distance).toBeCloseTo(0, 6);
    expect(rows[1].distance).toBeCloseTo(1 - Math.SQRT1_2, 6);
    expect(rows[2].distance).toBeCloseTo(1, 6);
    expect(rows[0].asset).not.toHaveProperty("embedding");
  });

  it("combines filters with semantic ranking", async () => {
    expect(ids(await searchAssets(h.db, { embedding: basis([0]), filters: { projectId, band: "high" } }))).toEqual(["s/near", "s/far"]);
    expect(ids(await searchAssets(h.db, { embedding: basis([0]), filters: { projectId, source: "upload" } }))).toEqual(["s/mid"]);
    expect(
      ids(await searchAssets(h.db, { embedding: basis([7]), filters: { projectId, from: "2025-03-10", to: "2025-04-01" } })),
    ).toEqual(["s/far", "s/mid"]);
    expect(ids(await searchAssets(h.db, { embedding: basis([0]), filters: { projectId }, limit: 1 }))).toEqual(["s/near"]);
  });

  it("falls back to newest-first without an embedding", async () => {
    expect(ids(await searchAssets(h.db, { filters: { projectId } }))).toEqual(["s/none", "s/far", "s/mid", "s/near"]);
  });

  it("rejects embeddings of the wrong size", async () => {
    await expect(searchAssets(h.db, { embedding: [1, 0, 0] })).rejects.toThrow(RangeError);
  });

  it("can use the HNSW index", async () => {
    await h.client.exec("set enable_seqscan = off");
    const plan = await h.client.query<{ "QUERY PLAN": string }>(
      `explain select id from assets order by embedding <=> '[${basis([0]).join(",")}]' limit 5`,
    );
    await h.client.exec("reset enable_seqscan");
    expect(plan.rows.map((r) => r["QUERY PLAN"]).join("\n")).toMatch(/assets_embedding_hnsw_idx/);
  });
});

describe("audit log (one chain per asset + a system chain)", () => {
  async function newAsset(name: string) {
    const [a] = await h.db.insert(assets).values({ source: "upload", cldPublicId: `saakshi/test/${name}` }).returning();
    return a.id;
  }

  it("links each row to the previous row of the same asset, and keeps chains independent", async () => {
    const a = await newAsset("audit-a");
    const b = await newAsset("audit-b");
    const a1 = await appendAudit(h.db, { assetId: a, actor: "system", action: "asset.uploaded", detail: { bytes: 4711 } });
    const b1 = await appendAudit(h.db, { assetId: b, actor: "system", action: "asset.uploaded" });
    const a2 = await appendAudit(h.db, { assetId: a, actor: "system", action: "asset.analyzed", detail: { nested: { b: 2, a: 1 } } });
    const s1 = await appendAudit(h.db, { actor: "reviewer:asha", action: "system.note" });
    expect(a2.prevHash).toBe(a1.hash); // not b1, which was appended in between
    expect(b1.prevHash).toBe(GENESIS_HASH);
    expect(s1.prevHash).toBe(GENESIS_HASH);
    expect(await verifyChain(h.db, a)).toMatchObject({ intact: true, entries: 2, firstBrokenAt: null });
    expect(await verifySystem(h.db)).toMatchObject({ intact: true, entries: 1 });
  });

  it("detects an edited or deleted middle row in one chain and leaves other chains intact", async () => {
    const a = await newAsset("audit-c");
    const b = await newAsset("audit-d");
    const first = await appendAudit(h.db, { assetId: a, actor: "system", action: "step.1", detail: { bytes: 4711, tags: ["x"] } });
    const second = await appendAudit(h.db, { assetId: a, actor: "system", action: "step.2" });
    await appendAudit(h.db, { assetId: a, actor: "system", action: "step.3" });
    await appendAudit(h.db, { assetId: b, actor: "system", action: "step.1" });

    await h.db.execute(sql`update audit_log set detail = '{"bytes": 1}'::jsonb where id = ${first.id}`);
    const broken = await verifyChain(h.db, a);
    expect(broken).toMatchObject({ intact: false, firstBrokenAt: 0 });
    expect(broken.brokenRow?.id).toBe(first.id);
    expect((await verifyChain(h.db, b)).intact).toBe(true);
    const all = await verifyAllChains(h.db);
    expect(all.ok).toBe(false);
    expect(all.broken).toEqual([{ assetId: a, firstBrokenAt: 0 }]);

    await h.db.update(auditLog).set({ detail: { bytes: 4711, tags: ["x"] } }).where(eq(auditLog.id, first.id));
    expect((await verifyChain(h.db, a)).intact).toBe(true);

    await h.db.delete(auditLog).where(eq(auditLog.id, second.id));
    expect(await verifyChain(h.db, a)).toMatchObject({ intact: false, firstBrokenAt: 1 });
    expect((await verifyChain(h.db, b)).intact).toBe(true);
  });

  it("deleting an asset removes its whole chain and every other chain stays valid", async () => {
    const gone = await newAsset("audit-gone");
    const kept = await newAsset("audit-kept");
    for (const n of [1, 2, 3]) await appendAudit(h.db, { assetId: gone, actor: "system", action: `step.${n}` });
    await appendAudit(h.db, { assetId: kept, actor: "system", action: "step.1" });
    await h.db.delete(assets).where(eq(assets.id, gone));
    expect(await h.db.select().from(auditLog).where(eq(auditLog.assetId, gone))).toHaveLength(0);
    expect((await verifyChain(h.db, kept)).intact).toBe(true);
    // Earlier tests left one chain deliberately broken; everything else verifies.
    expect((await verifyAllChains(h.db)).broken.every((x) => x.assetId !== kept)).toBe(true);
  });
});

describe("data migration: global chain → per-asset chains", () => {
  it("rebuilds old-style rows once, records it on the system chain, and never runs again", async () => {
    const m = await openPglite();
    try {
      const [x] = await m.db.insert(assets).values({ source: "upload", cldPublicId: "saakshi/test/mig-x" }).returning();
      const [y] = await m.db.insert(assets).values({ source: "upload", cldPublicId: "saakshi/test/mig-y" }).returning();
      // Write rows the old way: one global chain across all assets.
      let prev = GENESIS_HASH;
      for (const [assetId, action] of [[x.id, "a"], [y.id, "b"], [x.id, "c"], [null, "d"]] as const) {
        const at = new Date(Math.floor(Date.now()));
        const p = { id: crypto.randomUUID(), assetId, actor: "old", action, detail: {}, at: at.toISOString() };
        const hash = append(prev, p);
        await m.db.insert(auditLog).values({ ...p, at, prevHash: prev, hash });
        prev = hash;
      }
      expect((await verifyChain(m.db, x.id)).intact).toBe(false); // old links cross assets
      await m.db.delete(dataMigrations).where(eq(dataMigrations.id, "0003-audit-per-asset-chains"));

      expect(await runDataMigrations(m.db)).toEqual(["0003-audit-per-asset-chains"]);
      const all = await verifyAllChains(m.db);
      expect(all).toMatchObject({ ok: true, chains: 3 });
      expect((await chainRows(m.db, null)).map((r) => r.action)).toEqual(["d", "audit.chains_rebuilt"]);

      // Once only: tampering afterwards is not "repaired" by running migrations again.
      await m.db.execute(sql`update audit_log set actor = 'mallory' where action = 'a'`);
      expect(await runDataMigrations(m.db)).toEqual([]);
      expect((await verifyChain(m.db, x.id)).intact).toBe(false);
    } finally {
      await m.close();
    }
  });
});
