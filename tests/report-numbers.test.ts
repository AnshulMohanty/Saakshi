/** The report page's number cards, period line and Method text (pure: lib/report/numbers.ts). */
import { describe, expect, it } from "vitest";
import type { Claim } from "@/lib/claims";
import { methodLines, numberCards, periodLabel, type Shown } from "@/lib/report/numbers";
import { defaultTrustConfig } from "@/lib/trust/config";

const C = (id: string, value: number, extra: Partial<Claim> = {}): Claim => ({ id, label: id, value, unit: "photos", method: "measured", asset_ids: [], ...extra });
const shown: (c: Claim) => Shown = () => ({ kind: "value", text: "x", mock: false });

describe("numberCards", () => {
  it("orders cards as the design does and skips claims it has no card for", () => {
    const cards = numberCards([C("days_since_last_checkin", 3), C("spots_monitored", 2), C("photos_flagged", 4), C("photos_verified", 27), C("something_else", 9)], shown);
    expect(cards.map((c) => c.key)).toEqual(["photos_verified", "photos_flagged", "spots_monitored", "days_since_last_checkin"]);
    expect(cards.map((c) => [c.value, c.label])).toEqual([
      ["27", "photos verified"],
      ["4", "photos flagged, with reasons"],
      ["2", "spots monitored"],
      ["3", "days since the last check-in"],
    ]);
    expect(cards.map((c) => c.kind)).toEqual(["verified", "flagged", "count", "count"]);
  });

  it("reads singular for one, and names the project's activity", () => {
    const cards = numberCards([C("photos_verified", 1), C("spots_monitored", 1), C("checkins_after_cleanup", 1), C("days_since_last_checkin", 1)], shown, "planting");
    expect(cards.map((c) => c.label)).toEqual(["photo verified", "spot monitored", "check-in since the planting", "day since the last check-in"]);
  });

  it("signs changes with a true minus and marks AI estimates", () => {
    const cards = numberCards([C("litter_cover_change", -3.64, { unit: "points" }), C("items_visible_change", 2, { unit: "items", method: "ai_estimated", confidence: 0.62 })], shown);
    expect(cards[0]).toMatchObject({ value: "−3.6", kind: "measured", tag: "" });
    expect(cards[1]).toMatchObject({ value: "≈+2", kind: "estimated", tag: "AI estimate, confidence 62%", tagTone: "estimated" });
  });

  it("tags mock numbers in development and hides them behind a dash in production", () => {
    const dev = numberCards([C("photos_verified", 21)], () => ({ kind: "value", text: "21 photos", mock: true }));
    expect(dev[0]).toMatchObject({ value: "21", tag: "Mock output", tagTone: "review", hidden: false });
    const prod = numberCards([C("photos_verified", 21)], () => ({ kind: "hidden", text: "Not available: computed with mock providers" }));
    expect(prod[0]).toMatchObject({ value: "–", tag: "Not available: computed with mock providers", tagTone: "muted", hidden: true });
    expect(prod[0].value).not.toMatch(/\d/);
  });
});

describe("periodLabel", () => {
  it("writes the period the design's way, widening only as needed", () => {
    expect(periodLabel("2026-09-14", "2026-09-27")).toBe("14 to 27 Sep 2026");
    expect(periodLabel("2017-08-29", "2017-09-12")).toBe("29 Aug to 12 Sep 2017");
    expect(periodLabel("2025-12-30", "2026-01-02")).toBe("30 Dec 2025 to 2 Jan 2026");
    expect(periodLabel("2026-09-14", "2026-09-14")).toBe("14 Sep 2026");
  });
});

describe("methodLines", () => {
  it("states the rules from the config, never hand-written numbers", () => {
    const [rules, measure, photos] = methodLines({ metric: "litter", threshold: 0.5, archive: true, planted: 2 });
    const P = defaultTrustConfig.points;
    expect(rules).toContain(`location recorded up to ${Math.max(P.locationWitness, P.locationExif, P.locationArchive)}`);
    expect(rules).toContain(`Verified at ${defaultTrustConfig.verifiedMin} or more, Needs review from ${defaultTrustConfig.reviewMin}`);
    expect(measure).toBe("Litter cover is measured on photo pixels at mask threshold 0.50. Camera angle, framing, season and light affect the result. Only photos of the same spot are compared.");
    expect(photos).toBe("Photos: Wikimedia Commons, credited on each evidence page, faces blurred. Two fakes were planted to show the checks.");
  });

  it("follows a changed config, and words user projects differently", () => {
    const cfg = { ...defaultTrustConfig, verifiedMin: 80, points: { ...defaultTrustConfig.points, timeInWindow: 25 } };
    const [rules, measure, photos] = methodLines({ metric: "green", threshold: 0.5, archive: false, planted: 0 }, cfg);
    expect(rules).toContain("time in the event window 25");
    expect(rules).toContain("Verified at 80 or more");
    expect(measure.startsWith("Green cover")).toBe(true);
    expect(photos).toBe("Photos: taken or uploaded by the organisation, faces blurred on every public copy.");
    expect(methodLines({ metric: "litter", threshold: 0.5, archive: true, planted: 1 })[2]).toContain("One fake was planted");
    expect(methodLines({ metric: "litter", threshold: 0.5, archive: true, planted: 0 })[2]).not.toContain("planted");
  });
});
