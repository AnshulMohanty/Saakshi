/**
 * `pnpm map:india [--offline]`: public/geo/india.json, the one India map every map draws (landing,
 * Be a witness, the library). Source: DataMeet's `india-soi.geojson`, the Survey of India state
 * map dissolved into the official outline of India (CC BY-SA 2.5 / ODbL, attribution in
 * docs/map-data.md and on every map). Downloaded once through the provider HTTP layer and cached
 * in .data/geo/ (--offline uses the cache only). The outline is simplified (Douglas–Peucker),
 * slivers and specks dropped, and a dot field computed (lib/map/india.ts).
 */
import "./_env";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { dotsInside, INDIA_BOUNDS, ringArea, simplifyRing, type IndiaMapData, type Polygon, type Ring } from "../src/lib/map/india";
import { callWithRetry } from "../src/lib/providers/http";

export const INDIA_SOI_URL = "https://raw.githubusercontent.com/datameet/maps/master/Country/india-soi.geojson";
/** ≈ 1.1 km: well under a dot's width at country scale, still a clean coastline when zoomed to a city. */
const TOLERANCE = 0.01;
const STEP = 0.18;
/** Drop specks under ≈ 0.25 km² (sandbars); Lakshadweep's smallest inhabited island is ≈ 0.1 deg² × 1e-3. */
const MIN_ISLAND = 2e-5;
/** Dissolve leaves slivers between states; real holes in the country outline don't exist at this scale. */
const MIN_HOLE = 0.02;

async function main() {
  const root = process.cwd();
  const cache = path.join(root, ".data/geo/india-soi.geojson");
  if (!existsSync(cache)) {
    if (process.argv.includes("--offline")) throw new Error(`${cache} is missing; run without --offline once.`);
    const { body } = await callWithRetry<string>({ provider: "datameet", operation: "india.download", url: INDIA_SOI_URL, init: { headers: { accept: "application/geo+json, application/json" } }, as: "text", timeoutMs: 120_000 }, { onUsage: () => undefined });
    await mkdir(path.dirname(cache), { recursive: true });
    await writeFile(cache, body);
  }
  const fc = JSON.parse(await readFile(cache, "utf8")) as { features: Array<{ properties: Record<string, string>; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: Ring[] | Ring[][] } }> };
  const polygons: Polygon[] = [];
  let before = 0;
  for (const f of fc.features) {
    const list = f.geometry.type === "Polygon" ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]);
    for (const poly of list) {
      before += poly.reduce((n, r) => n + r.length, 0);
      if (ringArea(poly[0]) < MIN_ISLAND) continue;
      const outer = simplifyRing(poly[0], TOLERANCE);
      const holes = poly.slice(1).filter((h) => ringArea(h) >= MIN_HOLE).map((h) => simplifyRing(h, TOLERANCE));
      polygons.push([outer, ...holes].map((r) => r.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number])));
    }
  }
  const dots = dotsInside(polygons, STEP, INDIA_BOUNDS);
  const data: IndiaMapData = {
    source: `${fc.features[0]?.properties?.Source ?? "Survey of India State Map, Datameet"}: the official boundary of India (india-soi.geojson)`,
    licence: "CC BY-SA 2.5 / ODbL (DataMeet). This derived file is shared under the same terms.",
    url: INDIA_SOI_URL,
    step: STEP,
    tolerance: TOLERANCE,
    outline: polygons,
    dots,
  };
  const json = JSON.stringify(data);
  await mkdir(path.join(root, "public/geo"), { recursive: true });
  await writeFile(path.join(root, "public/geo/india.json"), json);
  const after = polygons.reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
  console.log(`public/geo/india.json: ${polygons.length} polygons, ${before} → ${after} points (tolerance ${TOLERANCE}°), ${dots.length} dots at ${STEP}°; ${(json.length / 1024).toFixed(0)} KB, ${(gzipSync(json).length / 1024).toFixed(0)} KB gzipped`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
