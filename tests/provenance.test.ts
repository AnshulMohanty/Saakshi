import { describe, expect, it } from "vitest";
import type { Claim } from "@/lib/claims";
import { aiPending, assetMode, combineModes, HIDDEN_MOCK, LOW_CONFIDENCE, MOCK_TAG, mockLabel, numberPolicy, PREVIEW_TAG, showClaim, showEstimate, showNumber } from "@/lib/provenance";

const dev = { production: false, minConfidence: 0.5 };
const prod = { production: true, minConfidence: 0.5 };
const claim = (o: Partial<Claim> = {}): Claim => ({ id: "photos_verified", label: "Photos verified", value: 20, unit: "photos", method: "measured", asset_ids: ["a"], provider_mode: "real", ...o });

describe("provider mode", () => {
  it("an asset is real only when both analysis and AI were real; unknown is mock", () => {
    expect(assetMode({ analysis: { mode: "real", provider: "cloudinary-analyze" }, ai: { mode: "real", model: "gpt-5.6-luna" } })).toBe("real");
    expect(assetMode({ analysis: { mode: "real", provider: "cloudinary-analyze" }, ai: { mode: "mock", model: "mock-vision-1" } })).toBe("mock");
    expect(assetMode({})).toBe("mock");
    expect(assetMode(null)).toBe("mock");
  });

  it("combineModes: mock if anything is mock, or if there is nothing to vouch for it", () => {
    expect(combineModes(["real", "real"])).toBe("real");
    expect(combineModes(["real", "mock"])).toBe("mock");
    expect(combineModes(["real", undefined])).toBe("mock");
    expect(combineModes([])).toBe("mock");
  });

  it("numberPolicy: real shows; mock is tagged in development and hidden in production", () => {
    expect(numberPolicy("real", prod)).toBe("show");
    expect(numberPolicy("mock", dev)).toBe("tag");
    expect(numberPolicy("mock", prod)).toBe("hide");
  });

  it("the preview (DEMO_PREVIEW=1) tags mock values in production as prototype measurements, and withholds mock AI readings", () => {
    const preview = { ...prod, preview: true };
    expect(numberPolicy("mock", preview)).toBe("tag");
    expect(numberPolicy("real", preview)).toBe("show");
    expect(showNumber(42, "mock", preview)).toEqual({ kind: "value", text: "42", mock: true });
    expect(mockLabel(preview)).toBe(PREVIEW_TAG);
    expect(mockLabel(dev)).toBe(MOCK_TAG);
    expect(aiPending("mock", preview)).toBe(true);
    expect(aiPending("real", preview)).toBe(false);
    expect(aiPending("mock", dev)).toBe(false);
    expect(aiPending("mock", prod)).toBe(false);
  });
});

describe("a mock-derived claim can't render in production", () => {
  it("production hides it; development shows it tagged", () => {
    const mock = claim({ provider_mode: "mock" });
    expect(showClaim(mock, prod)).toEqual({ kind: "hidden", text: HIDDEN_MOCK, reason: "mock_in_production" });
    expect(showClaim(mock, prod).text).not.toMatch(/\d/);
    expect(showClaim(mock, dev)).toEqual({ kind: "value", text: "20 photos", mock: true });
    expect(showClaim(claim(), prod)).toEqual({ kind: "value", text: "20 photos", mock: false });
  });

  it("a claim with no recorded mode counts as mock", () => {
    const { provider_mode: _drop, ...legacy } = claim();
    void _drop;
    expect(showClaim(legacy as Claim, prod).kind).toBe("hidden");
  });

  it("raw numbers and estimates follow the same rule", () => {
    expect(showNumber(88, "mock", prod)).toMatchObject({ kind: "hidden", text: HIDDEN_MOCK });
    expect(showNumber(88, "real", prod)).toMatchObject({ kind: "value", text: "88", mock: false });
    expect(showNumber(null, "real", prod)).toBeNull();
  });
});

describe("AI estimates below the confidence threshold", () => {
  it("show 'Not enough confidence to estimate' instead of a number", () => {
    const items = claim({ id: "items_visible_change", method: "ai_estimated", confidence: 0.38, unit: "items", value: 19 });
    expect(showClaim(items, dev)).toEqual({ kind: "hidden", text: LOW_CONFIDENCE, reason: "low_confidence" });
    expect(showClaim({ ...items, confidence: 0.5 }, dev)).toMatchObject({ kind: "value", text: "≈+19 items" });
    expect(showEstimate(19, 0.38, "real", prod)).toMatchObject({ kind: "hidden", text: LOW_CONFIDENCE });
    expect(showEstimate(19, 0.8, "mock", prod)).toMatchObject({ kind: "hidden", text: HIDDEN_MOCK }); // mock wins in production
  });
});
