import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultTrustConfig, describeReason, findMatches, isLater, reasonLabel, REASON_CODES, ruleChips, scoreAsset, signalMax, type DupCandidate, type DuplicateMatch, type TrustConfig, type TrustProject, type TrustSignals, type TrustSpot } from "@/lib/trust";

// Tiruppur, a 500 m site, a three-day event.
const SITE = { lat: 11.1085, lng: 77.3411 };
const project: TrustProject = { id: "p1", name: "Noyyal cleanup", center: SITE, radiusM: 500, startDate: "2024-01-10", endDate: "2024-01-12", monitoringEndsAt: null, minPairGapHours: 0.5 };
const spot: TrustSpot = { id: "s1", name: "Bridge", center: SITE, radiusM: 30 };
const north = (m: number) => ({ lat: SITE.lat + m / 111_195, lng: SITE.lng });

/** A perfect attested Witness Capture: 30 + 20 + 20 + 15 + 10 + 5 = 100. */
const witness = (o: Partial<TrustSignals> = {}): TrustSignals => ({
  assetId: "a1",
  source: "witness",
  exifSource: "none",
  deviceFix: { ...north(50), accuracyM: 8 },
  attested: true,
  exifLocation: null,
  uploaderLocation: null,
  capturedAt: "2024-01-11T04:30:00Z",
  capturedAtTzAssumed: false,
  capturedAtPrecision: "second",
  uploadedAt: "2024-01-11T04:31:00Z",
  moderation: { watermark_or_stock: false, screen_or_print: false, composited_or_generated: false, children_faces: false },
  watermark: false,
  textInImage: null,
  childrenVisible: false,
  qualityScore: 0.8,
  cameraMake: "Google",
  cameraModel: "Pixel 7",
  ...o,
});
/** An archive photo with Commons GPS: 20 + 20 + 20 + 15 + 10 + 5 = 90. */
const archive = (o: Partial<TrustSignals> = {}) =>
  witness({ source: "archive", exifSource: "commons_api", deviceFix: null, attested: false, exifLocation: north(100), ...o });

const dup = (o: Partial<DuplicateMatch> = {}): DuplicateMatch => {
  const d = {
    assetId: "other", projectId: "p1", projectName: "Noyyal cleanup", spotId: null, hamming: 3, exact: false, strong: true,
    capturedAt: "2024-01-11T04:00:00Z", uploadedAt: "2024-01-11T04:00:00Z", sameProject: true, sameSpot: false, gapHours: 0.5, otherIsLater: false,
    ...o,
  };
  return { gapHoursMin: d.gapHours, gapHoursMax: d.gapHours, ...d };
};

const codes = (r: ReturnType<typeof scoreAsset>) => r.reasons.map((x) => x.code);
const reason = (r: ReturnType<typeof scoreAsset>, code: string) => r.reasons.find((x) => x.code === code);
const sum = (r: ReturnType<typeof scoreAsset>) => r.reasons.reduce((s, x) => s + x.points, 0);

