/**
 * `pnpm design:inventory`: builds design/INVENTORY.md, design/inventory.json and
 * design/tokens.extracted.json from
 *   - design/inventory.manual.ts   hand-checked rows (constants, timelines, B5 bindings, checklist)
 *   - design/extracted/<page>.json the mechanical extraction (pnpm design:extract): copy, script
 *                                  copy, images, fonts, controls, bindings, logic lines, keyframes,
 *                                  preview props, sections/blocks per breakpoint
 *   - design/inventory.status.json statuses by stable key (so regenerating keeps progress)
 * Prints counts per type and priority.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { oklchCssToHex, parseHex, reconcile } from "../lib/color/oklch";
import { BINDINGS, CHECKLIST, COMPONENTS, MANUAL, type ItemType, type ManualRow, type Priority } from "../design/inventory.manual";

type Status = "todo" | "built" | "verified" | "verified-with-note";
interface Row extends ManualRow {
  id: string;
  key: string;
  refs: string;
  status: Status;
  statusNote?: string;
  origin: "manual" | "extracted";
}

const ROOT = process.cwd();
/** Pages that are built (B2). Specs and reference pages contribute manual rows only. */
const PAGES: Record<string, { route: string; component: string; file: string }> = {
  "saakshi-landing": { route: "/", component: "components/landing/landing.tsx", file: "Saakshi Landing.html" },
  "witness-wall": { route: "/witness", component: "components/witness/wall.tsx", file: "Witness Wall.html" },
  "how-it-works": { route: "/how-it-works", component: "components/how/how-it-works.tsx", file: "How It Works.html" },
  "demo-entry": { route: "/demo", component: "components/demo/demo-entry.tsx", file: "Demo Entry.html" },
  "evidence-page": { route: "/e/[assetId]", component: "components/evidence/evidence-page.tsx", file: "Evidence Page.html" },
  "spot-page": { route: "/spots/[slug]", component: "components/spot/spot-page.tsx", file: "Spot Page.html" },
  "report-page": { route: "/r/[reportId]", component: "components/report/report-page.tsx", file: "Report Page.html" },
  "qr-poster": { route: "/spots/[slug]/poster", component: "components/poster/qr-poster.tsx", file: "QR Poster.html" },
  capture: { route: "/capture", component: "components/capture/capture-screen.tsx", file: "Capture.html" },
  "saakshi-app": { route: "/library (+ /review, /projects/[id], /studio)", component: "components/app/app-shell.tsx", file: "Saakshi App.html" },
};
const REFERENCE_ONLY = ["saakshi-concept-board", "saakshi-index", "landing-viewports"];
const P1_SECTIONS = new Set(["07 It keeps watching", "08 Try to fool it"]);
const REVIEW_MARK = /^Chapter \d+, P[01]$|samples?\b.*prototype|is a sample|values are samples|, sample$|^sample value$/i;

const keyOf = (r: Pick<ManualRow, "page" | "type" | "section" | "what" | "source">) =>
  createHash("sha1").update([r.page, r.type, r.section, r.what, r.source].join("|")).digest("hex").slice(0, 12);

interface Extracted {
  page: string;
  sections: Array<{ label: string; id: string | null; line: number; height: string | null; pinned: boolean; night: boolean }>;
  copy: Array<{ text: string; tag: string | null; section: string | null; block: string | null; line: number; style: Record<string, string> }>;
  scriptCopy: Array<{ text: string; line: number }>;
  images: Array<{ src: string; alt: string | null; section: string | null; block: string | null; line: number }>;
  fonts: Array<{ subset: string; family: string | null; weight: string | null; stretch: string | null }>;
  controls: Array<{ tag: string; text: string; href: string | null; aria: string | null; handlers: string[]; section: string | null; block: string | null; line: number }>;
  bindings: Array<{ expr: string; lines: number[] }>;
  styles: Record<string, Array<{ v: string; n: number }>>;
  logic: Array<{ line: number; code: string }>;
  keyframes: Array<{ name: string; line: number }>;
  scriptColors?: Array<{ v: string; file: string; line: number }>;
  props: Record<string, { options?: string[]; default?: unknown }> | null;
}

