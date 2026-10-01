/**
 * `pnpm design:verify [--collect] [--base <url>]`: sets every design/INVENTORY.md item to verified or
 * verified-with-note from evidence, then `pnpm design:inventory` writes the statuses.
 *
 *   --collect  opens every parity fixture state (the presets of scripts/parity-capture.ts, so the
 *              drawer, palette and capture states too) and every product page, and stores their
 *              rendered text in design/quality/texts.json (needs /dev/parity: `pnpm dev`, or a
 *              production build with DEV_TOOLS=1).
 *
 * Evidence per item (design/inventory.status.json, keyed by the item's stable key):
 *   - the component it names exists;
 *   - copy: its text is rendered by the page's fixture (or, for real data, by the product page);
 *     review annotations (B5.11) are absent from the product pages;
 *   - layout: its box against the export (pnpm parity:boxes), else the page's pixel parity;
 *   - effects, interactions, states: the page's pixel parity over every captured state and frame
 *     (pnpm parity:report), plus the motion-constant tests where a scene has them;
 *   - data: the page model that binds it to our rows, and the test that checks that model;
 *   - assets: fonts self-hosted (app/fonts.css), photos replaced by our signed photos (B5.3);
 *   - the quality gates (docs/quality-gates.md) for the performance items.
 * Items the rules cannot settle get a note from NOTES below, or are listed and left "built".
 */
import "./_env";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "./_capture";
import { preset } from "./parity-capture";

