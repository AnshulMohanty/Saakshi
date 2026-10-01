/**
 * `pnpm quality [--base <url>] [--only lcp,lighthouse,fps,stage,three,axe,focus,browsers,modes]`:
 * the Phase 8 quality gates against a running app, meant for a production build
 * (`pnpm build && pnpm start`). Results merge into design/quality/results.json (raw, not committed,
 * with screenshots) and docs/quality-gates.md (committed) is rewritten from it, so gates can run
 * one at a time on a low-memory machine.
 *
 *   lighthouse  Lighthouse desktop: performance ≥ 85 and accessibility ≥ 95 on /, both ≥ 90 on
 *               every other page; mobile scores recorded too
 *   lcp         Lighthouse mobile (its simulated mid-range Android: 4× CPU, slow 4G): LCP ≤ 2.5 s
 *   lcp-applied the same profile applied in the browser (CDP network + CPU throttling), LCP ≤ 2.5 s
 *   stage       the landing paints its hero still first and starts the 3D only after idle
 *   fps         frame rate scrolling the landing and idling on the Wall: desktop ≥ 60 (≥ 57 measured,
 *               rAF jitter), Pixel 7 with 4× CPU throttling ≥ 30; --headed for the GPU
 *   three       three.js loads only on /, /witness and the evidence viewer
 *   axe         axe-core WCAG 2.1 A/AA: no violations
 *   focus       Tab through each page: every focused element shows a focus indicator
 *   browsers    Chromium, Firefox, WebKit at 1440, Pixel 7 and iPhone 14 emulation: renders, no errors
 *   modes       reduced-motion and low-power versions of every scene: right mode, no errors
 * Console errors are collected in every gate that opens pages.
 */
import "./_env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, devices, firefox, webkit, type Browser, type BrowserContextOptions, type Page } from "playwright";
import { launchBrowser } from "./_capture";

const arg = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const BASE = (arg("--base") ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ONLY = arg("--only")?.split(",");
/** --headed: a visible window, so WebGL runs on the machine's GPU (headless Chromium renders it in software). */
const HEADED = process.argv.includes("--headed");
/** --pages landing,spot: only those pages (and only their rows are replaced in the results). */
const PAGES = arg("--pages")?.split(",");
/** --form mobile|desktop: Lighthouse in one form factor only. */
const FORM = arg("--form");
const OUT = path.join(process.cwd(), "design", "quality");
const require_ = createRequire(import.meta.url);

interface PageDef {
  key: string;
  path: string;
  kind: "story" | "public" | "app";
  scene?: boolean;
}
interface Row {
  page: string;
  profile: string;
  value: string;
  pass: boolean;
  note?: string;
}
type Results = Record<string, { ranAt: string; rows: Row[] }>;

async function resolvePages(): Promise<PageDef[]> {
  const html = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(120_000) }).then((r) => r.text());
  const id = (re: RegExp) => re.exec(html)?.[1] ?? null;
  const asset = id(/\/e\/([0-9a-f-]{36})/);
  const report = id(/\/r\/([0-9a-f-]{36})/);
  const spot = id(/\/spots\/([a-z0-9-]+)/) ?? "demo-hero-cleanup-spot-1";
  const project = id(/\/projects\/([a-z0-9-]+)/) ?? "demo-hero-cleanup";
  return [
    { key: "landing", path: "/", kind: "story", scene: true },
    { key: "how-it-works", path: "/how-it-works", kind: "story", scene: true },
    { key: "demo", path: "/demo", kind: "story", scene: true },
    { key: "witness", path: "/witness", kind: "story", scene: true },
    ...(asset ? [{ key: "evidence", path: `/e/${asset}`, kind: "public" as const, scene: true }] : []),
    { key: "spot", path: `/spots/${spot}`, kind: "public" },
    ...(report ? [{ key: "report", path: `/r/${report}`, kind: "public" as const }] : []),
    { key: "poster", path: `/spots/${spot}/poster`, kind: "public" },
    { key: "capture", path: "/capture", kind: "app", scene: true },
    { key: "library", path: "/library", kind: "app" },
    { key: "review", path: "/review", kind: "app" },
    { key: "project", path: `/projects/${project}`, kind: "app" },
    { key: "studio", path: "/studio", kind: "app" },
  ];
}