function extractedRows(x: Extracted): ManualRow[] {
  const P = PAGES[x.page];
  const out: ManualRow[] = [];
  const src = (line: number | number[]) => `${x.page}/template.html:${Array.isArray(line) ? line.slice(0, 6).join(",") : line}`;
  const pri = (section: string | null): Priority => (section && P1_SECTIONS.has(section) ? "P1" : "P0");
  const base = (section: string | null) => ({ page: x.page, section: section ?? "Page", route: P.route, component: P.component });

  // Layout: each section (landing) or block (single-screen pages), at both breakpoints.
  const blocks = x.sections.length > 1 ? x.sections.map((s) => ({ section: s.label, what: `${s.label}${s.height ? ` (${s.height}${s.pinned ? ", pinned" : ""})` : ""}`, line: s.line })) : [...new Map(x.copy.filter((c) => c.block).map((c) => [c.block!, c])).values()].map((c) => ({ section: c.section ?? "Page", what: c.block!, line: c.line }));
  for (const b of blocks) for (const w of [1440, 390]) out.push({ ...base(b.section), type: "layout", what: `${b.what} @${w}`, source: src(b.line), priority: pri(b.section) });

  // Copy (markup), deduped per page; review annotations become 'never ships' state rows.
  const seen = new Set<string>();
  for (const c of x.copy) {
    if (c.text.length < 2 || /^[\s\W]+$/.test(c.text) || /^\{\{[^}]+\}\}$/.test(c.text) || seen.has(c.text)) continue;
    seen.add(c.text);
    if (REVIEW_MARK.test(c.text)) {
      out.push({ ...base(c.section), type: "state", what: `Review annotation (never ships, B5.11): "${c.text}"`, source: src(c.line), priority: "P0", binding: "B5.11" });
      continue;
    }
    const st = c.style;
    const style = [st["font-family"]?.split(",")[0]?.replace(/'/g, ""), st["font-weight"], st["font-stretch"], st["font-size"]].filter(Boolean).join(" ");
    out.push({ ...base(c.section), section: c.block ? `${c.section ?? "Page"} / ${c.block}` : (c.section ?? "Page"), type: "copy", what: `"${c.text.slice(0, 180)}"${style ? ` (${style})` : ""}`, source: src(c.line), priority: pri(c.section), binding: /\{\{/.test(c.text) ? "templated: see data rows" : undefined });
  }
  // Copy built in the script.
  const seenS = new Set<string>();
  for (const c of x.scriptCopy) {
    if (seenS.has(c.text) || seen.has(c.text)) continue;
    seenS.add(c.text);
    out.push({ ...base("Script"), type: "copy", what: `"${c.text.slice(0, 180)}" (script)`, source: src(c.line), priority: "P0" });
  }
  // Images.
  for (const [s, imgs] of new Map(x.images.map((i) => [i.src, x.images.filter((j) => j.src === i.src)]))) {
    if (!s || s.startsWith("{{")) continue;
    out.push({ ...base(imgs[0].section), type: "asset", what: `Image ${s}${imgs[0].alt ? ` ("${imgs[0].alt.slice(0, 100)}")` : ""}`, source: src(imgs.map((i) => i.line)), priority: pri(imgs[0].section), binding: "B5.3: design sample photo → our DB photo (signed, face-blurred)" });
  }
  // Fonts (per family + weight + stretch).
  for (const f of new Map(x.fonts.map((f) => [`${f.family}|${f.weight}|${f.stretch}`, f])).values()) {
    out.push({ ...base("Fonts"), type: "asset", what: `Font ${f.family} ${f.weight ?? ""}${f.stretch ? ` stretch ${f.stretch}` : ""} (subsets: ${x.fonts.filter((g) => g.family === f.family && g.weight === f.weight).map((g) => g.subset).join(", ")})`, source: src(0), priority: "P0", binding: "B5.14 self-host" });
  }
  // Controls.
  const seenC = new Set<string>();
  for (const c of x.controls) {
    const k = `${c.tag}|${c.text}|${c.handlers.join(",")}|${c.href}`;
    if (seenC.has(k)) continue;
    seenC.add(k);
    out.push({ ...base(c.section), type: "interaction", what: `${c.tag}${c.text ? ` "${c.text.slice(0, 80)}"` : ""}${c.aria ? ` [aria ${c.aria}]` : ""}${c.href ? ` → ${c.href}` : ""}${c.handlers.length ? ` {${c.handlers.join(", ")}}` : ""}`, source: src(c.line), priority: pri(c.section) });
  }
  // Data bindings.
  for (const b of x.bindings) out.push({ ...base("Data"), type: "data", what: `{{ ${b.expr} }}`, source: src(b.lines), priority: "P0", binding: "bind to our DB / real API (B5.4)" });
  // Logic lines.
  for (const l of x.logic) {
    const t: ItemType = /keydown|e\.key|onKey|\.key ===|click|onDrop|onFile|onInput/.test(l.code) ? "interaction" : /matchMedia|deviceMemory|saveData|prefers-reduced|webgl2|props\.motion/.test(l.code) ? "state" : "effect";
    // Chapter 7 (it keeps watching) and chapter 8 (try to fool it) are P1 on the landing.
    const p1 = x.page === "saakshi-landing" && /ch7|#c7-|analyse|onDrop|onFile|trySample|drop/.test(l.code);
    out.push({ ...base("Script"), type: t, what: l.code.slice(0, 220), source: src(l.line), priority: p1 ? "P1" : "P0" });
  }
  for (const k of x.keyframes) out.push({ ...base("Styles"), type: "effect", what: `@keyframes ${k.name}`, source: src(k.line), priority: "P0" });
  // Preview props → states (review-only props never ship).
  for (const [k, v] of Object.entries(x.props ?? {})) {
    const opts = v.options ?? (typeof v.default === "boolean" ? ["true", "false"] : [String(v.default)]);
    for (const o of opts) out.push({ ...base("Props"), type: "state", what: `Preview prop ${k}=${o}`, source: src(0), priority: "P0", binding: /showMarks|showSample|showP1|showOps|autoSimulate/.test(k) ? "B5.11/B5.8: review/operator-only, never ships as a prop" : /motion|demoState|theme/.test(k) ? "B5.11: auto-detected / real state, dev-only query override" : undefined });
  }
  return out;
}

async function tokensExtracted(extracted: Extracted[]) {
  const kit = await readFile(path.join(ROOT, "design/unpacked/saakshi-landing/res/8b72f710-4684-4f09-b36e-7edb6f47fe91.js"), "utf8");
  const tokens = new Function("window", "document", `${kit}; return window.SK.tokens;`)({}, {}) as Record<string, Record<string, string>>;
  const all = Object.entries(tokens).flatMap(([m, t]) => Object.entries(t).map(([k, v]) => ({ token: `${m}.${k}`, oklch: v, hex: oklchCssToHex(v)! })));
  const colors = new Map<string, number>();
  for (const x of extracted) for (const c of x.styles.colors ?? []) colors.set(c.v, (colors.get(c.v) ?? 0) + c.n);
  const inCode = new Map<string, string[]>();
  for (const x of extracted) for (const c of x.scriptColors ?? []) {
    colors.set(c.v, (colors.get(c.v) ?? 0) + 1);
    inCode.set(c.v, [...(inCode.get(c.v) ?? []), `${x.page}/${c.file}:${c.line}`]);
  }
  const map = [...colors].map(([v, n]) => {
    const rgb = parseHex(v);
    if (!rgb) return { value: v, uses: n, decision: "kept as written (alpha or computed colour)" };
    const r = reconcile(rgb, all.map((t) => ({ token: t.token, rgb: parseHex(t.hex)! })));
    const best = all.find((t) => t.token === r.token)!;
    return { value: v, uses: n, nearest: r.token, nearestOklch: best.oklch, nearestHex: best.hex, deltaE: r.deltaE, hueShift: r.hueShift, ...(inCode.has(v) ? { inCode: [...new Set(inCode.get(v))].slice(0, 12) } : {}), decision: r.useToken ? `→ var(--${r.token.split(".")[1]}) (${r.reason})` : `extra variable (${r.reason})` };
  }).sort((a, b) => b.uses - a.uses);
  const merged = (k: string) => {
    const m = new Map<string, number>();
    for (const x of extracted) for (const s of x.styles[k] ?? []) m.set(s.v, (m.get(s.v) ?? 0) + s.n);
    return [...m].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n }));
  };
  return {
    note: "Computed/inline style values across the built pages, reconciled with Developer_Handoff tokens (SK.tokens). The handoff wins for tokens; the rendered prototype wins for layout.",
    handoffTokens: tokens,
    colors: map,
    fontSizes: merged("fontSizes"),
    fontWeights: merged("fontWeights"),
    fontStretches: merged("fontStretches"),
    fontFamilies: merged("fontFamilies"),
    lineHeights: merged("lineHeights"),
    letterSpacings: merged("letterSpacings"),
    radii: merged("radii"),
    shadows: merged("shadows"),
    transitions: merged("transitions"),
    transforms3d: merged("transforms3d"),
  };
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

async function main() {
  const statusFile = path.join(ROOT, "design", "inventory.status.json");
  const statuses: Record<string, { status: Status; note?: string }> = existsSync(statusFile) ? JSON.parse(await readFile(statusFile, "utf8")) : {};
  const extracted: Extracted[] = [];
  for (const p of Object.keys(PAGES)) extracted.push(JSON.parse(await readFile(path.join(ROOT, "design", "extracted", `${p}.json`), "utf8")));

  const manual: Row[] = MANUAL.map((m) => ({ ...m, origin: "manual" as const, id: "", key: keyOf(m), refs: "", status: "todo" as Status }));
  const auto: Row[] = extracted.flatMap((x) => extractedRows(x)).map((m) => ({ ...m, origin: "extracted" as const, id: "", key: keyOf(m), refs: "", status: "todo" as Status }));
  const reference: Row[] = REFERENCE_ONLY.map((p) => ({ page: p, section: "Page", type: "asset" as ItemType, what: `${p}: reference only (not built; B2)`, source: `design/export/${p}`, priority: "P0" as Priority, route: "—", component: "—", origin: "manual" as const, id: "", key: keyOf({ page: p, type: "asset", section: "Page", what: "reference", source: p }), refs: `design/reference/${p}/`, status: "verified-with-note" as Status, statusNote: "Reference only, not built (brief B2)." }));

  const order = ["developer-handoff", "saakshi-landing", "witness-wall", "how-it-works", "demo-entry", "evidence-page", "spot-page", "report-page", "qr-poster", "capture", "saakshi-app", "all", ...REFERENCE_ONLY];
  const rows = [...manual, ...auto, ...reference].sort((a, b) => order.indexOf(a.page) - order.indexOf(b.page) || (a.origin === b.origin ? 0 : a.origin === "manual" ? -1 : 1));
  const dedupe = new Set<string>();
  const final: Row[] = [];
  // Ids are stable (code comments cite them): key → id is kept in design/inventory.ids.json; a new
  // row gets the next free number, a removed row's id is never reused.
  const idsFile = path.join(ROOT, "design", "inventory.ids.json");
  const ids: Record<string, string> = existsSync(idsFile) ? JSON.parse(await readFile(idsFile, "utf8")) : {};
  let next = Math.max(0, ...Object.values(ids).map((v) => Number(v.slice(2)))) + 1;
  for (const r of rows) {
    if (dedupe.has(r.key)) continue;
    dedupe.add(r.key);
    const st = statuses[r.key];
    ids[r.key] ??= `D-${String(next++).padStart(4, "0")}`;
    final.push({ ...r, id: ids[r.key], refs: r.refs || `design/reference/${r.page === "all" || r.page === "developer-handoff" ? "*" : r.page}/{1440,390}`, status: st?.status ?? r.status, statusNote: st?.note ?? r.statusNote });
  }
  await writeFile(idsFile, JSON.stringify(ids, null, 1) + "\n");

  // Counts.
  const types: ItemType[] = ["layout", "copy", "token", "effect", "interaction", "state", "asset", "data"];
  const count = (f: (r: Row) => boolean) => final.filter(f).length;
  const statusCounts = (["todo", "built", "verified", "verified-with-note"] as Status[]).map((s) => `${s} ${count((r) => r.status === s)}`).join(", ");

  const md: string[] = [];
  md.push("# Design inventory");
  md.push("");
  md.push("Every item of the design export that the build must match (Phase 8, part B). Generated by `pnpm design:inventory` from `design/inventory.manual.ts` (hand-checked constants, timelines, bindings) and `design/extracted/*.json` (`pnpm design:extract`: copy, assets, controls, bindings, logic lines). Statuses live in `design/inventory.status.json`. Source references: `<page>/template.html:<line>` = `design/unpacked/<page>/template.html` (`pnpm design:unpack`).");
  md.push("");
  md.push("Notes on files (B1): the exports were already in `design/export/` (moved in Phase 7, commit c36aa63, names kept with spaces), and no `Saakshi_Design_System.html` (v2) exists, so nothing was archived.");
  md.push("");
  md.push(`**${final.length} items.** Status: ${statusCounts}.`);
  md.push("");
  md.push("| Type | P0 | P1 | Total |");
  md.push("|---|---|---|---|");
  for (const t of types) md.push(`| ${t} | ${count((r) => r.type === t && r.priority === "P0")} | ${count((r) => r.type === t && r.priority === "P1")} | ${count((r) => r.type === t)} |`);
  md.push(`| **all** | ${count((r) => r.priority === "P0")} | ${count((r) => r.priority === "P1")} | ${final.length} |`);
  md.push("");
  md.push("## Ship checklist (Developer_Handoff), linked to inventory ids");
  md.push("");
  md.push("| # | Priority | Item | Inventory ids | Status |");
  md.push("|---|---|---|---|---|");
  for (const c of CHECKLIST) {
    const ids = final.filter((r) => r.checklist?.includes(c.id)).map((r) => r.id);
    const sts = final.filter((r) => r.checklist?.includes(c.id)).map((r) => r.status);
    const status = !sts.length ? "todo" : sts.every((s) => s.startsWith("verified")) ? "verified" : sts.some((s) => s !== "todo") ? "in progress" : "todo";
    md.push(`| ${c.id} | ${c.priority} | ${esc(c.label)} | ${ids.join(", ") || "—"} | ${status} |`);
  }
  md.push("");
  md.push("## Design vs product truth (B5): the product wins");
  md.push("");
  md.push("| Binding | Rule | Resolution | Inventory ids |");
  md.push("|---|---|---|---|");
  for (const b of BINDINGS) md.push(`| ${b.id} | ${esc(b.rule)} | ${esc(b.resolution)} | ${final.filter((r) => r.binding?.includes(b.id)).map((r) => r.id).slice(0, 20).join(", ")}${final.filter((r) => r.binding?.includes(b.id)).length > 20 ? ", …" : ""} |`);
  md.push("");
  md.push("## Components (Developer_Handoff)");
  md.push("");
  md.push("| Component | States | Used in | File |");
  md.push("|---|---|---|---|");
  for (const c of COMPONENTS) md.push(`| ${esc(c.name)} | ${esc(c.states)} | ${esc(c.where)} | \`${c.file}\` |`);
  md.push("");
  md.push("## Items");
  md.push("");
  for (const page of order) {
    const rs = final.filter((r) => r.page === page);
    if (!rs.length) continue;
    md.push(`### ${page}${PAGES[page] ? ` → \`${PAGES[page].route}\`` : ""} (${rs.length})`);
    md.push("");
    md.push("| id | section | type | item | source | frames | pri | route + component | data binding | status |");
    md.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rs) md.push(`| ${r.id} | ${esc(r.section)} | ${r.type} | ${esc(r.what)}${r.note ? ` **Note:** ${esc(r.note)}` : ""} | ${esc(r.source)} | ${esc(r.refs)} | ${r.priority} | ${esc(r.route)} · \`${esc(r.component)}\` | ${esc(r.binding ?? "")} | ${r.status}${r.statusNote ? `: ${esc(r.statusNote)}` : ""} |`);
    md.push("");
  }
  await writeFile(path.join(ROOT, "design", "INVENTORY.md"), md.join("\n"));
  await writeFile(path.join(ROOT, "design", "inventory.json"), JSON.stringify(final, null, 1));
  await writeFile(path.join(ROOT, "design", "tokens.extracted.json"), JSON.stringify(await tokensExtracted(extracted), null, 2));
  if (!existsSync(statusFile)) await writeFile(statusFile, "{}\n");

  console.log(`design/INVENTORY.md: ${final.length} items (${count((r) => r.origin === "manual")} hand-checked, ${count((r) => r.origin === "extracted")} extracted). Status: ${statusCounts}.`);
  console.log("type          P0    P1  total");
  for (const t of types) console.log(`${t.padEnd(12)} ${String(count((r) => r.type === t && r.priority === "P0")).padStart(4)}  ${String(count((r) => r.type === t && r.priority === "P1")).padStart(4)}  ${String(count((r) => r.type === t)).padStart(5)}`);
  console.log(`${"all".padEnd(12)} ${String(count((r) => r.priority === "P0")).padStart(4)}  ${String(count((r) => r.priority === "P1")).padStart(4)}  ${String(final.length).padStart(5)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
