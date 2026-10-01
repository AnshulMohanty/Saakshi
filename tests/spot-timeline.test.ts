/** The spot page's timeline labels, counters and trend geometry (pure: lib/measure/timeline.ts, lib/charts/trend-svg.ts). */
import { describe, expect, it } from "vitest";
import { breakJoins, TREND_BOX, trendGeometry, trendPath } from "@/lib/charts/trend-svg";
import { daysSince, pct, timelineLabels } from "@/lib/measure/timeline";

const T = (iso: string) => Date.parse(iso);
const DAY = 86_400_000;

describe("timelineLabels", () => {
  const photos = [
    { id: "a", t: T("2026-09-14T07:30:00+05:30"), source: "archive" },
    { id: "b", t: T("2026-09-14T08:30:00+05:30"), source: "archive" },
    { id: "c", t: T("2026-09-14T11:30:00+05:30"), source: "archive" },
    { id: "d", t: T("2026-09-17T12:00:00+05:30"), source: "witness" },
    { id: "e", t: T("2026-09-18T12:00:00+05:30"), source: "upload" },
    { id: "f", t: T("2026-09-20T12:00:00+05:30"), source: "witness" },
  ];

  it("names photos from stored facts: earlier than the baseline, the baseline, later, numbered check-ins", () => {
    const l = timelineLabels(photos, "c");
    expect(l.map((x) => x.label)).toEqual(["Earlier 1", "Earlier 2", "Baseline", "Check-in 1", "Later", "Check-in 2"]);
    expect(l[0].suffix).toBe(", before the baseline");
    expect(l[2].suffix).toBe(", the baseline");
    expect(l[3]).toEqual({ label: "Check-in 1", suffix: "", who: "Witness check-in" });
    expect(l[4].who).toBe("Uploaded in the app");
  });

  it("a single photo of a kind is not numbered", () => {
    expect(timelineLabels(photos.slice(1), "c").map((x) => x.label)).toEqual(["Earlier", "Baseline", "Check-in 1", "Later", "Check-in 2"]);
  });

  it("without a baseline every non-check-in photo is a numbered photo, and an unknown baseline id counts as none", () => {
    expect(timelineLabels(photos.slice(0, 4), null).map((x) => x.label)).toEqual(["Photo 1", "Photo 2", "Photo 3", "Check-in 1"]);
    expect(timelineLabels(photos.slice(0, 2), "zzz").map((x) => x.label)).toEqual(["Photo 1", "Photo 2"]);
  });

  it("a check-in that is also the baseline stays a check-in", () => {
    expect(timelineLabels(photos, "d")[3].label).toBe("Check-in 1");
  });
});

describe("daysSince and pct", () => {
  it("counts whole days from the latest check-in, never negative, null without one", () => {
    const now = T("2026-09-28T16:23:00+05:30");
    expect(daysSince([T("2026-09-27T12:00:00+05:30"), T("2026-09-20T12:00:00+05:30")], now)).toBe(1);
    expect(daysSince([null, T("2026-09-21T16:23:00+05:30")], now)).toBe(7);
    expect(daysSince([now + DAY], now)).toBe(0);
    expect(daysSince([], now)).toBeNull();
    expect(daysSince([null], now)).toBeNull();
  });

  it("shows whole numbers as they are and keeps one decimal otherwise", () => {
    expect(pct(10)).toBe("10");
    expect(pct(3.456)).toBe("3.5");
    expect(pct(0)).toBe("0");
  });
});

describe("trendGeometry", () => {
  const prototype = [
    ["2026-09-14T07:30:00+05:30", 10],
    ["2026-09-14T11:30:00+05:30", 2],
    ["2026-09-17T12:00:00+05:30", 3],
    ["2026-09-20T12:00:00+05:30", 2],
    ["2026-09-23T12:00:00+05:30", 6],
    ["2026-09-25T12:00:00+05:30", 4],
    ["2026-09-27T12:00:00+05:30", 3],
  ].map(([at, v]) => ({ t: T(at as string), value: v as number }));

  it("uses the design's box and scale: y = 210 − v/10 · 180, x across 20–540 by time", () => {
    const g = trendGeometry(prototype);
    expect(g.max).toBe(10);
    expect(g.pts.map((p) => p.y)).toEqual([30, 174, 156, 174, 102, 138, 156]);
    expect(g.pts[0].x).toBe(TREND_BOX.x0);
    expect(g.pts.at(-1)!.x).toBe(TREND_BOX.x1);
    // By time, not by index: the two clean-up-day photos sit 4 hours apart on a 13-day axis.
    expect(g.pts[1].x - g.pts[0].x).toBeLessThan(10);
    expect(g.breaks).toEqual([]);
    expect(g.ticks.length).toBeGreaterThan(1);
    expect(g.ticks.every((t) => t.x >= TREND_BOX.x0 && t.x <= TREND_BOX.x1)).toBe(true);
  });

  it("the scale grows in tens above 10 and caps nothing below it", () => {
    expect(trendGeometry([{ t: 0, value: 23.4 }, { t: DAY, value: 5 }]).max).toBe(30);
    expect(trendGeometry([{ t: 0, value: 0 }]).max).toBe(10);
  });

  it("the line draws up to the chosen point and restarts after a break, joined by a dashed line", () => {
    const runs = [
      { t: T("2017-09-05T12:45:00Z"), value: 8 },
      { t: T("2017-09-05T12:51:00Z"), value: 4 },
      { t: T("2020-03-30T03:52:00Z"), value: 5 },
      { t: T("2020-04-04T01:51:00Z"), value: 3 },
    ];
    const g = trendGeometry(runs);
    expect(g.breaks).toHaveLength(1);
    expect(g.breaks[0].label).toBe("2.6 years later");
    expect(g.pts.map((p) => p.run)).toEqual([0, 0, 1, 1]);
    expect(trendPath(g, 1).match(/M/g)).toHaveLength(1);
    expect(trendPath(g, 3).match(/M/g)).toHaveLength(2);
    expect(breakJoins(g, 1)).toEqual([]);
    expect(breakJoins(g, 3)).toEqual([{ x1: g.pts[1].x, y1: g.pts[1].y, x2: g.pts[2].x, y2: g.pts[2].y }]);
    expect(g.captions).toEqual(["5 Sep 2017 (IST)"]);
  });

  it("edge ticks anchor inwards so labels stay inside the card", () => {
    const g = trendGeometry(prototype);
    for (const t of g.ticks) {
      if (t.x - TREND_BOX.x0 < 30) expect(t.anchor).toBe("start");
      else if (TREND_BOX.x1 - t.x < 30) expect(t.anchor).toBe("end");
      else expect(t.anchor).toBe("middle");
    }
  });
});
