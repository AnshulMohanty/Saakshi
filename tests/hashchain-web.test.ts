import { describe, expect, it } from "vitest";
import { auditLabel } from "@/lib/audit-labels";
import { append, buildChain, GENESIS_HASH, sha256Hex } from "@/lib/hashchain";
import { appendWeb, sha256HexWeb, verifyWeb } from "@/lib/hashchain-web";

const rows = [
  { id: "a", assetId: "x", actor: "pipeline", action: "pipeline.parseMetadata", detail: { lat: 11.1 }, at: "2026-09-28T04:30:00.000Z" },
  { id: "b", assetId: "x", actor: "pipeline", action: "pipeline.score", detail: { score: 85, band: "VERIFIED" }, at: "2026-09-28T04:30:01.000Z" },
  { id: "c", assetId: "x", actor: "reviewer:Asha", action: "review.approve", detail: { note: "Seen on site" }, at: "2026-09-28T05:00:00.000Z" },
];

describe("audit chain recomputed in the browser (B5.9)", () => {
  it("Web Crypto gives the same hashes as the server's node:crypto", async () => {
    expect(await sha256HexWeb("saakshi साक्षी")).toBe(sha256Hex("saakshi साक्षी"));
    for (const r of rows) expect(await appendWeb(GENESIS_HASH, r)).toBe(append(GENESIS_HASH, r));
  });

  it("verifies an intact chain and finds the first broken row", async () => {
    const chain = buildChain(rows).map(({ prevHash, hash, ...row }) => ({ row, prevHash, hash }));
    const ok = await verifyWeb(chain);
    expect(ok.brokenAt).toBeNull();
    expect(ok.hashes).toEqual(chain.map((c) => c.hash));
    const tampered = chain.map((c, i) => (i === 1 ? { ...c, row: { ...c.row, detail: { score: 95, band: "VERIFIED" } } } : c));
    expect((await verifyWeb(tampered)).brokenAt).toBe(1);
    const reordered = [chain[1], chain[0], chain[2]];
    expect((await verifyWeb(reordered)).brokenAt).toBe(0);
  });
});

describe("audit timeline labels", () => {
  it("says what each stored action means", () => {
    expect(auditLabel("pipeline.score", { score: 85, band: "VERIFIED" })).toBe("Checked by the fixed rules: 85, Verified");
    expect(auditLabel("pipeline.score", { score: 50, band: "NEEDS_REVIEW" })).toBe("Checked by the fixed rules: 50, Needs review");
    expect(auditLabel("pipeline.finalize")).toBe("Public copy made: faces blurred, link signed");
    expect(auditLabel("archive.imported")).toBe("Imported into the demo archive");
    expect(auditLabel("review.reject")).toBe("Rejected by a reviewer");
    expect(auditLabel("something.new")).toBe("something new");
  });
});