describe("location (max 30)", () => {
  it("attested witness inside the site: +30", () => {
    const r = scoreAsset(witness(), project, null, []);
    expect(reason(r, "LOCATION_WITNESS")).toMatchObject({ points: 30, kind: "points" });
    expect(r).toMatchObject({ score: 100, band: "VERIFIED", hardFlags: [], reviewFlags: [] });
  });

  it("unattested witness inside: +20", () => {
    expect(reason(scoreAsset(witness({ attested: false }), project, null, []), "LOCATION_WITNESS_UNATTESTED")?.points).toBe(20);
  });

  it("EXIF inside: +25", () => {
    const r = scoreAsset(witness({ source: "upload", exifSource: "file", deviceFix: null, attested: false, exifLocation: north(200) }), project, null, []);
    expect(reason(r, "LOCATION_EXIF")?.points).toBe(25);
  });

  it("archive GPS inside: +20", () => {
    const r = scoreAsset(archive(), project, null, []);
    expect(reason(r, "LOCATION_ARCHIVE")?.points).toBe(20);
    expect(r).toMatchObject({ score: 90, band: "VERIFIED" });
  });

  it("outside the site: hard LOCATION_MISMATCH with the distance", () => {
    const r = scoreAsset(archive({ exifLocation: north(12_000) }), project, null, []);
    expect(r.hardFlags).toEqual(["LOCATION_MISMATCH"]);
    expect(reason(r, "LOCATION_MISMATCH")?.detail).toMatchObject({ distanceKm: 12, radiusM: 500, from: "archive" });
    expect(r.band).toBe("FLAGGED");
    expect(describeReason(reason(r, "LOCATION_MISMATCH")!)).toBe("The archive record's GPS is 12 km from Noyyal cleanup, outside its 500 m radius.");
  });

  it("inside the spot radius counts as inside even beyond the project radius", () => {
    const far = { id: "s2", name: "Upstream", center: north(700), radiusM: 50 };
    expect(scoreAsset(archive({ exifLocation: north(720) }), project, far, []).hardFlags).toEqual([]);
  });

  it("EXIF and the witness fix more than 1 km apart: review LOCATION_CONFLICT", () => {
    const r = scoreAsset(witness({ exifLocation: north(1_600) }), project, null, []);
    expect(r.reviewFlags).toEqual(["LOCATION_CONFLICT"]);
    expect(r.band).toBe("NEEDS_REVIEW");
    expect(scoreAsset(witness({ exifLocation: north(900) }), project, null, []).reviewFlags).toEqual([]);
  });

  it("no location: 0", () => {
    const r = scoreAsset(archive({ exifLocation: null }), project, null, []);
    expect(reason(r, "LOCATION_NONE")?.points).toBe(0);
    expect(r.hardFlags).toEqual([]);
  });

  it("the uploader's browser location is information only and never flags", () => {
    const upload = witness({ source: "upload", exifSource: "none", deviceFix: null, attested: false, uploaderLocation: { lat: 28.61, lng: 77.2 } });
    const r = scoreAsset(upload, project, null, []);
    expect(reason(r, "UPLOADER_LOCATION")).toMatchObject({ kind: "info", points: 0 });
    expect(codes(r)).toContain("LOCATION_NONE");
    expect(r.hardFlags).toEqual([]);
    expect(r.reviewFlags).toEqual([]);
  });

  it("a gallery upload's device fix is ignored (only Witness Capture fixes count)", () => {
    const r = scoreAsset(witness({ source: "upload", attested: false, deviceFix: { ...north(20_000), accuracyM: 5 } }), project, null, []);
    expect(codes(r)).toContain("LOCATION_NONE");
    expect(r.hardFlags).toEqual([]);
  });
});

