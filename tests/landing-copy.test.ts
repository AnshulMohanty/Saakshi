import { describe, expect, it } from "vitest";
import { aiSentence, creditTitle, decisiveReason, flagTitle, placeShort, splitProjectName, stackLayout, yearRange } from "@/lib/landing/copy";

describe("landing copy from our data (B5.4)", () => {
  it("shortens places and splits project names", () => {
    expect(placeShort("Palayakkadu, TiruppurNorth, Tamil Nadu, India")).toBe("Palayakkadu, TiruppurNorth");
    expect(placeShort(null)).toBeNull();
    expect(splitProjectName("River clean-up, Tiruppur North")).toEqual({ name: "River clean-up", city: "Tiruppur North" });
    expect(splitProjectName("Try to fool it")).toEqual({ name: "Try to fool it", city: "" });
  });

  it("gives year ranges like the prototype (\"2017 to 2020\")", () => {
    expect(yearRange([new Date("2020-03-30"), new Date("2017-09-05"), null])).toBe("2017 to 2020");
    expect(yearRange([new Date("2017-09-05")])).toBe("2017");
    expect(yearRange([])).toBe("");
  });

  it("titles each planted fake from the reason that caught it", () => {
    expect(flagTitle({ code: "REUSED", detail: { otherProject: "Lake clean-up, Hyderabad" } })).toBe("Same photo already used in Lake clean-up, Hyderabad");
    expect(flagTitle({ code: "LOCATION_MISMATCH", detail: { distanceKm: 1143.2 } })).toBe("Taken 1,143 km from the site");
    expect(flagTitle({ code: "STOCK_SUSPECTED", detail: {} })).toBe("Stock-site watermark");
    expect(flagTitle({ code: "STAMP_MISMATCH", detail: { distanceKm: 1480 } })).toBe("The stamp says 1,480 km away. The camera says here.");
    expect(flagTitle({ code: "STAMP_MISMATCH", detail: { distanceKm: null } })).toMatch(/date/);
    expect(decisiveReason([{ kind: "points" }, { kind: "review" }, { kind: "hard" }])).toEqual({ kind: "hard" });
    expect(decisiveReason([{ kind: "points" }])).toBeNull();
  });

  it("lays stacks out like the prototype: hero left with its label below, a near project below its pin", () => {
    const out = stackLayout([
      { key: "mumbai", lat: 19.13, lng: 72.82, isHero: true },
      { key: "pune", lat: 18.52, lng: 73.86, isHero: false },
      { key: "chennai", lat: 13.05, lng: 80.28, isHero: false },
    ]);
    expect(out.map((p) => [p.key, p.stackDir, p.stackBelow, p.labelBelow])).toEqual([
      ["mumbai", -1, false, true],
      ["pune", 1, true, false],
      ["chennai", 1, false, false],
    ]);
  });

  it("formats credits and the AI sentence", () => {
    expect(creditTitle("Noyyal River in Tiruppur JEG0329.jpg")).toBe("Noyyal River in Tiruppur JEG0329");
    expect(aiSentence(["plastic bottles", "bags", "people", "bags"])).toBe("Plastic bottles, bags, people.");
    expect(aiSentence([])).toBe("Nothing tagged yet.");
  });
});

describe("arrival reason (Witness Wall, live events)", () => {
  it("prefers a flag, then the first scoring reason", async () => {
    const { arrivalReason } = await import("@/lib/landing/copy");
    expect(arrivalReason([{ code: "UNIQUE", signal: "uniqueness", kind: "points", points: 20, detail: {} }, { code: "REUSED", signal: "uniqueness", kind: "hard", points: 0, detail: { otherProject: "Lake", otherDate: "2025-01-01", similarityPct: 97 } }])).toMatch(/97% match/);
    expect(arrivalReason([{ code: "LOCATION_NONE", signal: "location", kind: "points", points: 0, detail: {} }, { code: "UNIQUE", signal: "uniqueness", kind: "points", points: 20, detail: {} }])).toBe("Not a copy of any earlier photo.");
    expect(arrivalReason(null)).toBe("Checking");
  });
});
