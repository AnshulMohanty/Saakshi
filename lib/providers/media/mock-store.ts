/**
 * On-disk store for the mock media provider:
 *   <dir>/assets/<publicId>.<ext>   original bytes
 *   <dir>/assets/<publicId>.json    sidecar (asset record, tags, context, moderation)
 *   <dir>/cache/<sha>.<ext>         rendered derivatives
 * The analysis and AI mocks read sidecars too, to stay deterministic per asset.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_ID_RE } from "../../media/transform";
import type { MediaAsset } from "./index";

export interface Sidecar {
  asset: MediaAsset;
  tags: string[];
  context: Record<string, string>;
  metadata: Record<string, string>;
  moderation: "pending" | "approved" | "rejected";
  uploadedAt: string;
  sourceUrl?: string;
}

export class MockMediaStore {
  constructor(readonly dir: string) {}

  private assetPath(publicId: string, ext: string): string {
    if (!PUBLIC_ID_RE.test(publicId)) throw new Error(`Invalid public id "${publicId}"`);
    return path.join(this.dir, "assets", ...publicId.split("/")) + `.${ext}`;
  }

  async write(publicId: string, bytes: Buffer, sidecar: Sidecar): Promise<void> {
    const file = this.assetPath(publicId, sidecar.asset.format);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    await this.writeSidecar(publicId, sidecar);
  }

  async writeSidecar(publicId: string, sidecar: Sidecar): Promise<void> {
    const file = this.assetPath(publicId, "json");
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(sidecar, null, 2));
    await rename(tmp, file);
  }

  async readSidecar(publicId: string): Promise<Sidecar | null> {
    try {
      return JSON.parse(await readFile(this.assetPath(publicId, "json"), "utf8")) as Sidecar;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async readOriginal(publicId: string): Promise<{ bytes: Buffer; sidecar: Sidecar } | null> {
    const sidecar = await this.readSidecar(publicId);
    if (!sidecar) return null;
    return { bytes: await readFile(this.assetPath(publicId, sidecar.asset.format)), sidecar };
  }

  async update(publicId: string, patch: (s: Sidecar) => Sidecar): Promise<void> {
    const current = await this.readSidecar(publicId);
    if (!current) throw new Error(`Unknown mock asset "${publicId}"`);
    await this.writeSidecar(publicId, patch(current));
  }

  /** Deletes an asset's original and sidecar (derivative cache entries expire with the etag). */
  async remove(publicId: string): Promise<void> {
    const sidecar = await this.readSidecar(publicId).catch(() => null);
    if (sidecar) await rm(this.assetPath(publicId, sidecar.asset.format), { force: true });
    await rm(this.assetPath(publicId, "json"), { force: true });
  }

  async removeFolder(folder: string): Promise<void> {
    if (!PUBLIC_ID_RE.test(folder)) throw new Error(`Invalid folder "${folder}"`);
    await rm(path.join(this.dir, "assets", ...folder.split("/")), { recursive: true, force: true });
  }

  cachePath(key: string, ext: string): string {
    return path.join(this.dir, "cache", `${key}.${ext}`);
  }
}

/** Context keys that describe what the photo shows (others are bookkeeping: source, tokens, hints). */
const CONTENT_CONTEXT_KEYS = ["filename", "title", "description", "caption", "alt"];
/** Our own tags, which say nothing about the content ("planted_test" would otherwise read as "plant"). */
const SYSTEM_TAGS = /^(saakshi|archive|dev-upload|planted[_-](test|source)|reused|stock|location_mismatch|stamp_mismatch)$/;

/**
 * Lower-cased text the deterministic mocks key on: the photo's filename/title/description and its
 * non-system tags. Falls back to the public id for assets the store doesn't know.
 */
export async function mockHaystack(store: MockMediaStore, publicId: string): Promise<string> {
  const s = await store.readSidecar(publicId).catch(() => null);
  const parts = s
    ? [...s.tags.filter((t) => !SYSTEM_TAGS.test(t)), ...CONTENT_CONTEXT_KEYS.map((k) => s.context[k] ?? "")]
    : [publicId];
  return parts.join(" ").toLowerCase().replace(/[_\-/.]+/g, " ");
}