describe("time (max 20)", () => {
  it("in the window: +20; slack covers any timezone at either end", () => {
    expect(reason(scoreAsset(archive(), project, null, []), "TIME_IN_WINDOW")?.points).toBe(20);
    expect(codes(scoreAsset(archive({ capturedAt: "2024-01-09T18:30:00Z" }), project, null, []))).toContain("TIME_IN_WINDOW");
    expect(codes(scoreAsset(archive({ capturedAt: "2024-01-13T10:00:00Z" }), project, null, []))).toContain("TIME_IN_WINDOW");
  });

  it("missing capture time: +5", () => {
    expect(reason(scoreAsset(archive({ capturedAt: null }), project, null, []), "TIME_UPLOAD_ONLY")?.points).toBe(5);
  });

  it("outside the window: −20", () => {
    const r = scoreAsset(archive({ capturedAt: "2023-06-01T10:00:00Z" }), project, null, []);
    expect(reason(r, "TIME_OUTSIDE")).toMatchObject({ points: -20, detail: { side: "before" } });
    expect(r.score).toBe(50);
    expect(r.hardFlags).toEqual([]);
  });

  it("after the event, at a monitored spot, while monitoring runs: a check-in (+20)", () => {
    const later = witness({ capturedAt: "2024-03-01T05:00:00Z" });
    expect(reason(scoreAsset(later, project, spot, []), "TIME_CHECKIN")?.points).toBe(20);
    // Any photo at a monitored spot counts, archive ones too (the 2020 Tiruppur revisit).
    expect(reason(scoreAsset(archive({ capturedAt: "2024-03-01T05:00:00Z" }), project, spot, []), "TIME_CHECKIN")?.points).toBe(20);
    // Not at a spot: simply after the event.
    expect(reason(scoreAsset(later, project, null, []), "TIME_OUTSIDE")).toMatchObject({ points: -20, detail: { side: "after", atSpot: false } });
  });

  it("the monitoring period can end; after it, a photo is outside (−20)", () => {
    const ended = { ...project, monitoringEndsAt: "2024-02-01" };
    expect(codes(scoreAsset(witness({ capturedAt: "2024-01-25T05:00:00Z" }), ended, spot, []))).toContain("TIME_CHECKIN");
    const late = scoreAsset(witness({ capturedAt: "2024-03-01T05:00:00Z" }), ended, spot, []);
    expect(reason(late, "TIME_OUTSIDE")).toMatchObject({ points: -20, detail: { monitoringOver: true } });
    expect(describeReason(reason(late, "TIME_OUTSIDE")!)).toBe("Taken on 2024-03-01, after monitoring ended.");
  });

  it("a date-only capture says so", () => {
    const r = scoreAsset(archive({ capturedAt: "2024-01-11T00:00:00Z", capturedAtPrecision: "day" }), project, null, []);
    expect(describeReason(reason(r, "TIME_IN_WINDOW")!)).toBe("Taken on 2024-01-11 (date only), inside the event dates.");
  });

  it("no project or no dates: 0", () => {
    expect(codes(scoreAsset(archive(), null, null, []))).toContain("TIME_NO_WINDOW");
    expect(codes(scoreAsset(archive(), { ...project, startDate: null }, null, []))).toContain("TIME_NO_WINDOW");
  });
});

describe("uniqueness (max 20)", () => {
  it("no match: +20", () => {
    expect(reason(scoreAsset(archive(), project, null, []), "UNIQUE")?.points).toBe(20);
  });

  it("burst: a same-project match within 10 minutes: +10", () => {
    expect(reason(scoreAsset(archive(), project, null, [dup({ gapHours: 3 / 60 })]), "BURST")?.points).toBe(10);
  });

  it("revisit: same spot, gap ≥ min_pair_gap_hours: +20", () => {
    const r = scoreAsset(archive(), project, spot, [dup({ sameSpot: true, gapHours: 48 })]);
    expect(reason(r, "REVISIT")?.points).toBe(20);
    expect(r.band).toBe("VERIFIED");
  });

  it("same spot but a gap shorter than the project's minimum is only similar: +10", () => {
    const plantation = { ...project, minPairGapHours: 336 };
    expect(reason(scoreAsset(archive(), plantation, spot, [dup({ sameSpot: true, gapHours: 48 })]), "SIMILAR_IN_PROJECT")?.points).toBe(10);
  });

  it("burst beats revisit when both exist (the conservative reading)", () => {
    const r = scoreAsset(archive(), project, spot, [dup({ sameSpot: true, gapHours: 48 }), dup({ assetId: "b", gapHours: 0.05 })]);
    expect(codes(r)).toContain("BURST");
    expect(codes(r)).not.toContain("REVISIT");
  });

  it("date-only photos on the same day are neither a burst nor a revisit (unknown gap)", () => {
    const sameDay = dup({ sameSpot: true, gapHours: 0, gapHoursMin: 0, gapHoursMax: 24 });
    const r = scoreAsset(archive(), project, spot, [sameDay]);
    expect(codes(r)).toContain("SIMILAR_IN_PROJECT");
    expect(codes(r)).not.toContain("BURST");
    // Different days, day precision: at least 48 h apart, a revisit.
    expect(codes(scoreAsset(archive(), project, spot, [dup({ sameSpot: true, gapHours: 72, gapHoursMin: 48, gapHoursMax: 96 })]))).toContain("REVISIT");
  });

  it("identical file in the same project: review POSSIBLE_DUPLICATE", () => {
    const r = scoreAsset(archive(), project, null, [dup({ exact: true, hamming: 0 })]);
    expect(r.reviewFlags).toEqual(["POSSIBLE_DUPLICATE"]);
    expect(r.band).toBe("NEEDS_REVIEW");
  });

  it("a match in another project flags the LATER photo only", () => {
    const earlierOther = dup({ projectId: "p2", projectName: "Kasara plantation", sameProject: false, otherIsLater: false, hamming: 5, capturedAt: "2023-02-01T00:00:00Z" });
    const later = scoreAsset(archive(), project, null, [earlierOther]);
    expect(later.hardFlags).toEqual(["REUSED"]);
    expect(later.band).toBe("FLAGGED");
    expect(describeReason(reason(later, "REUSED")!)).toBe("A 92% match of a photo already in Kasara plantation from 2023-02-01.");

    const laterOther = { ...earlierOther, otherIsLater: true };
    const earlier = scoreAsset(archive(), project, null, [laterOther]);
    expect(earlier.hardFlags).toEqual([]);
    expect(reason(earlier, "COPY_LATER_SUBMITTED")).toMatchObject({ kind: "info", points: 0 });
    expect(reason(earlier, "UNIQUE")?.points).toBe(20);
    expect(earlier.band).toBe("VERIFIED");
  });

  it("a match with an unassigned photo is ignored", () => {
    const r = scoreAsset(archive(), project, null, [dup({ projectId: null, projectName: null, sameProject: false })]);
    expect(r.hardFlags).toEqual([]);
    expect(codes(r)).toContain("UNIQUE");
  });
});

