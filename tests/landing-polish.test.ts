/** Landing polish helpers (pure): the seal's sum, plain-words parameters, storm cells and grids, flag explanations, visit spans. */
import { describe, expect, it } from "vitest";
import { flagExplain, visitSpan } from "@/lib/landing/copy";
import { paramLabel, perceptionParams, UPLOAD_PARAMS, urlParams } from "@/lib/landing/params";
import { sealRunning, sealSteps } from "@/lib/landing/seal";
import { cellId, gridBlocks, heroKeyOf, stormSlots } from "@/lib/landing/storm-slots";
import type { LandingProject, StormPhoto } from "@/lib/landing/types";
import type { TrustReason } from "@/lib/trust/types";

const R = (code: TrustReason["code"], signal: TrustReason["signal"], kind: TrustReason["kind"], points: number, detail: TrustReason["detail"] = {}): TrustReason => ({ code, signal, kind, points, detail });

describe("sealSteps (chapter 1)", () => {
  const reasons = [
    R("QUALITY_OK", "quality", "points", 10),
    R("PROVENANCE_NONE", "provenance", "points", 0),
    R("LOCATION_EXIF", "location", "points", 30),
    R("TIME_IN_WINDOW", "time", "points", 20),
    R("UNIQUE", "uniqueness", "points", 20),
    R("STOCK_SUSPECTED", "authenticity", "hard", 0),
    R("TIME_NO_WINDOW", "time", "info", 0),
    R("HARD_FLAG_CAP", "score", "points", -40, { cap: 40 }),
  ];

  it("groups reasons under their layer and always adds up: Σ items + cap = score", () => {
    const s = sealSteps(reasons, 40, "Litter cover 12%, measured");
    expect(s.steps.map((x) => x.layer)).toEqual([1, 2, 3, 4, 5]);
    expect(s.steps.map((x) => x.points)).toEqual([10, 50, 20, 0, 0]);
    expect(s.cap).toMatchObject({ points: -40, cap: 40 });
    expect(s.steps.reduce((n, x) => n + x.points, 0) + s.cap!.points).toBe(40);
    expect(s.clamped).toBe(false);
    // Info reasons and the cap itself are not items; a zero-point signal says "0 of N".
    expect(s.steps.flatMap((x) => x.items).some((i) => i.code === "TIME_NO_WINDOW" || i.code === "HARD_FLAG_CAP")).toBe(false);
    expect(s.steps[0].items.find((i) => i.code === "PROVENANCE_NONE")!.chip.text).toMatch(/0 of \d+/);
    expect(s.steps[4].note).toBe("Litter cover 12%, measured");
  });

  it("runs the score step by step and ends on the engine's score", () => {
    const s = sealSteps(reasons, 40, null);
    const run = sealRunning(s);
    expect(run).toEqual([10, 60, 80, 80, 40]);
    expect(run.at(-1)).toBe(s.score);
  });

  it("says so when the engine clamped a negative sum at 0", () => {
    const s = sealSteps([R("LOCATION_MISMATCH", "location", "points", -30), R("QUALITY_OK", "quality", "points", 10)], 0, null);
    expect(s.clamped).toBe(true);
    expect(s.cap).toBeNull();
  });
});

describe("parameters in plain words (chapter 10)", () => {
  it("labels every component of a signed transformation", () => {
    expect(paramLabel("s--AbC12345--")).toMatch(/Signature/);
    expect(paramLabel("v1")).toMatch(/Version/);
    expect(paramLabel("c_fill,g_auto,w_800,h_600")).toBe("The same 800×600 frame for every photo, centred on the subject");
    expect(paramLabel("c_fill,g_auto")).toBe("Crops to one fixed frame");
    expect(paramLabel("e_blur_faces:1200")).toMatch(/face/i);
    expect(paramLabel("c_limit,w_1200")).toBe("Public size, at most 1200 px wide");
    expect(paramLabel("x_unknown")).toBe("Part of the signed transformation");
    expect(urlParams("s--x--/c_limit,w_1200/f_auto,q_auto").map((p) => p.code)).toEqual(["s--x--", "c_limit,w_1200", "f_auto,q_auto"]);
  });

  it("lists perception's calls as configured, with the OpenAI fallback only when it can run", () => {
    expect(perceptionParams("on").some((p) => /OpenAI/.test(p.code))).toBe(false);
    expect(perceptionParams("auto").at(-1)!.code).toBe("OpenAI vision (fallback)");
    expect(perceptionParams("off")[0].code).toBe("OpenAI vision");
    expect(UPLOAD_PARAMS.every((p) => p.label.length > 10)).toBe(true);
  });
});

