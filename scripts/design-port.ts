/**
 * `pnpm design:port <page> [--lines 532-1090] [--out file.tsx]`: a mechanical port of a design
 * template's markup (design/unpacked/<page>/template.html) to JSX, the starting point of every
 * page in Phase 8 Part C ("port, don't reinterpret"). What it does, and nothing else:
 *   - attributes → React names (class → className, sc-camel-view-box → viewBox, stroke-width →
 *     strokeWidth, sc-camel-on-click="{{ f }}" → onClick={f}); inputs get default values;
 *   - inline styles → style objects, with every colour mapped by the reconciliation rule
 *     (lib/color/oklch.ts reconcile): the token of the element's mode when it matches
 *     (var(--foreground) inside a data-night section is the night foreground), else the other
 *     mode's alias (var(--n-foreground)), else an extra variable from app/globals.css, else the
 *     literal (reported). Alpha colours become color-mix(in srgb, var(--x) a%, transparent);
 *   - font stacks → var(--font-display | --font-sans | --font-mono | --font-deva); 10px radius →
 *     var(--radius) (the handoff's only radius token; other radii are layout, kept exact);
 *   - {{ expr }} → {expr}; <sc-for> → .map(); <sc-if> → &&; <sc-raw-td> → <td>;
 *   - design image resources (uuid src) → design("<uuid>") for the /dev/parity harness to serve.
 * The output needs hand binding (our data, our components); it never ships as generated.
 * Unmapped values are listed at the end of the output so they can be resolved deliberately.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFragment } from "parse5";
import { parseHex, reconcile, type Rgb } from "../lib/color/oklch";
import { oklchCssToHex } from "../lib/color/oklch";
import { handoffTokens } from "./design-tokens";

type Mode = "light" | "dark" | "night";
interface Node {
  nodeName: string;
  tagName?: string;
  value?: string;
  data?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
  content?: Node;
}

const PREFIX: Record<Mode, string> = { light: "l", dark: "d", night: "n" };
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RENAME: Record<string, string> = {
  class: "className", for: "htmlFor", tabindex: "tabIndex", readonly: "readOnly", maxlength: "maxLength", minlength: "minLength",
  crossorigin: "crossOrigin", fetchpriority: "fetchPriority", srcset: "srcSet", autoplay: "autoPlay", playsinline: "playsInline",
  colspan: "colSpan", rowspan: "rowSpan", autocomplete: "autoComplete", inputmode: "inputMode", enterkeyhint: "enterKeyHint",
  contenteditable: "contentEditable", spellcheck: "spellCheck", datetime: "dateTime", novalidate: "noValidate", "xlink:href": "xlinkHref",
  "accept-charset": "acceptCharset", allowfullscreen: "allowFullScreen", frameborder: "frameBorder", referrerpolicy: "referrerPolicy",
};
const TAGS: Record<string, string> = { "sc-raw-table": "table", "sc-raw-thead": "thead", "sc-raw-tbody": "tbody", "sc-raw-tr": "tr", "sc-raw-td": "td", "sc-raw-th": "th" };
const FONTS: Record<string, string> = {
  "'Anek Latin',sans-serif": "var(--font-display)",
  "'IBM Plex Mono',monospace": "var(--font-mono)",
  "'IBM Plex Sans',sans-serif": "var(--font-sans)",
  "'IBM Plex Sans','IBM Plex Sans Devanagari',system-ui,sans-serif": "var(--font-sans)",
  "'IBM Plex Sans','IBM Plex Sans Devanagari',sans-serif": "var(--font-sans)",
  "'Anek Devanagari',sans-serif": "var(--font-deva)",
  "'Anek Devanagari','Anek Latin',sans-serif": "var(--font-deva)",
};
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const BOOLEAN = new Set(["hidden", "disabled", "checked", "readOnly", "required", "multiple", "autoFocus", "autoPlay", "controls", "loop", "muted", "playsInline", "open", "selected", "noValidate", "defer", "async", "inert", "defaultChecked"]);

export interface PortOptions {
  tokens: Record<Mode, Record<string, string>>;
  /** hex (upper case) → extra variable name, from app/globals.css. */
  extras: Record<string, string>;
  /** Mode of the fragment's context (a template whose root applies a mode). */
  mode?: Mode;
}