describe("findMatches and isLater", () => {
  const base: DupCandidate = { id: "a", projectId: "p1", spotId: "s1", phash: "0000000000000000", etag: "e1", capturedAt: "2024-01-11T04:00:00Z", uploadedAt: "2024-01-20T00:00:00Z" };
  const flip = (bits: number) => (2n ** BigInt(bits) - 1n).toString(16).padStart(16, "0");

  it("hamming ≤ 8 matches, ≤ 4 is strong, 9 is not a match; identical etag is exact", () => {
    const others: DupCandidate[] = [
      { ...base, id: "h4", phash: flip(4), etag: "x" },
      { ...base, id: "h8", phash: flip(8), etag: "y" },
      { ...base, id: "h9", phash: flip(9), etag: "z" },
      { ...base, id: "ex", phash: flip(30), etag: "e1" },
    ];
    const m = findMatches(base, others);
    expect(m.map((x) => [x.assetId, x.hamming, x.strong, x.exact])).toEqual([
      ["ex", 0, true, true],
      ["h4", 4, true, false],
      ["h8", 8, false, false],
    ]);
  });

  it("skips itself and photos without a hash", () => {
    expect(findMatches(base, [base, { ...base, id: "n", phash: null, etag: null }])).toEqual([]);
  });

  it("orders by capture time, then upload time, then id", () => {
    const b = { ...base, id: "b" };
    expect(isLater({ ...b, capturedAt: "2024-01-12T00:00:00Z" }, base)).toBe(true);
    expect(isLater({ ...b, capturedAt: null, uploadedAt: "2024-01-21T00:00:00Z" }, base)).toBe(true);
    expect(isLater(b, base)).toBe(true);
    expect(isLater(base, b)).toBe(false);
  });

  it("writes the relationship both ways consistently", () => {
    const b: DupCandidate = { ...base, id: "b", projectId: "p2", spotId: null, etag: "e2", phash: flip(2), capturedAt: "2025-01-01T00:00:00Z" };
    const [ab] = findMatches(base, [b]);
    const [ba] = findMatches(b, [base]);
    expect(ab).toMatchObject({ assetId: "b", otherIsLater: true, sameProject: false, hamming: 2 });
    expect(ba).toMatchObject({ assetId: "a", otherIsLater: false, sameProject: false, hamming: 2 });
    expect(ab.gapHours).toBeCloseTo(ba.gapHours);
  });
});

