/**
 * `pnpm design:extract`: mechanical extraction from design/unpacked/<page>/template.html (run
 * design:unpack first) into design/extracted/<page>.json, the raw material for design/INVENTORY.md:
 *
 *   sections   data-screen-label / id / height / pinned (data-pin) / night (data-night), source line
 *   copy       every visible text run with its element, section, line and text style
 *   images     src (resolved to the ext_resources id), alt, section, line
 *   controls   buttons, links, inputs, labels with their sc-camel-on-* handlers
 *   bindings   every {{ expression }} in markup (data the page needs)
 *   styles     distinct colours, font sizes/weights/stretches/families, radii, shadows, transitions
 *   logic      lines of the page script calling gsap/ScrollTrigger/Lenis/rAF/timers/observers/
 *              listeners/keys/vibrate, with line numbers (template line = script offset + n)
 *   props      the page's preview props (data-props on the script tag)
 *
 * Nothing is interpreted here: the inventory decides what each item means.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";

type Node = {
  nodeName: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
  value?: string;
  content?: Node;
  sourceCodeLocation?: { startLine: number; endLine: number };
  parentNode?: Node;
};

const attr = (n: Node, k: string) => n.attrs?.find((a) => a.name === k)?.value;
const styleOf = (n: Node): Record<string, string> =>
  Object.fromEntries(
    (attr(n, "style") ?? "")
      .split(/;(?![^(]*\))/)
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()];
      }),
  );

function walk(n: Node, fn: (n: Node, ancestors: Node[]) => void, anc: Node[] = []) {
  fn(n, anc);
  const kids = n.nodeName === "template" && n.content ? n.content.childNodes : n.childNodes;
  for (const c of kids ?? []) walk(c, fn, [...anc, n]);
}

const SKIP = new Set(["script", "style", "svg", "title", "meta", "link", "noscript"]);

async function extract(slug: string, root: string) {
  const dir = path.join(root, "design", "unpacked", slug);
  const html = await readFile(path.join(dir, "template.html"), "utf8");
  const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8")) as { extResources: Array<{ id: string; uuid: string }> };
  const idOf = (src: string) => index.extResources.find((e) => e.uuid === src)?.id ?? (/^[0-9a-f-]{36}$/.test(src) ? `res:${src}` : src);
  const doc = parse(html, { sourceCodeLocationInfo: true }) as unknown as Node;

  const sections: Array<Record<string, unknown>> = [];
  const copy: Array<Record<string, unknown>> = [];
  const images: Array<Record<string, unknown>> = [];
  const controls: Array<Record<string, unknown>> = [];
  const bindings = new Map<string, number[]>();
  const styles: Record<string, Map<string, number>> = {};
  const bump = (k: string, v: string) => {
    styles[k] ??= new Map();
    styles[k].set(v, (styles[k].get(v) ?? 0) + 1);
  };
  // The block a row sits in: the nearest preceding heading or id'd element (document order).
  let block: string | null = null;
  let scriptText = "";
  let scriptLine = 0;
  let props: unknown = null;

  const sectionOf = (anc: Node[]) => {
    for (let i = anc.length - 1; i >= 0; i--) {
      const l = attr(anc[i], "data-screen-label");
      if (l) return l;
    }
    return null;
  };

  walk(doc, (n, anc) => {
    const line = n.sourceCodeLocation?.startLine ?? 0;
    if (n.tagName === "script" && attr(n, "type") === "text/x-dc") {
      scriptText = (n.childNodes ?? []).map((c) => c.value ?? "").join("");
      scriptLine = line;
      const p = attr(n, "data-props");
      if (p) {
        try {
          props = JSON.parse(p);
        } catch {
          props = p;
        }
      }
      return;
    }
    if (n.tagName) {
      const id = attr(n, "id");
      if (id && !/^(top|__bundler)/.test(id)) block = `#${id}`;
      if (/^h[1-3]$/.test(n.tagName)) {
        const t: string[] = [];
        walk(n, (m) => {
          if (m.nodeName === "#text" && m.value?.trim()) t.push(m.value.trim());
        });
        if (t.length) block = t.join(" ").slice(0, 60);
      }
      const label = attr(n, "data-screen-label");
      if (label) {
        const st = styleOf(n);
        sections.push({ label, id: attr(n, "id") ?? null, tag: n.tagName, line, height: st.height ?? null, pinned: attr(n, "data-pin") !== undefined, night: attr(n, "data-night") !== undefined, background: st.background ?? st["background-color"] ?? null });
      }
      const st = styleOf(n);
      for (const [k, v] of Object.entries(st)) {
        if (/color|background|border|outline|fill|stroke/.test(k)) for (const c of v.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|oklch\([^)]*\)/g) ?? []) bump("colors", c.toUpperCase().startsWith("#") ? c.toUpperCase() : c);
        if (k === "font-size") bump("fontSizes", v);
        if (k === "font-weight") bump("fontWeights", v);
        if (k === "font-stretch") bump("fontStretches", v);
        if (k === "font-family") bump("fontFamilies", v.replace(/\s+/g, " "));
        if (k === "border-radius") bump("radii", v);
        if (k === "box-shadow") bump("shadows", v);
        if (k === "letter-spacing") bump("letterSpacings", v);
        if (k === "line-height") bump("lineHeights", v);
        if (k === "transition") bump("transitions", v);
        if (k === "transform" && /rotate|perspective|translateZ/.test(v)) bump("transforms3d", v);
        if (k === "perspective") bump("transforms3d", `perspective:${v}`);
      }
      if (n.tagName === "img") images.push({ src: idOf(attr(n, "src") ?? ""), alt: attr(n, "alt") ?? null, section: sectionOf(anc), block, line, fetchpriority: attr(n, "fetchpriority") ?? null, loading: attr(n, "loading") ?? null });
      const handlers = (n.attrs ?? []).filter((a) => a.name.startsWith("sc-camel-on-")).map((a) => `${a.name.replace("sc-camel-on-", "on-")}=${a.value}`);
      if (["button", "a", "input", "label", "select", "textarea"].includes(n.tagName) || handlers.length) {
        const text = [] as string[];
        walk(n, (m) => {
          if (m.nodeName === "#text" && m.value?.trim()) text.push(m.value.trim());
        });
        controls.push({ tag: n.tagName, text: text.join(" ").slice(0, 160), href: attr(n, "href") ?? null, type: attr(n, "type") ?? null, aria: attr(n, "aria-label") ?? null, handlers, section: sectionOf(anc), block, line });
      }
      for (const a of n.attrs ?? []) for (const m of a.value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) bindings.set(m[1], [...(bindings.get(m[1]) ?? []), line]);
    }
    if (n.nodeName === "#text" && n.value?.trim()) {
      const parent = anc[anc.length - 1];
      if (anc.some((a) => a.tagName && SKIP.has(a.tagName))) return;
      const text = n.value.replace(/\s+/g, " ").trim();
      for (const m of text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) bindings.set(m[1], [...(bindings.get(m[1]) ?? []), line]);
      const st = parent ? styleOf(parent) : {};
      copy.push({ text, tag: parent?.tagName ?? null, section: sectionOf(anc), block, line, style: Object.fromEntries(Object.entries(st).filter(([k]) => /font|color|line-height|letter-spacing/.test(k))) });
    }
  });

  // Logic lines: behaviour worth an inventory row.
  const RE = /gsap\.|\.to\(|\.fromTo\(|\.from\(|\.set\(|\.call\(|timeline\(|ScrollTrigger|scrollTrigger|Lenis|requestAnimationFrame|requestIdleCallback|setTimeout\(|setInterval\(|IntersectionObserver|ResizeObserver|addEventListener\(|matchMedia|prefers-reduced-motion|deviceMemory|saveData|webgl|vibrate|DeviceOrientation|watchPosition|getUserMedia|localStorage|e\.key|key ===|keydown|animate\(|@keyframes|transition|cubic-bezier|ease|duration|stagger/;
  const logic = scriptText
    .split("\n")
    .map((t, i) => ({ line: scriptLine + i, code: t.trim() }))
    .filter((l) => l.code && RE.test(l.code))
    .map((l) => ({ ...l, code: l.code.slice(0, 400) }));
  const keyframes = [...html.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((m) => ({ name: m[1], line: html.slice(0, m.index).split("\n").length }));

  // Colours written in code: the component logic (renderVals) and the page's own scene scripts
  // (landing_gl.js, saakshi-kit.js drawing), not the bundled libraries.
  const scriptColors: Array<{ v: string; file: string; line: number }> = [];
  const HEX = /['"`](#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})['"`]|0x([0-9a-fA-F]{6})\b/g;
  const scan = (text: string, file: string, first: number) => {
    for (const m of text.matchAll(HEX)) scriptColors.push({ v: (m[1] ?? `#${m[2]}`).toUpperCase(), file, line: first + text.slice(0, m.index).split("\n").length - 1 });
  };
  scan(scriptText, "template.html", scriptLine);
  for (const f of await readdir(path.join(dir, "res")).catch(() => [] as string[])) {
    if (!f.endsWith(".js")) continue;
    const text = await readFile(path.join(dir, "res", f), "utf8");
    if (/^\/\/ (Saakshi|Shared helpers for Saakshi)/.test(text)) scan(text, `res/${f}`, 1);
  }

  // Copy built in the script (renderVals lists, messages): sentence-like string literals.
  const scriptCopy = [...scriptText.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.){3,240})\1/g)]
    .map((m) => ({ text: m[2], line: scriptLine + scriptText.slice(0, m.index).split("\n").length - 1 }))
    .filter(
      (c) =>
        /[A-Za-z]{2,}/.test(c.text) &&
        /\s/.test(c.text) &&
        /^[A-Z0-9"'“(]/.test(c.text) &&
        !/^(https?:|data:|url\(|rgba?\(|M\d)|[{};=<>]|\$\{|translate\(|cubic-bezier|inset\(|^[#.[:]|^\((max|min)-|prefers-|' \+|\+ '/.test(c.text),
    );
  // Fonts: each @font-face (family, weight, stretch, subset comment).
  const fonts = [...html.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)].map((m) => ({
    subset: m[1],
    family: /font-family:\s*'([^']+)'/.exec(m[2])?.[1] ?? null,
    weight: /font-weight:\s*([^;]+);/.exec(m[2])?.[1].trim() ?? null,
    stretch: /font-stretch:\s*([^;]+);/.exec(m[2])?.[1].trim() ?? null,
    src: /url\("([^"]+)"\)/.exec(m[2])?.[1] ?? null,
    unicodeRange: /unicode-range:\s*([^;]+);/.exec(m[2])?.[1].trim() ?? null,
  }));

  const out = {
    page: slug,
    scriptCopy,
    fonts,
    sections,
    copy,
    images,
    controls,
    bindings: [...bindings].map(([expr, lines]) => ({ expr, lines: [...new Set(lines)] })),
    styles: Object.fromEntries(Object.entries(styles).map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n }))])),
    logic,
    keyframes,
    scriptColors,
    props,
    scriptLine,
  };
  await mkdir(path.join(root, "design", "extracted"), { recursive: true });
  await writeFile(path.join(root, "design", "extracted", `${slug}.json`), JSON.stringify(out, null, 2));
  return { slug, sections: sections.length, copy: copy.length, images: images.length, controls: controls.length, bindings: bindings.size, logic: logic.length, keyframes: keyframes.length };
}

async function main() {
  const root = process.cwd();
  const pages = (await readdir(path.join(root, "design", "unpacked"), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const p of pages) {
    const r = await extract(p, root);
    console.log(`${r.slug.padEnd(24)} sections ${String(r.sections).padStart(2)}  copy ${String(r.copy).padStart(4)}  images ${String(r.images).padStart(3)}  controls ${String(r.controls).padStart(3)}  bindings ${String(r.bindings).padStart(3)}  logic ${String(r.logic).padStart(3)}  keyframes ${r.keyframes}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
