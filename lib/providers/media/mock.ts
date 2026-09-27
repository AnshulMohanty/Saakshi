/**
 * Mock media provider: stores originals on disk, computes a real pHash (lib/phash.ts) and real
 * EXIF (exifr), and serves derivatives through /api/media/mock/… by applying the same Transform
 * objects with sharp. Only signed URLs are served (see app/api/media/mock/[...path]/route.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { readExifTags, summarizeExif, toMediaMetadata } from "../../media/exif";
import { computeMask, maskKindForPrompt } from "../../media/mask";
import {
  buildMockUrl,
  parseTransformation,
  PUBLIC_ID_RE,
  verifyMockSignature,
  type DeliveryPath,
  type Transform,
} from "../../media/transform";
import { phash } from "../../phash";
import type { MediaAsset, MediaProvider, MetadataTags, UploadInput, UrlOptions } from "./index";
import { mockHaystack, MockMediaStore } from "./mock-store";
import { renderTransform, type Rendered } from "./mock-render";

const MAX_BYTES = 25 * 1024 * 1024;
const PEOPLE_WORDS = /\b(people|person|crowd|volunteers?|group|team|children|kids|students|faces?|selfie)\b/;

export interface MockMediaOptions {
  dir: string;
  baseUrl: string;
  signingKey: string;
  exifDefaultOffset?: string;
}

export type RenderResult =
  | { status: 200; rendered: Rendered }
  | { status: 401 | 404; error: string };

function randomPublicName(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(20), (b) => alphabet[b % alphabet.length]).join("");
}

async function fetchImage(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`Unsupported URL scheme: ${u.protocol}`);
  const res = await fetch(u, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Saakshi/0.1 (mock media)" } });
  if (!res.ok) throw new Error(`Fetching ${u.host} failed: HTTP ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("Image is larger than 25 MB");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("Image is larger than 25 MB");
  return buf;
}

/** Cheap 0–1 quality heuristic from resolution, entropy and sharpness. */
async function qualityHeuristic(bytes: Buffer, width: number, height: number): Promise<number> {
  const { entropy, sharpness } = await sharp(bytes).stats();
  const mp = (width * height) / 1e6;
  const score = 0.4 * Math.min(1, mp / 2) + 0.3 * Math.min(1, entropy / 7.5) + 0.3 * Math.min(1, sharpness / 3);
  return Math.round(score * 100) / 100;
}

export class MockMediaProvider implements MediaProvider {
  readonly kind = "mock" as const;
  readonly store: MockMediaStore;
  private readonly logged = new Set<string>();

  constructor(private readonly opts: MockMediaOptions) {
    this.store = new MockMediaStore(opts.dir);
  }

  async upload(input: UploadInput): Promise<MediaAsset> {
    if (!input.file && !input.url) throw new Error("upload needs a file or a url");
    const bytes = input.file ?? (await fetchImage(input.url!));
    if (bytes.length > MAX_BYTES) throw new Error("Image is larger than 25 MB");

    const folder = input.folder.replace(/^\/+|\/+$/g, "");
    const publicId = input.publicId ?? `${folder}/${randomPublicName()}`;
    if (!PUBLIC_ID_RE.test(publicId)) throw new Error(`Invalid public id "${publicId}"`);

    // HEIC (iPhone default): sharp's prebuilt libvips can't decode HEVC. Real Cloudinary can.
    const brand = bytes.subarray(8, 12).toString("latin1");
    if (bytes.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(brand)) {
      throw new Error("HEIC photos aren't supported in mock mode. Witness Capture always sends JPEG; convert gallery photos to JPEG (or set Cloudinary keys).");
    }
    let meta: Metadata;
    try {
      meta = await sharp(bytes).metadata();
    } catch {
      throw new Error("Unsupported or corrupt image");
    }
    const format = meta.format === "jpeg" ? "jpg" : meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format;
    if (!format || !["jpg", "png", "webp", "gif", "avif", "tiff"].includes(format)) {
      throw new Error(`Unsupported image format: ${meta.format ?? "unknown"}`);
    }
    const width = meta.autoOrient?.width ?? meta.width ?? 0;
    const height = meta.autoOrient?.height ?? meta.height ?? 0;

    const haystack = [publicId, ...(input.tags ?? []), ...Object.values(input.context ?? {})].join(" ").toLowerCase();
    const seed = createHash("sha256").update(haystack).digest().readUInt32BE(0);

    const tags = await readExifTags(bytes);
    const asset: MediaAsset = {
      publicId,
      assetId: randomBytes(16).toString("hex"),
      etag: createHash("md5").update(bytes).digest("hex"),
      phash: await phash(bytes),
      width,
      height,
      format,
      bytes: bytes.length,
      exif: summarizeExif(tags, { defaultOffset: this.opts.exifDefaultOffset }),
      mediaMetadata: toMediaMetadata(tags),
      // No face detection in the mock: deterministic from filename/tags/context.
      facesCount: PEOPLE_WORDS.test(haystack) ? 1 + (seed % 6) : 0,
      qualityScore: await qualityHeuristic(bytes, width, height),
    };

    await this.store.write(publicId, bytes, {
      asset,
      tags: input.tags ?? [],
      context: input.context ?? {},
      metadata: {},
      moderation: "pending",
      uploadedAt: new Date().toISOString(),
      ...(input.url ? { sourceUrl: input.url } : {}),
    });
    return asset;
  }

