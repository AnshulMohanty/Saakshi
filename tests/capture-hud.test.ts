/** The capture HUD in numbers and words (pure: lib/capture/hud.ts). */
import { describe, expect, it } from "vitest";
import { accText, accTone, coordsText, isLevel, levelText, MAP, miniMapDot, ringPx, rollDeg, spotShort, stepLabels, stepOf } from "@/lib/capture/hud";

describe("accuracy", () => {
  it("uses the design's thresholds, ring size and wording", () => {
    expect([accTone(6), accTone(10), accTone(11), accTone(25), accTone(26), accTone(null)]).toEqual(["good", "good", "fair", "fair", "poor", "none"]);
    expect([accText(6), accText(15.4), accText(null)]).toEqual(["±6 m, good fix", "±15 m", "Location off"]);
    expect(ringPx(30)).toBe(88);
    expect(ringPx(null)).toBe(40);
    expect(ringPx(5000)).toBe(ringPx(120));
  });

  it("reads level within a degree, and the horizon roll from the device", () => {
    expect([isLevel(1), isLevel(-1), isLevel(2), isLevel(null)]).toEqual([true, true, false, false]);
    expect([levelText(0), levelText(4), levelText(null)]).toEqual(["Level", "Tilt to level", ""]);
    expect(rollDeg(80, 10)).toBe(-10);
    expect(rollDeg(80, -0.2)).toBe(0);
    expect(rollDeg(5, 3, 90)).toBe(5);
    expect(rollDeg(null, 10)).toBeNull();
  });
});

describe("miniMapDot", () => {
  const spot = { lat: 19.1265, lng: 72.8156, radiusM: 150 };

  it("puts the centre in the middle and says inside", () => {
    expect(miniMapDot(spot, spot)).toEqual({ x: MAP.center, y: MAP.center, text: "Inside the spot", inside: true });
  });

  it("scales metres so the site radius is 30 px, east right and north up", () => {
    const north = miniMapDot(spot, { lat: spot.lat + 100 / 111_195, lng: spot.lng })!; // ~100 m north
    expect(north.y).toBe(MAP.center - 20);
    expect(north.x).toBe(MAP.center);
    expect(north.text).toBe("Inside the spot");
    const east = miniMapDot(spot, { lat: spot.lat, lng: spot.lng + 140 / (111_195 * Math.cos((spot.lat * Math.PI) / 180)) })!;
    expect(east.x).toBe(MAP.center + 28);
    expect(east.text).toBe("Near the edge");
  });

  it("clamps far fixes into the box and says outside", () => {
    const far = miniMapDot(spot, { lat: spot.lat + 0.05, lng: spot.lng - 0.05 })!;
    expect(far).toMatchObject({ x: 6, y: 6, text: "Outside the spot", inside: false });
  });

  it("without a fix there is no dot; without a spot the dot sits in the middle", () => {
    expect(miniMapDot(spot, null)).toBeNull();
    expect(miniMapDot(null, spot)).toEqual({ x: MAP.center, y: MAP.center, text: "No spot chosen", inside: null });
  });
});

describe("labels", () => {
  it("shortens spot names for the bottom bar", () => {
    expect(spotShort("Versova beach, pole 3")).toBe("Pole 3");
    expect(spotShort("Tiruppur North · spot 1")).toBe("Spot 1");
    expect(spotShort("Ghat")).toBe("Ghat");
    expect(spotShort("A very long single name")).toBe("A very long…");
    expect(spotShort(null)).toBe("");
  });

  it("writes coordinates with hemispheres", () => {
    expect(coordsText({ lat: 19.1265, lng: 72.8156 })).toBe("19.12650° N, 72.81560° E");
    expect(coordsText({ lat: -33.9, lng: -70.65 })).toBe("33.90000° S, 70.65000° W");
    expect(coordsText(null)).toBe("No location");
  });

  it("maps a real upload to the sheet's steps", () => {
    expect(stepLabels(false)).toEqual(["Uploading", "Reading", "Checking", "Scored"]);
    expect(stepLabels(true)[0]).toBe("Queued");
    expect(stepOf({ uploaded: false, scored: false, steps: [] })).toBe(0);
    expect(stepOf({ uploaded: true, scored: false, steps: [{ name: "parseMetadata", status: "done" }] })).toBe(1);
    expect(stepOf({ uploaded: true, scored: false, steps: [{ name: "parseMetadata", status: "done" }, { name: "analyze", status: "done" }, { name: "understand", status: "running" }] })).toBe(2);
    expect(stepOf({ uploaded: true, scored: true, steps: [] })).toBe(3);
  });
});
