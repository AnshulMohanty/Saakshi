/**
 * Cloudinary REST calls, built by hand (not the SDK) so contract tests can assert the exact
 * outgoing requests offline. Shapes follow the docs recorded in docs/external-apis.md:
 *   Upload API  POST https://api.cloudinary.com/v1_1/<cloud>/<resource_type>/<action>
 *               signed: sha1(sorted "k=v&…" of every param except file, cloud_name,
 *               resource_type, api_key; then the api_secret appended)
 *   Admin API   https://api.cloudinary.com/v1_1/<cloud>/…, HTTP Basic api_key:api_secret
 *   Analyze API POST https://api.cloudinary.com/v2/analysis/<cloud>/analyze/<model>, Basic auth, JSON
 */
import { createHash } from "node:crypto";
import { callWithRetry, type HttpDeps } from "../http";

export interface CloudinaryCreds {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const API = "https://api.cloudinary.com";
const EXCLUDED_FROM_SIGNATURE = new Set(["file", "cloud_name", "resource_type", "api_key"]);

export type ParamValue = string | number | boolean | string[] | undefined;

/**
 * "k=v&k2=v2" (empty values dropped, arrays comma-joined), exactly what Cloudinary signs. The
 * "k=v" strings are sorted, as the official SDK's api_sign_request does (tests compare the two).
 */
export function stringToSign(params: Record<string, ParamValue>): string {
  return Object.keys(params)
    .filter((k) => !EXCLUDED_FROM_SIGNATURE.has(k) && params[k] !== undefined && params[k] !== "")
    .map((k) => `${k}=${Array.isArray(params[k]) ? (params[k] as string[]).join(",") : params[k]}`)
    .sort()
    .join("&");
}

export const signUploadParams = (params: Record<string, ParamValue>, apiSecret: string) =>
  createHash("sha1").update(stringToSign(params) + apiSecret).digest("hex");

/**
 * Context (docs: "=" and "|" escaped with a backslash; keys and values can't be empty; no control
 * characters except newline and space; values ≤ 1024 characters). Pairs join with "|".
 */
export function encodeCloudinaryContext(ctx: Record<string, string>): string {
  const clean = (s: string) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").slice(0, 1024);
  const esc = (s: string) => clean(s).replace(/([=|])/g, "\\$1");
  return Object.entries(ctx)
    .filter(([k, v]) => k !== "" && v !== "")
    .map(([k, v]) => `${esc(k)}=${esc(v)}`)
    .join("|");
}

export class CloudinaryClient {
  constructor(
    readonly creds: CloudinaryCreds,
    private readonly deps: HttpDeps = {},
    private readonly now: () => number = Date.now,
  ) {}

  private basic() {
    return `Basic ${Buffer.from(`${this.creds.apiKey}:${this.creds.apiSecret}`).toString("base64")}`;
  }

  /** Signed Upload API call (multipart form). */
  async uploadApi<T = Record<string, unknown>>(
    resourceType: "image" | "raw",
    action: string,
    params: Record<string, ParamValue>,
    file?: { bytes: Buffer; filename: string; contentType: string } | { url: string },
    meta: { operation?: string; assetId?: string | null; timeoutMs?: number } = {},
  ): Promise<T> {
    const signed: Record<string, ParamValue> = { ...params, timestamp: Math.floor(this.now() / 1000) };
    const form = new FormData();
    for (const [k, v] of Object.entries(signed)) {
      if (v === undefined || v === "") continue;
      if (Array.isArray(v)) for (const item of v) form.append(`${k}[]`, item);
      else form.append(k, String(v));
    }
    form.append("api_key", this.creds.apiKey);
    form.append("signature", signUploadParams(signed, this.creds.apiSecret));
    if (file && "url" in file) form.append("file", file.url);
    else if (file) form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.contentType }), file.filename);
    const { body } = await callWithRetry<T>(
      {
        provider: "cloudinary",
        operation: meta.operation ?? `${resourceType}:${action}`,
        url: `${API}/v1_1/${this.creds.cloudName}/${resourceType}/${action}`,
        init: { method: "POST", body: form },
        timeoutMs: meta.timeoutMs ?? 120_000,
        assetId: meta.assetId,
        meter: () => ({ units: { requests: 1 } }),
      },
      this.deps,
    );
    return body;
  }

  /** Admin API (Basic auth). Form-encoded body for POST, like the official SDKs. */
  async adminApi<T = Record<string, unknown>>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, params?: Record<string, string | number | boolean>, meta: { operation?: string } = {}): Promise<T> {
    const qs = params && method === "GET" ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : "";
    const body = params && method !== "GET" ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : undefined;
    const { body: out } = await callWithRetry<T>(
      {
        provider: "cloudinary",
        operation: meta.operation ?? `admin:${method} ${path.split("/")[0]}`,
        url: `${API}/v1_1/${this.creds.cloudName}/${path}${qs}`,
        init: { method, headers: { authorization: this.basic(), ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) }, body },
        timeoutMs: 30_000,
        meter: () => ({ units: { adminRequests: 1 } }),
      },
      this.deps,
    );
    return out;
  }

  /** Admin API with a JSON body (metadata fields, upload presets take nested settings). */
  async adminJson<T = Record<string, unknown>>(method: "POST" | "PUT", path: string, json: unknown, meta: { operation?: string } = {}): Promise<T> {
    const { body } = await callWithRetry<T>(
      {
        provider: "cloudinary",
        operation: meta.operation ?? `admin:${method} ${path.split("/")[0]}`,
        url: `${API}/v1_1/${this.creds.cloudName}/${path}`,
        init: { method, headers: { authorization: this.basic(), "content-type": "application/json" }, body: JSON.stringify(json) },
        timeoutMs: 30_000,
        meter: () => ({ units: { adminRequests: 1 } }),
      },
      this.deps,
    );
    return body;
  }

  /** Analyze API (beta): AI Vision tagging/moderation/general, watermark detection. */
  async analyze<T = Record<string, unknown>>(model: string, json: unknown, meta: { assetId?: string | null } = {}): Promise<T> {
    const { body } = await callWithRetry<T>(
      {
        provider: "cloudinary",
        operation: `analyze:${model}`,
        url: `${API}/v2/analysis/${this.creds.cloudName}/analyze/${model}`,
        init: { method: "POST", headers: { authorization: this.basic(), "content-type": "application/json" }, body: JSON.stringify(json) },
        timeoutMs: 90_000,
        assetId: meta.assetId,
        meter: (b) => ({ units: analyzeUnits(b) }),
      },
      this.deps,
    );
    return body;
  }
}

/**
 * AI Vision token use as reported. The docs show three shapes (limits.addons_quota, limits.items,
 * limits.usage), so all three are read. UNVERIFIED which one the live API returns.
 */
export function analyzeUnits(body: unknown): Record<string, number> {
  const l = (body as { limits?: Record<string, unknown> } | null)?.limits;
  const out: Record<string, number> = { requests: 1 };
  const quota = (l?.addons_quota ?? l?.items) as Array<{ type?: string; used_by_request?: number; remaining?: number }> | undefined;
  for (const q of Array.isArray(quota) ? quota : []) {
    if (typeof q.used_by_request === "number") out[`${q.type ?? "addon"}_tokens`] = q.used_by_request;
    if (typeof q.remaining === "number") out[`${q.type ?? "addon"}_remaining`] = q.remaining;
  }
  const usage = l?.usage as { type?: string; count?: number } | undefined;
  if (usage && typeof usage.count === "number") out[`${usage.type ?? "addon"}_tokens`] = usage.count;
  return out;
}
