/**
 * `pnpm media:rehash`: recomputes every stored fingerprint with our pHash from the stored
 * original, audits each change, then re-scores every photo (duplicates rebuilt). Downloads each
 * original once (bandwidth, no transformations). Idempotent.
 */
import "./_env";
import { closeDb, getDb } from "../src/lib/db/client";
import { rehashAll } from "../src/lib/media/rehash";
import { getMediaProvider } from "../src/lib/providers/media";
import { flushUsage } from "../src/lib/usage";

async function main() {
  const db = await getDb();
  const r = await rehashAll(db, getMediaProvider(), (m) => console.log(m));
  await flushUsage(db);
  console.log(`Fingerprints: ${r.changed} of ${r.assets} changed, ${r.failed} failed. Re-scored ${r.rescored.rescored} (${r.rescored.changed} changed).`);
  if (r.failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? (e.stack ?? e.message) : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
