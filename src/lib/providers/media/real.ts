/**
 * Cloudinary media provider, on the REST client in ../cloudinary/client.ts (retries, timeouts and
 * usage logging live there). Every call follows the docs recorded in docs/external-apis.md; where
 * the docs are unclear there is a switch with a documented fallback:
 *
 *   CLD_DELIVERY_TYPE  authenticated (default) | private: evidence delivery type. The docs
 *                      contradict each other on on-the-fly transformations of authenticated assets;
 *                      private + Strict Transformations gives the same "signed URLs only" rule.
 *   CLD_EXTRACT_MODE   multi (default, e_extract:prompt_(a;b) is documented) | union: one
 *                      e_extract per prompt, masks joined with sharp.
 *   CLD_COMPOSITE_MODE layer (default, l_authenticated:… with the whole URL signed) | server.
 *   CLD_PDF_DELIVERY   signed (default, raw/authenticated signed URL) | download (Download API URL).
 *   CLD_EAGER          1: generate the standard derivatives (THUMB, PREVIEW, VIEW) at upload.
 */
import { randomBytes } from "node:crypto";
import { compositeHalf, compositeLabels, compositePublicId, compositeTransform } from "../../media/composite";
import { summarizeExif } from "../../media/exif";
import { unionMasks, sideBySide } from "../../media/raster";
import { buildCloudinaryUrl, cloudinarySignature, compileTransform, PUBLIC_ID_RE, type Transform } from "../../media/transform";
import { PREVIEW, THUMB, VIEW } from "../../media/derivatives";
import { cloudinaryTransformations } from "../../pricing";
import { callWithRetry, ProviderHttpError, type HttpDeps } from "../http";
import { CloudinaryClient, encodeCloudinaryContext, signUploadParams, type CloudinaryCreds } from "../cloudinary/client";
import { STRUCTURED_FIELD_IDS, structuredValue } from "../cloudinary/setup";
import {
  maskTransform,
  type CompositeResult,
  type CompositeSide,
  type MaskOptions,
  type MediaAsset,
  type MediaProvider,
  type MetadataTags,
  type RawUploadInput,
  type UploadInput,
  type UrlOptions,
} from "./index";

export type CloudinaryCredentials = CloudinaryCreds;

export interface CloudinaryOptions extends CloudinaryCreds {
  deliveryType?: "authenticated" | "private";
  extractMode?: "multi" | "union";
  compositeMode?: "layer" | "server";
  pdfDelivery?: "signed" | "download";
  eager?: boolean;
}


/** Public ids under these prefixes are delivery type "upload" (QR codes, logos): nothing personal. */
export const PUBLIC_PREFIXES = ["saakshi/qr/", "saakshi/brand/"];

/** Derivatives generated at upload with CLD_EAGER=1 (pipe-separated in the eager parameter). */
export const EAGER_TRANSFORMS: Transform[] = [THUMB, PREVIEW, VIEW];

/** The upload response fields we read (docs: Upload API reference, upload response). */
export interface CloudinaryUploadResponse {
  public_id: string;
  asset_id?: string;
  version?: number;
  etag?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  phash?: string;
  faces?: number[][];
  image_metadata?: Record<string, string>;
  media_metadata?: Record<string, string>;
  quality_analysis?: { focus?: number };
  type?: string;
}

/** 16 lowercase hex chars (our pHash width), or null. Cloudinary returns phash as a hex string. */
export function normalizePhash(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const hex = v.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,16}$/.test(hex)) return null;
  return hex.padStart(16, "0");
}

/** Pure: upload response → MediaAsset. media_metadata=true returns an image_metadata object. */
export function mediaAssetFromUpload(r: CloudinaryUploadResponse, { exifDefaultOffset = "+05:30", fallbackPhash }: { exifDefaultOffset?: string; fallbackPhash?: string } = {}): MediaAsset {
  const meta = r.image_metadata ?? r.media_metadata ?? {};
  const focus = r.quality_analysis?.focus;
  return {
    publicId: r.public_id,
    assetId: r.asset_id ?? "",
    etag: r.etag ?? "",
    phash: normalizePhash(r.phash) ?? fallbackPhash ?? "",
    width: r.width ?? 0,
    height: r.height ?? 0,
    format: r.format === "jpeg" ? "jpg" : (r.format ?? ""),
    bytes: r.bytes ?? 0,
    exif: summarizeExif(meta, { defaultOffset: exifDefaultOffset }),
    mediaMetadata: meta,
    facesCount: Array.isArray(r.faces) ? r.faces.length : 0,
    qualityScore: typeof focus === "number" && focus >= 0 && focus <= 1 ? focus : null,
  };
}

