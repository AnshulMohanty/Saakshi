/**
 * `pnpm land:dots [--offline]`: data/land-dots.json, the land dot field every story map draws
 * (B5.10). Source: Natural Earth 50 m land, v5.1.2 (public domain), fetched once through the
 * provider HTTP layer and cached in .data/geo/ (--offline uses the cache only).
 */
import "./_env";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LAND_BOUNDS, LAND_STEP, landDots, type LandGeometry } from "../lib/land";
import { callWithRetry } from "../lib/providers/http";

export const NATURAL_EARTH_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_land.geojson";

async function main() {
  const root = process.cwd();
  const cache = path.join(root, ".data/geo/ne_50m_land.geojson");
  if (!existsSync(cache)) {
    if (process.argv.includes("--offline")) throw new Error(`${cache} is missing; run without --offline once.`);
    const { body } = await callWithRetry<string>(
      { provider: "naturalearth", operation: "land.download", url: NATURAL_EARTH_URL, init: { headers: { accept: "application/geo+json, application/json" } }, as: "text", timeoutMs: 60_000 },
      { onUsage: () => undefined },
    );
    await mkdir(path.dirname(cache), { recursive: true });
    await writeFile(cache, body);
  }
  const fc = JSON.parse(await readFile(cache, "utf8")) as { features: Array<{ geometry: LandGeometry }> };
  const dots = landDots(fc.features.map((f) => f.geometry));
  await writeFile(
    path.join(root, "data/land-dots.json"),
    JSON.stringify({ source: "Natural Earth 50 m land v5.1.2 (public domain)", url: NATURAL_EARTH_URL, bounds: LAND_BOUNDS, step: LAND_STEP, count: dots.length, dots }) + "\n",
  );
  console.log(`data/land-dots.json: ${dots.length} land dots at ${LAND_STEP}° over lat ${LAND_BOUNDS.lat0}–${LAND_BOUNDS.lat1} °N, lng ${LAND_BOUNDS.lng0}–${LAND_BOUNDS.lng1} °E`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
