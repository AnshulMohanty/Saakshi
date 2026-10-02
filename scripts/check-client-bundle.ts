/**
 * `pnpm check:bundle [--scan-only]`: builds the app with a canary value in every secret env var
 * (a fresh random string per run), then scans every browser file in .next/static for the canaries,
 * for secret env var names and for key-shaped strings (lib/bundle-secrets.ts). Exit code 1 on a leak.
 * --scan-only skips the build and checks the names and shapes in the existing .next/static.
 *
 * The canaries only fill secrets that don't switch a provider on (a lone CLOUDINARY_API_SECRET,
 * a lone INNGEST_SIGNING_KEY, …) plus OPENAI_API_KEY, which no build step calls, so the build
 * itself stays offline.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { findBundleLeaks } from "../src/lib/bundle-secrets";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(js|mjs|css|html|json|map|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

async function main() {
  const scanOnly = process.argv.includes("--scan-only");
  const tag = randomBytes(6).toString("hex");
  const canaries: Record<string, string> = scanOnly
    ? {}
    : {
        CLOUDINARY_API_SECRET: `canary-cld-secret-${tag}`,
        OPENAI_API_KEY: `sk-canary${tag}canary${tag}`,
        INNGEST_SIGNING_KEY: `signkey-test-${tag}${tag}`,
        CAPTURE_TOKEN_SECRET: `canary-capture-secret-${tag}-${tag}-${tag}`,
        DEMO_ADMIN_SECRET: `canary-admin-${tag}`,
      };
  if (!scanOnly) {
    console.log(`Building with canary secrets (${tag})…`);
    const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
    const r = spawnSync(process.execPath, [nextBin, "build"], { stdio: "inherit", env: { ...process.env, ...canaries } });
    if (r.status !== 0) {
      console.error("next build failed");
      process.exitCode = 1;
      return;
    }
  }
  const dir = path.join(process.cwd(), ".next", "static");
  const files = await walk(dir);
  if (!files.length) {
    console.error(`${dir} is empty: run a build first (or drop --scan-only).`);
    process.exitCode = 1;
    return;
  }
  const leaks = findBundleLeaks(await Promise.all(files.map(async (f) => ({ file: path.relative(process.cwd(), f), text: await readFile(f, "utf8") }))), canaries);
  for (const l of leaks) console.log(`✗ ${l.kind} ${l.what} in ${l.file}: …${l.excerpt}…`);
  console.log(`\nScanned ${files.length} browser file(s) in .next/static for ${Object.keys(canaries).length} canary value(s), secret env names and key shapes: ${leaks.length ? `${leaks.length} LEAK(S)` : "no secrets"}.`);
  if (leaks.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
