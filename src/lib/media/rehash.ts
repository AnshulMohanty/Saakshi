/**
 * Recomputes every stored fingerprint with our pHash (lib/phash.ts) from the stored original.
 * Needed once for photos ingested while real mode stored Cloudinary's phash, which drifts 14 bits
 * on a 2% re-crop (ours: 8) against match thresholds calibrated on ours. Each changed fingerprint
 * gets an audit row (old and new value); then every photo is re-scored so duplicates are rebuilt.
 * Idempotent: a second run changes nothing.
 */
import { eq } from "drizzle-orm";
import { appendAudit } from "../audit";
import type { DB } from "../db/client";
import { assets } from "../db/schema";
import { phash } from "../phash";
import { rescoreAll } from "../pipeline/score";
import type { MediaProvider } from "../providers/media";

export const FINGERPRINT_ALGORITHM = "saakshi-dct-64 (lib/phash.ts)";

export async function rehashAll(db: DB, media: MediaProvider, log: (m: string) => void = () => {}) {
  const rows = await db.select({ id: assets.id, publicId: assets.cldPublicId, phash: assets.phash, label: assets.externalId }).from(assets);
  let changed = 0;
  let failed = 0;
  for (const [i, a] of rows.entries()) {
    try {
      const next = await phash(await media.fetchDerived(a.publicId, []));
      if (next !== a.phash) {
        await db.transaction(async (tx) => {
          await tx.update(assets).set({ phash: next }).where(eq(assets.id, a.id));
          await appendAudit(tx as unknown as DB, { assetId: a.id, actor: "media:rehash", action: "asset.fingerprint_recomputed", detail: { from: a.phash, to: next, algorithm: FINGERPRINT_ALGORITHM } });
        });
        changed++;
      }
    } catch (err) {
      failed++;
      log(`  ✗ ${a.label ?? a.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if ((i + 1) % 10 === 0) log(`  fingerprinted ${i + 1} of ${rows.length} (${changed} changed)`);
  }
  const rescored = await rescoreAll(db, media, "fingerprints recomputed with lib/phash", log);
  return { assets: rows.length, changed, failed, rescored };
}
