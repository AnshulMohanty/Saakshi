/**
 * Upload tickets: provider-specific, server-signed parameters for a browser upload.
 * The capture context (token, device fix, client time…) is part of the signed params, so the
 * browser can't change it after the ticket is issued.
 */
import { randomBytes } from "node:crypto";
import { encodeContext, signCloudinaryParams, signMockTicket, type CloudinaryCreds } from "./verify";

export const EVIDENCE_FOLDER = "saakshi/evidence";
export const MOCK_UPLOAD_PATH = "/api/uploads/mock";

/** Keys the browser may put in an upload's context; values are truncated strings. */
export const CONTEXT_KEYS = [
  "source", "token", "client_captured_at", "device_lat", "device_lng", "device_accuracy_m", "fix_timestamp",
  "low_accuracy", "project", "spot", "uploader_lat", "uploader_lng", "uploader_accuracy_m", "filename",
] as const;

export function sanitizeContext(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const k of CONTEXT_KEYS) {
    const v = (input as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === "") continue;
    out[k] = String(v).replace(/[\r\n]/g, " ").slice(0, k === "token" ? 1000 : 200);
  }
  if (out.source !== "witness") out.source = "upload";
  return out;
}

export interface Ticket {
  provider: "mock" | "cloudinary";
  /** Full public id the upload will get ("<folder>/<id>"): the key the server stores the ticket under. */
  publicId: string;
  uploadUrl: string;
  /** Form fields to send with the file (field name "file"). */
  fields: Record<string, string>;
}

const randomId = () => randomBytes(12).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(12, "0").slice(0, 16);

export function createMockTicket(context: Record<string, string>, key: string, now = new Date()): Ticket {
  const params = {
    timestamp: String(Math.floor(now.getTime() / 1000)),
    folder: EVIDENCE_FOLDER,
    public_id: randomId(),
    context: encodeContext(context),
    tags: "saakshi",
  };
  return { provider: "mock", publicId: `${params.folder}/${params.public_id}`, uploadUrl: MOCK_UPLOAD_PATH, fields: { ...params, signature: signMockTicket(params, key) } };
}

/**
 * Signed params for a direct browser upload to Cloudinary (type "authenticated", or "private"
 * with CLD_DELIVERY_TYPE). The public id carries the full path, which works in both folder modes;
 * asset_folder places the asset in dynamic folder mode (docs: upload parameters). Manual
 * moderation, so /review decisions can set moderation_status.
 */
export function createCloudinaryTicket(
  context: Record<string, string>,
  creds: CloudinaryCreds,
  appUrl: string,
  now = new Date(),
  { deliveryType = "authenticated" }: { deliveryType?: "authenticated" | "private" } = {},
): Ticket {
  const params: Record<string, string> = {
    timestamp: String(Math.floor(now.getTime() / 1000)),
    type: deliveryType,
    public_id: `${EVIDENCE_FOLDER}/${randomId()}`,
    asset_folder: EVIDENCE_FOLDER,
    context: encodeContext(context),
    tags: "saakshi",
    media_metadata: "true",
    phash: "true",
    quality_analysis: "true",
    faces: "true",
    moderation: "manual",
    notification_url: `${appUrl}/api/webhooks/cloudinary`,
  };
  return {
    provider: "cloudinary",
    publicId: params.public_id,
    uploadUrl: `https://api.cloudinary.com/v1_1/${creds.cloudName}/image/upload`,
    fields: { ...params, api_key: creds.apiKey, signature: signCloudinaryParams(params, creds) },
  };
}
