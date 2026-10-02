import { readFile } from "node:fs/promises";
import path from "node:path";
import { devToolsEnabled } from "@/lib/config";

/**
 * Design resources for the /dev/parity fixtures (B5.3: the design's sample photos never reach a
 * real route). Serves design/unpacked/<page>/res/<uuid>.<ext> (run `pnpm design:unpack` first).
 */
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml", woff2: "font/woff2", js: "text/javascript" };

export async function GET(_req: Request, ctx: RouteContext<"/dev/parity/asset/[page]/[id]">) {
  if (!devToolsEnabled()) return new Response("Not found", { status: 404 });
  const { page, id } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(page) || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Bad request", { status: 400 });
  const dir = path.join(process.cwd(), "design", "unpacked", page, "res");
  for (const ext of Object.keys(TYPES)) {
    const bytes = await readFile(path.join(dir, `${id}.${ext}`)).catch(() => null);
    if (bytes) return new Response(new Uint8Array(bytes), { headers: { "content-type": TYPES[ext], "cache-control": "public, max-age=3600" } });
  }
  return new Response("Not found (run pnpm design:unpack)", { status: 404 });
}
