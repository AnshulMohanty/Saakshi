/**
 * `pnpm video:final [--real] [--no-build] [--scale 0.6667]`: re-records the footage and re-renders both
 * preview videos from the data as it is now. By default the production build runs in preview mode
 * (DEMO_PREVIEW=1: mock-derived values badged "Prototype measurement", mock AI readings withheld);
 * with --real (once the live providers are connected and the demo re-measured) it runs as a plain
 * production build, so only real values show.
 *
 * Needs CAPTURE_TOKEN_SECRET (production refuses the dev default), the key the local demo data's
 * signed URLs were made with (issue G11). Low memory: stop `pnpm dev` first; the server is stopped
 * before the render.
 */
import "../_env";
import { spawn, type ChildProcess } from "node:child_process";

const BASE = "http://localhost:3000";
const real = process.argv.includes("--real");
const scale = process.argv.includes("--scale") ? ["--scale", process.argv[process.argv.indexOf("--scale") + 1]] : [];

const sh = (cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  new Promise<void>((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env });
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")}: exit ${c}`))));
  });

const stop = (p: ChildProcess) =>
  new Promise<void>((res) => {
    if (process.platform === "win32" && p.pid) spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"]).on("close", () => res());
    else {
      p.kill("SIGTERM");
      res();
    }
  });

async function main() {
  if (!process.env.CAPTURE_TOKEN_SECRET) throw new Error("Set CAPTURE_TOKEN_SECRET (the production build refuses the dev default). It must be the key the demo data was imported with.");
  if (await fetch(BASE).then(() => true, () => false)) throw new Error(`${BASE} is already serving: stop it (pnpm dev holds the PGlite lock).`);
  const env = { ...process.env, ...(real ? {} : { DEMO_PREVIEW: "1" }) };
  if (!process.argv.includes("--no-build")) await sh("pnpm", ["build"], env);
  const recordingSince = new Date().toISOString();
  const server = spawn("pnpm", ["start"], { stdio: "inherit", shell: process.platform === "win32", env });
  try {
    for (let i = 0; i < 120 && !(await fetch(BASE).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 1000));
    await sh("pnpm", ["-s", "video:record", "--base", BASE, ...scale]);
  } finally {
    await stop(server);
  }
  // The capture clip's simulated check-in must not stay in the data.
  await sh("pnpm", ["-s", "video:cleanup", "--since", recordingSince]);
  await sh("pnpm", ["-s", "video:render"]);
  await sh("pnpm", ["-s", "video:description"]);
  console.log(`Done (${real ? "production" : "preview"} data): video/preview/saakshi-launch-preview.mp4, video/preview/saakshi-demo-3min-preview.mp4 (+ .srt, .music.m4a).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