describe("authenticity (max 15)", () => {
  it("clear: +15", () => {
    expect(reason(scoreAsset(archive(), project, null, []), "AUTH_CLEAR")?.points).toBe(15);
  });

  it("screen or print: −10 and review", () => {
    const r = scoreAsset(archive({ moderation: { screen_or_print: true } }), project, null, []);
    expect(reason(r, "SCREEN_OR_PRINT")).toMatchObject({ points: -10, kind: "review" });
    expect(r).toMatchObject({ score: 65, band: "NEEDS_REVIEW", hardFlags: [] });
  });

  it("composited: −10 and review, never a hard flag", () => {
    const r = scoreAsset(archive({ moderation: { composited_or_generated: true } }), project, null, []);
    expect(reason(r, "COMPOSITED")).toMatchObject({ points: -10, kind: "review" });
    expect(r.hardFlags).toEqual([]);
    expect(r.band).toBe("NEEDS_REVIEW");
  });

  it("watermark or stock branding: hard STOCK_SUSPECTED", () => {
    expect(scoreAsset(archive({ watermark: true }), project, null, []).hardFlags).toEqual(["STOCK_SUSPECTED"]);
    expect(scoreAsset(archive({ moderation: { watermark_or_stock: true } }), project, null, []).hardFlags).toEqual(["STOCK_SUSPECTED"]);
  });

  it("not checked yet: 0", () => {
    expect(reason(scoreAsset(archive({ moderation: null, watermark: null }), project, null, []), "AUTH_UNCHECKED")?.points).toBe(0);
  });
});

describe("burned-in stamp", () => {
  it("coordinates more than 1 km from the capture location: hard STAMP_MISMATCH", () => {
    const r = scoreAsset(archive({ textInImage: "Lat 19.0988° Long 72.8267° 11/01/2024" }), project, null, []);
    expect(r.hardFlags).toEqual(["STAMP_MISMATCH"]);
    expect(describeReason(reason(r, "STAMP_MISMATCH")!)).toMatch(/^A burned-in GPS stamp says 19.0988, 72.8267: \d+(\.\d)? km from where the photo was taken\.$/);
  });

  it("a date more than a day off: hard STAMP_MISMATCH", () => {
    const text = `Lat ${north(100).lat.toFixed(5)} Long ${SITE.lng} 20/01/2024`;
    const r = scoreAsset(archive({ textInImage: text }), project, null, []);
    expect(r.hardFlags).toEqual(["STAMP_MISMATCH"]);
    expect(describeReason(reason(r, "STAMP_MISMATCH")!)).toMatch(/dated 2024-01-20, \d+ days from the capture date/);
  });

  it("an agreeing stamp is information only", () => {
    const r = scoreAsset(archive({ textInImage: `Lat ${north(100).lat.toFixed(5)} Long ${SITE.lng} 11/01/2024 10:00 AM GMT +05:30` }), project, null, []);
    expect(reason(r, "STAMP_CONSISTENT")).toMatchObject({ kind: "info" });
    expect(r.band).toBe("VERIFIED");
  });

  it("without a capture location, checks the stamp against the site", () => {
    const r = scoreAsset(archive({ exifLocation: null, textInImage: "Lat 19.0988 Long 72.8267" }), project, null, []);
    expect(r.hardFlags).toEqual(["STAMP_MISMATCH"]);
  });

  it("text that is not a stamp adds nothing", () => {
    const r = scoreAsset(archive({ textInImage: "SWACHH BHARAT" }), project, null, []);
    expect(codes(r).filter((c) => c.startsWith("STAMP"))).toEqual([]);
  });
});

