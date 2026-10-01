/**
 * Scroll-step screenshots for design parity (design:capture and parity:capture share this).
 * Per page and viewport (1440×900 desktop, 390×844 phone):
 *   1. load, wait for fonts (document.fonts.ready) and, if the page has canvases, for WebGL to
 *      settle (60 animation frames + 1.5 s);
 *   2. scroll to the bottom once so lazy content loads, then back to the top;
 *   3. find the scroller (the window, or the largest scrollable element in an app shell); steps:
 *      every half viewport, plus start/¼/½/¾/end of each pinned section (GSAP pin-spacers
 *      and position: sticky elements);
 *   4. per step: scrollTo, two frames + 350 ms for scroll-driven animations, viewport screenshot.
 * Output: <outDir>/<page>/<width>/<step>.png, <outDir>/<page>/manifest.json, and a short video
 * per page at desktop width (<outDir>/<page>/video.webm; needs `npx playwright install ffmpeg`).
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

export const VIEWPORTS = [
  { width: 1440, height: 900, mobile: false },
  { width: 390, height: 844, mobile: true },
] as const;

export interface CaptureStep {
  index: number;
  y: number;
  file: string;
  kind: "step" | "pinned";
  label?: string;
}

/** Single-state manifest (before Phase 8); see CaptureManifestV2. */
export interface CaptureManifest {
  page: string;
  source: string;
  capturedAt: string;
  viewports: Array<{ width: number; height: number; scrollHeight: number; steps: CaptureStep[] }>;
  video: string | null;
  notes: string[];
}

export const pageSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.html?$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "index";

/** Edge first (installed on Windows, no download), then Chrome, then Playwright's own Chromium. */
export async function launchBrowser(): Promise<Browser> {
  const channels = [process.env.PLAYWRIGHT_CHANNEL, "msedge", "chrome", undefined].filter((c, i, a) => a.indexOf(c) === i);
  let last: unknown;
  for (const channel of channels) {
    try {
      return await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    } catch (err) {
      last = err;
    }
  }
  throw new Error(`No browser for Playwright: install Microsoft Edge or Chrome, or run \`npx playwright install chromium\`. Last error: ${last instanceof Error ? last.message.split("\n")[0] : last}`);
}

