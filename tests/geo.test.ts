import { describe, expect, it } from "vitest";
import { coordKey, dmsToDecimal, EARTH_RADIUS_M, haversine, isValidLatLng, parseDms, withinRadius } from "@/lib/geo";

const ONE_DEGREE_M = (Math.PI / 180) * EARTH_RADIUS_M; // ≈ 111 195 m

describe("haversine", () => {
  it("is zero for the same point", () => {
    expect(haversine({ lat: 12.97, lng: 77.59 }, { lat: 12.97, lng: 77.59 })).toBe(0);
  });

  it("measures one degree of latitude and of equatorial longitude", () => {
    expect(haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(ONE_DEGREE_M, 3);
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(ONE_DEGREE_M, 3);
  });

  it("is symmetric and matches a known city pair (Delhi → Mumbai ≈ 1 150 km)", () => {
    const delhi = { lat: 28.6139, lng: 77.209 };
    const mumbai = { lat: 19.076, lng: 72.8777 };
    const d = haversine(delhi, mumbai);
    expect(d).toBeCloseTo(haversine(mumbai, delhi), 6);
    expect(d / 1000).toBeGreaterThan(1140);
    expect(d / 1000).toBeLessThan(1160);
  });

  it("handles the antimeridian and antipodes", () => {
    expect(haversine({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).toBeCloseTo(ONE_DEGREE_M, 3);
    expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * EARTH_RADIUS_M, 3);
  });
});

describe("withinRadius", () => {
  const spot = { lat: 12.9716, lng: 77.5946 };
  it("includes points inside and on the boundary, excludes points outside", () => {
    // 0.0002° latitude ≈ 22.2 m
    expect(withinRadius(spot, { lat: spot.lat + 0.0002, lng: spot.lng }, 30)).toBe(true);
    expect(withinRadius(spot, { lat: spot.lat + 0.0004, lng: spot.lng }, 30)).toBe(false);
    const edge = { lat: spot.lat + 0.0003, lng: spot.lng };
    expect(withinRadius(spot, edge, haversine(spot, edge))).toBe(true);
  });
});

describe("DMS", () => {
  it("converts degrees/minutes/seconds with hemisphere refs", () => {
    expect(dmsToDecimal(12, 58, 18, "N")).toBeCloseTo(12.971667, 6);
    expect(dmsToDecimal(77, 35, 40.56, "E")).toBeCloseTo(77.5946, 4);
    expect(dmsToDecimal(33, 52, 4, "S")).toBeCloseTo(-33.867778, 6);
    expect(dmsToDecimal(-0, 30, 0)).toBeCloseTo(-0.5, 6);
    expect(dmsToDecimal(-12, 30, 0)).toBeCloseTo(-12.5, 6);
  });

  it("rejects out-of-range parts", () => {
    expect(() => dmsToDecimal(12, 60, 0)).toThrow(RangeError);
    expect(() => dmsToDecimal(91, 0, 0, "N")).toThrow(RangeError);
  });

  it("parses common string forms", () => {
    expect(parseDms(`12°58'18"N`)).toBeCloseTo(12.971667, 6);
    expect(parseDms("77 35 40.56 E")).toBeCloseTo(77.5946, 4);
    expect(parseDms("33°52′4″S")).toBeCloseTo(-33.867778, 6);
    expect(parseDms("-12:30:00")).toBeCloseTo(-12.5, 6);
    expect(parseDms(`12 deg 58' 18.00" N`)).toBeCloseTo(12.971667, 6); // exiftool / Cloudinary media_metadata
    expect(parseDms(`77 deg 35' 40.56" E`)).toBeCloseTo(77.5946, 4);
    expect(parseDms("12.9716")).toBeCloseTo(12.9716, 6);
    expect(() => parseDms("north-ish")).toThrow(SyntaxError);
  });
});

describe("helpers", () => {
  it("validates coordinates", () => {
    expect(isValidLatLng({ lat: 12, lng: 77 })).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
  });

  it("builds stable 3 dp cache keys without negative zero", () => {
    expect(coordKey(12.97164, 77.59456)).toBe("12.972,77.595");
    expect(coordKey(-0.0001, 0.0004)).toBe("0.000,0.000");
    expect(coordKey(-33.86778, 151.2)).toBe("-33.868,151.200");
  });
});
