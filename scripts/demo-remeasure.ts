/**
 * `pnpm demo:remeasure [--all] [--reanalyze]`: measures the demo again with the providers now
 * configured (e.g. real Cloudinary masks in Phase 10). Drops cached measurements made in another
 * provider mode (--all: every one), re-measures manual and check-in pairs, re-pairs and refreshes
 * baselines. --reanalyze also re-runs the analysis, AI and embedding steps where their mode differs.
 */
import "./_env";
import { runDemoRemeasure } from "../lib/demo/run";
import { runCli } from "./_demo-cli";

void runCli("demo:remeasure", () =>
  runDemoRemeasure({ all: process.argv.includes("--all"), reanalyze: process.argv.includes("--reanalyze"), log: (m) => console.log(m) }),
);
