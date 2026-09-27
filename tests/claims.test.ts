import { describe, expect, it } from "vitest";
import {
  ClaimSchema,
  extractClaimIds,
  findProseIssues,
  formatClaimValue,
  ProseValidationError,
  renderClaims,
  validateProse,
  type Claim,
} from "@/lib/claims";

const claims: Claim[] = [
  { id: "bags", label: "Bags of litter removed", value: 1240, unit: "bags", method: "measured", asset_ids: ["a1", "a2"] },
  { id: "cover", label: "Litter cover reduction", value: 38.456, unit: "%", method: "measured", asset_ids: ["a3"] },
  { id: "people_2025", label: "Volunteers", value: 150000, unit: "", method: "measured", asset_ids: [] },
  { id: "trees", label: "Saplings visible", value: 12, unit: "saplings", method: "ai_estimated", confidence: 0.7, asset_ids: ["a4"] },
];

describe("renderClaims", () => {
  it("fills every placeholder, including repeats", () => {
    const out = renderClaims("Volunteers removed {{claim:bags}}; cover fell {{claim:cover}}. Again: {{claim:bags}}.", claims);
    expect(out).toBe("Volunteers removed 1,240 bags; cover fell 38.46%. Again: 1,240 bags.");
  });

  it("uses Indian digit grouping by default and supports other locales", () => {
    expect(renderClaims("{{claim:people_2025}}", claims)).toBe("1,50,000");
    expect(renderClaims("{{claim:people_2025}}", claims, { locale: "en-US" })).toBe("150,000");
  });

  it("marks AI-estimated values", () => {
    expect(formatClaimValue(claims[3])).toBe("≈12 saplings");
  });

  it("lets callers wrap values (e.g. link to source photos)", () => {
    const out = renderClaims("{{claim:bags}}", claims, { wrap: (v, c) => `[${v}](/e/${c.asset_ids[0]})` });
    expect(out).toBe("[1,240 bags](/e/a1)");
  });

  it("throws on an unknown claim id", () => {
    expect(() => renderClaims("{{claim:nope}}", claims)).toThrow(/Unknown claim "nope"/);
  });

  it("extracts ids in order of first appearance", () => {
    expect(extractClaimIds("{{claim:cover}} {{claim:bags}} {{claim:cover}}")).toEqual(["cover", "bags"]);
  });
});

describe("validateProse", () => {
  it("accepts prose whose numbers are all placeholders (ids may contain digits)", () => {
    expect(() =>
      validateProse(
        "Across the drive, {{claim:people_2025}} volunteers removed {{claim:bags}}. One of the spots improved most.",
      ),
    ).not.toThrow();
  });

  it("rejects ASCII digits outside placeholders", () => {
    expect(() => validateProse("Volunteers removed 12 bags.")).toThrow(ProseValidationError);
    expect(() => validateProse("Cover fell by {{claim:cover}}, about 40% overall.")).toThrow(ProseValidationError);
  });

  it("rejects non-ASCII numerals (Devanagari, fractions, superscripts)", () => {
    for (const s of ["स्वयंसेवकों ने १२ बैग उठाए", "about ½ of the spot", "area of m²"]) {
      expect(() => validateProse(s), s).toThrow(ProseValidationError);
    }
  });

  it("rejects spelled-out quantities unless allowed", () => {
    expect(() => validateProse("Twelve bags were removed.")).toThrow(ProseValidationError);
    expect(() => validateProse("Hundreds of volunteers came.")).toThrow(ProseValidationError);
    expect(() => validateProse("Twelve bags were removed.", { allowNumberWords: true })).not.toThrow();
    expect(() => validateProse("Someone often came; the tent stood.")).not.toThrow();
  });

  it("rejects malformed placeholders", () => {
    for (const s of ["{{claim: bags}}", "{{bags}}", "{{claim:bags}", "{{claim:_bags}}"]) {
      expect(findProseIssues(s).some((i) => i.kind === "malformed_placeholder"), s).toBe(true);
    }
  });

  it("rejects placeholders for unknown claims when ids are given", () => {
    expect(() => validateProse("{{claim:bags}} and {{claim:ghost}}", { claimIds: ["bags"] })).toThrow(/unknown_claim/);
    expect(() => validateProse("{{claim:bags}}", { claimIds: ["bags"] })).not.toThrow();
  });

  it("reports every issue with its position", () => {
    let issues: ProseValidationError["issues"] = [];
    try {
      validateProse("In 2025 we saw seven sites.");
    } catch (e) {
      issues = (e as ProseValidationError).issues;
    }
    expect(issues.map((i) => i.kind)).toEqual(["digit", "digit", "digit", "digit", "number_word"]);
    expect(issues[0].index).toBe(3);
  });
});

describe("ClaimSchema", () => {
  it("requires a confidence for AI-estimated claims", () => {
    const noConfidence: Partial<Claim> = { ...claims[3] };
    delete noConfidence.confidence;
    expect(ClaimSchema.safeParse(noConfidence).success).toBe(false);
    expect(ClaimSchema.safeParse(claims[3]).success).toBe(true);
    expect(ClaimSchema.safeParse(claims[0]).success).toBe(true);
  });
});
