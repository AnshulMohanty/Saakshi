/** The evidence drawer in plain words (pure: lib/app/drawer.ts). */
import { describe, expect, it } from "vitest";
import { groupRows, plainVerdict, pointsBreakdown, questionOf, whyLine, type DrawerRow } from "@/lib/app/drawer";

const row = (o: Partial<DrawerRow>): DrawerRow => ({ label: "x", note: "", pts: 10, max: 10, tone: "good", ...o });
const ROWS: DrawerRow[] = [
  row({ signal: "location", label: "No location recorded", note: "No location recorded.", pts: 0, max: 30, tone: "warn" }),
  row({ signal: "time", label: "Upload time only", note: "No capture time recorded, so the upload time is used.", pts: 5, max: 20, tone: "warn" }),
  row({ signal: "uniqueness", label: "Fingerprint is new", pts: 20, max: 20 }),
  row({ signal: "authenticity", label: "No watermark or edits", pts: 15, max: 15 }),
  row({ signal: "quality", label: "Sharp enough to measure", pts: 10, max: 10 }),
  row({ signal: "provenance", label: "Camera recorded", pts: 0, max: 5, note: "No camera make or model in the file.", tone: "neutral" }),
];

describe("questions", () => {
  it("groups rows by the question they answer, by signal first and label words as a fallback", () => {
    const gs = groupRows(ROWS);
    expect(gs.map((g) => g.key)).toEqual(["where", "when", "original", "clear"]);
    const orig = gs.find((g) => g.key === "original")!;
    expect(orig.rows.map((r) => r.label)).toEqual(["Fingerprint is new", "No watermark or edits", "Camera recorded"]);
    expect([orig.pts, orig.max, orig.tone]).toEqual([35, 40, "warn"]);
    expect(gs.find((g) => g.key === "clear")!.tone).toBe("good");
    expect(gs.map((g) => g.answer)).toEqual(["No", "Partly", "Partly", "Yes"]);
    // The parity fixture's rows have no signal: their words place them.
    expect(questionOf({ label: "Location recorded" })).toBe("where");
    expect(questionOf({ label: "Time recorded" })).toBe("when");
    expect(questionOf({ label: "Taken in the Saakshi app" })).toBe("original");
    expect(questionOf({ label: "Something new" })).toBe("other");
    // Every row lands in exactly one group.
    expect(gs.reduce((n, g) => n + g.rows.length, 0)).toBe(ROWS.length);
  });

  it("gives a why-line to every row short of its points, and none at full points", () => {
    expect(whyLine(ROWS[1])).toBe("15 points short: no capture time recorded, so the upload time is used.");
    expect(whyLine(row({ pts: 4, max: 5, note: "One point off" }))).toBe("1 point short: one point off.");
    expect(whyLine(ROWS[2])).toBeNull();
    for (const g of groupRows(ROWS)) for (const r of g.rows) expect(r.why === null).toBe(r.pts >= r.max);
  });
});

describe("pointsBreakdown", () => {
  it("adds up to the score: the parts' sum plus the adjustment", () => {
    const b = pointsBreakdown(ROWS, 50, [])!;
    expect(b.sum).toBe(50);
    expect(b.adjust).toBeNull();
    expect(b.parts.reduce((n, p) => n + p.pts, 0) + (b.adjust?.pts ?? 0)).toBe(b.score);
  });

  it("shows a hard flag's cap as its own term, so the numbers still add up", () => {
    const b = pointsBreakdown(ROWS, 30, ["Stock-site watermark"])!;
    expect(b.adjust).toEqual({ pts: -20, why: "capped by a hard flag: stock-site watermark" });
    expect(b.sum + b.adjust!.pts).toBe(30);
    // Only the first letter is lowered: later sentences keep their capitals.
    expect(pointsBreakdown(ROWS, 30, ["The stamp says 1,947 km away. The camera says here."])!.adjust!.why).toBe("capped by a hard flag: the stamp says 1,947 km away. The camera says here");
  });

  it("has nothing to show when the score is hidden", () => {
    expect(pointsBreakdown(ROWS, null, [])).toBeNull();
  });
});

describe("plainVerdict", () => {
  it("says what the band means for this photo, with the deciding reason", () => {
    expect(plainVerdict("Verified", "Location, time and fingerprint check out", [])).toBe("Good to use as proof: location, time and fingerprint check out.");
    expect(plainVerdict("Needs review", "No location recorded.", [])).toBe("Not proven yet: no location recorded. A person should check it before it counts.");
    expect(plainVerdict("Flagged", "Taken 715 km from the site", ["Stock-site watermark"])).toBe("Don't count this photo: stock-site watermark.");
  });
});
