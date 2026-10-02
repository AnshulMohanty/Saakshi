import "server-only";
/**
 * The design's sample archive (SAAKSHI_ARCHIVE, bundled into every export), for the /dev/parity
 * fixtures only (B5.3). `src("photos/p56.jpg")` → the page's own copy of that image, served by
 * /dev/parity/asset/<page>/<uuid>. Run `pnpm design:unpack` first.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface DPhoto {
  id: string;
  title: string;
  author: string;
  license: string;
  page: string;
  lat?: number;
  lng?: number;
  date?: string;
  project: string;
  hash: string;
  w: number;
  h: number;
  gps?: boolean;
  planted?: boolean;
}

export interface Archive {
  photos: DPhoto[];
  spots: Record<string, { name: string; city: string; lat: number; lng: number }>;
  dup: { of: string; copy: string; diff: number };
  hero: { src: string; mask: string; title: string; author: string; license: string; page: string; lat: number; lng: number; alt: number; taken: string; cover: number; hash: string; w: number; h: number };
  before: { src: string; mask: string; title: string; author: string; license: string; page: string; cover: number; hash: string; w: number; h: number };
  land: Array<[number, number]>;
}

/** photos/p56.jpg → that page's own copy of the image (some exports carry images but no archive). */
export async function designSrc(page: string): Promise<(p: string) => string> {
  const dir = path.join(process.cwd(), "design", "unpacked", page);
  const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8")) as { extResources: Array<{ id: string; uuid: string }> };
  const byId = new Map(index.extResources.map((e) => [e.id, e.uuid]));
  // photos/p56.jpg → ph_p56_jpg (the templates' resource key, e.g. landing L:5).
  return (p: string) => {
    const uuid = byId.get(`ph_${p.replace("photos/", "").replace(/[^\w]/g, "_")}`);
    return uuid ? `/dev/parity/asset/${page}/${uuid}` : p;
  };
}

export async function designArchive(page: string): Promise<{ D: Archive; src: (p: string) => string }> {
  const dir = path.join(process.cwd(), "design", "unpacked", page);
  let D: Archive | null = null;
  for (const f of await readdir(path.join(dir, "res"))) {
    if (!f.endsWith(".js")) continue;
    const text = await readFile(path.join(dir, "res", f), "utf8");
    if (!text.startsWith("window.SAAKSHI_ARCHIVE")) continue;
    const win: { SAAKSHI_ARCHIVE?: Archive } = {};
    new Function("window", text)(win);
    D = win.SAAKSHI_ARCHIVE ?? null;
  }
  if (!D) throw new Error(`SAAKSHI_ARCHIVE not found in design/unpacked/${page}: run pnpm design:unpack.`);
  return { D, src: await designSrc(page) };
}
