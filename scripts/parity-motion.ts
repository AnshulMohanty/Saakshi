/**
 * `pnpm parity:motion <page> [--base url]`: motion parity by numbers. The design export and our
 * /dev/parity fixture run on Playwright's fake clock from the same trigger (aligned to the
 * animation-frame grid); at each sample time the computed transform, opacity and text of the
 * page's key elements are read and compared. Screenshots of tween onsets vary by a frame of
 * React/image timing; the numbers don't. Writes design/parity/motion-<page>.json.
 */
import "./_env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./_capture";

interface Spec {
  exportFile: string;
  route: string;
  viewport: { width: number; height: number };
  ready: { design: string; app: string };
  trigger: string;
  times: number[];
  selectors: string[];
}

const SPECS: Record<string, Spec> = {
  "witness-wall": {
    exportFile: "Witness Wall.html",
    route: "/dev/parity/witness-wall",
    viewport: { width: 1920, height: 1080 },
    ready: { design: "!!window.gsap && !!document.querySelector('#ww-qr svg')", app: "!!document.querySelector('[data-wall-ready]')" },
    trigger: "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))",
    times: [0, 0.05, 0.1, 0.3, 0.5, 0.9, 1.3, 1.5, 1.6, 1.8, 2.0, 2.3, 2.4, 2.9, 3.6, 4.4, 5.0, 7.4, 7.6, 8.0, 8.4],
    selectors: ["#ww-card", "#ww-plane", "#ww-cam", "#ww-focus-name"],
  },
};

type Sample = Record<string, { transform: string; opacity: string; text: string }>;

const READ = (sel: string[]) => `(${JSON.stringify(sel)}).reduce((o, s) => { const el = document.querySelector(s); if (el) { const cs = getComputedStyle(el); o[s] = { transform: cs.transform, opacity: cs.opacity, text: el.children.length ? "" : (el.textContent || "").trim() }; } return o; }, {})`;

async function run(url: string, ready: string, s: Spec): Promise<Sample[]> {
  const b = await launchBrowser();
  try {
    const page = await (await b.newContext({ viewport: s.viewport, deviceScaleFactor: 1 })).newPage();
    await page.clock.install({ time: new Date("2026-09-28T10:00:00+05:30") });
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    let ticks = 0;
    for (let i = 0; i < 200 && !(await page.evaluate(ready).catch(() => false)); i++) {
      await page.clock.runFor(100);
      ticks += 100;
    }
    await page.clock.runFor(500);
    ticks += 500;
    await page.clock.runFor((16 - (ticks % 16)) % 16);
    await page.evaluate(s.trigger);
    const out: Sample[] = [];
    let now = 0;
    for (const t of s.times) {
      await page.clock.runFor(Math.round((t - now) * 1000));
      now = t;
      out.push((await page.evaluate(READ(s.selectors))) as Sample);
    }
    return out;
  } finally {
    await b.close();
  }
}

const nums = (m: string) => (m === "none" ? [1, 0, 0, 1, 0, 0] : (m.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number));

async function main() {
  const page = process.argv[2];
  const s = SPECS[page];
  if (!s) throw new Error(`Usage: pnpm parity:motion <${Object.keys(SPECS).join("|")}>`);
  const base = (process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const [d, a] = [await run(pathToFileURL(path.join(process.cwd(), "design", "export", s.exportFile)).href, s.ready.design, s), await run(`${base}${s.route}`, s.ready.app, s)];
  const rows = s.times.map((t, i) => {
    const per = s.selectors.map((sel) => {
      const x = d[i][sel];
      const y = a[i][sel];
      if (!x || !y) return { sel, missing: true, transform: Infinity, opacity: Infinity, text: false };
      const nx = nums(x.transform);
      const ny = nums(y.transform);
      const transform = nx.length === ny.length ? Math.max(0, ...nx.map((v, k) => Math.abs(v - ny[k]))) : Infinity;
      return { sel, transform: Math.round(transform * 1000) / 1000, opacity: Math.abs(Number(x.opacity) - Number(y.opacity)), text: x.text === y.text };
    });
    return { t, per };
  });
  const worstT = Math.max(...rows.flatMap((r) => r.per.map((p) => p.transform)));
  const worstO = Math.max(...rows.flatMap((r) => r.per.map((p) => p.opacity)));
  const textOk = rows.every((r) => r.per.every((p) => p.text));
  await mkdir(path.join(process.cwd(), "design", "parity"), { recursive: true });
  await writeFile(path.join(process.cwd(), "design", "parity", `motion-${page}.json`), JSON.stringify({ page, times: s.times, selectors: s.selectors, worstTransform: worstT, worstOpacity: worstO, textMatches: textOk, rows, design: d, app: a }, null, 1));
  console.log(`${page}: ${s.times.length} samples × ${s.selectors.length} elements; worst transform difference ${worstT} (matrix units/px), worst opacity difference ${worstO}, text ${textOk ? "identical" : "differs"}`);
  for (const r of rows) {
    const bad = r.per.filter((p) => p.transform > 0.5 || p.opacity > 0.01 || !p.text);
    if (bad.length) console.log(`  t=${r.t}s: ${bad.map((p) => `${p.sel} Δtransform ${p.transform} Δopacity ${p.opacity}${p.text ? "" : " text differs"}`).join("; ")}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
