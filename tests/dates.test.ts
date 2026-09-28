import { describe, expect, it } from "vitest";
import { dateOnly, eventWindow, gapBetween, interval, knownGapHours } from "@/lib/dates";

describe("capture precision", () => {
  it("a day-precision time covers the whole day; a second-precision time one second", () => {
    const [a, b] = interval({ at: "2025-11-02T00:00:00Z", precision: "day" });
    expect(b - a).toBe(86_400_000);
    const [c, d] = interval({ at: "2025-11-02T06:00:00Z", precision: "second" });
    expect(d - c).toBe(1000);
    expect(interval({ at: "2025-02-01T00:00:00Z", precision: "month" })[1]).toBe(Date.parse("2025-03-01T00:00:00Z"));
  });

  it("two day-precision photos on the same day have an unknown gap and order", () => {
    const g = gapBetween({ at: "2025-11-02T00:00:00Z", precision: "day" }, { at: "2025-11-02T00:00:00Z", precision: "day" });
    expect(g.ordered).toBe(false);
    expect(g.known).toBe(false);
    expect(g.minHours).toBeLessThan(0);
    expect(g.maxHours).toBeCloseTo(24, 0);
    expect(knownGapHours({ at: "2025-11-02T00:00:00Z", precision: "day" }, { at: "2025-11-02T00:00:00Z", precision: "day" })).toBeNull();
  });

  it("different days are ordered, with a gap range", () => {
    const g = gapBetween({ at: "2025-11-02T00:00:00Z", precision: "day" }, { at: "2025-11-05T00:00:00Z", precision: "day" });
    expect(g.ordered).toBe(true);
    expect(g.minHours).toBeCloseTo(48, 0);
    expect(g.maxHours).toBeCloseTo(96, 0);
  });

  it("second-precision times have a known, exact gap", () => {
    const a = { at: "2017-09-05T12:45:00Z", precision: "second" as const };
    const b = { at: "2017-09-05T14:30:00Z", precision: "second" as const };
    expect(gapBetween(a, b)).toMatchObject({ ordered: true, known: true });
    expect(knownGapHours(a, b)).toBe(1.75);
    expect(knownGapHours(a, { ...b, precision: null })).toBe(1.75); // unknown precision = exact
  });

  it("dateOnly", () => {
    expect([dateOnly("day"), dateOnly("month"), dateOnly("second"), dateOnly(null)]).toEqual([true, true, false, false]);
  });
});

describe("eventWindow: densest run of capture days ± 7", () => {
  it("Tiruppur: the 2017 evening, not the 2020 revisit", () => {
    const dates = [...Array(20).fill("2017-09-05T18:15:00"), "2020-03-30T09:22:15"];
    expect(eventWindow(dates)).toEqual({ startDate: "2017-08-29", endDate: "2017-09-12", run: { start: "2017-09-05", end: "2017-09-05", photos: 20 } });
  });

  it("joins days up to a week apart into one run (a planting week); the biggest run wins", () => {
    const dates = ["2020-11-20", "2020-11-22", "2020-11-22", "2020-11-27", "2020-11-27", "2020-11-29", "2022-01-20"];
    expect(eventWindow(dates)).toMatchObject({ startDate: "2020-11-13", endDate: "2020-12-06", run: { photos: 6 } });
  });

  it("ties go to the earliest run; nothing to window gives null", () => {
    expect(eventWindow(["2024-01-01", "2024-06-01"])?.run.start).toBe("2024-01-01");
    expect(eventWindow([])).toBeNull();
  });
});
