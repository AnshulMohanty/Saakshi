import { describe, expect, it } from "vitest";
import { append, buildChain, canonicalJson, GENESIS_HASH, verify } from "@/lib/hashchain";

const rows: Record<string, unknown>[] = [
  { actor: "system", action: "asset.uploaded", assetId: "a1", detail: { bytes: 4711 }, at: "2025-03-14T04:00:00.000Z" },
  { actor: "system", action: "asset.analyzed", assetId: "a1", detail: { tags: ["litter"] }, at: "2025-03-14T04:00:01.000Z" },
  { actor: "reviewer:asha", action: "asset.approved", assetId: "a1", detail: {}, at: "2025-03-14T05:12:00.000Z" },
  { actor: "system", action: "report.generated", assetId: null, detail: { claims: 3 }, at: "2025-03-15T10:00:00.000Z" },
];

describe("canonicalJson", () => {
  it("sorts keys recursively and is insensitive to insertion order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it("serialises Dates as ISO, drops undefined members, keeps null", () => {
    expect(canonicalJson({ at: new Date("2025-03-14T04:00:00Z"), gone: undefined, none: null })).toBe(
      '{"at":"2025-03-14T04:00:00.000Z","none":null}',
    );
  });

  it("rejects values that don't round-trip", () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ n: Infinity })).toThrow(TypeError);
    expect(() => canonicalJson({ n: 10n })).toThrow(TypeError);
  });
});

describe("hash chain", () => {
  it("links each row to the previous hash, starting from genesis", () => {
    const chain = buildChain(rows);
    expect(chain[0].prevHash).toBe(GENESIS_HASH);
    for (let i = 1; i < chain.length; i++) expect(chain[i].prevHash).toBe(chain[i - 1].hash);
    expect(chain[0].hash).toBe(append(GENESIS_HASH, rows[0]));
    expect(chain[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies an intact chain (and an empty one)", () => {
    expect(verify(buildChain(rows))).toBeNull();
    expect(verify([])).toBeNull();
  });

  it("detects an edited payload at the edited row", () => {
    const chain = buildChain(rows);
    chain[2] = { ...chain[2], actor: "reviewer:mallory" };
    expect(verify(chain)).toBe(2);
  });

  it("detects a nested detail edit", () => {
    const chain = buildChain(rows);
    chain[0] = { ...chain[0], detail: { bytes: 9999 } };
    expect(verify(chain)).toBe(0);
  });

  it("detects a recomputed hash because the next row's link breaks", () => {
    const chain = buildChain(rows);
    const { prevHash, hash: _old, ...payload } = { ...chain[1], action: "asset.rejected" };
    void _old;
    chain[1] = { ...payload, prevHash, hash: append(prevHash, payload) };
    expect(verify(chain)).toBe(2);
  });

  it("detects deleted, reordered and inserted rows", () => {
    const chain = buildChain(rows);
    expect(verify([chain[0], chain[2], chain[3]])).toBe(1);
    expect(verify([chain[1], chain[0], chain[2], chain[3]])).toBe(0);
    const forged = { ...rows[1], prevHash: chain[0].hash, hash: append(chain[0].hash, rows[1]) };
    expect(verify([chain[0], forged, chain[1]])).toBe(2);
  });

  it("supports continuing a chain from a checkpoint hash", () => {
    const first = buildChain(rows.slice(0, 2));
    const rest = buildChain(rows.slice(2), first[1].hash);
    expect(verify([...first, ...rest])).toBeNull();
    expect(verify(rest, first[1].hash)).toBeNull();
    expect(verify(rest)).toBe(0);
  });
});
