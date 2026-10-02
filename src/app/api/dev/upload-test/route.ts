/**
 * Dev-only upload round-trip: file → MediaProvider.upload → assets row (source=upload) →
 * audit entry → transformed, signed and deliberately tampered URLs for the page to check.
 * Returns 404 in production unless DEV_TOOLS=1.
 */
import { appendAudit } from "@/lib/audit";
import { devToolsEnabled } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import type { Transform } from "@/lib/media/transform";
import { getGeocoder } from "@/lib/providers/geocoder";
import { getMediaProvider } from "@/lib/providers/media";

const MAX_BYTES = 20 * 1024 * 1024;
const PREVIEW: Transform = [{ width: 400, crop: "scale" }, { effect: "blur", strength: 300 }];

export async function POST(request: Request) {
  if (!devToolsEnabled()) return Response.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose an image file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Images must be 20 MB or smaller." }, { status: 413 });

  const media = getMediaProvider();
  let uploaded;
  try {
    uploaded = await media.upload({
      file: Buffer.from(await file.arrayBuffer()),
      folder: "saakshi/dev",
      tags: ["dev-upload"],
      context: { filename: file.name.slice(0, 200) },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }

  const { exif } = uploaded;
  const placeName = exif?.lat != null && exif.lng != null ? await getGeocoder().reverse(exif.lat, exif.lng) : null;

  const db = await getDb();
  const [row] = await db
    .insert(assets)
    .values({
      source: "upload",
      cldPublicId: uploaded.publicId,
      cldAssetId: uploaded.assetId,
      etag: uploaded.etag,
      phash: uploaded.phash,
      width: uploaded.width,
      height: uploaded.height,
      capturedAt: exif?.takenAt ? new Date(exif.takenAt) : null,
      exifLat: exif?.lat ?? null,
      exifLng: exif?.lng ?? null,
      placeName,
      cameraMake: exif?.make ?? null,
      cameraModel: exif?.model ?? null,
      qualityScore: uploaded.qualityScore,
      facesCount: uploaded.facesCount,
      status: "ready",
      transforms: [{ at: new Date().toISOString(), actor: "dev:upload-test", steps: PREVIEW, note: "preview" }],
    })
    .returning();

  const audit = await appendAudit(db, {
    assetId: row.id,
    actor: "dev:upload-test",
    action: "asset.uploaded",
    detail: { publicId: uploaded.publicId, etag: uploaded.etag, phash: uploaded.phash, bytes: uploaded.bytes },
  });

  const unsigned = media.url(uploaded.publicId, PREVIEW);
  const signed = media.url(uploaded.publicId, PREVIEW, { signed: true });
  const flip = (s: string) => s.replace(/s--(.)/, (_m, c: string) => `s--${c === "A" ? "B" : "A"}`);

  return Response.json({
    asset: {
      id: row.id,
      publicId: row.cldPublicId,
      phash: row.phash,
      width: row.width,
      height: row.height,
      format: uploaded.format,
      bytes: uploaded.bytes,
      etag: row.etag,
      facesCount: row.facesCount,
      qualityScore: row.qualityScore,
      placeName,
      exif,
      status: row.status,
    },
    audit: { seq: audit.seq, hash: audit.hash, prevHash: audit.prevHash },
    mediaKind: media.kind,
    urls: { unsigned, signed },
    checks: [
      { label: "Signed URL", url: signed, expect: 200 },
      { label: "Unsigned URL (same transformation)", url: unsigned, expect: 401 },
      { label: "Signed, blur removed", url: signed.replace("/e_blur:300", ""), expect: 401 },
      { label: "Signed, width changed", url: signed.replace("w_400", "w_1600"), expect: 401 },
      { label: "Signed, public id swapped", url: signed.replace(uploaded.publicId, "saakshi/dev/someone-else"), expect: 401 },
      { label: "Signed, signature edited", url: flip(signed), expect: 401 },
    ],
  });
}
