/**
 * No browser code reaches Node's crypto (or other server-only modules): a stray import pulls a
 * 451 KB polyfill into the client bundle, and its eval breaks under the Content-Security-Policy.
 * Walks value imports from every "use client" module.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const files: string[] = [];
(function walk(d: string) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})(SRC);

const resolve = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
};
const SERVER_ONLY = /from "(node:crypto|crypto|node:fs|fs|node:fs\/promises|sharp|server-only)"|^import "server-only"/m;

describe("client bundles stay browser-only", () => {
  it("no 'use client' module imports node:crypto, node:fs, sharp or server-only, directly or through its imports", () => {
    const deps = new Map<string, string[]>();
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      const out: string[] = [];
      for (const m of s.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)) {
        const r = resolve(f, m[1]);
        if (r) out.push(r);
      }
      deps.set(f, out);
    }
    const leaks: string[] = [];
    for (const f of files) {
      if (!/^\s*["']use client["']/.test(readFileSync(f, "utf8"))) continue;
      const prev = new Map<string, string | null>([[f, null]]);
      const queue = [f];
      while (queue.length) {
        const x = queue.shift()!;
        if (SERVER_ONLY.test(readFileSync(x, "utf8"))) {
          const chain: string[] = [];
          for (let y: string | null | undefined = x; y; y = prev.get(y)) chain.unshift(path.relative(ROOT, y).replaceAll("\\", "/"));
          leaks.push(chain.join(" -> "));
          break;
        }
        for (const d of deps.get(x) ?? []) {
          if (prev.has(d)) continue;
          prev.set(d, x);
          queue.push(d);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
