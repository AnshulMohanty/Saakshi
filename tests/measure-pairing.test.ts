import { describe, expect, it } from "vitest";
import { chooseBaseline, effectiveRadius, evaluatePair, findPairs, stageScore, type PairPhoto, type PairProject, type PairSpot } from "@/lib/measure/pairing";

const CENTER = { lat: 11.1, lng: 77.3 };
const at = (m: number) => ({ lat: CENTER.lat + m / 111_195, lng: CENTER.lng });
let n = 0;
const photo = (o: Partial<PairPhoto> = {}): PairPhoto => ({
  id: `p${String(++n).padStart(2, "0")}`,
  spotId: "s1",
  location: at(0),
  capturedAt: "2024-01-10T12:45:00Z",
  band: "VERIFIED",
  status: "ready",
  stage: "unknown",
  phash: "0000000000000000",
  ...o,
});
const spot: PairSpot = { id: "s1", center: CENTER, radiusM: 30 };
const wide: PairSpot = { id: "s1", center: CENTER, radiusM: 150 };
const cleanup: PairProject = { minPairGapHours: 0.5, locationApproximate: false };
const plantation: PairProject = { minPairGapHours: 336, locationApproximate: false };
const school: PairProject = { minPairGapHours: 168, locationApproximate: false };
const opts1 = { maxRadiusM: 30, approximateMaxRadiusM: 150, perSpot: 1 };

describe("stage hints", () => {
  it("before → after beats one hint beats none; reversed hints score 0", () => {
    expect(stageScore("before", "after")).toBe(3);
    expect(stageScore("before", "unknown")).toBe(2);
    expect(stageScore("unknown", "after")).toBe(2);
    expect(stageScore(null, "unknown")).toBe(1);
    expect(stageScore("after", "before")).toBe(0);
    expect(stageScore("after", "after")).toBe(0);
  });
});

describe("evaluatePair: gap by project type", () => {
  it("accepts a same-evening clean-up pair (18:15 → 20:00 IST, gap ≥ 0.5 h)", () => {
    const c = evaluatePair(cleanup, spot, photo({ capturedAt: "2017-09-05T12:45:00Z" }), photo({ capturedAt: "2017-09-05T14:30:00Z", location: at(10) }));
    expect(c).toMatchObject({ ok: true, rejects: [], gapHours: 1.75 });
  });

  it("rejects a clean-up pair taken minutes apart (under 0.5 h)", () => {
    expect(evaluatePair(cleanup, spot, photo({ capturedAt: "2017-09-05T12:45:00Z" }), photo({ capturedAt: "2017-09-05T12:51:00Z" })).rejects).toEqual(["gap_too_short"]);
  });

  it("rejects a same-day plantation pair; accepts 14+ days", () => {
    expect(evaluatePair(plantation, spot, photo({ capturedAt: "2024-01-10T08:00:00Z" }), photo({ capturedAt: "2024-01-10T17:00:00Z" })).rejects).toEqual(["gap_too_short"]);
    expect(evaluatePair(plantation, spot, photo({ capturedAt: "2024-01-10T08:00:00Z" }), photo({ capturedAt: "2024-01-17T08:00:00Z" })).rejects).toEqual(["gap_too_short"]);
    expect(evaluatePair(plantation, spot, photo({ capturedAt: "2024-01-10T08:00:00Z" }), photo({ capturedAt: "2024-01-24T08:00:00Z" })).ok).toBe(true);
  });

  it("school needs a week", () => {
    expect(evaluatePair(school, spot, photo({ capturedAt: "2024-01-10T08:00:00Z" }), photo({ capturedAt: "2024-01-15T08:00:00Z" })).ok).toBe(false);
    expect(evaluatePair(school, spot, photo({ capturedAt: "2024-01-10T08:00:00Z" }), photo({ capturedAt: "2024-01-17T08:00:00Z" })).ok).toBe(true);
  });

  it("rejects photos taken at the same instant, even with a 0 h gap", () => {
    const stage = { ...cleanup, minPairGapHours: 0 };
    expect(evaluatePair(stage, spot, photo(), photo()).rejects).toEqual(["same_time"]);
    expect(evaluatePair(stage, spot, photo(), photo({ capturedAt: "2024-01-10T12:46:00Z" })).ok).toBe(true);
  });
});

