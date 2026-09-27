import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { centroid, dbscan, radiusCovering } from "@/lib/archive/cluster";
import { retryAfterMs } from "@/lib/archive/commons";
import {
  classifyLicense,
  cleanThumbUrl,
  isUsable,
  parseCommonsDate,
  parseQueryResponse,
  rejectReasons,
  stripHtml,
  type CommonsFile,
} from "@/lib/archive/parse";
import { haversine } from "@/lib/geo";

// Saved (trimmed) real API responses: action=query&prop=imageinfo&iiprop=…|extmetadata|commonmetadata
const load = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures", "commons", name), "utf8"));
const search = parseQueryResponse(load("search-beach-cleanup.json"));
const edge = parseQueryResponse(load("edge-cases.json"));
const category = parseQueryResponse(load("category-members.json"));
const byId = (files: CommonsFile[], id: number) => files.find((f) => f.pageId === id)!;

describe("parseQueryResponse (real fixtures)", () => {
  it("parses a geotagged file with description-page GPS, license and attribution", () => {
    const f = byId(search, 131443399);
    expect(f).toMatchObject({
      externalId: "commons:131443399",
      title: "File:Coastal-cleanup-month-ocean-blue-projects.jpg",
      mime: "image/jpeg",
      license: "CC BY-SA 4.0",
      licenseClass: "cc-by-sa",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      attributionRequired: true,
      author: "Ocean Blue Project, Inc.",
      gpsSource: "desc_page",
    });
    expect(f.lat).toBeCloseTo(34.005222, 6);
    expect(f.lng).toBeCloseTo(-118.491592, 6);
    expect(f.date).toMatchObject({ local: "2021-09-18T15:14:19", precision: "second" });
    expect(f.description).toMatch(/^Volunteers at local beach cleanups/);
    expect(f.descriptionUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(f.thumbWidth).toBe(1920);
    expect(f.thumbUrl).not.toMatch(/utm_/);
    expect(f.sha1).toMatch(/^[0-9a-f]{40}$/);
  });

  it("prefers the original's EXIF date and reads camera make/model from commonmetadata", () => {
    const withMake = search.find((f) => f.make && f.lat === null)!;
    expect(withMake.make).toBeTruthy();
    expect(withMake.date?.source).toBe("exif");
    expect(withMake.lat).toBeNull();
    expect(withMake.gpsSource).toBeNull();
  });

  it("parses category member responses the same way", () => {
    expect(category.length).toBeGreaterThan(0);
    for (const f of category) expect(f.externalId).toBe(`commons:${f.pageId}`);
    expect(load("category-members.json").continue.gcmcontinue).toBeTruthy();
  });

  it("strips HTML from authors and decodes entities", () => {
    const f = byId(edge, 16040020);
    expect(f.author).not.toMatch(/[<>]/);
    expect(f.author).toBeTruthy();
  });

  it("prefers the original's EXIF date over a year-only description date", () => {
    // Description page says just "2012"; the original's EXIF has the full timestamp.
    expect(byId(edge, 18592728).date).toMatchObject({ local: "2012-02-28T09:36:30", precision: "second", source: "exif" });
    expect(parseCommonsDate("2012", "description")).toMatchObject({ local: "2012-01-01T00:00:00", precision: "year" });
  });
});

describe("license and file filter", () => {
  it("classifies licenses", () => {
    expect(classifyLicense("CC0")).toBe("cc0");
    expect(classifyLicense("Public domain")).toBe("pd");
    expect(classifyLicense("PD-self")).toBe("pd");
    expect(classifyLicense("CC BY 2.0")).toBe("cc-by");
    expect(classifyLicense("CC BY-SA 4.0")).toBe("cc-by-sa");
    expect(classifyLicense("CC BY-SA 3.0 igo")).toBe("cc-by-sa");
    for (const bad of ["GODL-India", "GFDL", "Attribution", "CC BY-NC 2.0", "CC BY-ND 4.0", "", null]) {
      expect(classifyLicense(bad), String(bad)).toBeNull();
    }
  });

  it("keeps only jpeg/png ≥1024 px under CC0/PD/CC BY/CC BY-SA", () => {
    expect(rejectReasons(byId(edge, 16548854))).toEqual(["too_small"]); // 576 px
    expect(rejectReasons(byId(edge, 71595438))).toEqual(["license"]); // GODL-India
    expect(rejectReasons(byId(edge, 37091153))).toContain("mime"); // application/ogg
    expect(isUsable(byId(edge, 192428370))).toBe(true); // PNG, CC BY-SA 4.0, 1134 px
    expect(isUsable(byId(search, 131443399))).toBe(true);
  });
});

describe("helpers", () => {
  it("parses the date formats Commons uses", () => {
    expect(parseCommonsDate("2013:08:14 12:37:23", "exif")).toMatchObject({ local: "2013-08-14T12:37:23", precision: "second" });
    expect(parseCommonsDate("2021-09-18 15:14", "description")).toMatchObject({ local: "2021-09-18T15:14:00", precision: "minute" });
    expect(parseCommonsDate('<time class="dtstart" datetime="2013-08-14">14 August 2013</time>', "description")).toMatchObject({
      local: "2013-08-14T00:00:00",
      precision: "day",
    });
    expect(parseCommonsDate("2013-08", "description")?.precision).toBe("month");
    expect(parseCommonsDate("0000:00:00 00:00:00", "exif")).toBeNull();
    expect(parseCommonsDate("unknown date", "description")).toBeNull();
  });

  it("strips HTML and tracking params", () => {
    expect(stripHtml('<a href="x">Ann &amp; Bo</a><br/>&#233;t&eacute;')).toBe("Ann & Bo été");
    expect(stripHtml("   ")).toBeNull();
    expect(cleanThumbUrl("https://thumb.wikimedia.org/a.jpg?utm_source=x&utm_campaign=y")).toBe("https://thumb.wikimedia.org/a.jpg");
  });

  it("parses Retry-After seconds and dates", () => {
    expect(retryAfterMs("30")).toBe(30_000);
    expect(retryAfterMs(new Date(Date.UTC(2025, 0, 1, 0, 0, 10)).toUTCString(), Date.UTC(2025, 0, 1))).toBe(10_000);
    expect(retryAfterMs(null)).toBeNull();
  });
});

describe("dbscan clustering", () => {
  // Three groups: a tight one in Hyderabad (5), a looser chain in Pune (4), two isolated points.
  const at = (lat: number, lng: number, id: string) => ({ id, lat, lng });
  const points = [
    at(17.4642, 78.3736, "h1"), at(17.4645, 78.3739, "h2"), at(17.4640, 78.3731, "h3"), at(17.4650, 78.3745, "h4"), at(17.4647, 78.3728, "h5"),
    at(18.6439, 73.7712, "p1"), at(18.6519, 73.7712, "p2"), at(18.6599, 73.7712, "p3"), at(18.6679, 73.7712, "p4"),
    at(26.2986, 89.4534, "lonely"), at(11.1048, 77.3517, "alone"), { id: "nogps", lat: null, lng: null },
  ];
  const coord = (p: { lat: number | null; lng: number | null }) => (p.lat === null ? null : { lat: p.lat, lng: p.lng! });

  it("groups points within eps (chaining through core points) and labels the rest noise", () => {
    const { clusters, noise } = dbscan(points, coord, { epsM: 1500, minPts: 2 });
    expect(clusters.map((c) => c.members.map((m) => m.id))).toEqual([["h1", "h2", "h3", "h4", "h5"], ["p1", "p2", "p3", "p4"]]);
    expect(noise.map((n) => n.id).sort()).toEqual(["alone", "lonely"]);
    expect(clusters[0].maxRadiusM).toBeLessThan(200);
    expect(clusters[1].maxRadiusM).toBeGreaterThan(1000); // chained ~890 m hops
  });

  it("respects minPts and is deterministic", () => {
    expect(dbscan(points, coord, { epsM: 1500, minPts: 5 }).clusters.map((c) => c.members.length)).toEqual([5]);
    expect(dbscan(points, coord, { epsM: 1500, minPts: 2 })).toEqual(dbscan(points, coord, { epsM: 1500, minPts: 2 }));
  });

  it("computes centroids and quantile radii", () => {
    const pts = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }, { lat: 0, lng: 0.002 }, { lat: 0, lng: 0.01 }];
    const c = centroid(pts.slice(0, 3));
    expect(c.lng).toBeCloseTo(0.001, 9);
    expect(radiusCovering(pts, { lat: 0, lng: 0 }, 0.75)).toBeCloseTo(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 0.002 }), 6);
    expect(radiusCovering(pts, { lat: 0, lng: 0 }, 1)).toBeCloseTo(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }), 6);
    expect(radiusCovering([], { lat: 0, lng: 0 }, 0.9)).toBe(0);
  });
});
