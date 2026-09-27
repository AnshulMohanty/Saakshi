import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { extractExif, parseExifDateTime } from "@/lib/media/exif";
import { classifyPixel, computeMask, maskKindForPrompt } from "@/lib/media/mask";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name));

describe("extractExif", () => {
  it("reads GPS, offset-aware capture time and camera from a phone-style JPEG", async () => {
    const exif = await extractExif(fixture("geotagged.jpg"));
    expect(exif).not.toBeNull();
    expect(exif!.lat).toBeCloseTo(12.971667, 5);
    expect(exif!.lng).toBeCloseTo(77.5946, 4);
    expect(exif!.takenAt).toBe("2025-03-14T04:00:00.000Z"); // 09:30 at +05:30
    expect(exif!.make).toBe("SaakshiFixture");
    expect(exif!.model).toBe("Synthetic-1");
  });

  it("returns null for images without EXIF", async () => {
    expect(await extractExif(fixture("scene-a.png"))).toBeNull();
    expect(await extractExif(Buffer.from("not an image"))).toBeNull();
  });

  it("applies the default offset when EXIF has no timezone, independent of the server's zone", async () => {
    const jpg = await sharp(fixture("scene-a.png"))
      .jpeg()
      .withExif({ IFD2: { DateTimeOriginal: "2025:03:14 09:30:00" } })
      .toBuffer();
    expect((await extractExif(jpg, { defaultOffset: "+05:30" }))!.takenAt).toBe("2025-03-14T04:00:00.000Z");
    expect((await extractExif(jpg, { defaultOffset: "+00:00" }))!.takenAt).toBe("2025-03-14T09:30:00.000Z");
  });

  it("drops null-island GPS", async () => {
    const jpg = await sharp(fixture("scene-a.png"))
      .jpeg()
      .withExif({ IFD0: { Make: "X" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "0/1 0/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "0/1 0/1 0/1" } })
      .toBuffer();
    expect(await extractExif(jpg)).toMatchObject({ lat: null, lng: null, make: "X" });
  });
});

describe("parseExifDateTime", () => {
  it("handles offsets, fractions and invalid values", () => {
    expect(parseExifDateTime("2025:03:14 09:30:00", "-04:00")).toBe("2025-03-14T13:30:00.000Z");
    expect(parseExifDateTime("2025:03:14 09:30:00.250", "+00:00")).toBe("2025-03-14T09:30:00.250Z");
    expect(parseExifDateTime("2025-03-14T09:30:00", null, "+05:30")).toBe("2025-03-14T04:00:00.000Z");
    expect(parseExifDateTime("0000:00:00 00:00:00")).toBeNull();
    expect(parseExifDateTime("2025:02:31 10:00:00")).toBeNull();
    expect(parseExifDateTime("2025:03:14 25:00:00")).toBeNull();
    expect(parseExifDateTime(undefined)).toBeNull();
  });
});

describe("masks", () => {
  it("picks the mask kind from the prompt", () => {
    expect(maskKindForPrompt("grass and saplings")).toBe("vegetation");
    expect(maskKindForPrompt("plastic litter")).toBe("litter");
  });

  it("classifies representative pixels", () => {
    expect(classifyPixel(79, 138, 46, "vegetation")).toBe(true); // grass
    expect(classifyPixel(230, 57, 70, "litter")).toBe(true); // red wrapper
    expect(classifyPixel(250, 250, 250, "litter")).toBe(true); // white plastic
    expect(classifyPixel(79, 138, 46, "litter")).toBe(false);
    expect(classifyPixel(59, 63, 70, "litter")).toBe(false); // grey asphalt
  });

  it("produces a real grayscale mask with plausible coverage", async () => {
    const litter = await computeMask(fixture("litter-grass.png"), "litter");
    const green = await computeMask(fixture("litter-grass.png"), "vegetation");
    expect(litter.coverage).toBeGreaterThan(0.01);
    expect(litter.coverage).toBeLessThan(0.3);
    expect(green.coverage).toBeGreaterThan(0.6);
    expect(litter.coverage + green.coverage).toBeLessThanOrEqual(1.0001);

    const meta = await sharp(litter.png).metadata();
    expect(meta).toMatchObject({ format: "png", width: 240, height: 180, channels: 1 });

    const street = await computeMask(fixture("scene-b.png"), "vegetation");
    expect(street.coverage).toBeLessThan(0.02);
  });
});