describe("evaluatePair: the spot radius", () => {
  const later = "2024-01-10T14:00:00Z";

  it("both photos must be inside the spot (30 m by default)", () => {
    expect(evaluatePair(cleanup, spot, photo(), photo({ location: at(25), capturedAt: later })).ok).toBe(true);
    expect(evaluatePair(cleanup, spot, photo(), photo({ location: at(45), capturedAt: later })).rejects).toEqual(["outside_spot"]);
    expect(evaluatePair(cleanup, spot, photo({ location: null }), photo({ capturedAt: later })).rejects).toEqual(["outside_spot"]);
  });

  it("a 150 m spot counts only when the project is labelled approximate location", () => {
    const approx = { ...cleanup, locationApproximate: true };
    expect(effectiveRadius(cleanup, wide)).toBe(30);
    expect(effectiveRadius(approx, wide)).toBe(150);
    expect(effectiveRadius(approx, { ...wide, radiusM: 400 })).toBe(150);
    expect(evaluatePair(cleanup, wide, photo(), photo({ location: at(120), capturedAt: later })).rejects).toEqual(["outside_spot"]);
    expect(evaluatePair(approx, wide, photo(), photo({ location: at(120), capturedAt: later }))).toMatchObject({ ok: true, radiusM: 150 });
    expect(evaluatePair(approx, wide, photo(), photo({ location: at(160), capturedAt: later })).rejects).toEqual(["outside_spot"]);
  });
});

describe("findPairs", () => {
  it("never pairs across spots, and says why photos were left out (flagged excluded)", () => {
    const s2: PairSpot = { id: "s2", center: CENTER, radiusM: 30 };
    const a = photo({ spotId: "s1" });
    const b = photo({ spotId: "s2", capturedAt: "2024-01-10T18:00:00Z" });
    const noSpot = photo({ spotId: null });
    const flagged = photo({ band: "FLAGGED", status: "flagged" });
    const rejected = photo({ status: "rejected" });
    const noTime = photo({ capturedAt: null });
    const r = findPairs(cleanup, [spot, s2], [a, b, noSpot, flagged, rejected, noTime]);
    expect(r.pairs).toEqual([]);
    expect(r.candidates).toEqual([]);
    expect(Object.fromEntries(r.excluded.map((e) => [e.id, e.reasons]))).toEqual({
      [noSpot.id]: ["no_spot"],
      [flagged.id]: ["flagged"],
      [rejected.id]: ["rejected"],
      [noTime.id]: ["no_time"],
    });
  });

  it("a reviewer-approved photo may pair even though the engine flagged it", () => {
    const r = findPairs(cleanup, [spot], [photo({ band: "FLAGGED", status: "approved" }), photo({ capturedAt: "2024-01-10T18:00:00Z" })]);
    expect(r.pairs).toHaveLength(1);
  });

  it("puts the earlier photo first whatever the input order", () => {
    const early = photo({ capturedAt: "2024-01-10T08:00:00Z" });
    const late = photo({ capturedAt: "2024-01-10T12:00:00Z" });
    expect(findPairs(cleanup, [spot], [late, early]).pairs[0]).toMatchObject({ beforeId: early.id, afterId: late.id });
  });

  it("ranks by stage hints first, then distance, then pHash", () => {
    const b1 = photo({ stage: "before", capturedAt: "2024-01-10T08:00:00Z" });
    const u = photo({ stage: "unknown", capturedAt: "2024-01-10T09:00:00Z" });
    const a1 = photo({ stage: "after", capturedAt: "2024-01-10T12:00:00Z", location: at(20) });
    expect(findPairs(cleanup, [spot], [b1, u, a1], opts1).pairs.map((p) => [p.beforeId, p.afterId])).toEqual([[b1.id, a1.id]]);

    const x = photo({ capturedAt: "2024-01-10T08:00:00Z" });
    const near = photo({ capturedAt: "2024-01-10T12:00:00Z", location: at(5), phash: "ffffffffffffffff" });
    const far = photo({ capturedAt: "2024-01-10T13:00:00Z", location: at(25), phash: "0000000000000000" });
    expect(findPairs(cleanup, [spot], [x, near, far], opts1).pairs[0].afterId).toBe(near.id);

    const y = photo({ capturedAt: "2024-01-10T08:00:00Z" });
    const same = photo({ capturedAt: "2024-01-10T12:00:00Z", phash: "0000000000000003" });
    const other = photo({ capturedAt: "2024-01-10T13:00:00Z", phash: "00000000ffffffff" });
    expect(findPairs(cleanup, [spot], [y, other, same], opts1).pairs[0].afterId).toBe(same.id);
  });

  it("uses each photo once and caps pairs per spot; lists every candidate", () => {
    const ps = Array.from({ length: 8 }, (_, i) => photo({ capturedAt: `2024-01-10T${String(8 + i).padStart(2, "0")}:00:00Z` }));
    const r = findPairs(cleanup, [spot], ps);
    expect(r.pairs).toHaveLength(3);
    const ids = r.pairs.flatMap((p) => [p.beforeId, p.afterId]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.candidates).toHaveLength(28);
  });

  it("does not manufacture pairs when every candidate fails", () => {
    const r = findPairs(plantation, [spot], [photo(), photo({ capturedAt: "2024-01-11T08:00:00Z" }), photo({ capturedAt: "2024-01-12T08:00:00Z" })]);
    expect(r.pairs).toEqual([]);
    expect(r.candidates.every((c) => c.rejects.includes("gap_too_short"))).toBe(true);
  });

  it("is deterministic", () => {
    const ps = Array.from({ length: 6 }, (_, i) => photo({ capturedAt: `2024-01-1${i}T08:00:00Z`, location: at(i * 3) }));
    expect(findPairs(cleanup, [spot], ps)).toEqual(findPairs(cleanup, [spot], [...ps].reverse()));
  });
});

