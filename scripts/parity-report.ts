/**
 * `pnpm parity:report`: design/parity/report.html + summary.json, the design (design/reference)
 * next to the app (design/actual), per variant, width and step. Two numbers per step:
 *   pixelmatch  share of pixels that differ (pixelmatch, threshold 0.1, anti-aliasing ignored), at
 *               the reference's size; the fixture-route gate is ≤ 1.5 %;
 *   mean        mean absolute difference of 320-px greyscale versions (0 % = identical), a softer
 *               "how far off" for real routes whose data differs from the design's samples.
 * Pages pair by name, or through design/parity.json: { "pairs": [{ "design": "saakshi-landing",
 * "actual": "index" }] }. Variants pair by id (a missing app variant falls back to "default"),
 * steps by index; the scroll positions are in each manifest. Reads pre-Phase-8 manifests too.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import sharp from "sharp";
import type { CaptureManifest, CaptureManifestV2, VariantManifest } from "./_capture";

const root = process.cwd();
const ref = path.join(root, "design", "reference");
const act = path.join(root, "design", "actual");
const out = path.join(root, "design", "parity");
export const PIXEL_GATE = 1.5;

function toV2(m: CaptureManifest | CaptureManifestV2): CaptureManifestV2 {
  if ("variants" in m) return m;
  return { ...m, variants: [{ id: "default", label: null, viewports: m.viewports }] };
}

async function manifests(dir: string): Promise<Map<string, CaptureManifestV2>> {
  const m = new Map<string, CaptureManifestV2>();
  for (const d of await readdir(dir).catch(() => [])) {
    const f = path.join(dir, d, "manifest.json");
    if (existsSync(f)) m.set(d, toV2(JSON.parse(await readFile(f, "utf8")) as CaptureManifest | CaptureManifestV2));
  }
  return m;
}

/** Both images at the reference's size (the app's is resized if it differs), RGBA. */
async function pair(a: string, b: string) {
  const meta = await sharp(a).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const load = (f: string) => sharp(f).resize(w, h, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  const [x, y] = await Promise.all([load(a), load(b)]);
  return { x, y, w, h };
}

async function diff(a: string, b: string, diffFile: string | null) {
  const { x, y, w, h } = await pair(a, b);
  const d = diffFile ? Buffer.alloc(w * h * 4) : undefined;
  const bad = pixelmatch(x, y, d, w, h, { threshold: 0.1, includeAA: false });
  if (d && diffFile) await sharp(d, { raw: { width: w, height: h, channels: 4 } }).png().toFile(diffFile);
  // Mean absolute difference, greyscale, 320 px wide.
  const sw = 320;
  const sh = Math.max(1, Math.round((h / w) * sw));
  const g = (buf: Buffer) => sharp(buf, { raw: { width: w, height: h, channels: 4 } }).resize(sw, sh, { fit: "fill" }).greyscale().raw().toBuffer();
  const [gx, gy] = await Promise.all([g(x), g(y)]);
  let sum = 0;
  for (let i = 0; i < gx.length; i++) sum += Math.abs(gx[i] - gy[i]);
  return { pixel: Math.round((bad / (w * h)) * 1000) / 10, mean: Math.round((sum / gx.length / 255) * 1000) / 10 };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

interface Row {
  design: string;
  actual: string;
  variant: string;
  width: number;
  steps: number;
  pixel: number | null;
  worstPixel: number | null;
  mean: number | null;
  pass: boolean | null;
}

async function main() {
  const [refs, acts] = await Promise.all([manifests(ref), manifests(act)]);
  const map = existsSync(path.join(root, "design", "parity.json"))
    ? ((JSON.parse(await readFile(path.join(root, "design", "parity.json"), "utf8")) as { pairs: Array<{ design: string; actual: string }> }).pairs ?? [])
    : [];
  const pairs = [...map, ...[...refs.keys()].filter((k) => acts.has(k) && !map.some((p) => p.design === k)).map((k) => ({ design: k, actual: k }))].filter((p) => refs.has(p.design) && acts.has(p.actual));

  await mkdir(path.join(out, "diff"), { recursive: true });
  const sections: string[] = [];
  const summary: Row[] = [];
  for (const p of pairs) {
    const r = refs.get(p.design)!;
    const a = acts.get(p.actual)!;
    for (const rvar of r.variants) {
      const avar: VariantManifest | undefined = a.variants.find((v) => v.id === rvar.id) ?? a.variants.find((v) => v.id === "default");
      if (!avar) continue;
      for (const rv of rvar.viewports) {
        const av = avar.viewports.find((v) => v.width === rv.width);
        if (!av) continue;
        const rows: string[] = [];
        const px: number[] = [];
        const mn: number[] = [];
        const n = Math.max(rv.steps.length, av.steps.length);
        for (let i = 0; i < n; i++) {
          const rs = rv.steps[i];
          const as = av.steps[i];
          const rf = rs ? path.join(ref, p.design, rs.file) : null;
          const af = as ? path.join(act, p.actual, as.file) : null;
          const df = rf && af ? path.join(out, "diff", `${p.design}--${rvar.id}--${rv.width}--${String(i).padStart(3, "0")}.png`) : null;
          const d = rf && af ? await diff(rf, af, df) : null;
          if (d) {
            px.push(d.pixel);
            mn.push(d.mean);
          }
          const img = (f: string | null, alt: string) => (f ? `<img loading="lazy" src="${esc(path.relative(out, f).replaceAll("\\", "/"))}" alt="${esc(alt)}">` : `<div class="missing">no step</div>`);
          const cls = d === null ? "" : d.pixel <= PIXEL_GATE ? "good" : d.pixel < 10 ? "fair" : "poor";
          rows.push(
            `<tr><td class="meta">#${i}<br>design y ${rs?.y ?? "–"}<br>app y ${as?.y ?? "–"}${rs?.label ? `<br>${esc(rs.label)}` : ""}<br><b class="${cls}">${d === null ? "–" : `${d.pixel}% px`}</b><br>${d === null ? "" : `${d.mean}% mean`}</td><td>${img(rf, `design step ${i}`)}</td><td>${img(af, `app step ${i}`)}</td><td>${img(df, `difference step ${i}`)}</td></tr>`,
          );
        }
        const row: Row = { design: p.design, actual: p.actual, variant: rvar.id, width: rv.width, steps: n, pixel: avg(px), worstPixel: px.length ? Math.max(...px) : null, mean: avg(mn), pass: px.length ? Math.max(...px) <= PIXEL_GATE : null };
        summary.push(row);
        const id = `${p.design}-${rvar.id}-${rv.width}`;
        sections.push(
          `<section id="${esc(id)}"><h2>${esc(p.design)} [${esc(rvar.id)}] ↔ ${esc(p.actual)} [${esc(avar.id)}] · ${rv.width}px · pixelmatch mean ${row.pixel ?? "–"}%, worst ${row.worstPixel ?? "–"}% · greyscale mean ${row.mean ?? "–"}%</h2><table><thead><tr><th>step</th><th>design (${esc(r.source.split("/").pop() ?? "")})</th><th>app (${esc(a.source)})</th><th>difference</th></tr></thead><tbody>${rows.join("")}</tbody></table></section>`,
        );
      }
    }
  }
  const unpairedDesign = [...refs.keys()].filter((k) => !pairs.some((p) => p.design === k));
  const unpairedApp = [...acts.keys()].filter((k) => !pairs.some((p) => p.actual === k));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Design parity</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--good:#15803d;--fair:#b45309;--poor:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--line:#292524;--good:#4ade80;--fair:#fbbf24;--poor:#f87171}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
h1{font-size:20px}h2{font-size:15px;margin:32px 0 8px}table{border-collapse:collapse;width:100%}td,th{border-top:1px solid var(--line);padding:8px;vertical-align:top;text-align:left}
td img{width:100%;height:auto;display:block;border:1px solid var(--line)}td.meta{width:120px;color:var(--muted);font-size:12px}.missing{color:var(--muted)}
.good{color:var(--good)}.fair{color:var(--fair)}.poor{color:var(--poor)}ul{color:var(--muted)}
</style></head><body><h1>Design parity</h1>
<p>Generated ${new Date().toISOString()}. pixelmatch: share of differing pixels (threshold 0.1, anti-aliasing ignored); gate ≤ ${PIXEL_GATE}% on fixture routes. Mean: mean absolute difference of 320-px greyscale versions.</p>
<ul>${summary.map((s) => `<li><a href="#${esc(`${s.design}-${s.variant}-${s.width}`)}">${esc(s.design)} [${esc(s.variant)}] ↔ ${esc(s.actual)} @${s.width}</a>: ${s.steps} step(s), pixelmatch mean ${s.pixel ?? "–"}% (worst ${s.worstPixel ?? "–"}%), greyscale ${s.mean ?? "–"}%${s.pass === null ? "" : s.pass ? " · pass" : " · over the gate"}</li>`).join("") || "<li>No pairs yet: capture a design page and the matching app route with the same name (or map them in design/parity.json).</li>"}</ul>
${unpairedDesign.length ? `<p>Design pages without an app capture: ${unpairedDesign.map(esc).join(", ")}</p>` : ""}${unpairedApp.length ? `<p>App captures without a design page: ${unpairedApp.map(esc).join(", ")}</p>` : ""}
${sections.join("\n")}</body></html>`;
  await writeFile(path.join(out, "report.html"), html);
  await writeFile(path.join(out, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), gate: PIXEL_GATE, pairs: summary, unpairedDesign, unpairedApp }, null, 2));
  console.log(`design/parity/report.html: ${summary.length} page/variant/width row(s); ${unpairedDesign.length} design page(s) and ${unpairedApp.length} app capture(s) unpaired.`);
  for (const s of summary) console.log(`  ${s.design} [${s.variant}] ↔ ${s.actual} @${s.width}: ${s.steps} step(s), pixelmatch ${s.pixel ?? "–"}% (worst ${s.worstPixel ?? "–"}%), greyscale ${s.mean ?? "–"}%`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
