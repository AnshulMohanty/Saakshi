/**
 * `pnpm demo:status [--since <ISO date>] [--errors]`: read-only. Assets by status, each step by
 * status, step errors grouped by reason (with example ids), and real provider spend since a date
 * (default: the last 24 h) from provider_usage. Writes nothing; safe while a run is going.
 * `--cld` adds Cloudinary's own usage report (one Admin API GET, which costs no credits).
 */
import "./_env";
import { closeDb, getDb } from "../src/lib/db/client";
import { readSpend, readStatus } from "../src/lib/demo/status";
import { getMediaProvider } from "../src/lib/providers/media";
import { CloudinaryMediaProvider } from "../src/lib/providers/media/real";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const db = await getDb();
  const s = await readStatus(db);
  const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`Assets: ${s.total} (${fmt(s.byStatus)})`);
  for (const [src, o] of Object.entries(s.bySource)) console.log(`  ${src.padEnd(13)} ${fmt(o)}`);
  console.log("\nSteps:");
  for (const [step, o] of Object.entries(s.bySteps)) console.log(`  ${step.padEnd(14)} ${fmt(o)}`);
  console.log(s.errors.length ? "\nStep errors (grouped):" : "\nStep errors: none");
  for (const g of s.errors) console.log(`  ${String(g.n).padStart(3)} × ${g.step}: ${g.message}\n        e.g. ${g.examples.join(", ")}`);

  const since = new Date(arg("--since") ?? Date.now() - 24 * 3600_000);
  const spend = await readSpend(db, since);
  console.log(`\nReal provider calls since ${since.toISOString()}:`);
  const total = (p: string) => spend.filter((r) => r.provider === p).reduce((n, r) => n + (r.costUsd ?? 0), 0);
  for (const r of spend.sort((a, b) => a.provider.localeCompare(b.provider) || b.calls - a.calls))
    console.log(`  ${r.provider.padEnd(10)} ${r.operation.padEnd(32)} ${String(r.calls).padStart(5)} calls  ${String(r.failed).padStart(4)} failed${r.costUsd ? `  $${r.costUsd.toFixed(4)}` : ""}${r.transformations ? `  ${r.transformations} transformations` : ""}`);
  console.log(`  OpenAI total: $${total("openai").toFixed(4)}`);

  const media = getMediaProvider();
  if (process.argv.includes("--cld") && media instanceof CloudinaryMediaProvider) {
    type U = { usage?: number; limit?: number; used_percent?: number; credits_usage?: number };
    const u = await media.client.adminApi<Record<string, U | string | number>>("GET", "usage", undefined, { operation: "admin:usage" });
    console.log(`
Cloudinary usage (plan ${String(u.plan ?? "?")}, updated ${String(u.last_updated ?? "?")}):`);
    for (const k of ["credits", "transformations", "storage", "bandwidth", "objects", "requests"]) {
      const v = u[k] as U | undefined;
      if (v && typeof v === "object") console.log(`  ${k.padEnd(16)} usage ${v.usage ?? "?"}${v.limit != null ? ` of ${v.limit}` : ""}${v.credits_usage != null ? `  (credits ${v.credits_usage})` : ""}`);
    }
    const addons = Object.keys(u).filter((k) => !["credits", "transformations", "storage", "bandwidth", "objects", "requests", "plan", "last_updated", "rate_limit_allowed", "rate_limit_reset_at", "rate_limit_remaining", "media_limits", "derived_resources"].includes(k));
    for (const k of addons) console.log(`  ${k.padEnd(16)} ${JSON.stringify(u[k])}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
