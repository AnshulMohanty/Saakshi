/**
 * `pnpm parity:capture <route> [--name <page>] [--base <url>] [--no-video]`: the same scroll-step
 * capture as design:capture, of a running app route → design/actual/<page>/…  The page name
 * defaults to the route ("/" → index, "/spots/x" → spots-x); pass --name to match a design export
 * (e.g. `pnpm parity:capture / --name saakshi-landing`). Base URL: --base, else APP_URL, else
 * http://localhost:3000 (start `pnpm dev` first).
 */
import "./_env";
import path from "node:path";
import { capturePage, launchBrowser, pageSlug } from "./_capture";

const arg = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);

async function main() {
  const raw = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !["--name", "--base"].includes(all[i - 1] ?? ""));
  if (!raw) throw new Error("Usage: pnpm parity:capture <route> [--name <page>] [--base <url>]");
  // Git Bash (MSYS) rewrites "/spots/x" into "C:/Program Files/Git/spots/x": undo that.
  const route = raw.replace(/^[A-Za-z]:[\\/](?:.*?[\\/])?Git[\\/]/, "/").replaceAll("\\", "/");
  const base = (arg("--base") ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${base}${route.startsWith("/") ? route : `/${route}`}`;
  const name = pageSlug(arg("--name") ?? (route.replace(/^\/+|\/+$/g, "") || "index"));
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch((e: unknown) => e);
  if (!(res instanceof Response)) throw new Error(`${url} is not reachable (${res instanceof Error ? res.message : res}). Start the app with \`pnpm dev\`, or pass --base.`);
  if (!res.ok) console.warn(`${url} answered HTTP ${res.status}; capturing anyway.`);

  const browser = await launchBrowser();
  try {
    console.log(`${url} → design/actual/${name}/`);
    await capturePage(browser, { name, url, outDir: path.join(process.cwd(), "design", "actual"), video: !process.argv.includes("--no-video"), log: console.log });
  } finally {
    await browser.close();
  }
  console.log(`\nNext: pnpm parity:report (pairs design/reference/${name} with design/actual/${name}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
