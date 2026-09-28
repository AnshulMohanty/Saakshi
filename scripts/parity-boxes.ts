/**
 * `pnpm parity:boxes <design page> <route> [--width 1440] [--base url]`: bounding boxes of the
 * same elements in the design export and in our route, compared. Elements pair by id, by
 * data-screen-label (sections) and by data-* hooks the port keeps (data-ll, data-num, data-tile…).
 * Document coordinates (rect + scroll), at the top of the page, reduced motion (pins released,
 * so every section is in flow). Tolerance: ±2 px at 1440, ±1 px at 390 (Phase 8 brief).
 * Writes design/parity/boxes-<page>-<width>.json and prints the worst offenders.
 */
import "./_env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./_capture";

const arg = (f: string) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : undefined);

interface Box {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLLECT = `(() => {
  const out = [];
  const seen = new Map();
  const push = (key, el) => {
    const n = (seen.get(key) ?? 0) + 1; seen.set(key, n);
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    out.push({ key: n > 1 ? key + "#" + n : key, x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) });
  };
  for (const el of document.querySelectorAll("[data-screen-label]")) push("section:" + el.getAttribute("data-screen-label"), el);
  for (const el of document.querySelectorAll("[id]")) if (!/^(__|top$|sk-gl$|sk-sky$|gl-)/.test(el.id)) push("#" + el.id, el);
  for (const a of ["data-ll", "data-num", "data-flag", "data-hole", "data-tile", "data-rule", "data-pl"]) for (const el of document.querySelectorAll("[" + a + "]")) push(a + "=" + el.getAttribute(a), el);
  for (const el of document.querySelectorAll("h1, h2")) push("heading:" + (el.textContent || "").trim().slice(0, 40), el);
  return out;
})()`;

async function boxes(url: string, width: number, prepare?: string): Promise<Box[]> {
  const b = await launchBrowser();
  try {
    const ctx = await b.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 180_000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.waitForTimeout(2500);
    if (prepare) await page.evaluate(prepare);
    await page.waitForTimeout(800);
    return (await page.evaluate(COLLECT)) as Box[];
  } finally {
    await b.close();
  }
}

async function main() {
  const [designPage, route] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !["--width", "--base"].includes(all[i - 1] ?? ""));
  if (!designPage || !route) throw new Error("Usage: pnpm parity:boxes <design page slug> <route> [--width 1440]");
  const width = Number(arg("--width") ?? 1440);
  const tol = width < 800 ? 1 : 2;
  const base = (arg("--base") ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const { readdir } = await import("node:fs/promises");
  const exportDir = path.join(process.cwd(), "design", "export");
  const file = (await readdir(exportDir)).find((f) => f.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-html$/, "") === designPage);
  if (!file) throw new Error(`No export for ${designPage}`);
  const noMarks = "window.__dcSetProps && window.__dcSetProps(window.__dcRootName(), { showMarks: false, showSample: false })";
  const [d, a] = [await boxes(pathToFileURL(path.join(exportDir, file)).href, width, noMarks), await boxes(`${base}${route.replace(/^[A-Za-z]:[\\/](?:.*?[\\/])?Git[\\/]/, "/")}`, width)];
  const byKey = new Map(a.map((x) => [x.key, x]));
  const rows = d
    .filter((x) => byKey.has(x.key))
    .map((x) => {
      const y = byKey.get(x.key)!;
      const dx = y.x - x.x, dy = y.y - x.y, dw = y.w - x.w, dh = y.h - x.h;
      return { key: x.key, design: x, app: y, dx, dy, dw, dh, worst: Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh)) };
    });
  const bad = rows.filter((r) => r.worst > tol);
  const missing = d.filter((x) => !byKey.has(x.key)).map((x) => x.key);
  await mkdir(path.join(process.cwd(), "design", "parity"), { recursive: true });
  await writeFile(path.join(process.cwd(), "design", "parity", `boxes-${designPage}-${width}.json`), JSON.stringify({ width, tolerance: tol, compared: rows.length, over: bad.length, missing, rows }, null, 1));
  console.log(`${designPage} @${width}: ${rows.length} boxes compared, ${bad.length} over ±${tol} px, ${missing.length} design boxes with no app match`);
  for (const r of bad.sort((p, q) => p.design.y - q.design.y).slice(0, Number(arg("--show") ?? 25))) console.log(`  ${r.key.padEnd(48).slice(0, 48)} y ${r.design.y}→${r.app.y} (${r.dy >= 0 ? "+" : ""}${r.dy})  x ${r.dx >= 0 ? "+" : ""}${r.dx}  w ${r.dw >= 0 ? "+" : ""}${r.dw}  h ${r.dh >= 0 ? "+" : ""}${r.dh}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
