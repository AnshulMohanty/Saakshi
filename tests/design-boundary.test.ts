import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : [];
  });
}

describe("B5.3: the design's sample archive stays in /dev/parity", () => {
  it("only /dev pages import the parity fixtures, and nothing reads design/unpacked at runtime outside them", () => {
    const offenders: string[] = [];
    for (const f of [...files(path.join(root, "src/app")), ...files(path.join(root, "src/lib")), ...files(path.join(root, "src/components"))]) {
      const rel = path.relative(root, f).replaceAll("\\", "/");
      const src = readFileSync(f, "utf8");
      // Allowed: the dev pages, lib/parity, the fixture loaders and the design-scoring wrappers they render.
      const allowed = rel.startsWith("src/app/dev/") || rel.startsWith("src/lib/parity/") || /^src\/lib\/[a-z-]+\/fixture\.ts$/.test(rel) || /^src\/components\/[a-z-]+\/design\.tsx$/.test(rel);
      const reads = /from\s+["'][^"']*\/fixture["']/.test(src) || /design["'],\s*["']unpacked/.test(src) || /SAAKSHI_ARCHIVE/.test(src) || /from\s+["']@\/lib\/parity\//.test(src) || /from\s+["']\.\/design["']/.test(src);
      if (!allowed && reads) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
