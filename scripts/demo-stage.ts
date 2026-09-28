/**
 * `pnpm demo:stage`: creates (or updates) the "Live stage demo" project at the venue.
 *   STAGE_LAT=12.97 STAGE_LNG=77.59 pnpm demo:stage     or     pnpm demo:stage --lat 12.97 --lng 77.59
 */
import "./_env";
import { closeDb, getDb } from "../lib/db/client";
import { DatabaseLockedError } from "../lib/db/lock";
import { createStageProject } from "../lib/demo/stage";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const lat = Number(arg("lat") ?? process.env.STAGE_LAT);
  const lng = Number(arg("lng") ?? process.env.STAGE_LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error(
      "Set the venue: STAGE_LAT and STAGE_LNG (or --lat/--lng). There is deliberately no default: a wrong location would flag every live photo as a location mismatch.",
    );
    process.exitCode = 1;
    return;
  }
  try {
    const r = await createStageProject(await getDb(), { lat, lng });
    console.log(`Live stage demo ready (min_pair_gap_hours 0, spot radius 150 m at ${lat}, ${lng}).`);
    console.log(`  Capture:  ${r.captureUrl}\n  Spot:     ${r.spotUrl}`);
    console.log("  On stage: photograph the littered table, clean it, photograph it again.");
  } catch (err) {
    console.error(err instanceof DatabaseLockedError ? `${err.message}\nStop \`pnpm dev\` first.` : err);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();
