/**
 * Client bundles carry no secrets. The scanner is tested here on synthetic bundles; `pnpm
 * check:bundle` runs it on a real build made with canary secrets. When a build exists
 * (.next/static), this test also scans it for secret names and key shapes.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findBundleLeaks } from "@/lib/bundle-secrets";

describe("findBundleLeaks", () => {
  it("finds canary values, secret env names and key-shaped strings", () => {
    const leaks = findBundleLeaks(
      [
        { file: "a.js", text: 'const k="canary-cld-secret-abc";' },
        { file: "b.js", text: "process.env.OPENAI_API_KEY" },
        { file: "c.js", text: 'fetch(u,{headers:{authorization:"Bearer sk-proj-abcdefghijklmnopqrstuvwxyz"}})' },
        { file: "d.js", text: 'connect("postgresql://postgres.ref:hunter2@pooler.supabase.com:6543/postgres")' },
      ],
      { CLOUDINARY_API_SECRET: "canary-cld-secret-abc" },
    );
    expect(leaks.map((l) => `${l.file}:${l.kind}:${l.what}`)).toEqual(["a.js:canary:CLOUDINARY_API_SECRET", "b.js:env_name:OPENAI_API_KEY", "c.js:key_shape:OpenAI key", "d.js:key_shape:Postgres URL with password"]);
  });

  it("ignores public values (cloud names, signed URLs, NEXT_PUBLIC_ names)", () => {
    const text = 'const u="https://res.cloudinary.com/demo/image/authenticated/s--AbCd1234--/v1/x";process.env.NEXT_PUBLIC_APP_NAME;"skeleton-sk-12"';
    expect(findBundleLeaks([{ file: "ok.js", text }])).toEqual([]);
  });
});

const staticDir = path.join(process.cwd(), ".next", "static");

describe.runIf(existsSync(staticDir))("the current build's browser files", () => {
  it("contain no secret env names or key-shaped strings", async () => {
    const walk = async (d: string): Promise<string[]> =>
      (await Promise.all((await readdir(d, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])))).flat();
    const files = (await walk(staticDir)).filter((f) => /\.(js|css|json)$/.test(f));
    const leaks = findBundleLeaks(await Promise.all(files.map(async (f) => ({ file: f, text: await readFile(f, "utf8") }))));
    expect(leaks).toEqual([]);
  });
});
