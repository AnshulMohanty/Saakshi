/** Library search chips (pure: lib/app/chips.ts). */
import { describe, expect, it } from "vitest";
import { matches, parseChip, projectLabel, type ChipPhoto } from "@/lib/app/chips";

const projects = [
  { key: "mumbai", name: "Versova beach clean-up", city: "Mumbai", aliases: ["versova", "juhu"] },
  { key: "pune", name: "Lake clean-up", city: "Pune", aliases: ["pavana"] },
  { key: "tiruppur", name: "River clean-up", city: "Tiruppur North" },
];

describe("parseChip", () => {
  it("reads bands, as the prototype does", () => {
    expect(parseChip("Verified", projects)).toMatchObject({ t: "band", v: "Verified" });
    expect(parseChip("needs review", projects)).toMatchObject({ t: "band", v: "Needs review" });
    expect(parseChip("fakes", projects)).toMatchObject({ t: "band", v: "Flagged" });
    expect(parseChip("flaged", projects)).toMatchObject({ t: "band", v: "Flagged" }); // typo, corrected
  });

  it("finds a project by any word of its name, city or aliases, and labels it like the prototype", () => {
    expect(parseChip("juhu", projects)).toEqual({ t: "project", v: "mumbai", kind: "Project", label: "Versova, Mumbai" });
    expect(parseChip("Pune", projects)).toMatchObject({ v: "pune", label: "Lake, Pune" });
    expect(parseChip("lake", projects)).toMatchObject({ v: "pune" });
    expect(parseChip("tiruppur", projects)).toMatchObject({ v: "tiruppur", label: "River, Tiruppur North" });
    // "beach" is in two prototype projects' names, so it is text, not a project.
    expect(parseChip("beach", projects)).toMatchObject({ t: "text" });
  });

  it("reads no location, years and text (Hinglish normalised)", () => {
    expect(parseChip("no GPS", projects)).toMatchObject({ t: "noloc", label: "none recorded" });
    expect(parseChip("2024", projects)).toEqual({ t: "year", v: "2024", kind: "Taken in", label: "2024" });
    expect(parseChip("kachra", projects)).toEqual({ t: "text", v: "garbage", kind: "Text", label: '"kachra"' });
    expect(parseChip("   ", projects)).toBeNull();
  });

  it("labels a project without a city by its first meaningful word", () => {
    expect(projectLabel({ key: "x", name: "Live stage demo", city: "" })).toBe("Live");
  });
});

describe("matches", () => {
  const p = (o: Partial<ChipPhoto> = {}): ChipPhoto => ({ id: "a", band: "Verified", project: "mumbai", year: "2024", gps: true, title: "Garbage on the beach at Versova", reason: "Location, time and fingerprint check out", ...o });
  const none = { band: "all" as const, zoom: null, chips: [] };

  it("applies the band filter, the zoomed project and every chip together", () => {
    expect(matches(p(), none)).toBe(true);
    expect(matches(p(), { ...none, band: "Flagged" })).toBe(false);
    expect(matches(p(), { ...none, zoom: "pune" })).toBe(false);
    const year = parseChip("2024", projects)!;
    const pune = parseChip("pune", projects)!;
    expect(matches(p(), { ...none, chips: [year] })).toBe(true);
    expect(matches(p(), { ...none, chips: [year, pune] })).toBe(false);
    expect(matches(p({ gps: false }), { ...none, chips: [parseChip("no location", projects)!] })).toBe(true);
    expect(matches(p(), { ...none, chips: [parseChip("no location", projects)!] })).toBe(false);
  });

  it("text matches normalised words in the title or reason, or the hybrid search's ids when given", () => {
    const kachra = parseChip("kachra", projects)!;
    expect(matches(p(), { ...none, chips: [kachra] })).toBe(true);
    expect(matches(p({ title: "Clean shore" }), { ...none, chips: [kachra] })).toBe(false);
    const withIds = { ...kachra, ids: ["b"] } as typeof kachra;
    expect(matches(p(), { ...none, chips: [withIds] })).toBe(false);
    expect(matches(p({ id: "b", title: "Clean shore" }), { ...none, chips: [withIds] })).toBe(true);
  });
});