describe("chooseBaseline: the best 'after' photo", () => {
  it("prefers stage after, then trust score, then the latest; never an ineligible photo", () => {
    const before = { ...photo({ stage: "before", capturedAt: "2024-01-10T08:00:00Z" }), score: 95 };
    const after1 = { ...photo({ stage: "after", capturedAt: "2024-01-10T12:00:00Z" }), score: 80 };
    const after2 = { ...photo({ stage: "after", capturedAt: "2024-01-10T11:00:00Z" }), score: 90 };
    const flaggedAfter = { ...photo({ stage: "after", band: "FLAGGED", status: "flagged" }), score: 100 };
    expect(chooseBaseline([before, after1, after2, flaggedAfter])?.id).toBe(after2.id);
    expect(chooseBaseline([before, { ...before, id: "later", capturedAt: "2024-01-11T08:00:00Z" }])?.id).toBe("later");
    expect(chooseBaseline([flaggedAfter])).toBeNull();
  });
});

describe("date precision", () => {
  const plantation: PairProject = { minPairGapHours: 336, locationApproximate: false };
  const cleanup: PairProject = { minPairGapHours: 0.5, locationApproximate: false };
  const spot: PairSpot = { id: "s1", center: CENTER, radiusM: 30 };

  it("two date-only photos on the same day can't form a pair: the gap is unknown", () => {
    const a = photo({ capturedAt: "2025-11-02T00:00:00Z", capturedAtPrecision: "day" });
    const b = photo({ capturedAt: "2025-11-02T00:00:00Z", capturedAtPrecision: "day" });
    expect(evaluatePair(cleanup, spot, a, b).rejects).toEqual(["gap_unknown"]);
  });

  it("a date-only photo against an exact one on the same day is also unknown", () => {
    const a = photo({ capturedAt: "2025-11-02T00:00:00Z", capturedAtPrecision: "day" });
    const b = photo({ capturedAt: "2025-11-02T18:00:00Z", capturedAtPrecision: "second" });
    expect(evaluatePair(cleanup, spot, a, b).rejects).toEqual(["gap_unknown"]);
  });

  it("date-only photos on different days use the smallest possible gap", () => {
    const a = photo({ capturedAt: "2024-01-01T00:00:00Z", capturedAtPrecision: "day" });
    const b = photo({ capturedAt: "2024-01-15T00:00:00Z", capturedAtPrecision: "day" }); // 13–15 days apart
    expect(evaluatePair(plantation, spot, a, b)).toMatchObject({ rejects: ["gap_too_short"], gapHoursMin: 312 });
    const c = photo({ capturedAt: "2024-01-16T00:00:00Z", capturedAtPrecision: "day" }); // at least 14 days
    expect(evaluatePair(plantation, spot, a, c).ok).toBe(true);
  });
});