export function makeColorMapper(o: PortOptions) {
  const byMode = Object.fromEntries(
    (Object.keys(o.tokens) as Mode[]).map((m) => [m, Object.entries(o.tokens[m]).map(([k, v]) => ({ token: k, rgb: parseHex(oklchCssToHex(v)!)! }))]),
  ) as Record<Mode, Array<{ token: string; rgb: Rgb }>>;
  // Ties (dark and night share several values) resolve to night: the story pages are night.
  const all = (["light", "night", "dark"] as Mode[]).flatMap((m) => byMode[m].map((t) => ({ ...t, token: `${m}.${t.token}` })));
  const unmapped = new Map<string, number>();
  const one = (rgb: Rgb, alpha: number, literal: string, mode: Mode): string => {
    let name: string | null = null;
    const here = reconcile(rgb, byMode[mode]);
    if (here.useToken) name = `--${here.token}`;
    else {
      const any = reconcile(rgb, all);
      if (any.useToken) {
        const [m, k] = any.token.split(".") as [Mode, string];
        name = `--${PREFIX[m]}-${k}`;
      } else {
        const hx = `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
        if (o.extras[hx]) name = `--${o.extras[hx]}`;
      }
    }
    if (!name) {
      unmapped.set(literal, (unmapped.get(literal) ?? 0) + 1);
      return literal;
    }
    return alpha >= 1 ? `var(${name})` : `color-mix(in srgb, var(${name}) ${+(alpha * 100).toFixed(1)}%, transparent)`;
  };
  const map = (value: string, mode: Mode) =>
    value
      .replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (m, r, g, b, a) => one({ r: +r, g: +g, b: +b }, a === undefined ? 1 : +a, m, mode))
      .replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (m) => one(parseHex(m)!, 1, m, mode));
  return { map, unmapped };
}

/** Split "a:b;c:url(x;y)" on top-level semicolons. */
function declarations(style: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of style) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) {
      if (cur.trim()) out.push(split(cur));
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(split(cur));
  return out;
  function split(d: string): [string, string] {
    const i = d.indexOf(":");
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
  }
}

const BIND = /\{\{\s*([\s\S]+?)\s*\}\}/g;
/** A JSX expression for an attribute or style value that may contain {{ }} bindings. */
function expr(value: string): string {
  const whole = /^\{\{\s*([\s\S]+?)\s*\}\}$/.exec(value);
  if (whole) return whole[1];
  if (!BIND.test(value)) return JSON.stringify(value);
  BIND.lastIndex = 0;
  return "`" + value.replace(/`/g, "\\`").replace(BIND, (_, e: string) => "${" + e + "}") + "`";
}

export function port(html: string, o: PortOptions): { tsx: string; unmapped: Map<string, number>; images: string[] } {
  const colors = makeColorMapper(o);
  const images: string[] = [];
  const frag = parseFragment(html) as unknown as Node;
  const lines: string[] = [];
  const pad = (n: number) => "  ".repeat(n);

  const styleObj = (style: string, mode: Mode) => {
    const parts = declarations(style).map(([k, v]) => {
      let val = colors.map(v, mode);
      if (k === "font-family") val = FONTS[v.replace(/\s*,\s*/g, ",").replace(/"/g, "'")] ?? val;
      if (k === "border-radius" && v === "10px") val = "var(--radius)";
      const key = k.startsWith("--") ? JSON.stringify(k) : /^-(webkit|moz|ms)-/.test(k) ? camel(k.slice(1)).replace(/^./, (c) => c.toUpperCase()) : camel(k);
      return `${key}: ${expr(val)}`;
    });
    return `{{ ${parts.join(", ")} }}`;
  };

  const attrs = (n: Node, mode: Mode): string => {
    const out: string[] = [];
    // Colour attributes that map to a variable move into the style (var() in SVG presentation
    // attributes is not reliable across browsers).
    const moved: string[] = [];
    for (const a of n.attrs ?? []) {
      if (!["fill", "stroke", "stop-color", "color", "flood-color"].includes(a.name) || /\{\{/.test(a.value)) continue;
      const mapped = colors.map(a.value, mode);
      if (mapped !== a.value && /var\(/.test(mapped)) moved.push(`${a.name}:${a.value}`);
    }
    const own = n.attrs?.find((a) => a.name === "style")?.value ?? "";
    if (own || moved.length) out.push(`style=${styleObj([...moved, own].filter(Boolean).join(";"), mode)}`);
    for (const a of n.attrs ?? []) {
      let name = a.name;
      let v = a.value;
      if (name === "style" || moved.some((m) => m.startsWith(`${name}:`))) continue;
      if (name.startsWith("sc-camel-")) name = camel(name.slice("sc-camel-".length));
      else if (RENAME[name]) name = RENAME[name];
      else if (!name.startsWith("data-") && !name.startsWith("aria-") && name.includes("-")) name = camel(name);
      if (["fill", "stroke", "stopColor", "color", "floodColor", "lightingColor"].includes(name)) v = colors.map(v, mode);
      if (n.tagName === "img" && name === "src" && /^[0-9a-f-]{36}$/.test(v)) {
        images.push(v);
        out.push(`src={design("${v}")}`);
        continue;
      }
      if ((n.tagName === "input" || n.tagName === "textarea" || n.tagName === "select") && (name === "value" || name === "checked") && !/\{\{/.test(v)) name = name === "value" ? "defaultValue" : "defaultChecked";
      if (/^on[A-Z]/.test(name)) {
        out.push(`${name}={${expr(v).replace(/^"|"$/g, "")}}`);
        continue;
      }
      if (v === "" && BOOLEAN.has(name)) {
        out.push(name);
        continue;
      }
      const e = expr(v);
      out.push(e.startsWith('"') ? `${name}=${e}` : `${name}={${e}}`);
    }
    return out.length ? " " + out.join(" ") : "";
  };

  const text = (s: string) => s.replace(/[{}<>]/g, (c) => `{"${c}"}`);
  // HTML whitespace only: a no-break space (&nbsp;) is content, not layout.
  const WS = /[ \t\n\r\f]+/g;

  /** inline: whitespace between siblings renders (not flex/grid, not first/last child). */
  const walk = (n: Node, depth: number, mode: Mode, key?: string, inline = false) => {
    if (n.nodeName === "#comment") {
      lines.push(`${pad(depth)}{/* ${(n.data ?? "").trim().replace(/\*\//g, "* /")} */}`);
      return;
    }
    if (n.nodeName === "#text") {
      const v = n.value ?? "";
      if (!v.replace(WS, "")) {
        if (inline && v.length) lines.push(`${pad(depth)}{" "}`);
        return;
      }
      // JSX trims text at line ends: text with outer spaces or bindings becomes a string expression.
      const inner = v.replace(WS, " ").replace(/^ | $/g, "");
      const t = (/^[ \t\n\r\f]/.test(v) ? " " : "") + inner + (/[ \t\n\r\f]$/.test(v) ? " " : "");
      const whole = /^\{\{\s*([\s\S]+?)\s*\}\}$/.exec(t);
      if (whole) lines.push(`${pad(depth)}{${whole[1]}}`);
      else if (/^ | $/.test(t) || /\{\{/.test(t)) lines.push(`${pad(depth)}{${expr(t)}}`);
      else lines.push(`${pad(depth)}${text(t)}`);
      return;
    }
    if (!n.tagName) {
      for (const c of n.childNodes ?? []) walk(c, depth, mode);
      return;
    }
    const tag = n.tagName;
    const kids = n.content?.childNodes ?? n.childNodes ?? [];
    const attr = (k: string) => n.attrs?.find((a) => a.name === k)?.value;
    if (tag === "x-dc" || tag === "helmet") {
      if (tag === "x-dc") for (const c of kids) walk(c, depth, mode);
      return;
    }
    if (tag === "script" || tag === "style") return;
    if (tag === "sc-for") {
      const list = expr(attr("list") ?? "[]");
      const as = attr("as") ?? "item";
      const elems = kids.filter((c) => c.tagName || (c.nodeName === "#text" && c.value?.trim()));
      lines.push(`${pad(depth)}{${list}.map((${as}, ${as}I) => (`);
      if (elems.length === 1 && elems[0].tagName) walk(elems[0], depth + 1, mode, `${as}I`);
      else {
        lines.push(`${pad(depth + 1)}<Fragment key={${as}I}>`);
        for (const c of kids) walk(c, depth + 2, mode);
        lines.push(`${pad(depth + 1)}</Fragment>`);
      }
      lines.push(`${pad(depth)}))}`);
      return;
    }
    if (tag === "sc-if") {
      lines.push(`${pad(depth)}{${expr(attr("value") ?? "false")} && (`);
      lines.push(`${pad(depth + 1)}<>`);
      for (const c of kids) walk(c, depth + 2, mode);
      lines.push(`${pad(depth + 1)}</>`);
      lines.push(`${pad(depth)})}`);
      return;
    }
    const out = TAGS[tag] ?? tag;
    const m: Mode = attr("data-night") !== undefined ? "night" : mode;
    const a = attrs({ ...n, attrs: (n.attrs ?? []).filter((x) => !x.name.startsWith("hint-")) }, m) + (key ? ` key={${key}}` : "");
    if (VOID.has(out) || !kids.length) {
      lines.push(`${pad(depth)}<${out}${a} />`);
      return;
    }
    if (tag === "textarea") {
      const t = kids.map((c) => c.value ?? "").join("");
      lines.push(`${pad(depth)}<textarea${a} defaultValue=${JSON.stringify(t)} />`);
      return;
    }
    lines.push(`${pad(depth)}<${out}${a}>`);
    const st = n.attrs?.find((x) => x.name === "style")?.value ?? "";
    // Whitespace between siblings renders only in inline flow: not in flex/grid or SVG, and only
    // next to an inline element (a space between two blocks or absolutely placed boxes collapses).
    const flow = !/display:\s*(inline-)?(flex|grid)/.test(st) && out !== "svg" && !n.attrs?.some((x) => x.name === "xmlns");
    const INLINE = new Set(["a", "span", "strong", "em", "b", "i", "code", "img", "button", "input", "label", "small", "sup", "sub", "abbr", "time", "br", "mark", "kbd"]);
    const inlineEl = (c: Node | undefined) => {
      if (!c) return false;
      if (c.nodeName === "#text") return !!c.value?.replace(WS, "");
      const cs = c.attrs?.find((x) => x.name === "style")?.value ?? "";
      return !!c.tagName && INLINE.has(TAGS[c.tagName] ?? c.tagName) && !/display:\s*(block|flex|grid|none)|position:\s*(absolute|fixed)/.test(cs);
    };
    const inSvg = tag === "svg" || tag === "g" || tag === "defs" || tag === "pattern";
    kids.forEach((c, i) => walk(c, depth + 1, m, undefined, flow && !inSvg && i > 0 && i < kids.length - 1 && inlineEl(kids[i - 1]) && inlineEl(kids[i + 1])));
    lines.push(`${pad(depth)}</${out}>`);
  };
  walk(frag, 0, o.mode ?? "light");
  return { tsx: lines.join("\n"), unmapped: colors.unmapped, images };
}

/** Extra variables in app/globals.css: "--name: #hex;" → { HEX: name }. */
export async function extrasFromGlobals(root = process.cwd()): Promise<Record<string, string>> {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    const rgb = parseHex(m[2])!;
    out[`#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase()] = m[1];
  }
  return out;
}

async function main() {
  const page = process.argv[2];
  if (!page || page.startsWith("--")) throw new Error("Usage: pnpm design:port <page> [--lines a-b] [--mode light|dark|night] [--out file]");
  const arg = (f: string) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : undefined);
  const html = await readFile(path.join(process.cwd(), "design/unpacked", page, "template.html"), "utf8");
  const [a, b] = (arg("--lines") ?? "").split("-").map(Number);
  const src = a ? html.split("\n").slice(a - 1, b || undefined).join("\n") : html.slice(html.indexOf("<x-dc>"), html.indexOf('<script type="text/x-dc"'));
  const r = port(src, { tokens: await handoffTokens(), extras: await extrasFromGlobals(), mode: (arg("--mode") as Mode) ?? "light" });
  const tail = [
    "",
    `// design:port ${page}${a ? ` lines ${a}-${b}` : ""}: ${r.images.length} design image(s)`,
    ...(r.unmapped.size ? [`// Unmapped colours (no token within ΔE 2.3 in any mode, no extra variable): ${[...r.unmapped].map(([k, n]) => `${k} ×${n}`).join(", ")}`] : ["// Every colour mapped to a token or an extra variable."]),
  ];
  const out = arg("--out");
  if (out) {
    await writeFile(out, r.tsx + "\n" + tail.join("\n") + "\n");
    console.log(`${out}: ${r.tsx.split("\n").length} lines${tail.slice(1).map((t) => "\n" + t).join("")}`);
  } else console.log(r.tsx + "\n" + tail.join("\n"));
}

if (process.argv[1] && /design-port/.test(process.argv[1]))
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
