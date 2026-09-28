/**
 * `pnpm demo:import`: builds the 3 demo projects from data/archive-candidates.json, downloads the
 * selected Commons thumbnails (cached), uploads them and runs the evidence pipeline in-process.
 * Idempotent on external_id. `--offline` uses only the archive cache.
 */
import "./_env";
import { runDemoImport } from "../lib/demo/run";
import { runCli } from "./_demo-cli";

void runCli("demo:import", () => runDemoImport({ inline: true, offline: process.argv.includes("--offline"), log: (m) => console.log(m) }));
