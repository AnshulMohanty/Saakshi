import { deriveKey } from "@/lib/config";
import { decodeContext, mockResponseSignature, verifyMockTicket } from "@/lib/ingest/verify";
import { getMediaProvider } from "@/lib/providers/media";
import { MockMediaProvider } from "@/lib/providers/media/mock";

const MAX_BYTES = 25 * 1024 * 1024;
const TICKET_MAX_AGE_S = 60 * 60;
const SIGNED = ["timestamp", "folder", "public_id", "context", "tags"] as const;

/**
 * Mock stand-in for Cloudinary's upload endpoint: accepts a ticketed multipart upload, stores it
 * via the mock media provider and answers with a Cloudinary-shaped, signed response.
 */
export async function POST(request: Request) {
  const media = getMediaProvider();
  if (!(media instanceof MockMediaProvider)) return Response.json({ error: "Mock uploads are disabled (Cloudinary is configured)" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: { message: "Expected multipart form data" } }, { status: 400 });
  const params = Object.fromEntries(SIGNED.map((k) => [k, String(form.get(k) ?? "")]));
  const key = deriveKey("mock-upload:v1");
  if (!verifyMockTicket(params, String(form.get("signature") ?? ""), key)) {
    return Response.json({ error: { message: "Invalid upload signature" } }, { status: 401 });
  }
  if (Math.abs(Date.now() / 1000 - Number(params.timestamp)) > TICKET_MAX_AGE_S) {
    return Response.json({ error: { message: "Upload ticket expired" } }, { status: 401 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: { message: "Missing file" } }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: { message: "File is larger than 25 MB" } }, { status: 413 });

  const context = decodeContext(params.context);
  try {
    const asset = await media.upload({
      file: Buffer.from(await file.arrayBuffer()),
      folder: params.folder,
      publicId: `${params.folder}/${params.public_id}`,
      tags: params.tags ? params.tags.split(",") : [],
      context,
    });
    const version = Math.floor(Date.now() / 1000);
    return Response.json({
      asset_id: asset.assetId,
      public_id: asset.publicId,
      version,
      signature: mockResponseSignature(asset.publicId, version, key),
      width: asset.width,
      height: asset.height,
      format: asset.format,
      bytes: asset.bytes,
      etag: asset.etag,
      phash: asset.phash,
      faces: Array.from({ length: asset.facesCount }, () => [0, 0, 0, 0]),
      media_metadata: asset.mediaMetadata,
      quality_analysis: { focus: asset.qualityScore },
      context: { custom: context },
      tags: params.tags ? params.tags.split(",") : [],
      type: "authenticated",
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json({ error: { message: err instanceof Error ? err.message : "Upload failed" } }, { status: 400 });
  }
}