describe("quality, provenance, privacy", () => {
  it("quality ≥ 0.6: +10; below: 0", () => {
    expect(reason(scoreAsset(archive({ qualityScore: 0.6 }), project, null, []), "QUALITY_OK")?.points).toBe(10);
    expect(reason(scoreAsset(archive({ qualityScore: 0.59 }), project, null, []), "QUALITY_LOW")?.points).toBe(0);
  });

  it("provenance needs make and model: +5", () => {
    expect(reason(scoreAsset(archive(), project, null, []), "PROVENANCE_CAMERA")?.points).toBe(5);
    expect(reason(scoreAsset(archive({ cameraModel: null }), project, null, []), "PROVENANCE_NONE")?.points).toBe(0);
  });

  it("children are a privacy note only", () => {
    const r = scoreAsset(archive({ childrenVisible: true }), project, null, []);
    expect(reason(r, "PRIVACY_CHILDREN")).toMatchObject({ kind: "info", points: 0 });
    expect(r).toMatchObject({ score: 90, band: "VERIFIED" });
  });
});

describe("score, cap and bands", () => {
  it("a hard flag caps the score at 40 with its own reason, so the ledger still adds up", () => {
    const r = scoreAsset(witness({ watermark: true }), project, null, []);
    expect(r.score).toBe(40);
    expect(reason(r, "HARD_FLAG_CAP")).toMatchObject({ points: -45, detail: { cap: 40 } });
    expect(sum(r)).toBe(r.score);
    expect(r.band).toBe("FLAGGED");
  });

  it("a hard flag below the cap is not raised to it", () => {
    const r = scoreAsset(archive({ exifLocation: north(9_000), capturedAt: "2020-01-01T00:00:00Z", qualityScore: null, cameraMake: null }), project, null, []);
    expect(r.score).toBe(15);
    expect(codes(r)).not.toContain("HARD_FLAG_CAP");
  });

  it("the ledger always sums to the score", () => {
    for (const s of [witness(), archive(), archive({ capturedAt: "2023-01-01T00:00:00Z", moderation: { screen_or_print: true } }), archive({ watermark: true })]) {
      const r = scoreAsset(s, project, null, []);
      expect(sum(r)).toBe(r.score);
    }
  });

  // archive 20 + time 20 + unique 20 + auth 15 = 75 (no quality, no provenance).
  const bare = archive({ qualityScore: null, cameraMake: null });
  const tweak = (points: Partial<TrustConfig["points"]>): TrustConfig => ({ ...defaultTrustConfig, points: { ...defaultTrustConfig.points, ...points } });

  it("75 is VERIFIED, 74 is NEEDS_REVIEW", () => {
    expect(scoreAsset(bare, project, null, [])).toMatchObject({ score: 75, band: "VERIFIED" });
    expect(scoreAsset(bare, project, null, [], tweak({ authClear: 14 }))).toMatchObject({ score: 74, band: "NEEDS_REVIEW" });
  });

  it("45 is NEEDS_REVIEW, 44 is FLAGGED", () => {
    // archive 20 + upload-only 5 + unique 20 = 45.
    const low = archive({ capturedAt: null, moderation: null, watermark: null, qualityScore: null, cameraMake: null });
    expect(scoreAsset(low, project, null, [])).toMatchObject({ score: 45, band: "NEEDS_REVIEW", hardFlags: [] });
    expect(scoreAsset(low, project, null, [], tweak({ unique: 19 }))).toMatchObject({ score: 44, band: "FLAGGED", hardFlags: [] });
  });

  it("a review flag keeps even a high score out of VERIFIED", () => {
    const r = scoreAsset(witness({ exifLocation: north(5_000) }), project, null, []);
    expect(r.score).toBe(100);
    expect(r.band).toBe("NEEDS_REVIEW");
  });

  it("missing everything: a low score, no flags, no crash", () => {
    const empty: TrustSignals = {
      assetId: "x", source: "upload", exifSource: "none", deviceFix: null, attested: false, exifLocation: null, uploaderLocation: null,
      capturedAt: null, capturedAtTzAssumed: false, capturedAtPrecision: null, uploadedAt: "2024-01-01T00:00:00Z", moderation: null, watermark: null, textInImage: null,
      childrenVisible: false, qualityScore: null, cameraMake: null, cameraModel: null,
    };
    const r = scoreAsset(empty, null, null, []);
    expect(r).toMatchObject({ score: 20, band: "FLAGGED", hardFlags: [], reviewFlags: [] });
    expect(codes(r)).toEqual(["LOCATION_NONE", "TIME_NO_WINDOW", "UNIQUE", "AUTH_UNCHECKED", "QUALITY_UNKNOWN", "PROVENANCE_NONE"]);
  });

  it("is deterministic", () => {
    const dups = [dup({ gapHours: 0.01 }), dup({ assetId: "z", projectId: "p9", sameProject: false })];
    expect(scoreAsset(witness(), project, spot, dups)).toEqual(scoreAsset(witness(), project, spot, dups));
  });
});

