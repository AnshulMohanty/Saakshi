/**
 * `pnpm tunnel`: HTTPS for phone testing, no account. Runs a Cloudflare quick tunnel to the dev
 * server (camera and GPS need HTTPS) and prints the /capture URLs.
 */
import { spawn, spawnSync } from "node:child_process";

const port = process.env.PORT || "3000";
const check = spawnSync("cloudflared", ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
if (check.status !== 0) {
  console.error(`cloudflared is not installed. Install it (no account needed), then run \`pnpm tunnel\` again:
  Windows:  winget install --id Cloudflare.cloudflared
  macOS:    brew install cloudflared
  Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
Or run it directly: cloudflared tunnel --url http://localhost:${port}`);
  process.exit(1);
}

console.log(`Starting a quick tunnel to http://localhost:${port} (keep \`pnpm dev\` running in another terminal)…`);
const child = spawn(`cloudflared tunnel --url http://localhost:${port}`, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
let shown = false;
const onData = (buf) => {
  const text = buf.toString();
  const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
  if (m && !shown) {
    shown = true;
    console.log(`\n  Open on your phone:  ${m[0]}/capture\n  With a project:      ${m[0]}/capture?project=<slug>   (slugs: /dev/status or pnpm demo:import)\n`);
  }
  if (/error|failed/i.test(text)) process.stderr.write(text);
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