describe("storm cells and grids (chapter 2)", () => {
  const P = (key: string, isHero = false, lng = 75): LandingProject => ({ key, name: key, city: "", lat: 15, lng, count: 0, range: "", stackDir: 1, stackBelow: false, labelBelow: false, isHero }) as LandingProject;
  const T = (id: string, project: string): StormPhoto => ({ id, src: "", w: 4, h: 3, lat: null, lng: null, project });

  it("keeps slot 0 of the hero project for the hero card, and sends unknown projects to the hero", () => {
    const projects = [P("a"), P("hero", true), P("b")];
    expect(heroKeyOf(projects)).toBe("hero");
    const { slots, counts } = stormSlots([T("1", "hero"), T("2", "a"), T("3", "zzz"), T("4", "a")], projects);
    expect(slots).toEqual([
      { k: "hero", slot: 1 },
      { k: "a", slot: 0 },
      { k: "hero", slot: 2 },
      { k: "a", slot: 1 },
    ]);
    expect(counts).toEqual({ a: 2, hero: 3, b: 0 });
    expect(cellId("a", 1)).toBe("a:1");
  });

  it("places grids beside their pins, inside the box, without overlapping", () => {
    const o = { cs: 20, gap: 3, cols: 5, midX: 500, labelH: 18, W: 1000, H: 700 };
    const bs = gridBlocks(
      [
        { key: "w", x: 300, y: 300, n: 20 },
        { key: "e", x: 640, y: 320, n: 16 },
        { key: "s", x: 560, y: 560, n: 26 },
      ],
      o,
    );
    expect(bs.map((b) => b.key)).toEqual(["w", "e", "s"]);
    for (const b of bs) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.left + b.w).toBeLessThanOrEqual(o.W);
      expect(b.top - o.labelH).toBeGreaterThanOrEqual(0);
      expect(b.top + b.h).toBeLessThanOrEqual(o.H);
    }
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const [a, b] = [bs[i], bs[j]];
        const apart = a.left + a.w <= b.left || b.left + b.w <= a.left || a.top + a.h <= b.top - o.labelH || b.top + b.h <= a.top - o.labelH;
        expect(apart).toBe(true);
      }
    // West of the middle opens west (toward the nearer sea) when there is room.
    expect(bs[0].side).toBe(-1);
  });
});

describe("chapter copy", () => {
  it("explains every planted fake's rule and what would change the verdict", () => {
    for (const code of ["REUSED", "STOCK_SUSPECTED", "LOCATION_MISMATCH", "STAMP_MISMATCH", "SCREEN_OR_PRINT", "TIME_OUTSIDE"] as const) {
      const e = flagExplain(code);
      expect(e.rule.length).toBeGreaterThan(20);
      expect(e.proof.length).toBeGreaterThan(15);
    }
    expect(flagExplain("UNIQUE").rule).toBe("A fixed rule of the Trust Engine.");
  });

  it("says honestly when every visit was on one day, and spans otherwise", () => {
    const day = (t: number) => new Date(t).toISOString().slice(0, 10);
    const t0 = Date.UTC(2017, 8, 5, 10, 0);
    expect(visitSpan([t0, t0 + 6 * 60_000, t0 + 2 * 60_000], day)).toEqual({ sameDay: true, text: "on 2017-09-05, within 6 minutes" });
    expect(visitSpan([t0], day)).toEqual({ sameDay: true, text: "on 2017-09-05, within 1 minute" });
    expect(visitSpan([t0, t0 + 3 * 3_600_000], day).text).toBe("on 2017-09-05, within 3 hours");
    expect(visitSpan([t0, Date.UTC(2017, 11, 5)], day)).toEqual({ sameDay: false, text: "over 3 months, 2017-09-05 to 2017-12-05" });
    expect(visitSpan([], day)).toEqual({ sameDay: true, text: "" });
  });
});
