/**
 * Cloudinary media provider. URL building (signed + unsigned) and extractMask are implemented;
 * upload/metadata/moderation arrive with real keys in Phase 8.
 */
import { NotConfiguredError } from "../../errors";
import { buildCloudinaryUrl, type Transform } from "../../media/transform";
import type { MediaAsset, MediaProvider, UploadInput, UrlOptions } from "./index";

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export class CloudinaryMediaProvider implements MediaProvider {
  readonly kind = "real" as const;

  constructor(private readonly creds: CloudinaryCredentials) {}

  async upload(input: UploadInput): Promise<MediaAsset> {
    void input;
    throw new NotConfiguredError("CloudinaryMediaProvider", "upload");
  }

  url(publicId: string, transforms: Transform, { signed = false }: UrlOptions = {}): string {
    return buildCloudinaryUrl({
      cloudName: this.creds.cloudName,
      publicId,
      transforms,
      apiSecret: signed ? this.creds.apiSecret : undefined,
    });
  }

  async updateMetadata(publicId: string, fields: Record<string, string>): Promise<void> {
    void publicId;
    void fields;
    throw new NotConfiguredError("CloudinaryMediaProvider", "updateMetadata");
  }

  async setModeration(publicId: string, status: "approved" | "rejected"): Promise<void> {
    void publicId;
    void status;
    throw new NotConfiguredError("CloudinaryMediaProvider", "setModeration");
  }

  async extractMask(publicId: string, prompt: string): Promise<{ maskUrl: string; buffer: Buffer }> {
    const maskUrl = this.url(publicId, [{ effect: "extract", prompt, mode: "mask" }, { format: "png" }], { signed: true });
    const res = await fetch(maskUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Cloudinary extract failed: HTTP ${res.status}`);
    return { maskUrl, buffer: Buffer.from(await res.arrayBuffer()) };
  }
}