async function settle(page: Page, { webgl }: { webgl: boolean }) {
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => true);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  if (webgl) {
    await page.evaluate(() => new Promise<void>((r) => { let n = 0; const f = () => (++n >= 60 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    await page.waitForTimeout(1500);
  }
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Scroll positions: every half viewport, plus the key points of each pinned section. */
export function planSteps(scrollHeight: number, viewportHeight: number, pinned: Array<{ top: number; height: number; label: string }>, maxSteps = 160) {
  const maxY = Math.max(0, scrollHeight - viewportHeight);
  const steps: Array<{ y: number; kind: "step" | "pinned"; label?: string }> = [];
  for (let y = 0; y < maxY; y += Math.round(viewportHeight / 2)) steps.push({ y, kind: "step" });
  steps.push({ y: maxY, kind: "step" });
  for (const p of pinned) {
    const span = Math.max(0, p.height - viewportHeight);
    for (const f of [0, 0.25, 0.5, 0.75, 1]) steps.push({ y: Math.min(maxY, Math.round(p.top + span * f)), kind: "pinned", label: `${p.label} ${Math.round(f * 100)}%` });
  }
  steps.sort((a, b) => a.y - b.y || (a.kind === "pinned" ? -1 : 1));
  // Drop near-duplicates (within 24 px), keeping pinned labels.
  const out: typeof steps = [];
  for (const s of steps) {
    const prev = out.at(-1);
    if (prev && Math.abs(prev.y - s.y) < 24) {
      if (s.kind === "pinned" && prev.kind === "step") out[out.length - 1] = s;
      continue;
    }
    out.push(s);
  }
  if (out.length <= maxSteps) return out;
  const every = out.length / maxSteps;
  return Array.from({ length: maxSteps }, (_, i) => out[Math.floor(i * every)]);
}

/**
 * In-page helpers (a plain script string, so tsx's __name wrapping can't break them). The
 * scroller is the window, or, when the document doesn't scroll (app shells), the largest
 * scrollable element that is at least half the viewport tall.
 */
const PAGE_HELPERS = {
  content: `
globalThis.__name = globalThis.__name || ((f) => f);
globalThis.__cap = {
  el: null,
  doc() { return document.scrollingElement || document.documentElement; },
  find() {
    const doc = this.doc();
    let best = null, bestD = 50;
    if (doc.scrollHeight <= innerHeight + 8) {
      for (const el of document.querySelectorAll("body *")) {
        if (!/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) continue;
        const d = el.scrollHeight - el.clientHeight;
        if (d > bestD && el.clientHeight >= innerHeight * 0.5) { best = el; bestD = d; }
      }
    }
    this.el = best || doc;
    const r = best ? best.getBoundingClientRect() : { top: 0, left: 0, width: innerWidth, height: innerHeight };
    return { element: !!best, height: best ? best.clientHeight : innerHeight, scrollHeight: Math.max(this.el.scrollHeight, best ? 0 : (document.body ? document.body.scrollHeight : 0)), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },
  to(y) { this.el.scrollTo({ top: y, behavior: "instant" }); },
  atBottom() { const e = this.el, h = e === this.doc() ? innerHeight : e.clientHeight; return e.scrollTop + h >= e.scrollHeight - 2; },
  pinned() {
    const e = this.el, isDoc = e === this.doc();
    const top0 = isDoc ? 0 : e.getBoundingClientRect().top, s0 = isDoc ? scrollY : e.scrollTop, vh = isDoc ? innerHeight : e.clientHeight;
    const label = (el) => el.id ? "#" + el.id : (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
    const out = [], seen = new Set();
    for (const sp of document.querySelectorAll(".pin-spacer")) {
      const r = sp.getBoundingClientRect(), inner = sp.firstElementChild || sp;
      if (r.height > 0) out.push({ top: r.top - top0 + s0, height: r.height, label: "pin " + label(inner) });
      seen.add(inner);
    }
    for (const el of document.querySelectorAll("body *")) {
      if (seen.has(el) || getComputedStyle(el).position !== "sticky" || !el.parentElement) continue;
      const r = el.parentElement.getBoundingClientRect();
      if (r.height > vh * 1.2) out.push({ top: r.top - top0 + s0, height: r.height, label: "sticky " + label(el) });
    }
    return out.slice(0, 20);
  },
};`,
};

export interface Viewport {
  width: number;
  height: number;
  mobile: boolean;
}

/**
 * One captured state of a page. `mode`:
 *   scroll    half-viewport + pinned-section steps (the default);
 *   single    one frame after `prepare`;
 *   timeline  Playwright's fake clock: `trigger` runs at t = 0, then a frame at each `at` second
 *             (deterministic: timers, rAF and performance.now all follow the fake clock).
 */
export interface Variant {
  id: string;
  label?: string;
  viewports?: readonly Viewport[];
  reducedMotion?: "reduce" | "no-preference";
  colorScheme?: "light" | "dark";
  /** Runs before the page's own scripts (e.g. faking navigator.deviceMemory). */
  initScript?: string;
  /** Replaces the page URL (e.g. our routes with ?state= or ?motion=). */
  url?: string;
  /** Evaluated after the page settles (e.g. __dcSetProps, clicking a tab). */
  prepare?: string;
  mode?: "scroll" | "single" | "timeline";
  timeline?: { ready: string; trigger: string; at: number[] };
  /** Screenshot this element instead of the viewport. */
  element?: string;
}

export interface VariantManifest {
  id: string;
  label: string | null;
  viewports: Array<{ width: number; height: number; scrollHeight: number; steps: CaptureStep[] }>;
}

export interface CaptureManifestV2 {
  page: string;
  source: string;
  capturedAt: string;
  variants: VariantManifest[];
  video: string | null;
  notes: string[];
}

const DEFAULT_VARIANT: Variant = { id: "default" };

async function captureVariant(browser: Browser, o: { name: string; url: string; dir: string; log?: (m: string) => void }, v: Variant): Promise<VariantManifest> {
  type Scroller = { element: boolean; height: number; scrollHeight: number; x: number; y: number };
  const out: VariantManifest = { id: v.id, label: v.label ?? null, viewports: [] };
  for (const vp of v.viewports ?? VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      reducedMotion: v.reducedMotion ?? "no-preference",
      colorScheme: v.colorScheme ?? "light",
    });
    await context.addInitScript(PAGE_HELPERS);
    if (v.initScript) await context.addInitScript({ content: v.initScript });
    const page = await context.newPage();
    await mkdir(path.join(o.dir, v.id, String(vp.width)), { recursive: true });
    const shots: CaptureStep[] = [];
    const shoot = async (index: number, y: number, kind: CaptureStep["kind"], label?: string) => {
      const file = `${v.id}/${vp.width}/${String(index).padStart(3, "0")}.png`;
      const target = v.element ? page.locator(v.element).first() : null;
      if (target && (await target.count())) await target.screenshot({ path: path.join(o.dir, file) });
      else await page.screenshot({ path: path.join(o.dir, file) });
      shots.push({ index, y, file, kind, ...(label ? { label } : {}) });
    };
    let scrollHeight = vp.height;
    if (v.mode === "timeline" && v.timeline) {
      // Installed, Playwright's clock still flows in real time; paused, only runFor moves it, so
      // the time a screenshot takes can't leak into the next frame (issue G5).
      await page.clock.install({ time: new Date("2026-09-28T10:00:00+05:30") });
      await page.clock.pauseAt(new Date("2026-09-28T10:00:01+05:30"));
      await page.goto(v.url ?? o.url, { waitUntil: "load", timeout: 120_000 });
      // Advance the fake clock until the page is ready (its own polling timers need ticks).
      let ticks = 0;
      for (let i = 0; i < 200 && !(await page.evaluate(v.timeline.ready).catch(() => false)); i++) {
        await page.clock.runFor(100);
        ticks += 100;
      }
      if (v.prepare) await page.evaluate(v.prepare);
      await page.clock.runFor(500);
      ticks += 500;
      // Trigger on an animation-frame boundary (the fake clock runs frames every 16 ms from
      // install), so two pages that became ready after different waits share the same frame phase.
      await page.clock.runFor((16 - (ticks % 16)) % 16);
      await page.evaluate(v.timeline.trigger);
      let t = 0;
      for (const [i, at] of v.timeline.at.entries()) {
        await page.clock.runFor(Math.max(0, Math.round((at - t) * 1000)));
        t = at;
        // Let queued work finish without moving any clock: React commits through MessageChannel
        // (not on the fake clock; two round trips run what was queued before them), then images
        // decode. A real-time wait would let a page's own real-time work drift.
        await page.evaluate(`(async () => {
          for (let i = 0; i < 2; i++) await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(0); c.port2.postMessage(0); });
          await Promise.all([...document.images].map((im) => (im.complete ? 0 : im.decode().catch(() => 0))));
        })()`);
        await shoot(i, 0, "step", `t=${at}s`);
      }
    } else {
      await page.goto(v.url ?? o.url, { waitUntil: "load", timeout: 120_000 });
      const webgl = (await page.evaluate("document.querySelectorAll('canvas').length > 0")) as boolean;
      await settle(page, { webgl });
      if (v.prepare) {
        await page.evaluate(v.prepare);
        await frames(page);
        await page.waitForTimeout(700);
      }
      if (v.mode === "single") await shoot(0, 0, "step");
      else {
        let sc = (await page.evaluate("__cap.find()")) as Scroller;
        await page.evaluate(`__cap.to(${sc.scrollHeight})`);
        await page.waitForTimeout(600);
        await page.evaluate("__cap.to(0)");
        await frames(page);
        sc = (await page.evaluate("__cap.find()")) as Scroller;
        scrollHeight = sc.scrollHeight;
        const pinned = (await page.evaluate("__cap.pinned()")) as Array<{ top: number; height: number; label: string }>;
        for (const [index, s] of planSteps(sc.scrollHeight, sc.height, pinned).entries()) {
          await page.evaluate(`__cap.to(${s.y})`);
          await frames(page);
          await page.waitForTimeout(350);
          await shoot(index, s.y, s.kind, s.label);
        }
      }
    }
    out.viewports.push({ width: vp.width, height: vp.height, scrollHeight, steps: shots });
    o.log?.(`  ${o.name} [${v.id}] @${vp.width}: ${shots.length} frame(s)`);
    await context.close();
  }
  return out;
}

/**
 * `merge`: re-capture only the given variants (and their viewports) into the existing manifest,
 * keeping every other variant and width as it was (a narrowed `--variant`/`--width` run).
 */
export async function capturePage(browser: Browser, o: { name: string; url: string; outDir: string; video?: boolean; variants?: Variant[]; merge?: boolean; log?: (m: string) => void }): Promise<CaptureManifestV2> {
  const dir = path.join(o.outDir, o.name);
  const previous = o.merge ? ((await readFile(path.join(dir, "manifest.json"), "utf8").then((t) => JSON.parse(t) as CaptureManifestV2, () => null)) ?? null) : null;
  if (previous) for (const v of o.variants ?? []) for (const vp of v.viewports ?? VIEWPORTS) await rm(path.join(dir, v.id, String(vp.width)), { recursive: true, force: true });
  else await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const manifest: CaptureManifestV2 = { page: o.name, source: o.url, capturedAt: new Date().toISOString(), variants: [], video: previous?.video ?? null, notes: [] };
  // One variant at a time, one browser context at a time (low-memory machine).
  for (const v of o.variants?.length ? o.variants : [DEFAULT_VARIANT]) {
    try {
      manifest.variants.push(await captureVariant(browser, { name: o.name, url: o.url, dir, log: o.log }, v));
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      manifest.notes.push(`Variant ${v.id} failed: ${msg}`);
      o.log?.(`  ${o.name} [${v.id}] FAILED: ${msg}`);
    }
  }

  if (o.video !== false) {
    const vp = VIEWPORTS[0];
    try {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, recordVideo: { dir: path.join(dir, ".video"), size: { width: 1280, height: 800 } } });
      await context.addInitScript(PAGE_HELPERS);
      const page = await context.newPage();
      await page.goto(o.url, { waitUntil: "load", timeout: 120_000 });
      await settle(page, { webgl: true });
      const sc = (await page.evaluate("__cap.find()")) as { x: number; y: number };
      // The wheel scrolls whatever is under the pointer: put it over the scroller.
      await page.mouse.move(sc.x, sc.y);
      const started = Date.now();
      while (Date.now() - started < 20_000) {
        await page.mouse.wheel(0, 160);
        await page.waitForTimeout(70);
        if ((await page.evaluate("__cap.atBottom()")) as boolean) break;
      }
      await page.waitForTimeout(800);
      const video = page.video();
      await context.close();
      if (video) {
        await video.saveAs(path.join(dir, "video.webm"));
        await video.delete();
        manifest.video = "video.webm";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      manifest.notes.push(/ffmpeg/i.test(msg) ? "No video: run `npx playwright install ffmpeg` once." : `No video: ${msg}`);
      o.log?.(`  ${o.name}: ${manifest.notes.at(-1)}`);
    }
    await rm(path.join(dir, ".video"), { recursive: true, force: true });
  }
  if (previous) {
    // New viewports replace the same widths; everything else is kept, in the old order.
    const fresh = new Map(manifest.variants.map((v) => [v.id, v]));
    const merged = previous.variants.map((old) => {
      const n = fresh.get(old.id);
      if (!n) return old;
      fresh.delete(old.id);
      const widths = new Set(n.viewports.map((vp) => vp.width));
      return { ...n, viewports: [...old.viewports.filter((vp) => !widths.has(vp.width)), ...n.viewports].sort((a, b) => b.width - a.width) };
    });
    manifest.variants = [...merged, ...fresh.values()];
    manifest.notes = [...previous.notes.filter((t) => !manifest.variants.some((v) => t.startsWith(`Variant ${v.id} failed`))), ...manifest.notes];
  }
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
