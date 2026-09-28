/**
 * `pnpm demo:reset`: wipes demo data, re-imports from the archive cache (offline) and re-plants.
 * `--online` allows network fetches for anything missing from the cache.
 * `--include-witness` also deletes witness photos in demo projects (full wipe).
 */
import "./_env";
import { runDemoReset } from "../lib/demo/run";
import { runCli } from "./_demo-cli";

void runCli("demo:reset", () => runDemoReset({ inline: true, offline: !process.argv.includes("--online"), includeWitness: process.argv.includes("--include-witness"), log: (m) => console.log(m) }));
