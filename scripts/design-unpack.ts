/**
 * `pnpm design:unpack [--page <name>]`: extracts each design export (a "bundler" page) in
 * design/export/*.html into design/unpacked/<page>/:
 *
 *   template.html     the page HTML (the __bundler/template JSON string, decoded)
 *   res/<id>.<ext>    every resource in __bundler/manifest (base64, gunzipped when compressed)
 *   index.json        resource ids → uuid, mime, size, file, and the ext_resources + page_order maps
 *
 * The exports themselves stay untouched (pages link to each other by file name).
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const EXT: Record<string, string> = {
  "application/javascript": "js",
  "text/javascript": "js",
  "text/css": "css",
  "text/html": "html",
  "application/json": "json",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "application/font-woff2": "woff2",
  "text/plain": "txt",
};

export const slugOf = (file: string) =>
  path
    .basename(file, path.extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The text inside <script type="__bundler/<kind>">…</script>, or null. */
export function bundlerBlock(html: string, kind: string): string | null {
  const open = `<script type="__bundler/${kind}">`;
  const i = html.indexOf(open);
  if (i < 0) return null;
  const j = html.indexOf("</script>", i + open.length);
  return j < 0 ? null : html.slice(i + open.length, j).trim();
}

interface ManifestEntry {
  mime?: string;
  type?: string;
  compressed?: boolean;
  data?: string;
  content?: string;
  name?: string;
}

async function unpack(file: string, outRoot: string) {
  const html = await readFile(file, "utf8");
  const slug = slugOf(file);
  const dir = path.join(outRoot, slug);
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, "res"), { recursive: true });

  const templateRaw = bundlerBlock(html, "template");
  const template = templateRaw ? (JSON.parse(templateRaw) as string) : "";
  await writeFile(path.join(dir, "template.html"), template);

  const manifest = JSON.parse(bundlerBlock(html, "manifest") ?? "{}") as Record<string, ManifestEntry>;
  const ext = JSON.parse(bundlerBlock(html, "ext_resources") ?? "[]") as unknown;
  const pageOrder = JSON.parse(bundlerBlock(html, "page_order") ?? "null") as unknown;

  const resources: Array<{ uuid: string; mime: string; bytes: number; file: string; compressed: boolean; name: string | null }> = [];
  for (const [uuid, e] of Object.entries(manifest)) {
    const mime = e.mime ?? e.type ?? "application/octet-stream";
    const raw = e.data ?? e.content ?? "";
    let buf = Buffer.from(raw, "base64");
    if (e.compressed) buf = gunzipSync(buf);
    const name = `${uuid}.${EXT[mime.split(";")[0]] ?? "bin"}`;
    await writeFile(path.join(dir, "res", name), buf);
    resources.push({ uuid, mime, bytes: buf.length, file: `res/${name}`, compressed: !!e.compressed, name: e.name ?? null });
  }
  // ext_resources maps friendly ids to uuids: list them so a script can find "saakshi-kit" etc.
  const ids = Array.isArray(ext)
    ? (ext as Array<Record<string, string>>).map((x) => ({ id: x.id ?? x.name ?? null, uuid: x.uuid ?? x.resource ?? x.ref ?? null }))
    : ext && typeof ext === "object"
      ? Object.entries(ext as Record<string, unknown>).map(([id, v]) => ({ id, uuid: typeof v === "string" ? v : ((v as Record<string, string>)?.uuid ?? null) }))
      : [];
  await writeFile(path.join(dir, "index.json"), JSON.stringify({ source: path.relative(process.cwd(), file).replaceAll("\\", "/"), templateBytes: template.length, resources, extResources: ids, pageOrder }, null, 2));
  return { slug, resources: resources.length, bytes: resources.reduce((s, r) => s + r.bytes, 0), templateBytes: template.length, ext: ids.length };
}

async function main() {
  const root = process.cwd();
  const only = process.argv.includes("--page") ? process.argv[process.argv.indexOf("--page") + 1] : null;
  const exportDir = path.join(root, "design", "export");
  const files = (await readdir(exportDir)).filter((f) => /\.html?$/i.test(f)).filter((f) => !only || slugOf(f).includes(slugOf(only)));
  const outRoot = path.join(root, "design", "unpacked");
  // One file at a time: some exports are 7 MB, and this machine has little memory to spare.
  for (const f of files) {
    const r = await unpack(path.join(exportDir, f), outRoot);
    console.log(`${f.padEnd(28)} → design/unpacked/${r.slug}/  template ${(r.templateBytes / 1024).toFixed(0)} KB, ${r.resources} resource(s) ${(r.bytes / 1024).toFixed(0)} KB, ${r.ext} ext id(s)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