  url(publicId: string, transforms: Transform, { signed = false }: UrlOptions = {}): string {
    return buildMockUrl({
      baseUrl: this.opts.baseUrl,
      publicId,
      transforms,
      signingKey: signed ? this.opts.signingKey : undefined,
    });
  }

  async updateMetadata(publicId: string, fields: Record<string, string>, { tags = [], removeTags = [] }: MetadataTags = {}): Promise<void> {
    await this.store.update(publicId, (s) => ({
      ...s,
      metadata: { ...s.metadata, ...fields },
      tags: [...new Set([...s.tags.filter((t) => !removeTags.includes(t)), ...tags])],
    }));
  }

  async fetchDerived(publicId: string, transforms: Transform): Promise<Buffer> {
    const original = await this.store.readOriginal(publicId);
    if (!original) throw new Error(`Unknown mock asset "${publicId}"`);
    const rendered = await renderTransform(original.bytes, original.sidecar.asset.format, transforms, this.renderContext(original.sidecar.asset.facesCount, null));
    return rendered.body;
  }

  async setModeration(publicId: string, status: "approved" | "rejected"): Promise<void> {
    await this.store.update(publicId, (s) => ({ ...s, moderation: status }));
  }

  async extractMask(publicId: string, prompt: string): Promise<{ maskUrl: string; buffer: Buffer }> {
    const original = await this.store.readOriginal(publicId);
    if (!original) throw new Error(`Unknown mock asset "${publicId}"`);
    const mask = await computeMask(original.bytes, maskKindForPrompt(prompt));
    return {
      maskUrl: this.url(publicId, [{ effect: "extract", prompt, mode: "mask" }], { signed: true }),
      buffer: mask.png,
    };
  }

  /** Text the deterministic analysis/AI mocks key on. */
  haystack(publicId: string): Promise<string> {
    return mockHaystack(this.store, publicId);
  }

  /** A context value stored at upload (e.g. the planted stamp text the mock AI "reads"). */
  async contextValue(publicId: string, key: string): Promise<string | null> {
    return (await this.store.readSidecar(publicId).catch(() => null))?.context[key] ?? null;
  }

  /**
   * Serves a delivery path. Strict, like Cloudinary with Strict Transformations on: unsigned or
   * wrongly signed requests get 401, so originals and unblurred variants are never served.
   */
  async render(parsed: DeliveryPath, accept: string | null): Promise<RenderResult> {
    if (!parsed.signature) return { status: 401, error: "Unsigned delivery URLs are not served" };
    if (!verifyMockSignature(parsed, this.opts.signingKey)) return { status: 401, error: "Invalid URL signature" };

    const original = await this.store.readOriginal(parsed.publicId);
    if (!original) return { status: 404, error: "Unknown asset" };

    const steps = parseTransformation(parsed.transformation);
    const wantsAuto = steps.some((s) => "format" in s && s.format === "auto");
    const variant = wantsAuto && accept?.includes("image/webp") ? "webp" : "default";
    const key = createHash("sha256").update(`${parsed.tail}|${variant}|${original.sidecar.asset.etag}`).digest("hex").slice(0, 40);
    const cached = await this.readCache(key);
    if (cached) return { status: 200, rendered: cached };

    const rendered = await renderTransform(original.bytes, original.sidecar.asset.format, steps, this.renderContext(original.sidecar.asset.facesCount, accept));
    await this.writeCache(key, rendered);
    return { status: 200, rendered };
  }

  private renderContext(facesCount: number, accept: string | null) {
    return {
      accept,
      facesCount,
      loadOverlay: async (id: string) => (await this.store.readOriginal(id))?.bytes ?? null,
      log: (message: string) => {
        if (this.logged.has(message)) return;
        this.logged.add(message);
        console.warn(`[mock-media] ${message}`);
      },
    };
  }

  private async readCache(key: string): Promise<Rendered | null> {
    try {
      const meta = JSON.parse(await readFile(this.store.cachePath(key, "json"), "utf8")) as Omit<Rendered, "body">;
      return { ...meta, body: await readFile(this.store.cachePath(key, meta.format)) };
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, r: Rendered): Promise<void> {
    const file = this.store.cachePath(key, r.format);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, r.body);
    await writeFile(this.store.cachePath(key, "json"), JSON.stringify({ contentType: r.contentType, format: r.format }));
  }
}