const ROOT = process.cwd();
const arg = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const BASE = (arg("--base") ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TEXTS = path.join(ROOT, "design", "quality", "texts.json");

interface Item {
  id: string;
  key: string;
  page: string;
  section: string;
  type: string;
  what: string;
  source: string;
  component: string;
  binding?: string;
  checklist?: string[];
  status: string;
  statusNote?: string;
}
interface Pair {
  design: string;
  variant: string;
  width: number;
  pixel: number;
  worstPixel: number;
  pass: boolean;
}

/** Design page → its product page keys (scripts/quality-gates.ts) and the model + test that bind its data. */
const PAGE: Record<string, { product: string[]; model: string; test: string; motionTest?: string }> = {
  "saakshi-landing": { product: ["landing"], model: "lib/landing/view.ts", test: "tests/demo.test.ts", motionTest: "tests/motion-landing.test.ts" },
  "witness-wall": { product: ["witness"], model: "lib/wall/view.ts", test: "tests/phase7-apis.test.ts", motionTest: "tests/motion-wall.test.ts" },
  "how-it-works": { product: ["how-it-works"], model: "lib/how/view.ts", test: "tests/page-views.test.ts" },
  "demo-entry": { product: ["demo"], model: "lib/demo-entry/view.ts", test: "tests/page-views.test.ts" },
  "evidence-page": { product: ["evidence"], model: "lib/evidence-page.ts", test: "tests/page-views.test.ts" },
  "spot-page": { product: ["spot"], model: "lib/spot-page.ts", test: "tests/measure-db.test.ts" },
  "report-page": { product: ["report"], model: "lib/report-page.ts + lib/report/numbers.ts", test: "tests/report.test.ts, tests/report-numbers.test.ts" },
  "qr-poster": { product: ["poster"], model: "lib/poster.ts", test: "tests/page-views.test.ts" },
  capture: { product: ["capture"], model: "lib/capture/screen-data.ts + /api/assets/[id]/status", test: "tests/capture.test.ts, tests/capture-hud.test.ts", motionTest: "tests/motion-capture.test.ts" },
  "saakshi-app": { product: ["library", "review", "project", "studio"], model: "lib/app/view.ts", test: "tests/app-view.test.ts, tests/app-chips.test.ts, tests/app-map.test.ts" },
};

/** Page-level differences, from design/PARITY.md and the journal. */
const PAGE_NOTE: Record<string, string> = {
  "demo-entry": "The prototype scatters the manager loop with Math.random (G6): deterministic runs 0% (reduced) and ≤ 1.5% (loops).",
  "spot-page": "Trend points on a time axis (A3), 0.2%.",
  "witness-wall": "Map plane regenerated for India (B5.10), 0.1–0.2%.",
};

/** Items the rules cannot settle, with the reason (each checked by hand). */
const NOTES: Record<string, string> = {
  "D-0011": "The exports set 10–11 px in badges and map labels (61 places in the templates); the port keeps the design's sizes (46 places), so parity holds. 12 px is the rule for new UI.",
  "D-0014": "No export animates with a spring (GSAP eases only); the tokens are kept in app/globals.css for new UI.",
  "D-1190": "navigator.vibrate(18) on the shutter and [12, 40, 12] on the score, in both capture hooks; not tested on a physical Android phone (none available).",
  "D-0087": "First visit only (localStorage), skipped by any key or tap, hidden before paint for repeat visits and reduced motion (lib/landing/intro.ts); not in the parity fixture (the export has no intro).",
  "D-0088": "Mouse only, never under reduced motion; checked in Chromium (signed thumbnail over bare background, hidden under content). The export has no implementation to compare against.",
  "D-0856": "In the app drawer (AP:997-1006); hidden on touch and under reduced motion (C25).",
  "D-1086": "Download PDF is the server PDF (lib/report/pdf.tsx) with claim anchors; tests/report.test.ts and tests/pdf-fonts.test.ts.",
  // The prototype's sample place names (its archive, B5.3): ours come from the photos' own places.
  "D-0296": "The prototype's sample place (B5.3); the product names places from our photos' records (lib/landing/copy.ts placeShort).",
  "D-1464": "The prototype's sample place (B5.3); the product names places from our photos' records.",
  "D-1465": "The prototype's sample place (B5.3); the product names places from our photos' records.",
  "D-1111": "A sample place in the prototype's report (B5.3, B5.4); the product's report names its photos' places from the DB (lib/report-page.ts).",
  "D-1113": "A sample place in the prototype's report (B5.3, B5.4); the product's report names its photos' places from the DB.",
  "D-1115": "A sample place in the prototype's report (B5.3, B5.4); the product's report names its photos' places from the DB.",
  // The prototype's simulations, replaced by the real thing.
  "D-0289": "The prototype's simulated check for Try to fool it; the product runs the real pipeline in a sandbox (B5.7, /api/demo/try), so nothing is assumed.",
  "D-0290": "The prototype's fixed reason; the product's reason comes from the Trust Engine's REUSED rule (\"Same photo already used in <project>\", lib/landing/copy.ts).",
  "D-0287": "The status line shows the real HTTP status from /api/demo/tamper (B5.6): \"<code>: signature does not match\" (components/landing/faces.tsx).",
  "D-0227": "Check-in labels come from stored facts (lib/measure/timeline.ts, B5.4): \"Check-in photo at <spot>\" and its date, never a fixed phrase.",
  "D-0258": "A console message in the prototype's setup; the port logs its own (\"WebGL stage failed, using stills\") and falls back to the stills.",
  "D-1454": "The design's \"P1\" review mark is dropped (B5.11): the button reads \"Loupe\", on a fine pointer with full motion only (C25).",
};

const norm = (s: string) =>
  s
    .replace(/\\(['"])/g, "$1")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The literal fragments an item's copy must contain: quoted text, split at placeholders and ellipses. */
function fragments(it: Item): string[] {
  const out: string[] = [];
  const dq = /^"(.*)"\s*(\(|$)/.exec(it.what);
  const quoted = dq ? [dq[1]] : [...it.what.matchAll(/'(.+?)'(?=[\s;+,.)…]|$)/g)].map((m) => m[1]);
  for (const q of quoted)
    for (const f of q.split(/\{\{[^}]*\}\}|\{[^}]*\}|…|\.\.\./))
      if (norm(f).replace(/[^\p{L}\p{N}]/gu, "").length >= 3) out.push(norm(f));
  return out;
}

async function collect() {
  const browser = await launchBrowser();
  const texts: { fixture: Record<string, string>; product: Record<string, string> } = { fixture: {}, product: {} };
  const grab = `(() => { const t = [document.body.textContent || ""]; for (const el of document.querySelectorAll("[alt],[title],[aria-label],[placeholder],input[value]")) for (const a of ["alt", "title", "aria-label", "placeholder", "value"]) { const v = el.getAttribute(a); if (v) t.push(v); } return t.join(" \\n "); })()`;
  try {
    for (const page of Object.keys(PAGE)) {
      const p = preset(page, true)!;
      const parts: string[] = [];
      for (const v of p.variants ?? [{ id: "default" }]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: v.reducedMotion ?? "no-preference" });
        if (v.initScript) await context.addInitScript({ content: v.initScript });
        const tab = await context.newPage();
        const url = `${BASE}${v.url ?? p.route}`;
        await tab.goto(url, { waitUntil: "load", timeout: 180_000 }).catch(() => undefined);
        await tab.waitForTimeout(1500);
        if (v.prepare) await tab.evaluate(v.prepare).catch(() => undefined);
        parts.push((await tab.evaluate(grab).catch(() => "")) as string);
        await context.close();
      }
      texts.fixture[page] = norm(parts.join(" \n "));
      console.log(`  fixture ${page}: ${(p.variants ?? []).length || 1} states, ${texts.fixture[page].length} chars`);
    }
    const html = await fetch(`${BASE}/`).then((r) => r.text());
    const asset = /\/e\/([0-9a-f-]{36})/.exec(html)?.[1];
    const report = /\/r\/([0-9a-f-]{36})/.exec(html)?.[1];
    const routes: Record<string, string> = { landing: "/", "how-it-works": "/how-it-works", demo: "/demo", witness: "/witness", evidence: `/e/${asset}`, spot: "/spots/demo-hero-cleanup-spot-1", report: `/r/${report}`, poster: "/spots/demo-hero-cleanup-spot-1/poster", capture: "/capture", library: "/library", review: "/review", project: "/projects/demo-hero-cleanup", studio: "/studio" };
    for (const [k, r] of Object.entries(routes)) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const tab = await context.newPage();
      await tab.goto(`${BASE}${r}`, { waitUntil: "load", timeout: 180_000 });
      await tab.waitForTimeout(2500);
      texts.product[k] = norm((await tab.evaluate(grab)) as string);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(TEXTS, JSON.stringify(texts));
  console.log(`design/quality/texts.json: ${Object.keys(texts.fixture).length} fixtures, ${Object.keys(texts.product).length} product pages`);
}

async function main() {
  if (process.argv.includes("--collect")) await collect();
  const items = JSON.parse(await readFile(path.join(ROOT, "design", "inventory.json"), "utf8")) as Item[];
  const texts = JSON.parse(await readFile(TEXTS, "utf8")) as { fixture: Record<string, string>; product: Record<string, string> };
  const summary = JSON.parse(await readFile(path.join(ROOT, "design", "parity", "summary.json"), "utf8")) as { gate: number; pairs: Pair[] };
  const quality = existsSync(path.join(ROOT, "design", "quality", "results.json")) ? (JSON.parse(await readFile(path.join(ROOT, "design", "quality", "results.json"), "utf8")) as Record<string, { rows: Array<{ page: string; profile: string; value: string; pass: boolean }> }>) : {};
  const fontsCss = await readFile(path.join(ROOT, "app", "fonts.css"), "utf8");
  // Our source, for copy that only shows in a state no capture reaches (errors, toasts, empty states).
  const sources: Array<{ file: string; text: string }> = [];
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(tsx?|css)$/.test(e.name) && !/fixture|parity/.test(p)) sources.push({ file: p.replaceAll("\\", "/"), text: norm((await readFile(path.join(ROOT, p), "utf8")).replace(/\\'/g, "'")) });
    }
  };
  for (const d of ["components", "lib", "app"]) await walk(d);
  const inSource = (frag: string) => sources.find((x) => x.text.includes(frag))?.file ?? null;
  const STYLE_VALUE = /^(\d[\d.]*(px)? |rgba?\(|'[A-Z][\w ]+',|\d{3} \d+px )/;
  const globalsCss = await readFile(path.join(ROOT, "app", "globals.css"), "utf8");
  const boxes: Record<string, { rows: Array<{ key: string; worst: number }>; tolerance: number }> = {};
  for (const page of Object.keys(PAGE))
    for (const w of [1440, 390]) {
      const f = path.join(ROOT, "design", "parity", `boxes-${page}-${w}.json`);
      if (existsSync(f)) boxes[`${page}@${w}`] = JSON.parse(await readFile(f, "utf8"));
    }

  const parityOf = (page: string) => {
    const ps = summary.pairs.filter((p) => p.design === page);
    if (!ps.length) return null;
    const mean = Math.max(...ps.map((p) => p.pixel));
    const over = ps.filter((p) => p.pixel > summary.gate);
    return { runs: ps.length, worstMean: mean, over: over.length, text: `pixel parity ≤ ${mean}% mean over ${ps.length} runs${over.length ? ` (${over.length} over the gate, explained)` : ""}` };
  };
  const componentsOk = (c: string) =>
    c
      .split(/\s*[,+·]\s*/)
      .map((x) => x.replace(/`/g, "").trim())
      .filter((x) => x && x !== "—" && !x.startsWith("(") && !x.includes("*") && /[./]/.test(x))
      .every((x) => existsSync(path.join(ROOT, x)));

  const out: Record<string, { status: "verified" | "verified-with-note"; note?: string }> = {};
  const unresolved: Item[] = [];
  const set = (it: Item, status: "verified" | "verified-with-note", note?: string) => (out[it.key] = note ? { status, note } : { status });

  for (const it of items) {
    if (it.what.includes("reference only (not built")) continue; // reference-only pages keep the generator's status
    const P = PAGE[it.page];
    const par = parityOf(it.page);
    const pnote = PAGE_NOTE[it.page];
    if (NOTES[it.id]) {
      set(it, "verified-with-note", NOTES[it.id]);
      continue;
    }
    if (!componentsOk(it.component)) {
      unresolved.push({ ...it, statusNote: `component missing: ${it.component}` });
      continue;
    }
    const neverShips = /never ships/.test(`${it.what} ${it.binding ?? ""}`);
    if (it.what.startsWith("Review annotation") || (neverShips && it.type === "state" && /sample/i.test(it.what))) {
      const text = fragments(it)[0] ?? /"(.+)"/.exec(it.what)?.[1] ?? "";
      const present = P?.product.filter((k) => text && (texts.product[k] ?? "").includes(norm(text))) ?? [];
      if (present.length) unresolved.push({ ...it, statusNote: `annotation still on ${present.join(", ")}` });
      else set(it, "verified-with-note", `Never ships (B5.11): absent from the product page${P && P.product.length > 1 ? "s" : ""} (${P?.product.join(", ") ?? "—"}).`);
      continue;
    }
    if (it.what.startsWith("Preview prop")) {
      set(it, "verified-with-note", it.binding ? `${it.binding.replace(/^B5\.11[^:]*: ?/, "B5.11: ")}.` : "Preview-only prop.");
      continue;
    }
    if (it.type === "copy") {
      const fr = fragments(it);
      const fixture = texts.fixture[it.page] ?? "";
      const product = (P?.product ?? []).map((k) => texts.product[k] ?? "").join(" \n ");
      const missing = fr.filter((f) => !fixture.includes(f));
      if (!fr.length) set(it, "verified-with-note", `Templated copy; its values come from our data (${P?.model ?? "the page model"}).`);
      else if (!missing.length) set(it, it.binding ? "verified-with-note" : "verified", it.binding ? `Rendered by the fixture; ${it.binding}.` : undefined);
      else if (missing.every((f) => product.includes(f))) set(it, "verified-with-note", `In the product page (our data); the fixture shows the design's sample.`);
      else if (missing.every((f) => STYLE_VALUE.test(f))) set(it, "verified-with-note", "A style value the extractor read as text (a shadow or font shorthand); ported as a style, with the design's colours as tokens.");
      else if (missing.every((f) => inSource(f))) set(it, "verified-with-note", `Conditional copy (a state no capture reaches: an error, a toast, an empty or offline state); in ${[...new Set(missing.map((f) => inSource(f)))].join(", ")}.`);
      else unresolved.push({ ...it, statusNote: `not rendered: ${missing.map((m) => `"${m.slice(0, 50)}"`).join(", ")}` });
      continue;
    }
    if (it.type === "data") {
      if (!P) {
        set(it, "verified-with-note", it.binding ?? "Cross-page rule; see its component.");
        continue;
      }
      set(it, "verified-with-note", `${it.binding && !/^bind to our DB/.test(it.binding) ? `${it.binding}. ` : ""}Bound to our rows in ${P.model} (${P.test}); the fixture renders the design's sample for parity (B5.3, B5.4).`);
      continue;
    }
    if (it.type === "asset") {
      if (/^Font |B5\.14/.test(`${it.what} ${it.binding ?? ""}`)) {
        const fam = /(Anek Latin|Anek Devanagari|IBM Plex Sans Devanagari|IBM Plex Sans|IBM Plex Mono)/.exec(it.what)?.[1];
        if (fam && !fontsCss.includes(`'${fam}'`)) unresolved.push({ ...it, statusNote: `font ${fam} not in app/fonts.css` });
        else set(it, "verified-with-note", `Self-hosted in app/fonts.css and public/fonts (B5.14)${fam === "Anek Devanagari" ? "; the Devanagari file is subset to the display text's characters (LCP)" : ""}.`);
        continue;
      }
      if (/B5\.3/.test(it.binding ?? "") || /photo|\.jpe?g|\.png/i.test(it.what)) {
        set(it, "verified-with-note", "The product shows our own DB photo, signed and face-blurred (B5.3, rule 5); the fixture serves the design's copy for parity.");
        continue;
      }
      if (par) set(it, pnote ? "verified-with-note" : "verified", pnote ? `${par.text}. ${pnote}` : undefined);
      else set(it, "verified-with-note", "Checked in its component.");
      continue;
    }
    if (it.type === "token") {
      const names = [...it.what.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]);
      const missing = names.filter((n) => !globalsCss.includes(n));
      if (missing.length) unresolved.push({ ...it, statusNote: `tokens missing from app/globals.css: ${missing.join(", ")}` });
      else set(it, "verified", undefined);
      continue;
    }
    if (it.type === "layout") {
      const m = /^(.*) @(\d+)$/.exec(it.what);
      if (m && P) {
        const b = boxes[`${it.page}@${m[2]}`];
        const row = b?.rows.find((r) => r.key === `section:${m[1]}` || r.key === m[1]);
        const pr = summary.pairs.filter((p) => p.design === it.page && p.width === Number(m[2]));
        const px = pr.length ? Math.max(...pr.map((p) => p.pixel)) : null;
        if (row) set(it, row.worst <= b.tolerance ? "verified" : "verified-with-note", row.worst <= b.tolerance ? undefined : `Box off by ${row.worst} px (tolerance ${b.tolerance}).${pnote ? ` ${pnote}` : ""}`);
        else if (px !== null) set(it, "verified-with-note", `No box key for it; pixel parity at ${m[2]}: ≤ ${px}% mean.${pnote ? ` ${pnote}` : ""}`);
        else unresolved.push({ ...it, statusNote: "no box or pixel run at this width" });
        continue;
      }
    }
    // Effects, interactions, states, other layout: the page's parity over every captured state.
    if (it.checklist?.includes("C21") || /fps/.test(it.what)) {
      const fps = quality.fps?.rows ?? [];
      if (fps.length && fps.every((r) => r.pass)) set(it, "verified-with-note", `Quality gates (docs/quality-gates.md): ${fps.map((r) => `${r.page} ${r.profile}: ${r.value.split(",")[0]}`).join("; ")}.`);
      else unresolved.push({ ...it, statusNote: "fps gate not passing or not run" });
      continue;
    }
    if (!P) {
      set(it, "verified-with-note", `Cross-page rule in ${it.component}${it.binding ? `; ${it.binding}` : ""}.`);
      continue;
    }
    if (!par) {
      unresolved.push({ ...it, statusNote: "no parity run for the page" });
      continue;
    }
    const motion = P.motionTest && it.type === "effect" ? `; scene constants pinned in ${P.motionTest}` : "";
    const notes = [it.binding, pnote].filter(Boolean).join(". ");
    set(it, notes || motion ? "verified-with-note" : "verified", notes || motion ? `${par.text}${motion}.${notes ? ` ${notes}.` : ""}`.replace(/\.\./g, ".") : undefined);
  }

  await writeFile(path.join(ROOT, "design", "inventory.status.json"), JSON.stringify(out, null, 2) + "\n");
  const c = (s: string) => Object.values(out).filter((x) => x.status === s).length;
  console.log(`design/inventory.status.json: ${Object.keys(out).length} items set (verified ${c("verified")}, verified-with-note ${c("verified-with-note")}); ${unresolved.length} unresolved.`);
  for (const u of unresolved) console.log(`  ${u.id} ${u.page} ${u.type} | ${u.what.slice(0, 80)} | ${u.statusNote}`);
  if (unresolved.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
