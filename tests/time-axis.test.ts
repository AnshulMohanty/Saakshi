/** Adaptive time axis for spot trends (pure): runs, breaks, tick units by range, full times on hover. */
import { describe, expect, it } from "vitest";
import { buildTimeAxis, fullDateTime, gapLabel, unitFor } from "@/lib/charts/time-axis";

const T = (iso: string) => Date.parse(iso);

describe("buildTimeAxis", () => {
  it("a six-minute clean-up run gets minute ticks in IST and its date as a caption", () => {
    // Tiruppur spot 1: 5 Sep 2017, 12:45–12:51 UTC (18:15–18:21 IST).
    const times = ["2017-09-05T12:45:10Z", "2017-09-05T12:47:30Z", "2017-09-05T12:49:05Z", "2017-09-05T12:51:40Z"].map(T);
    const a = buildTimeAxis(times);
    expect(a.runs).toHaveLength(1);
    expect(a.breaks).toEqual([]);
    expect(a.runs[0]).toMatchObject({ unit: "minute", caption: "5 Sep 2017 (IST)", x0: 0, x1: 1 });
    expect(a.ticks.map((t) => t.label)).toEqual(["18:16", "18:18", "18:20"]);
    expect(a.x(times[0])).toBe(0);
    expect(a.x(times.at(-1)!)).toBe(1);
  });

  it("a clean-up in 2017 and check-ins in 2020 become two runs with a labelled break", () => {
    const times = ["2017-09-05T12:45:00Z", "2017-09-05T12:51:00Z", "2020-03-30T03:52:00Z", "2020-04-04T01:51:00Z"].map(T);
    const a = buildTimeAxis(times);
    expect(a.runs.map((r) => r.unit)).toEqual(["minute", "day"]);
    expect(a.breaks).toHaveLength(1);
    expect(a.breaks[0].label).toBe("2.6 years later");
    // The break sits between the runs, and nothing overlaps.
    expect(a.runs[0].x1).toBeCloseTo(a.breaks[0].x0, 10);
    expect(a.breaks[0].x1).toBeCloseTo(a.runs[1].x0, 10);
    expect(a.runs[1].x1).toBeCloseTo(1, 10);
    // Each run keeps at least 15% of the width, however short it is.
    for (const r of a.runs) expect(r.x1 - r.x0).toBeGreaterThanOrEqual(0.15 * 0.95 - 1e-9);
    expect(a.ticks.filter((t) => t.x > a.runs[1].x0).map((t) => t.label)).toEqual(["31 Mar", "2 Apr", "4 Apr"]); // 5 days → a 2-day step
  });

  it("Pimpri-Chinchwad (Nov 2020 planting, Sep 2021, Jan 2022) splits into three runs", () => {
    const times = ["2020-11-20T03:41:00Z", "2020-11-27T05:00:00Z", "2020-12-07T11:26:00Z", "2021-09-08T02:47:00Z", "2022-01-20T03:30:00Z"].map(T);
    const a = buildTimeAxis(times);
    expect(a.runs).toHaveLength(3);
    expect(a.breaks.map((b) => b.label)).toEqual(["9 months later", "4 months later"]);
    expect(a.runs[0].unit).toBe("day");
    // Single-photo runs are one tick with the full date, centred.
    expect(a.ticks.at(-1)).toEqual({ x: (a.runs[2].x0 + a.runs[2].x1) / 2, label: "20 Jan 2022" });
  });

  it("positions increase with time and stay within 0–1", () => {
    const times = Array.from({ length: 30 }, (_, i) => T("2021-01-01T00:00:00Z") + i * 11 * 86_400_000);
    const a = buildTimeAxis(times);
    expect(a.runs).toHaveLength(1);
    expect(a.runs[0].unit).toBe("month");
    const xs = times.map(a.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(1);
    expect(a.ticks.every((t) => /^[A-Z][a-z]{2} \d{4}$/.test(t.label))).toBe(true);
  });

  it("empty and single inputs", () => {
    expect(buildTimeAxis([])).toMatchObject({ runs: [], breaks: [], ticks: [] });
    const one = buildTimeAxis([T("2025-11-05T02:58:00Z")]);
    expect(one.ticks).toEqual([{ x: 0.5, label: "5 Nov 2025" }]);
  });
});

describe("labels", () => {
  it("unit by span: minutes to years", () => {
    expect(["PT2H", 2 * 3_600_000, 2 * 86_400_000, 60 * 86_400_000, 700 * 86_400_000, 5000 * 86_400_000].slice(1).map((s) => unitFor(s as number))).toEqual(["minute", "hour", "day", "month", "year"]);
  });

  it("full date and time on hover, honest about precision", () => {
    expect(fullDateTime(T("2017-09-05T12:45:10Z"))).toBe("5 Sep 2017, 18:15 IST");
    expect(fullDateTime(T("2017-09-05T00:00:00Z"), "day")).toBe("5 Sep 2017 (date only)");
    expect(fullDateTime(T("2017-09-05T12:45:10Z"), "second", 0)).toBe("5 Sep 2017, 12:45 UTC+00:00");
    expect(fullDateTime(T("2017-09-05T12:45:10Z"), "second", 330, { seconds: true })).toBe("5 Sep 2017, 18:15:10 IST");
    expect(fullDateTime(T("2017-09-05T12:45:10Z"), "minute", 330, { seconds: true })).toBe("5 Sep 2017, 18:15 IST");
  });

  it("gap labels", () => {
    expect(gapLabel(5 * 86_400_000)).toBe("5 days later");
    expect(gapLabel(3 * 3_600_000)).toBe("3 hours later");
    expect(gapLabel(2 * 365.25 * 86_400_000)).toBe("2 years later");
  });
});

describe("offsetMinutes", () => {
  it("parses EXIF_DEFAULT_UTC_OFFSET and falls back to India", async () => {
    const { offsetMinutes } = await import("@/lib/charts/time-axis");
    expect(offsetMinutes("+05:30")).toBe(330);
    expect(offsetMinutes("-03:00")).toBe(-180);
    expect(offsetMinutes("nonsense")).toBe(330);
  });
});
