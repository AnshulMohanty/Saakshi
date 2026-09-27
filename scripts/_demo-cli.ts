/** Shared CLI wrapper for the demo scripts: runs one action, prints the summary, closes the DB. */
import { closeDb } from "../lib/db/client";
import { DatabaseLockedError } from "../lib/db/lock";
import { projectTable, type DemoSummary } from "../lib/demo/run";

export async function runCli(name: string, action: () => Promise<DemoSummary>) {
  const started = Date.now();
  try {
    const s = await action();
    console.log("");
    if (s.import) {
      console.log(`Imported ${s.import.imported}, already present ${s.import.skipped}${s.import.requeued ? `, resumed ${s.import.requeued}` : ""}.`);
    }
    if (s.planted) for (const p of s.planted) console.log(`Planted ${p.testCase.padEnd(18)} ${p.created ? "new" : "exists"}  → ${p.project}`);
    console.log("\nProjects:");
    for (const line of await projectTable()) console.log(`  ${line}`);
    const t = s.trust;
    console.log(`\nTrust (archive photos): ${Object.entries(t.bands).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    console.log(`  Top reasons: ${t.topReasons.map((r) => `${r.code} ${r.n}`).join(", ") || "none"}`);
    console.log(`  Archive photos with a hard flag: ${t.hardFlagged.length ? t.hardFlagged.map((h) => `${h.externalId} ${h.codes.join("+")}`).join("; ") : "none"}`);
    for (const p of t.planted) console.log(`  Planted ${p.testCase.padEnd(18)} ${String(p.band).padEnd(12)} score ${p.score}  ${p.hardFlags.join(", ") || "no hard flag"}`);
    console.log("\nBefore/after pairs (details: pnpm measure:pairs):");
    for (const p of s.pairing) {
      const why = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
      console.log(`  ${p.project.padEnd(36)} ${p.pairs} pair(s) from ${p.candidates} candidate(s); rejected: ${why(p.rejected)}; photos left out: ${why(p.excluded)}`);
    }
    console.log(`\nAssets by status: ${Object.entries(s.statuses).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
    console.log(
      `Audit: ${s.audit.ok ? "all chains intact" : `${s.audit.broken.length} BROKEN chain(s): ${JSON.stringify(s.audit.broken)}`} (${s.audit.chains} chains, ${s.audit.entries} rows)`,
    );
    console.log(`${name} done in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  } catch (err) {
    if (err instanceof DatabaseLockedError) {
      console.error(`\n${err.message}\nWhile \`pnpm dev\` is running, use "Run demo import" on /dev/status instead.`);
    } else {
      console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    }
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