describe("reasons", () => {
  it("every code has a sentence with no unfilled placeholders", () => {
    const detail = { distanceM: 12, distanceKm: 3.4, radiusM: 500, site: "S", from: "exif", capturedAt: "2024-01-01T00:00:00Z", start: "a", end: "b", side: "after", matches: 2, gapHours: 3, otherProject: "P", otherDate: "2024-01-01", similarityPct: 90, stampLat: 1, stampLng: 2, stampDate: "2024-01-01", dayDifference: 3, camera: "C", cap: 40 };
    for (const code of REASON_CODES) {
      const s = describeReason({ code, detail });
      expect(s.length, code).toBeGreaterThan(10);
      expect(s, code).not.toMatch(/undefined|NaN|\?|\[object/);
    }
  });
});

describe("lib/trust is browser-safe", () => {
  it("imports only pure modules (no server-only, node:, db, providers)", () => {
    const root = path.resolve(__dirname, "..");
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      for (const [, spec] of src.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
        expect(spec.startsWith("."), `${path.relative(root, file)} imports "${spec}"`).toBe(true);
        visit(path.resolve(path.dirname(file), spec) + ".ts");
      }
    };
    visit(path.join(root, "lib/trust/index.ts"));
    const files = [...seen].map((f) => path.relative(root, f).replaceAll("\\", "/")).sort();
    expect(files.every((f) => f.startsWith("lib/trust/") || ["lib/geo.ts", "lib/hamming.ts", "lib/dates.ts"].includes(f)), files.join(", ")).toBe(true);
  });
});

describe("rule chips (TrustMeter)", () => {
  it("labels every reason code", () => {
    for (const code of REASON_CODES) expect(reasonLabel(code).length, code).toBeGreaterThan(3);
  });

  it("reads a perfect Witness Capture as five scoring chips with its points", () => {
    const r = scoreAsset(witness({ qualityScore: 0.9, cameraMake: "Pixel", cameraModel: "7", moderation: {}, watermark: false }), project, spot, []);
    const chips = ruleChips(r.reasons);
    expect(chips.filter((c) => c.tone === "good").map((c) => c.text)).toEqual(
      expect.arrayContaining(["Taken in the Saakshi app, inside the site, 30", "Time recorded, 20", "Fingerprint is new, 20"]),
    );
    expect(chips.every((c) => !/undefined|NaN/.test(c.text))).toBe(true);
  });

  it("shows a missing signal as 0 of its most, and flags as bare labels", () => {
    const chips = ruleChips([
      { code: "LOCATION_NONE", signal: "location", kind: "points", points: 0 },
      { code: "TIME_OUTSIDE", signal: "time", kind: "points", points: -20 },
      { code: "REUSED", signal: "uniqueness", kind: "hard", points: 0 },
      { code: "LOCATION_CONFLICT", signal: "location", kind: "review", points: 0 },
      { code: "UPLOADER_LOCATION", signal: "location", kind: "info", points: 0 },
      { code: "HARD_FLAG_CAP", signal: "score", kind: "points", points: -12 },
    ]);
    expect(chips).toEqual([
      { code: "LOCATION_NONE", text: "No location recorded, 0 of 30", tone: "neutral" },
      { code: "TIME_OUTSIDE", text: "Taken outside the event dates, −20", tone: "bad" },
      { code: "REUSED", text: "Same photo used in another project", tone: "bad" },
      { code: "LOCATION_CONFLICT", text: "Two locations disagree", tone: "warn" },
    ]);
  });

  it("takes each signal's maximum from the config", () => {
    expect(signalMax("location")).toBe(defaultTrustConfig.points.locationWitness);
    expect(signalMax("time")).toBe(defaultTrustConfig.points.timeInWindow);
    expect(signalMax("score")).toBeNull();
  });
});

