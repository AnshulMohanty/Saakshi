/**
 * `pnpm parity:report`: design/parity/report.html, the design (design/reference) next to the app
 * (design/actual), step by step and per width, with a pixel difference per step (mean absolute
 * difference of downscaled greyscale images, 0% = identical). Pages pair by name, or through
 * design/parity.json: { "pairs": [{ "design": "saakshi-landing", "actual": "index" }] }.
 * Steps pair by index; the scroll positions are in each manifest.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { CaptureManifest } from "./_capture";

const root = process.cwd();
const ref = path.join(root, "design", "reference");
const act = path.join(root, "design", "actual");
const out = path.join(root, "design", "parity");

async function manifests(dir: string): Promise<Map<string, CaptureManifest>> {
  const m = new Map<string, CaptureManifest>();
  for (const d of await readdir(dir).catch(() => [])) {
    const f = path.join(dir, d, "manifest.json");
    if (existsSync(f)) m.set(d, JSON.parse(await readFile(f, "utf8")) as CaptureManifest);
  }
  return m;
}

/** 0–100: mean absolute difference of 320-px-wide greyscale versions (the actual resized to the reference). */
async function diffPct(a: string, b: string): Promise<number> {
  const meta = await sharp(a).metadata();
  const w = 320;
  const h = Math.max(1, Math.round(((meta.height ?? 1) / (meta.width ?? 1)) * w));
  const load = (f: string) => sharp(f).resize(w, h, { fit: "fill" }).greyscale().raw().toBuffer();
  const [x, y] = await Promise.all([load(a), load(b)]);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  return Math.round((sum / x.length / 255) * 1000) / 10;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function main() {
  const [refs, acts] = await Promise.all([manifests(ref), manifests(act)]);
  const map = existsSync(path.join(root, "design", "parity.json"))
    ? ((JSON.parse(await readFile(path.join(root, "design", "parity.json"), "utf8")) as { pairs: Array<{ design: string; actual: string }> }).pairs ?? [])
    : [];
  const pairs = [...map, ...[...refs.keys()].filter((k) => acts.has(k) && !map.some((p) => p.design === k)).map((k) => ({ design: k, actual: k }))].filter((p) => refs.has(p.design) && acts.has(p.actual));

  const sections: string[] = [];
  const summary: Array<{ design: string; actual: string; width: number; steps: number; meanDiff: number | null }> = [];
  for (const p of pairs) {
    const r = refs.get(p.design)!;
    const a = acts.get(p.actual)!;
    for (const rv of r.viewports) {
      const av = a.viewports.find((v) => v.width === rv.width);
      if (!av) continue;
      const rows: string[] = [];
      const diffs: number[] = [];
      const n = Math.max(rv.steps.length, av.steps.length);
      for (let i = 0; i < n; i++) {
        const rs = rv.steps[i];
        const as = av.steps[i];
        const rf = rs ? path.join(ref, p.design, rs.file) : null;
        const af = as ? path.join(act, p.actual, as.file) : null;
        const d = rf && af ? await diffPct(rf, af) : null;
        if (d !== null) diffs.push(d);
        const img = (f: string | null, alt: string) => (f ? `<img loading="lazy" src="${esc(path.relative(out, f).replaceAll("\\", "/"))}" alt="${esc(alt)}">` : `<div class="missing">no step</div>`);
        rows.push(
          `<tr><td class="meta">#${i}<br>design y ${rs?.y ?? "–"}<br>app y ${as?.y ?? "–"}${rs?.label ? `<br>${esc(rs.label)}` : ""}<br><b class="${d === null ? "" : d < 5 ? "good" : d < 15 ? "fair" : "poor"}">${d === null ? "–" : `${d}%`}</b></td><td>${img(rf, `design step ${i}`)}</td><td>${img(af, `app step ${i}`)}</td></tr>`,
        );
      }
      const mean = diffs.length ? Math.round((diffs.reduce((s, x) => s + x, 0) / diffs.length) * 10) / 10 : null;
      summary.push({ design: p.design, actual: p.actual, width: rv.width, steps: n, meanDiff: mean });
      sections.push(
        `<section id="${esc(`${p.design}-${rv.width}`)}"><h2>${esc(p.design)} ↔ ${esc(p.actual)} · ${rv.width}px · mean difference ${mean ?? "–"}%</h2><table><thead><tr><th>step</th><th>design (${esc(r.source.split("/").pop() ?? "")})</th><th>app (${esc(a.source)})</th></tr></thead><tbody>${rows.join("")}</tbody></table></section>`,
      );
    }
  }
  const unpairedDesign = [...refs.keys()].filter((k) => !pairs.some((p) => p.design === k));
  const unpairedApp = [...acts.keys()].filter((k) => !pairs.some((p) => p.actual === k));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design parity</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--good:#15803d;--fair:#b45309;--poor:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--line:#292524;--good:#4ade80;--fair:#fbbf24;--poor:#f87171}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
h1{font-size:20px}h2{font-size:16px;margin:32px 0 8px}table{border-collapse:collapse;width:100%}td,th{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}
td img{width:100%;height:auto;display:block;border:1px solid var(--line)}td.meta{width:120px;color:var(--muted);font-size:12px}.missing{color:var(--muted)}
.good{color:var(--good)}.fair{color:var(--fair)}.poor{color:var(--poor)}ul{color:var(--muted)}
</style></head><body><h1>Design parity</h1>
<p>Generated ${new Date().toISOString()}. Difference: mean absolute difference of 320-px greyscale versions, per step (0% = identical).</p>
<ul>${summary.map((s) => `<li><a href="#${esc(`${s.design}-${s.width}`)}">${esc(s.design)} ↔ ${esc(s.actual)} @${s.width}</a>: ${s.steps} step(s), mean ${s.meanDiff ?? "–"}%</li>`).join("") || "<li>No pairs yet: capture a design page and the matching app route with the same name (or map them in design/parity.json).</li>"}</ul>
${unpairedDesign.length ? `<p>Design pages without an app capture: ${unpairedDesign.map(esc).join(", ")}</p>` : ""}${unpairedApp.length ? `<p>App captures without a design page: ${unpairedApp.map(esc).join(", ")}</p>` : ""}
${sections.join("\n")}</body></html>`;
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "report.html"), html);
  await writeFile(path.join(out, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), pairs: summary, unpairedDesign, unpairedApp }, null, 2));
  console.log(`design/parity/report.html: ${summary.length} page/width pair(s); ${unpairedDesign.length} design page(s) and ${unpairedApp.length} app capture(s) unpaired.`);
  for (const s of summary) console.log(`  ${s.design} ↔ ${s.actual} @${s.width}: ${s.steps} step(s), mean difference ${s.meanDiff ?? "–"}%`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