const randomPublicName = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(20), (b) => alphabet[b % alphabet.length]).join("");
};

/** Upload API parameters for an image upload (pure, so contract tests can check them). */
export function uploadParams(input: UploadInput, o: Pick<CloudinaryOptions, "deliveryType" | "eager">, publicId: string): Record<string, string> {
  const evidence = (input.access ?? "evidence") === "evidence" && !PUBLIC_PREFIXES.some((p) => publicId.startsWith(p));
  const folder = input.folder.replace(/^\/+|\/+$/g, "");
  return {
    // Full path in the public id works in both folder modes; asset_folder places it in dynamic mode.
    public_id: publicId,
    asset_folder: folder,
    type: evidence ? (o.deliveryType ?? "authenticated") : "upload",
    overwrite: "true",
    ...(input.tags?.length ? { tags: input.tags.join(",") } : {}),
    ...(input.context && Object.keys(input.context).length ? { context: encodeCloudinaryContext(input.context) } : {}),
    media_metadata: "true",
    phash: "true",
    quality_analysis: "true",
    faces: "true",
    ...(evidence ? { moderation: "manual" } : {}),
    ...(evidence && o.eager ? { eager: EAGER_TRANSFORMS.map(compileTransform).join("|") } : {}),
  };
}

export class CloudinaryMediaProvider implements MediaProvider {
  readonly kind = "real" as const;
  readonly evidenceType: "authenticated" | "private";
  readonly client: CloudinaryClient;

  constructor(
    private readonly o: CloudinaryOptions,
    private readonly extra: { exifDefaultOffset?: string; deps?: HttpDeps; now?: () => number } = {},
  ) {
    this.evidenceType = o.deliveryType ?? "authenticated";
    this.client = new CloudinaryClient({ cloudName: o.cloudName, apiKey: o.apiKey, apiSecret: o.apiSecret }, extra.deps, extra.now);
  }

  /** Delivery type of a public id: QR codes and logos are public; everything else is evidence. */
  typeOf(publicId: string): "upload" | "authenticated" | "private" {
    return PUBLIC_PREFIXES.some((p) => publicId.startsWith(p)) ? "upload" : this.evidenceType;
  }

  async upload(input: UploadInput): Promise<MediaAsset> {
    if (!input.file && !input.url) throw new Error("upload needs a file or a url");
    const folder = input.folder.replace(/^\/+|\/+$/g, "");
    const publicId = input.publicId ?? `${folder}/${randomPublicName()}`;
    if (!PUBLIC_ID_RE.test(publicId)) throw new Error(`Invalid public id "${publicId}"`);
    const params = uploadParams(input, this.o, publicId);
    const file = input.file ? { bytes: input.file, filename: `${publicId.split("/").pop()}.jpg`, contentType: "application/octet-stream" } : { url: input.url! };
    const r = await this.client.uploadApi<CloudinaryUploadResponse>("image", "upload", params, file, { operation: "upload" });
    // Cloudinary always returns phash when asked; the local hash is only a guard for an empty field.
    const fallbackPhash = !r.phash && input.file ? await import("../../phash").then((m) => m.phash(input.file!)) : undefined;
    return mediaAssetFromUpload(r, { exifDefaultOffset: this.extra.exifDefaultOffset, fallbackPhash });
  }