describe("trust simulator (How it works) runs the real engine (B5.1)", () => {
  it("scores the three presets with our rules and bands", async () => {
    const { simulate, SIM_PRESETS } = await import("@/lib/trust");
    const w = simulate(SIM_PRESETS.witness);
    expect(w).toMatchObject({ score: 100, band: "VERIFIED" });
    expect(w.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["LOCATION_WITNESS", "TIME_IN_WINDOW", "UNIQUE", "AUTH_CLEAR", "QUALITY_OK", "PROVENANCE_CAMERA"]));
    const g = simulate(SIM_PRESETS.google);
    expect(g.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["LOCATION_NONE", "TIME_UPLOAD_ONLY", "PROVENANCE_NONE"]));
    expect(g).toMatchObject({ score: 50, band: "NEEDS_REVIEW" }); // 0 + 5 + 20 + 15 + 10 + 0
    const r = simulate(SIM_PRESETS.reused);
    expect(r).toMatchObject({ band: "FLAGGED", hardFlags: ["REUSED"] });
    expect(r.score).toBeLessThanOrEqual(defaultTrustConfig.hardFlagCap);
  });
  it("follows each fact: outside the site is a hard flag, a screen photo needs review, a burst counts once", async () => {
    const { simulate, SIM_PRESETS } = await import("@/lib/trust");
    expect(simulate({ ...SIM_PRESETS.witness, inside: false }).hardFlags).toEqual(["LOCATION_MISMATCH"]);
    expect(simulate({ ...SIM_PRESETS.witness, screen: true }).reviewFlags).toEqual(["SCREEN_OR_PRINT"]);
    expect(simulate({ ...SIM_PRESETS.witness, dup: "burst" }).reasons.find((x) => x.signal === "uniqueness")?.code).toBe("BURST");
    expect(simulate({ ...SIM_PRESETS.witness, dup: "revisit" }).reasons.find((x) => x.signal === "uniqueness")?.code).toBe("REVISIT");
    expect(simulate({ ...SIM_PRESETS.witness, watermark: true }).hardFlags).toEqual(["STOCK_SUSPECTED"]);
    expect(simulate({ ...SIM_PRESETS.witness, quality: "poor" }).reasons.find((x) => x.signal === "quality")?.code).toBe("QUALITY_LOW");
    expect(simulate({ ...SIM_PRESETS.witness, inWindow: false }).reasons.find((x) => x.signal === "time")?.code).toBe("TIME_OUTSIDE");
  });
});

describe("ledger rows (evidence page, How it works)", () => {
  it("one row per scoring signal, the deciding reason's words, points of the most", async () => {
    const { ledgerRows, simulate, SIM_PRESETS } = await import("@/lib/trust");
    const rows = ledgerRows(simulate({ ...SIM_PRESETS.witness, dup: "other" }).reasons, describeReason);
    expect(rows.map((r) => r.signal)).toEqual(["location", "time", "uniqueness", "authenticity", "quality", "provenance"]);
    expect(rows.find((r) => r.signal === "uniqueness")).toMatchObject({ label: "Same photo used in another project", pts: 0, max: 20, tone: "bad" });
    expect(rows.find((r) => r.signal === "location")).toMatchObject({ pts: 30, max: 30, tone: "good" });
    expect(rows.every((r) => r.note.length > 5)).toBe(true);
  });
});