// ---------- console errors, collected by every page visit
const consoleErrors = new Map<string, Set<string>>();
function watch(page: Page, key: string) {
  const add = (m: string) => {
    if (!consoleErrors.has(key)) consoleErrors.set(key, new Set());
    consoleErrors.get(key)!.add(m.slice(0, 240));
  };
  page.on("console", (m) => m.type() === "error" && add(`console: ${m.text()}`));
  page.on("pageerror", (e) => add(`pageerror: ${e.message.split("\n")[0]}`));
}

async function open(browser: Browser, p: PageDef, ctx: BrowserContextOptions, o: { wait?: number; init?: string } = {}) {
  const context = await browser.newContext(ctx);
  // The ink-drop intro runs on a first visit only: measure the page, not the intro.
  await context.addInitScript(`try{localStorage.setItem("saakshi-intro-seen","1")}catch(e){}${o.init ?? ""}`);
  const page = await context.newPage();
  watch(page, p.key);
  await page.goto(`${BASE}${p.path}`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForTimeout(o.wait ?? 2500);
  return { page, close: () => context.close() };
}

const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const WALL: BrowserContextOptions = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
const desktopFor = (p: PageDef) => (p.key === "witness" ? WALL : DESKTOP);

// ---------- gates
async function gateThree(pages: PageDef[]): Promise<Row[]> {
  const allowed = new Set(["landing", "witness", "evidence"]);
  const browser = await launchBrowser();
  const rows: Row[] = [];
  try {
    for (const p of pages) {
      const context = await browser.newContext(desktopFor(p));
      await context.addInitScript(`try{localStorage.setItem("saakshi-intro-seen","1")}catch(e){}`);
      const page = await context.newPage();
      watch(page, p.key);
      const bodies: Array<Promise<{ url: string; three: boolean }>> = [];
      page.on("response", (r) => {
        if (r.request().resourceType() !== "script") return;
        bodies.push(r.text().then((t) => ({ url: r.url(), three: /THREE\.WebGLRenderer/.test(t) }), () => ({ url: r.url(), three: false })));
      });
      await page.goto(`${BASE}${p.path}`, { waitUntil: "load", timeout: 180_000 });
      // The landing starts its 3D after idle: give every page the same chance, then scroll it through.
      await page.waitForTimeout(6000);
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 1200) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
      });
      await page.waitForTimeout(1500);
      const loaded = (await Promise.all(bodies)).filter((b) => b.three);
      const has = loaded.length > 0;
      rows.push({ page: p.key, profile: "chromium 1440", value: has ? `loaded (${loaded.map((b) => path.basename(new URL(b.url).pathname)).join(", ")})` : "not loaded", pass: has ? allowed.has(p.key) : true });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return rows;
}

async function gateAxe(pages: PageDef[]): Promise<Row[]> {
  const axePath = require_.resolve("axe-core/axe.min.js");
  const browser = await launchBrowser();
  const rows: Row[] = [];
  try {
    for (const p of pages) {
      for (const [profile, ctx] of [
        ["chromium 1440", desktopFor(p)],
        ["chromium 390", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
      ] as const) {
        const { page, close } = await open(browser, p, ctx, { wait: 3000 });
        await page.addScriptTag({ path: axePath });
        const v = (await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> } }).axe;
          const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
          return r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, at: x.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
        })) as Array<{ id: string; impact: string; n: number; at: string[] }>;
        rows.push({ page: p.key, profile, value: v.length ? v.map((x) => `${x.id} (${x.impact}, ${x.n})`).join("; ") : "0 violations", pass: v.length === 0, note: v.length ? v.map((x) => `${x.id}: ${x.at.join(" | ")}`).join(" ; ") : undefined });
        await close();
      }
    }
  } finally {
    await browser.close();
  }
  return rows;
}

