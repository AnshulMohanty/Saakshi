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
import { mkdir, rm, writeFile } from "node:fs/promises";
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

export async function capturePage(browser: Browser, o: { name: string; url: string; outDir: string; video?: boolean; log?: (m: string) => void }): Promise<CaptureManifest> {
  const dir = path.join(o.outDir, o.name);
  await rm(dir, { recursive: true, force: true });
  const manifest: CaptureManifest = { page: o.name, source: o.url, capturedAt: new Date().toISOString(), viewports: [], video: null, notes: [] };
  type Scroller = { element: boolean; height: number; scrollHeight: number; x: number; y: number };

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile });
    await context.addInitScript(PAGE_HELPERS);
    const page = await context.newPage();
    await page.goto(o.url, { waitUntil: "load", timeout: 120_000 });
    const webgl = await page.evaluate("document.querySelectorAll('canvas').length > 0") as boolean;
    await settle(page, { webgl });
    // Visit the bottom once so lazy sections load and pin-spacers get their final size.
    let sc = (await page.evaluate("__cap.find()")) as Scroller;
    await page.evaluate(`__cap.to(${sc.scrollHeight})`);
    await page.waitForTimeout(600);
    await page.evaluate("__cap.to(0)");
    await frames(page);
    sc = (await page.evaluate("__cap.find()")) as Scroller;
    const pinned = (await page.evaluate("__cap.pinned()")) as Array<{ top: number; height: number; label: string }>;
    const steps = planSteps(sc.scrollHeight, sc.height, pinned);
    await mkdir(path.join(dir, String(vp.width)), { recursive: true });
    const shots: CaptureStep[] = [];
    for (const [index, s] of steps.entries()) {
      await page.evaluate(`__cap.to(${s.y})`);
      await frames(page);
      await page.waitForTimeout(350);
      const file = `${vp.width}/${String(index).padStart(3, "0")}.png`;
      await page.screenshot({ path: path.join(dir, file) });
      shots.push({ index, y: s.y, file, kind: s.kind, ...(s.label ? { label: s.label } : {}) });
    }
    manifest.viewports.push({ width: vp.width, height: vp.height, scrollHeight: sc.scrollHeight, steps: shots });
    o.log?.(`  ${o.name} @${vp.width}: ${shots.length} step(s), ${sc.element ? "inner scroller" : "page"} height ${sc.scrollHeight}px${webgl ? ", canvas" : ""}`);
    await context.close();
  }

  if (o.video !== false) {
    const vp = VIEWPORTS[0];
    try {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, recordVideo: { dir: path.join(dir, ".video"), size: { width: 1280, height: 800 } } });
      await context.addInitScript(PAGE_HELPERS);
      const page = await context.newPage();
      await page.goto(o.url, { waitUntil: "load", timeout: 120_000 });
      await settle(page, { webgl: true });
      const sc = (await page.evaluate("__cap.find()")) as Scroller;
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
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
