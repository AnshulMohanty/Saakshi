/**
 * `pnpm video:cleanup --since <ISO time>`: deletes the witness photos uploaded since the recording
 * started: the capture clip's simulated check-in (Chromium's fake camera at the spot). Its audit
 * chain goes with it (FK cascade); nothing else is touched. Run with the server stopped (PGlite).
 */
import "../_env";
import { and, eq, gte } from "drizzle-orm";
import { closeDb, getDb } from "../../lib/db/client";
import { assets } from "../../lib/db/schema";

async function main() {
  const i = process.argv.indexOf("--since");
  const since = i > 0 ? new Date(process.argv[i + 1]) : null;
  if (!since || Number.isNaN(since.getTime())) throw new Error("Usage: pnpm video:cleanup --since <ISO time>");
  const db = await getDb();
  const gone = await db.delete(assets).where(and(eq(assets.source, "witness"), gte(assets.uploadedAt, since))).returning({ id: assets.id });
  console.log(`Deleted ${gone.length} witness photo(s) uploaded since ${since.toISOString()} (the recording's simulated capture).`);
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