async function gateFocus(pages: PageDef[]): Promise<Row[]> {
  const browser = await launchBrowser();
  const rows: Row[] = [];
  try {
    for (const p of pages) {
      const { page, close } = await open(browser, p, desktopFor(p), { wait: 2500 });
      let seen = 0;
      const missing: string[] = [];
      const keys = new Set<string>();
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(120);
        const f = (await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== "none" && s.boxShadow !== "") ;
          const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}"`;
          return { ring, label };
        })) as { ring: boolean; label: string } | null;
        if (!f || keys.has(f.label)) continue;
        keys.add(f.label);
        seen++;
        if (!f.ring) missing.push(f.label);
      }
      rows.push({ page: p.key, profile: "chromium 1440", value: `${seen - missing.length}/${seen} focused elements show a ring`, pass: missing.length === 0, note: missing.length ? missing.slice(0, 5).join("; ") : undefined });
      await close();
    }
  } finally {
    await browser.close();
  }
  return rows;
}

const RAF_PROBE = `(() => { window.__fps = []; const loop = (t) => { window.__fps.push(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); })()`;
const fpsOf = (ts: number[]) => {
  const d = ts.slice(1).map((t, i) => t - ts[i]);
  const mean = d.length ? (d.length * 1000) / (ts[ts.length - 1] - ts[0]) : 0;
  const sorted = [...d].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const slow = d.filter((x) => x > 1000 / 30 + 1).length;
  return { mean: Math.round(mean * 10) / 10, p95: Math.round(p95 * 10) / 10, slowShare: d.length ? Math.round((slow / d.length) * 1000) / 10 : 0, frames: d.length };
};

async function scrollFps(page: Page, step: number) {
  await page.evaluate("window.scrollTo(0, 0)");
  await page.waitForTimeout(800);
  await page.mouse.move(400, 400);
  await page.evaluate(RAF_PROBE);
  const H = (await page.evaluate("document.documentElement.scrollHeight")) as number;
  const started = Date.now();
  // Wheel through the page (Lenis smooths it), at most 14 s.
  for (let y = 0; y < H && Date.now() - started < 14_000; y += step) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(32);
  }
  await page.waitForTimeout(500);
  return fpsOf((await page.evaluate("window.__fps")) as number[]);
}

