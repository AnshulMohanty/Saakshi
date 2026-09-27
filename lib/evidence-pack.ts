/**
 * Evidence pack (P1): a zip with manifest.json (per photo: id, etag, pHash, capture times, GPS,
 * trust result, credits) and each photo's face-blurred derivative. Originals are never included.
 */
import { asc, eq } from "drizzle-orm";
import { strToU8, zipSync, type Zippable } from "fflate";
import type { DB } from "./db/client";
import { assets, projects } from "./db/schema";
import { locationOf } from "./evidence";
import { PREVIEW } from "./library";
import { asJpg } from "./report/generate";
import type { MediaProvider } from "./providers/media";
import { describeReason } from "./trust";

export const PACK_LIMIT = 100;

export async function buildEvidencePack(db: DB, media: MediaProvider, projectId: string, appUrl: string, now = new Date()) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  const rows = await db.select().from(assets).where(eq(assets.projectId, projectId)).orderBy(asc(assets.capturedAt), asc(assets.id)).limit(PACK_LIMIT);
  const files: Zippable = {};
  const entries = [];
  for (const a of rows) {
    const file = `photos/${a.id}.jpg`;
    files[file] = [await media.fetchDerived(a.cldPublicId, asJpg(PREVIEW)), { level: 0 }];
    entries.push({
      id: a.id,
      file,
      evidenceUrl: `${appUrl}/e/${a.id}`,
      source: a.source,
      testCase: a.testCase,
      etag: a.etag,
      phash: a.phash,
      capturedAt: a.capturedAt?.toISOString() ?? null,
      capturedAtTzAssumed: a.capturedAtTzAssumed,
      uploadedAt: a.uploadedAt.toISOString(),
      attestation: a.capture ? { attested: a.capture.attested, clientCapturedAt: a.capture.clientCapturedAt, ticketIssuedAt: a.capture.ticketIssuedAt, serverReceivedAt: a.capture.serverReceivedAt } : null,
      gps: locationOf(a),
      trust: { score: a.trustScore, band: a.trustBand, reasons: (a.trustReasons ?? []).map((r) => ({ code: r.code, kind: r.kind, points: r.points, sentence: describeReason(r) })) },
      status: a.status,
      credits: a.attribution,
    });
  }
  const manifest = {
    project: { id: project.id, name: project.name, slug: project.slug, type: project.type, startDate: project.startDate, endDate: project.endDate },
    generatedAt: now.toISOString(),
    count: entries.length,
    truncated: rows.length === PACK_LIMIT,
    note: "Images are face-blurred derivatives (the originals are never published). Each photo's evidence page shows its full audit chain.",
    assets: entries,
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["README.txt"] = strToU8(`Saakshi evidence pack: ${project.name}\nGenerated ${manifest.generatedAt}. ${entries.length} photo(s).\nmanifest.json lists every photo with its hashes, capture times, GPS, trust result and credits.\n`);
  return { zip: zipSync(files), manifest, filename: `saakshi-evidence-${project.slug ?? project.id.slice(0, 8)}.zip` };
}
