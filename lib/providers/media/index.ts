/**
 * MediaProvider: storage, metadata and delivery URLs for images.
 * Real = Cloudinary; mock = local files in MEDIA_MOCK_DIR served by /api/media/mock with sharp.
 */
import "server-only";
import path from "node:path";
import { getConfig, getMockMediaSigningKey } from "../../config";
import type { ExifSummary } from "../../media/exif";
import type { Transform } from "../../media/transform";
import { MockMediaProvider } from "./mock";
import { CloudinaryMediaProvider } from "./real";

export interface UploadInput {
  file?: Buffer;
  url?: string;
  /** Folder under which the public id is created, e.g. "saakshi/uploads". */
  folder: string;
  publicId?: string;
  tags?: string[];
  /** Cloudinary contextual metadata (string key/values), e.g. { filename, project }. */
  context?: Record<string, string>;
}

export interface MediaAsset {
  publicId: string;
  assetId: string;
  etag: string;
  /** 64-bit DCT pHash as 16 hex chars (lib/phash.ts). */
  phash: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  exif: ExifSummary | null;
  /** Raw metadata as Cloudinary's media_metadata returns it (string values). */
  mediaMetadata: Record<string, string>;
  facesCount: number;
  /** 0–1, or null when unavailable. */
  qualityScore: number | null;
}

export interface UrlOptions {
  signed?: boolean;
}

export interface MetadataTags {
  tags?: string[];
  removeTags?: string[];
}

export interface MediaProvider {
  readonly kind: "mock" | "real";
  upload(input: UploadInput): Promise<MediaAsset>;
  url(publicId: string, transforms: Transform, opts?: UrlOptions): string;
  /** Contextual metadata (key/values, merged), tags to add and tags to remove (real: add_context, add_tag, remove_tag). */
  updateMetadata(publicId: string, fields: Record<string, string>, opts?: MetadataTags): Promise<void>;
  setModeration(publicId: string, status: "approved" | "rejected"): Promise<void>;
  /** Segmentation mask for `prompt` (real: e_extract:prompt_…;mode_mask). */
  extractMask(publicId: string, prompt: string): Promise<{ maskUrl: string; buffer: Buffer }>;
  /** Bytes of a derived image (server-side; e.g. to re-upload a watermarked variant). */
  fetchDerived(publicId: string, transforms: Transform): Promise<Buffer>;
}

let instance: MediaProvider | undefined;

export function getMediaProvider(): MediaProvider {
  if (!instance) {
    const config = getConfig();
    instance =
      config.providers.media.mode === "real"
        ? new CloudinaryMediaProvider(config.cloudinary as Required<typeof config.cloudinary>)
        : new MockMediaProvider({
            dir: path.resolve(config.env.MEDIA_MOCK_DIR),
            // Relative URLs: they work on any host (localhost, LAN IP, HTTPS tunnel to a phone).
            baseUrl: "",
            signingKey: getMockMediaSigningKey(config),
            exifDefaultOffset: config.env.EXIF_DEFAULT_UTC_OFFSET,
          });
  }
  return instance;
}

export type { ExifSummary };
