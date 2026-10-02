/**
 * Upload tickets and response verification, per provider.
 * - Cloudinary: signed direct-upload params (SDK api_sign_request); upload responses verified
 *   with the SDK's verify_api_response_signature; webhooks with verifyNotificationSignature.
 * - Mock: the same shapes, HMAC-SHA256 with a key derived from CAPTURE_TOKEN_SECRET.
 */
import { createHmac } from "node:crypto";
import { safeEqual } from "../safe-equal";
import cloudinary from "cloudinary";

/** Cloudinary-style upload response (the fields we use). */
export interface UploadResponse {
  public_id: string;
  version: number;
  signature: string;
  asset_id?: string;
  etag?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  phash?: string;
  faces?: number[][];
  media_metadata?: Record<string, string>;
  image_metadata?: Record<string, string>;
  quality_analysis?: { focus?: number };
  context?: { custom?: Record<string, string> };
  tags?: string[];
  created_at?: string;
  type?: string;
}

export interface CloudinaryCreds {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const configure = (c: CloudinaryCreds) => cloudinary.v2.config({ cloud_name: c.cloudName, api_key: c.apiKey, api_secret: c.apiSecret });

/** Cloudinary context parameter: "k=v|k2=v2" with "=" and "|" escaped. */
export function encodeContext(ctx: Record<string, string>): string {
  const esc = (s: string) => s.replace(/([=|])/g, "\\$1");
  return Object.entries(ctx)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${esc(k)}=${esc(v)}`)
    .join("|");
}

export function decodeContext(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split(/(?<!\\)\|/)) {
    const i = pair.search(/(?<!\\)=/);
    if (i <= 0) continue;
    const un = (x: string) => x.replace(/\\([=|])/g, "$1");
    out[un(pair.slice(0, i))] = un(pair.slice(i + 1));
  }
  return out;
}

/**
 * What confirm ingests: the signed public_id/version from the browser, everything else (pHash,
 * size, faces, quality, metadata) from the provider's own record of the stored image.
 */
export function trustedResponse(signed: Pick<UploadResponse, "public_id" | "version" | "signature">, stored: { assetId: string; etag: string; phash: string; width: number; height: number; format: string; bytes: number; facesCount: number; qualityScore: number | null; mediaMetadata: Record<string, string> }): UploadResponse {
  return {
    public_id: signed.public_id,
    version: Number(signed.version),
    signature: signed.signature,
    asset_id: stored.assetId || undefined,
    etag: stored.etag || undefined,
    phash: stored.phash || undefined,
    width: stored.width || undefined,
    height: stored.height || undefined,
    format: stored.format || undefined,
    bytes: stored.bytes || undefined,
    faces: Array.from({ length: stored.facesCount }, () => []),
    quality_analysis: stored.qualityScore === null ? undefined : { focus: stored.qualityScore },
    media_metadata: stored.mediaMetadata,
  };
}

/** "k=v&k2=v2" over sorted keys, as Cloudinary signs requests. */
export function paramsToSign(params: Record<string, string | number>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

// ---------------------------------------------------------------------------------------------
// Mock

const hmacHex = (key: string, s: string) => createHmac("sha256", key).update(s).digest("hex");
const safeEq = safeEqual;

export function signMockTicket(params: Record<string, string | number>, key: string): string {
  return hmacHex(key, `ticket:${paramsToSign(params)}`);
}

export function verifyMockTicket(params: Record<string, string | number>, signature: string, key: string): boolean {
  return safeEq(signMockTicket(params, key), signature);
}

export function mockResponseSignature(publicId: string, version: number, key: string): string {
  return hmacHex(key, `response:public_id=${publicId}&version=${version}`);
}

export function verifyMockUploadResponse(r: Pick<UploadResponse, "public_id" | "version" | "signature">, key: string): boolean {
  return typeof r.signature === "string" && safeEq(mockResponseSignature(r.public_id, r.version, key), r.signature);
}

// ---------------------------------------------------------------------------------------------
// Cloudinary (SDK helpers)

export function signCloudinaryParams(params: Record<string, string | number>, creds: CloudinaryCreds): string {
  return cloudinary.v2.utils.api_sign_request(params, creds.apiSecret);
}

/** The response signature the SDK documents (api_sign_request over public_id and version), compared in constant time. */
export function verifyCloudinaryUploadResponse(r: Pick<UploadResponse, "public_id" | "version" | "signature">, creds: CloudinaryCreds): boolean {
  if (typeof r.signature !== "string") return false;
  const expected = cloudinary.v2.utils.api_sign_request({ public_id: r.public_id, version: r.version }, creds.apiSecret);
  return safeEqual(expected, r.signature);
}

/** Webhook: X-Cld-Timestamp + X-Cld-Signature over the raw body, valid for 2 h. */
export function verifyCloudinaryNotification(body: string, timestamp: number, signature: string, creds: CloudinaryCreds, validForSeconds = 7200, now = Date.now()): boolean {
  const nowS = Math.floor(now / 1000);
  // Not too old, and not from the future (5 minutes of clock skew).
  if (!Number.isFinite(timestamp) || timestamp < nowS - validForSeconds || timestamp > nowS + 300) return false;
  configure(creds);
  // The SDK's webhook signature (sha1 of body + timestamp + secret), compared in constant time.
  const utils = cloudinary.v2.utils as unknown as { webhook_signature(data: string, timestamp: number, options: { api_secret: string }): string };
  return safeEqual(utils.webhook_signature(body, timestamp, { api_secret: creds.apiSecret }), signature);
}