  async uploadRaw({ publicId, bytes, contentType }: RawUploadInput): Promise<{ publicId: string; bytes: number }> {
    // Raw public ids keep the extension (docs: upload_parameters). Folder = the id's directory.
    const folder = publicId.includes("/") ? publicId.slice(0, publicId.lastIndexOf("/")) : "";
    const r = await this.client.uploadApi<{ public_id: string; bytes?: number }>(
      "raw",
      "upload",
      { public_id: publicId, ...(folder ? { asset_folder: folder } : {}), type: this.evidenceType, overwrite: "true", invalidate: "true" },
      { bytes, filename: publicId.split("/").pop()!, contentType },
      { operation: "upload:raw" },
    );
    return { publicId: r.public_id, bytes: r.bytes ?? bytes.length };
  }

  /**
   * Signed raw delivery URL (the generic <resource_type>/<delivery_type>/s--sig--/v1/<id> form).
   * CLD_PDF_DELIVERY=download: a Download API URL instead (expires in 1 h, not CDN-cached).
   */
  rawUrl(publicId: string): string {
    if (this.o.pdfDelivery === "download") return this.privateDownloadUrl(publicId, "raw");
    const sig = cloudinarySignature("", publicId, this.o.apiSecret);
    return `https://res.cloudinary.com/${this.o.cloudName}/raw/${this.evidenceType}/${sig}/v1/${publicId}`;
  }

  /** Download API URL (docs: "download" method; public_id and format required, type default private). */
  privateDownloadUrl(publicId: string, resourceType: "image" | "raw" = "image", expiresInSeconds = 3600): string {
    const now = Math.floor((this.extra.now ?? Date.now)() / 1000);
    const ext = /\.([a-z0-9]+)$/i.exec(publicId)?.[1] ?? "";
    const params: Record<string, string> = {
      public_id: publicId,
      format: ext,
      type: this.typeOf(publicId),
      timestamp: String(now),
      expires_at: String(now + expiresInSeconds),
    };
    const signature = signUploadParams(params, this.o.apiSecret);
    const qs = new URLSearchParams({ ...params, signature, api_key: this.o.apiKey });
    return `https://api.cloudinary.com/v1_1/${this.o.cloudName}/${resourceType}/download?${qs}`;
  }

  async exists(publicId: string): Promise<boolean> {
    try {
      await this.client.adminApi("GET", `resources/image/${this.typeOf(publicId)}/${publicId}`, undefined, { operation: "admin:resource" });
      return true;
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return false;
      throw err;
    }
  }

  async destroy(publicId: string): Promise<void> {
    await this.client.uploadApi("image", "destroy", { public_id: publicId, type: this.typeOf(publicId), invalidate: "true" }, undefined, { operation: "destroy" });
  }

