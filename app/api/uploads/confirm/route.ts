import { deriveKey, getCaptureTokenSecret, getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { ingestUpload } from "@/lib/ingest/upload";
import { verifyCloudinaryUploadResponse, verifyMockUploadResponse, type UploadResponse } from "@/lib/ingest/verify";
import { enqueueAsset } from "@/lib/pipeline";

/**
 * POST {provider, response}: the browser forwards the provider's upload response. We verify its
 * signature, upsert the asset, check the capture token and queue the pipeline.
 */
export async function POST(request: Request) {
  const receivedAt = new Date();
  const body = (await request.json().catch(() => null)) as { provider?: string; response?: UploadResponse } | null;
  const r = body?.response;
  if (!r || typeof r.public_id !== "string" || typeof r.signature !== "string" || !Number.isFinite(Number(r.version))) {
    return Response.json({ error: "Expected {provider, response} with public_id, version and signature" }, { status: 400 });
  }

  const config = getConfig();
  const real = config.providers.media.mode === "real";
  if (body!.provider !== (real ? "cloudinary" : "mock")) return Response.json({ error: "Provider mismatch" }, { status: 400 });
  const ok = real
    ? verifyCloudinaryUploadResponse(r, {
        cloudName: config.cloudinary.cloudName!,
        apiKey: config.cloudinary.apiKey!,
        apiSecret: config.cloudinary.apiSecret!,
      })
    : verifyMockUploadResponse(r, deriveKey("mock-upload:v1"));
  if (!ok) return Response.json({ error: "Upload response signature is invalid" }, { status: 401 });

  const result = await ingestUpload({ db: await getDb(), captureSecret: getCaptureTokenSecret(), enqueue: enqueueAsset }, r, receivedAt);
  return Response.json({ ...result, status: "processing" });
}
