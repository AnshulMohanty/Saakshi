import { and, count, gte, ne } from "drizzle-orm";
import { deriveKey, getCaptureTokenSecret, getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import { ingestUpload } from "@/lib/ingest/upload";
import { trustedResponse, verifyCloudinaryUploadResponse, verifyMockUploadResponse, type UploadResponse } from "@/lib/ingest/verify";
import { enqueueAsset } from "@/lib/pipeline";
import { getMediaProvider } from "@/lib/providers/media";
import { clientKey, createRateLimiter, tooMany } from "@/lib/ratelimit";

const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

/**
 * POST {provider, response}: the browser forwards the provider's upload response. We verify its
 * signature (it covers only public_id and version), then read the stored image's details from the
 * provider ourselves: pHash, size, faces, quality and EXIF never come from the browser. Then we
 * upsert the asset, check the capture token and queue the pipeline, up to UPLOAD_DAILY_CAP a day.
 */
export async function POST(request: Request) {
  const rl = limiter.hit(clientKey(request));
  if (!rl.ok) return tooMany(rl.retryAfterS);
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

  const db = await getDb();
  if (config.isProduction) {
    const [{ n }] = await db.select({ n: count() }).from(assets).where(and(gte(assets.uploadedAt, new Date(receivedAt.getTime() - 86_400_000)), ne(assets.source, "archive")));
    if (n >= config.env.UPLOAD_DAILY_CAP) return Response.json({ error: "Today's upload limit is reached. Try again tomorrow." }, { status: 429, headers: { "retry-after": "3600" } });
  }
  const stored = await getMediaProvider().resource(r.public_id);
  if (!stored) return Response.json({ error: "No such upload" }, { status: 404 });

  const result = await ingestUpload({ db, captureSecret: getCaptureTokenSecret(), enqueue: enqueueAsset }, trustedResponse(r, stored), receivedAt);
  return Response.json({ ...result, status: "processing" });
}