  async resource(publicId: string): Promise<MediaAsset | null> {
    try {
      const r = await this.client.adminApi<CloudinaryUploadResponse>("GET", `resources/image/${this.typeOf(publicId)}/${publicId}`, { media_metadata: true, phash: true, faces: true, quality_analysis: true }, { operation: "admin:resource" });
      return mediaAssetFromUpload(r, { exifDefaultOffset: this.extra.exifDefaultOffset });
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) return null;
      throw err;
    }
  }

  url(publicId: string, transforms: Transform, { signed = false }: UrlOptions = {}): string {
    const type = this.typeOf(publicId);
    return buildCloudinaryUrl({
      cloudName: this.o.cloudName,
      publicId,
      transforms,
      // Evidence (authenticated/private) is always signed; public assets only when asked.
      apiSecret: signed || type !== "upload" ? this.o.apiSecret : undefined,
      deliveryType: type,
    });
  }

  /**
   * Structured metadata (fields `cld:setup` created), contextual metadata (everything, merged:
   * context command "add"), tags added in one call (a comma-separated list is documented for
   * assigning), then one call per tag removed.
   */
  async updateMetadata(publicId: string, fields: Record<string, string>, opts: MetadataTags = {}): Promise<void> {
    const type = this.typeOf(publicId);
    // Fields cld:setup created go to structured metadata too; everything goes to context.
    const structured = Object.entries(fields).filter(([k]) => STRUCTURED_FIELD_IDS.includes(k)).map(([k, v]) => [k, structuredValue(k, v)]);
    if (structured.length) {
      await this.client.uploadApi("image", "metadata", { metadata: encodeMetadata(Object.fromEntries(structured)), public_ids: [publicId], type }, undefined, { operation: "metadata" });
    }
    if (Object.keys(fields).length) {
      await this.client.uploadApi("image", "context", { command: "add", context: encodeCloudinaryContext(fields), public_ids: [publicId], type }, undefined, { operation: "context:add" });
    }
    const add = [...new Set(opts.tags ?? [])];
    if (add.length) await this.client.uploadApi("image", "tags", { command: "add", tag: add.join(","), public_ids: [publicId], type }, undefined, { operation: "tags:add" });
    for (const tag of [...new Set(opts.removeTags ?? [])].filter((t) => !(opts.tags ?? []).includes(t))) {
      await this.client.uploadApi("image", "tags", { command: "remove", tag, public_ids: [publicId], type }, undefined, { operation: "tags:remove" });
    }
  }

  /** Admin API update with moderation_status (docs: moderate_assets, update resource). */
  async setModeration(publicId: string, status: "approved" | "rejected"): Promise<void> {
    await this.client.adminApi("POST", `resources/image/${this.typeOf(publicId)}/${publicId}`, { moderation_status: status }, { operation: "admin:moderation" });
  }

  async fetchDerived(publicId: string, transforms: Transform): Promise<Buffer> {
    const { body } = await callWithRetry<Buffer>(
      {
        provider: "cloudinary",
        operation: "derived",
        url: this.url(publicId, transforms, { signed: true }),
        init: { method: "GET" },
        as: "buffer",
        timeoutMs: 90_000,
        // 423: "derived asset is being generated" (docs, e_extract); retried with backoff.
        retries: 4,
        meter: () => ({ units: { transformations: cloudinaryTransformations(compileTransform(transforms)) } }),
      },
      this.extra.deps,
    );
    return body;
  }

  async extractMask(publicId: string, prompt: string | string[], opts: MaskOptions = {}): Promise<{ maskUrl: string; buffer: Buffer }> {
    const prompts = Array.isArray(prompt) ? prompt : [prompt];
    if (this.o.extractMode === "union" && prompts.length > 1) {
      const parts = await Promise.all(prompts.map((p) => this.fetchDerived(publicId, maskTransform(p, opts))));
      // No single URL shows the union; the first prompt's mask URL is kept as the reference.
      return { maskUrl: this.url(publicId, maskTransform(prompts[0], opts), { signed: true }), buffer: await unionMasks(parts) };
    }
    const t = maskTransform(prompts.length === 1 ? prompts[0] : prompts, opts);
    return { maskUrl: this.url(publicId, t, { signed: true }), buffer: await this.fetchDerived(publicId, t) };
  }

  async composite(before: CompositeSide, after: CompositeSide): Promise<CompositeResult> {
    if (this.o.compositeMode !== "server") {
      const transforms = compositeTransform(before, after, { layerType: this.evidenceType });
      return { url: this.url(before.publicId, transforms, { signed: true }), publicId: before.publicId, transforms, mode: "layer" };
    }
    const [b, a] = await Promise.all([this.fetchDerived(before.publicId, compositeHalf()), this.fetchDerived(after.publicId, compositeHalf())]);
    const publicId = compositePublicId(before.publicId, after.publicId);
    const transforms = compositeLabels(before, after);
    await this.client.uploadApi(
      "image",
      "upload",
      // Labels as an eager derivative: generated ahead of time, so it is deliverable under any access rule.
      { public_id: publicId, asset_folder: "saakshi/composites", type: this.evidenceType, overwrite: "true", invalidate: "true", tags: "saakshi,composite", eager: compileTransform(transforms) },
      { bytes: await sideBySide(b, a), filename: "composite.jpg", contentType: "image/jpeg" },
      { operation: "upload:composite" },
    );
    return { url: this.url(publicId, transforms, { signed: true }), publicId, transforms, mode: "server" };
  }
}

/** Structured metadata parameter: "id=value|id2=value2" with "=" and "|" escaped (like context). */
export const encodeMetadata = (fields: Record<string, string>) => encodeCloudinaryContext(fields);
