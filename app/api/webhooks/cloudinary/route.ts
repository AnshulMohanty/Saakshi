import { getCaptureTokenSecret, getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { ingestUpload } from "@/lib/ingest/upload";
import { decodeContext, verifyCloudinaryNotification, type UploadResponse } from "@/lib/ingest/verify";
import { enqueueAsset } from "@/lib/pipeline";

/**
 * Cloudinary upload notifications (notification_url on the ticket). Verified with the SDK's
 * notification-signature helper, then upserted through the same idempotent path as /confirm.
 * Only reachable after deploy (Phase 8); /api/uploads/confirm is the primary path.
 */
export async function POST(request: Request) {
  const config = getConfig();
  if (config.providers.media.mode !== "real") return Response.json({ error: "Cloudinary is not configured" }, { status: 404 });

  const raw = await request.text();
  const timestamp = Number(request.headers.get("x-cld-timestamp"));
  const signature = request.headers.get("x-cld-signature") ?? "";
  const creds = { cloudName: config.cloudinary.cloudName!, apiKey: config.cloudinary.apiKey!, apiSecret: config.cloudinary.apiSecret! };
  if (!Number.isFinite(timestamp) || !verifyCloudinaryNotification(raw, timestamp, signature, creds)) {
    return Response.json({ error: "Invalid notification signature" }, { status: 401 });
  }

  const n = JSON.parse(raw) as UploadResponse & { notification_type?: string; context?: UploadResponse["context"] | string };
  if (n.notification_type !== "upload") return Response.json({ ignored: n.notification_type ?? "unknown" });
  const context = typeof n.context === "string" ? { custom: decodeContext(n.context) } : n.context;
  const result = await ingestUpload(
    { db: await getDb(), captureSecret: getCaptureTokenSecret(), enqueue: enqueueAsset },
    { ...n, context, signature: "verified-webhook" },
    new Date(),
  );
  return Response.json(result);
}
