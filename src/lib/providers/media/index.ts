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
import { CloudinaryMediaProvider, type CloudinaryOptions } from "./real";

export interface UploadInput {
  file?: Buffer;
  url?: string;
  /** Folder under which the public id is created, e.g. "saakshi/uploads". */
  folder: string;
  publicId?: string;
  tags?: string[];
  /** Cloudinary contextual metadata (string key/values), e.g. { filename, project }. */
  context?: Record<string, string>;
  /**
   * "evidence" (default): delivery type authenticated (or private), signed URLs only, manual
   * moderation. "public": delivery type upload, for QR codes and logos (nothing personal).
   */
  access?: "evidence" | "public";
}

/** A non-image file (report PDFs), stored as raw + authenticated. Public ids keep the extension. */
export interface RawUploadInput {
  publicId: string;
  bytes: Buffer;
  contentType: string;
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

export interface MaskOptions {
  multiple?: boolean;
  /** Steps applied before extraction, e.g. [{crop: "fill", gravity: "auto", width: 800, height: 600}]. */
  frame?: Transform;
}

/** The URL steps for a mask: frame, then e_extract in mask mode, delivered as PNG. */
export function maskTransform(prompt: string | string[], { multiple, frame = [] }: MaskOptions = {}): Transform {
  return [...frame, { effect: "extract", prompt, ...(multiple ? { multiple: true } : {}), mode: "mask" }, { format: "png" }];
}

export interface CompositeSide {
  publicId: string;
  /** Date label, e.g. "5 Sep 2017". */
  label: string;
}

/** A before/after side-by-side: the asset and transform it is delivered from, and the signed URL. */
export interface CompositeResult {
  url: string;
  publicId: string;
  transforms: Transform;
  mode: "layer" | "server";
}

export interface MetadataTags {
  tags?: string[];
  removeTags?: string[];
}

export interface MediaProvider {
  readonly kind: "mock" | "real";
  /** Delivery type of evidence uploads (and of their layers in composites). */
  readonly evidenceType: "authenticated" | "private";
  upload(input: UploadInput): Promise<MediaAsset>;
  /** Stores a raw file with delivery type authenticated (real: resource_type raw, type authenticated). */
  uploadRaw(input: RawUploadInput): Promise<{ publicId: string; bytes: number }>;
  /** Signed delivery URL of a raw authenticated file. */
  rawUrl(publicId: string): string;
  /** Whether an asset with this public id exists (real: Admin API resource lookup). */
  exists(publicId: string): Promise<boolean>;
  /**
   * A stored image's details as the provider has them (pHash, size, faces, quality, metadata), read
   * server-side; null when there is no such image. Upload confirms use this, never what the
   * browser forwards (only public_id and version are signed).
   */
  resource(publicId: string): Promise<MediaAsset | null>;
  /** Deletes a stored image and its derivatives (the sandbox sweep). Missing is not an error. */
  destroy(publicId: string): Promise<void>;
  url(publicId: string, transforms: Transform, opts?: UrlOptions): string;
  /** Contextual metadata (key/values, merged), tags to add and tags to remove (real: add_context, add_tag, remove_tag). */
  updateMetadata(publicId: string, fields: Record<string, string>, opts?: MetadataTags): Promise<void>;
  setModeration(publicId: string, status: "approved" | "rejected"): Promise<void>;
  /**
   * Segmentation mask for `prompt` (real: e_extract:prompt_(…);multiple_true;mode_mask, PNG),
   * computed on the `frame` derivative so two photos can be masked on the same crop.
   */
  extractMask(publicId: string, prompt: string | string[], opts?: MaskOptions): Promise<{ maskUrl: string; buffer: Buffer }>;
  /** Bytes of a derived image (server-side; e.g. to re-upload a watermarked variant). */
  fetchDerived(publicId: string, transforms: Transform): Promise<Buffer>;
  /**
   * Before/after side-by-side. "layer" (default): one signed URL on the before photo with the
   * after photo as an l_authenticated layer. "server" (CLD_COMPOSITE_MODE=server): halves joined
   * with sharp and stored as their own evidence asset, labels drawn by Cloudinary.
   */
  composite(before: CompositeSide, after: CompositeSide): Promise<CompositeResult>;
}

let instance: MediaProvider | undefined;

export function getMediaProvider(): MediaProvider {
  if (!instance) {
    const config = getConfig();
    instance =
      config.providers.media.mode === "real"
        ? new CloudinaryMediaProvider(config.cloudinary as CloudinaryOptions, { exifDefaultOffset: config.env.EXIF_DEFAULT_UTC_OFFSET })
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
