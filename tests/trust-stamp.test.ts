import { describe, expect, it } from "vitest";
import { parseStamp, stampDayDifference } from "@/lib/trust/stamp";

describe("parseStamp: formats", () => {
  it("GPS Map Camera overlay (labels, degrees, dd/mm/yyyy, 12 h clock, GMT offset)", () => {
    expect(parseStamp("GPS Map Camera · Andheri East, Mumbai · Lat 19.0988° Long 72.8267° · 14/03/2025 10:42 AM GMT +05:30")).toEqual({
      lat: 19.0988, lng: 72.8267, date: "2025-03-14", time: "10:42", offset: "+05:30",
    });
  });

  it("Latitude:/Longitude: labels with a negative latitude and ISO date, 24 h clock", () => {
    expect(parseStamp("Latitude: -33.8688 Longitude: 151.2093 2024-06-01 18:05")).toMatchObject({
      lat: -33.8688, lng: 151.2093, date: "2024-06-01", time: "18:05",
    });
  });

  it("Lat/Lng labels with hemisphere letters", () => {
    expect(parseStamp("Lat 19.1 N Lng 72.8 E")).toMatchObject({ lat: 19.1, lng: 72.8, date: null });
  });

  it("DMS with straight quotes and a day-month-name date", () => {
    const s = parseStamp(`19°05'55.7"N 72°49'36.1"E 01 Jan 2024`)!;
    expect(s.lat).toBeCloseTo(19.098806, 5);
    expect(s.lng).toBeCloseTo(72.826694, 5);
    expect(s.date).toBe("2024-01-01");
  });

  it("DMS with typographic primes", () => {
    const s = parseStamp("19°05′55.7″N 72°49′36.1″E")!;
    expect(s.lat).toBeCloseTo(19.098806, 5);
  });

  it("decimal degrees with hemispheres, including S and W", () => {
    expect(parseStamp("12.9716°N 77.5946°E")).toMatchObject({ lat: 12.9716, lng: 77.5946 });
    expect(parseStamp("12.9716 S, 77.5946 W")).toMatchObject({ lat: -12.9716, lng: -77.5946 });
  });

  it("bare coordinate pair and a dashed day-first date", () => {
    expect(parseStamp("GPS: 12.97160, 77.59460 · 05-02-2024")).toMatchObject({ lat: 12.9716, lng: 77.5946, date: "2024-02-05" });
  });

  it("month-first only when unambiguous", () => {
    expect(parseStamp("03/25/2024")?.date).toBe("2024-03-25");
    expect(parseStamp("03/04/2024")?.date).toBe("2024-04-03");
  });

  it("long and short month names", () => {
    expect(parseStamp("15 August 2023 5:30 PM")).toMatchObject({ date: "2023-08-15", time: "17:30", lat: null });
    expect(parseStamp("3 Sept 2023")?.date).toBe("2023-09-03");
    expect(parseStamp("21-Oct-2022")?.date).toBe("2022-10-21");
  });

  it("12 AM is midnight; UTC offsets without a colon", () => {
    expect(parseStamp("01/01/2024 12:05 AM")?.time).toBe("00:05");
    expect(parseStamp("01/01/2024 09:00 GMT+0530")?.offset).toBe("+05:30");
    expect(parseStamp("01/01/2024 09:00 UTC-4:00")?.offset).toBe("-04:00");
  });
});

describe("parseStamp: malformed input is rejected, not guessed", () => {
  it.each([
    ["no text", ""],
    ["plain caption", "Beach cleanup drive, Juhu"],
    ["latitude out of range", "Lat 123.45 Long 72.1"],
    ["null island", "Lat 0 Long 0"],
    ["impossible date", "31/02/2024"],
    ["year out of range", "01/01/1985"],
    ["DMS minutes ≥ 60", `19°75'55.7"N 72°49'36.1"E`],
    ["unknown month name", "12 Smarch 2024"],
  ])("%s", (_label, text) => {
    expect(parseStamp(text)).toBeNull();
  });

  it("keeps the readable half when the other half is malformed", () => {
    expect(parseStamp("Lat 123.45 Long 72.1 · 14/03/2025")).toMatchObject({ lat: null, lng: null, date: "2025-03-14" });
    expect(parseStamp("Lat 19.1 Long 72.8 · 31/02/2024")).toMatchObject({ lat: 19.1, date: null });
  });

  it("null and undefined", () => {
    expect(parseStamp(null)).toBeNull();
    expect(parseStamp(undefined)).toBeNull();
  });
});

describe("stampDayDifference", () => {
  const stamp = (text: string) => parseStamp(text)!;

  it("uses the stamp's own offset when it has one", () => {
    // 20:00 UTC on 13 March is 01:30 on 14 March in IST.
    expect(stampDayDifference(stamp("14/03/2025 01:30 GMT +05:30"), "2025-03-13T20:00:00Z")).toBe(0);
    expect(stampDayDifference(stamp("14/03/2025 01:30 GMT +05:30"), "2025-03-12T20:00:00Z")).toBe(1);
  });

  it("without an offset, allows any timezone", () => {
    expect(stampDayDifference(stamp("14/03/2025"), "2025-03-13T20:00:00Z")).toBe(0);
    expect(stampDayDifference(stamp("14/03/2025"), "2025-03-10T06:00:00Z")).toBe(4);
    expect(stampDayDifference(stamp("14/03/2025"), "2025-03-20T06:00:00Z")).toBe(5);
  });

  it("null without a date or a valid capture time", () => {
    expect(stampDayDifference(stamp("Lat 19.1 Long 72.8"), "2025-03-13T20:00:00Z")).toBeNull();
    expect(stampDayDifference(stamp("14/03/2025"), "not a date")).toBeNull();
  });
});

describe("the planted stamp (lib/demo/plant.ts stampText)", () => {
  it("ends like a real GPS Map Camera stamp, GMT +05:30, and the parser reads it", async () => {
    const { stampText } = await import("@/lib/demo/plant");
    const text = stampText({ name: "New Delhi", lat: 28.6139, lng: 77.209 }, "2025-03-14T10:42:00");
    expect(text.split("\n").at(-1)).toBe("14/03/2025 10:42 AM GMT +05:30");
    const s = parseStamp(text)!;
    expect(s.offset).toBe("+05:30");
    expect(s.lat).toBeCloseTo(28.6139, 4);
    expect(s.lng).toBeCloseTo(77.209, 3);
    expect(stampDayDifference(s, "2025-03-14T05:12:00Z")).toBe(0);
  });
});