async function gateFps(pages: PageDef[]): Promise<Row[]> {
  const rows: Row[] = [];
  const landing = pages.find((p) => p.key === "landing")!;
  const wall = pages.find((p) => p.key === "witness")!;
  const browser = await launchBrowser({ headless: !HEADED });
  const where = HEADED ? "headed Chromium (GPU)" : "headless Chromium (software GL)";
  try {
    const describe = (f: ReturnType<typeof fpsOf>) => `${f.mean} fps mean, p95 frame ${f.p95} ms, ${f.slowShare}% of ${f.frames} frames over 33 ms`;
    // Desktop.
    {
      const { page, close } = await open(browser, landing, DESKTOP, { wait: 9000 });
      const f = await scrollFps(page, 120);
      rows.push({ page: "landing", profile: `desktop 1440, ${where}`, value: describe(f), pass: f.mean >= 57 });
      await close();
    }
    {
      const { page, close } = await open(browser, wall, WALL, { wait: 4000 });
      await page.evaluate(RAF_PROBE);
      await page.waitForTimeout(6000);
      const f = fpsOf((await page.evaluate("window.__fps")) as number[]);
      rows.push({ page: "witness", profile: `desktop 1920, ${where}, idle`, value: describe(f), pass: f.mean >= 57 });
      await close();
    }
    // Mid-range Android: Pixel 7 viewport and touch, CPU slowed 4× (Lighthouse's mobile CPU factor).
    for (const p of [landing, wall]) {
      const { page, close } = await open(browser, p, { ...devices["Pixel 7"] }, { wait: 1000 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.waitForTimeout(p.key === "landing" ? 9000 : 4000);
      let f: ReturnType<typeof fpsOf>;
      if (p.key === "landing") f = await scrollFps(page, 90);
      else {
        await page.evaluate(RAF_PROBE);
        await page.waitForTimeout(6000);
        f = fpsOf((await page.evaluate("window.__fps")) as number[]);
      }
      rows.push({ page: p.key, profile: `Pixel 7 emulation, 4× CPU throttle, ${where}${p.key === "witness" ? ", idle" : ""}`, value: describe(f), pass: f.mean >= 30 });
      await close();
    }
  } finally {
    await browser.close();
  }
  return rows;
}

async function gateStage(pages: PageDef[]): Promise<Row[]> {
  const landing = pages.find((p) => p.key === "landing")!;
  const browser = await launchBrowser();
  const rows: Row[] = [];
  try {
    for (const [profile, ctx] of [
      ["desktop 1440", DESKTOP],
      ["Pixel 7 emulation", { ...devices["Pixel 7"] }],
    ] as const) {
      const context = await browser.newContext(ctx);
      await context.addInitScript(`try{localStorage.setItem("saakshi-intro-seen","1")}catch(e){}
        window.__lcp = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push({ t: e.startTime, id: e.element ? (e.element.id || e.element.closest("[id]")?.id || e.element.tagName) : null }); }).observe({ type: "largest-contentful-paint", buffered: true });`);
      const page = await context.newPage();
      watch(page, "landing");
      await page.goto(`${BASE}${landing.path}`, { waitUntil: "load", timeout: 180_000 });
      const on = await page.waitForSelector("[data-stage='on']", { timeout: 20_000, state: "attached" }).then(() => true, () => false);
      const r = (await page.evaluate(() => {
        const w = window as unknown as { __lcp: Array<{ t: number; id: string | null }> };
        const stage = performance.getEntriesByName("saakshi:stage")[0]?.startTime ?? null;
        const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
        return { lcp: w.__lcp.at(-1) ?? null, fcp, stage, mode: document.querySelector<HTMLElement>("[data-motion]")?.dataset.motion ?? null };
      })) as { lcp: { t: number; id: string | null } | null; fcp: number | null; stage: number | null; mode: string | null };
      const ok = on && r.stage !== null && r.fcp !== null && r.stage > r.fcp;
      rows.push({ page: "landing", profile, value: `mode ${r.mode}; first paint ${Math.round(r.fcp ?? -1)} ms, LCP ${Math.round(r.lcp?.t ?? -1)} ms (#${r.lcp?.id ?? "?"}), 3D started ${r.stage === null ? "never" : `${Math.round(r.stage)} ms`}`, pass: ok, note: ok ? undefined : "3D did not start after the still" });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return rows;
}

/** LCP with throttling applied in the browser (not simulated): Pixel 7, 4× CPU, Lighthouse's mobile network. */
async function gateLcpApplied(pages: PageDef[]): Promise<Row[]> {
  const browser = await launchBrowser();
  const rows: Row[] = [];
  try {
    for (const p of pages) {
      const context = await browser.newContext({ ...devices["Pixel 7"] });
      await context.addInitScript(`try{localStorage.setItem("saakshi-intro-seen","1")}catch(e){}
        window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });`);
      const page = await context.newPage();
      watch(page, p.key);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.goto(`${BASE}${p.path}`, { waitUntil: "load", timeout: 300_000 });
      await page.waitForTimeout(3000);
      const lcp = (await page.evaluate("window.__lcp")) as number;
      rows.push({ page: p.key, profile: "applied: Pixel 7, 4× CPU, 1.6 Mbps / 150 ms RTT", value: `LCP ${(lcp / 1000).toFixed(2)} s`, pass: lcp > 0 && lcp <= 2500 });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return rows;
}

async function gateBrowsers(pages: PageDef[]): Promise<Row[]> {
  const rows: Row[] = [];
  const profiles: Array<{ name: string; launch: () => Promise<Browser>; ctx: (p: PageDef) => BrowserContextOptions }> = [
    { name: "Chromium 1440", launch: () => launchBrowser(), ctx: desktopFor },
    { name: "Firefox 1440", launch: () => firefox.launch({ headless: true }), ctx: desktopFor },
    { name: "WebKit 1440", launch: () => webkit.launch({ headless: true }), ctx: desktopFor },
    { name: "Pixel 7", launch: () => launchBrowser(), ctx: () => ({ ...devices["Pixel 7"] }) },
    { name: "iPhone 14", launch: () => webkit.launch({ headless: true }), ctx: () => ({ ...devices["iPhone 14"] }) },
  ];
  await mkdir(path.join(OUT, "browsers"), { recursive: true });
  for (const pr of profiles) {
    const browser = await pr.launch();
    try {
      for (const p of pages) {
        const errs: string[] = [];
        const context = await browser.newContext(pr.ctx(p));
        await context.addInitScript(`try{localStorage.setItem("saakshi-intro-seen","1")}catch(e){}`);
        const page = await context.newPage();
        page.on("pageerror", (e) => errs.push(e.message.split("\n")[0].slice(0, 200)));
        page.on("console", (m) => m.type() === "error" && errs.push(`console: ${m.text().slice(0, 200)}`));
        const res = await page.goto(`${BASE}${p.path}`, { waitUntil: "load", timeout: 180_000 }).catch((e: unknown) => e);
        await page.waitForTimeout(3000);
        const text = ((await page.evaluate("document.body.innerText.trim().length").catch(() => 0)) as number) ?? 0;
        const status = res && typeof (res as { status?: () => number }).status === "function" ? (res as { status: () => number }).status() : 0;
        await page.screenshot({ path: path.join(OUT, "browsers", `${pr.name.replace(/\s+/g, "-").toLowerCase()}-${p.key}.png`) }).catch(() => undefined);
        const ok = status === 200 && text > 40 && errs.length === 0;
        rows.push({ page: p.key, profile: pr.name, value: `HTTP ${status}, ${text} chars of text, ${errs.length} errors`, pass: ok, note: errs.length ? errs.slice(0, 3).join(" | ") : undefined });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  return rows;
}

async function gateModes(pages: PageDef[]): Promise<Row[]> {
  const rows: Row[] = [];
  const browser = await launchBrowser();
  try {
    for (const p of pages.filter((x) => x.scene)) {
      for (const [mode, ctx, init] of [
        ["reduced", { ...desktopFor(p), reducedMotion: "reduce" as const }, ""],
        ["low-power", desktopFor(p), "Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });"],
      ] as const) {
        const { page, close } = await open(browser, p, ctx, { wait: 6000, init });
        const r = (await page.evaluate(() => ({
          motion: document.querySelector<HTMLElement>("[data-motion]")?.dataset.motion ?? null,
          stage: !!document.querySelector("[data-stage='on']"),
          reducedQuery: matchMedia("(prefers-reduced-motion: reduce)").matches,
        }))) as { motion: string | null; stage: boolean; reducedQuery: boolean };
        await mkdir(path.join(OUT, "modes"), { recursive: true });
        await page.screenshot({ path: path.join(OUT, "modes", `${p.key}-${mode}.png`) });
        const errs = [...(consoleErrors.get(p.key) ?? [])].filter((e) => e.startsWith("pageerror"));
        // Pages with a motion attribute must resolve to the mode; the others read the media query in place.
        const want = mode === "reduced" ? "reduced" : "low";
        const motionOk = r.motion === null || r.motion === want;
        const ok = motionOk && !r.stage && errs.length === 0;
        rows.push({ page: p.key, profile: mode, value: `data-motion ${r.motion ?? "(none; reads the media query)"}, 3D ${r.stage ? "on" : "off"}`, pass: ok });
        await close();
      }
    }
  } finally {
    await browser.close();
  }
  return rows;
}

/** LCP rows from the mobile runs of the last `lighthouse` gate (the `lcp` gate reuses them). */
let lcpFromLighthouse: Row[] = [];

async function lighthouseRuns(pages: PageDef[], want: "lcp" | "lighthouse"): Promise<Row[]> {
  const { default: lighthouse } = await import("lighthouse");
  const { default: desktopConfig } = await import("lighthouse/core/config/desktop-config.js");
  const port = 9333;
  const exe = chromium.executablePath();
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: [`--remote-debugging-port=${port}`] });
  const rows: Row[] = [];
  try {
    for (const p of pages) {
      for (const form of (want === "lcp" ? (["mobile"] as const) : (["desktop", "mobile"] as const)).filter((x) => !FORM || x === FORM)) {
        const flags = { port, output: "json" as const, logLevel: "error" as const, onlyCategories: ["performance", "accessibility"] };
        const r = await lighthouse(`${BASE}${p.path}`, flags, form === "desktop" ? desktopConfig : undefined);
        const lhr = r?.lhr;
        if (lhr) {
          await mkdir(path.join(OUT, "lighthouse"), { recursive: true });
          await writeFile(path.join(OUT, "lighthouse", `${p.key}-${form}.json`), JSON.stringify(lhr));
        }
        if (!lhr) {
          rows.push({ page: p.key, profile: `lighthouse ${form}`, value: "no result", pass: false });
          continue;
        }
        const perf = Math.round((lhr.categories.performance?.score ?? 0) * 100);
        const a11y = Math.round((lhr.categories.accessibility?.score ?? 0) * 100);
        const lcp = lhr.audits["largest-contentful-paint"]?.numericValue ?? NaN;
        const fails = Object.values(lhr.audits).filter((a) => a.score !== null && a.score < 1 && lhr.categories.accessibility.auditRefs.some((ref) => ref.id === a.id && ref.weight > 0)).map((a) => a.id);
        const lcpRow = { page: p.key, profile: "Lighthouse mobile (simulated mid-range Android: 4× CPU, slow 4G)", value: `LCP ${(lcp / 1000).toFixed(2)} s`, pass: lcp <= 2500 };
        if (form === "mobile") lcpFromLighthouse.push(lcpRow);
        if (want === "lcp") rows.push(lcpRow);
        else {
          const [needP, needA] = form === "mobile" ? [0, 0] : p.key === "landing" ? [85, 95] : [90, 90];
          rows.push({ page: p.key, profile: `Lighthouse ${form}`, value: `performance ${perf}, accessibility ${a11y}, LCP ${(lcp / 1000).toFixed(2)} s`, pass: perf >= needP && a11y >= needA, note: [form === "mobile" ? "recorded, not gated" : "", fails.length ? `a11y audits below 1: ${fails.join(", ")}` : ""].filter(Boolean).join("; ") || undefined });
        }
      }
    }
  } finally {
    await browser.close();
  }
  return rows;
}

const GATES: Record<string, { title: string; run: (pages: PageDef[]) => Promise<Row[]> }> = {
  lighthouse: { title: "Lighthouse (desktop gated: / ≥ 85 performance and ≥ 95 accessibility; other pages ≥ 90 both)", run: (p) => lighthouseRuns(p, "lighthouse") },
  lcp: { title: "LCP ≤ 2.5 s on a throttled mid-range Android profile", run: (p) => lighthouseRuns(p, "lcp") },
  "lcp-applied": { title: "LCP ≤ 2.5 s, throttling applied in the browser", run: gateLcpApplied },
  stage: { title: "Hero still first, 3D after idle", run: gateStage },
  fps: { title: "Frame rate: 60 fps desktop, 30+ fps mid-range Android", run: gateFps },
  three: { title: "three.js only on /, /witness and the evidence viewer", run: gateThree },
  axe: { title: "axe-core, WCAG 2.1 A and AA", run: gateAxe },
  focus: { title: "Visible focus", run: gateFocus },
  browsers: { title: "Browsers: Chromium, Firefox, WebKit, Pixel 7, iPhone 14", run: gateBrowsers },
  modes: { title: "Reduced-motion and low-power versions of every scene", run: gateModes },
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const file = path.join(OUT, "results.json");
  const results: Results = await readFile(file, "utf8").then((t) => JSON.parse(t) as Results, () => ({}));
  const pages = (await resolvePages()).filter((p) => !PAGES || PAGES.includes(p.key));
  console.log(`${BASE}: ${pages.map((p) => p.key).join(", ")}`);
  for (const [key, g] of Object.entries(GATES)) {
    if (ONLY && !ONLY.includes(key)) continue;
    console.log(`\n${g.title}`);
    consoleErrors.clear();
    lcpFromLighthouse = [];
    const rows = await g.run(pages);
    for (const r of rows) console.log(`  ${r.pass ? "pass" : "FAIL"}  ${r.page} · ${r.profile}: ${r.value}${r.note ? `  (${r.note})` : ""}`);
    const kept = PAGES || FORM ? (results[key]?.rows ?? []).filter((r) => !rows.some((n) => n.page === r.page && n.profile === r.profile)) : [];
    results[key] = { ranAt: new Date().toISOString(), rows: [...kept, ...rows] };
    const errs = [...consoleErrors.entries()].map(([page, s]) => ({ page, profile: `during ${key}`, value: [...s].join(" | ") || "none", pass: s.size === 0 }));
    results[`console:${key}`] = { ranAt: new Date().toISOString(), rows: errs };
    if (key === "lighthouse" && lcpFromLighthouse.length) {
      const keptLcp = PAGES ? (results.lcp?.rows ?? []).filter((r) => !lcpFromLighthouse.some((n) => n.page === r.page)) : [];
      results.lcp = { ranAt: new Date().toISOString(), rows: [...keptLcp, ...lcpFromLighthouse] };
    }
    await writeFile(file, JSON.stringify(results, null, 2));
  }
  await writeFile(path.join(process.cwd(), "docs", "quality-gates.md"), markdown(results));
  const all = Object.values(results).flatMap((r) => r.rows);
  console.log(`\ndocs/quality-gates.md: ${all.filter((r) => r.pass).length}/${all.length} checks pass.`);
}

function markdown(results: Results): string {
  const md: string[] = ["# Quality gates", ""];
  md.push(`Generated by \`pnpm quality\` (scripts/quality-gates.ts) against a production build (\`pnpm build && pnpm start\`, mock providers, the demo archive) on the development machine: Windows 11, 8 GB RAM, headless browsers from Playwright. Raw results and screenshots: \`design/quality/\` (not committed).`);
  md.push("");
  const all = Object.values(results).flatMap((r) => r.rows);
  md.push(`**${all.filter((r) => r.pass).length} of ${all.length} checks pass.**`);
  for (const [key, g] of Object.entries(GATES)) {
    const r = results[key];
    if (!r) continue;
    md.push("", `## ${g.title}`, "", `Run ${r.ranAt.slice(0, 16).replace("T", " ")} UTC.`, "", "| page | profile | result | gate |", "|---|---|---|---|");
    for (const x of r.rows) md.push(`| ${x.page} | ${x.profile} | ${x.value.replace(/\|/g, "/")}${x.note ? ` (${x.note.replace(/\|/g, "/")})` : ""} | ${x.pass ? "pass" : "**fail**"} |`);
  }
  const cons = Object.entries(results).filter(([k]) => k.startsWith("console:"));
  if (cons.length) {
    md.push("", "## No console errors", "", "Errors and uncaught exceptions seen while each gate had the pages open.", "", "| page | during | errors | gate |", "|---|---|---|---|");
    for (const [, r] of cons) for (const x of r.rows) md.push(`| ${x.page} | ${x.profile.replace("during ", "")} | ${x.value.replace(/\|/g, "/")} | ${x.pass ? "pass" : "**fail**"} |`);
    if (cons.every(([, r]) => r.rows.length === 0)) md.push("| all | all gates | none | pass |");
  }
  md.push("");
  return md.join("\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
