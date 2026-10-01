/**
 * `pnpm video:record [--only id,id] [--base <url>] [--scale 0.6667]`: real footage of the product for
 * the preview videos → video/preview/footage/<clip>.mp4 + manifest.json.
 *
 * Run it against the production build in preview mode (`DEMO_PREVIEW=1 pnpm build && pnpm start`;
 * see `pnpm video:final`). Every clip is frame-stepped: Playwright's fake clock is paused and moved
 * one frame (1/60 s) at a time, so GSAP's ticker, Lenis, timers and the WebGL render all advance
 * exactly one frame; scroll positions are set per frame; each frame is screenshotted after images
 * decode and streamed to ffmpeg (nothing is kept in memory). One clip, one browser context at a
 * time (low-memory machine). --scale 0.6667 records 1280×720 instead of 1920×1080.
 */
import "../_env";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import { launchBrowser } from "../_capture";

const arg = (flag: string) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const BASE = (arg("--base") ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ONLY = arg("--only")?.split(",");
const SCALE = Number(arg("--scale") ?? 1);
const OUT = path.join(process.cwd(), "video", "preview", "footage");
const FPS = 60;

interface Clip {
  id: string;
  /** What it shows (manifest, captions). */
  shows: string;
  path: string | ((ids: Ids) => string);
  seconds: number;
  phone?: boolean;
  /** First visit: the ink-drop intro plays. */
  firstVisit?: boolean;
  /** JS that is true once the page is ready (polled on the fake clock). */
  ready?: string;
  /** Scroll from the top of `section` (fraction `from`) to its end (fraction `to`) over the clip. */
  scroll?: { section: string; from?: number; to?: number };
  /** Static scroll before the clip starts: an element to bring to the top. */
  at?: string;
  /** JS run at given seconds into the clip (clicks, keys, hovers). */
  events?: Array<{ t: number; js: string }>;
  /** Real-time setup before the clock is paused (typing into a field, for instance). */
  setup?: (page: Page) => Promise<void>;
  /** Extra context options. */
  init?: string;
}
interface Ids {
  asset: string;
  report: string;
  /** The hero still (a signed, face-blurred Commons photo): the fake camera's picture. */
  hero: string;
  spot: { lat: number; lng: number } | null;
}

const click = (sel: string) => `document.querySelector(${JSON.stringify(sel)})?.click()`;
const clickText = (scope: string, text: string) => `[...document.querySelectorAll(${JSON.stringify(scope)})].find((b) => (b.textContent || "").trim().startsWith(${JSON.stringify(text)}))?.click()`;
const hover = (sel: string) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); el?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); el?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false })); el?.focus?.(); })()`;

export const CLIPS: Clip[] = [
  { id: "intro", shows: "First visit: the ink-drop intro, then the hero still", path: "/", seconds: 3, firstVisit: true },
  { id: "hero-layers", shows: "Chapter 1: one photo taken apart into its evidence layers, then sealed with its score", path: "/", seconds: 10, ready: "!!document.querySelector('[data-stage=\"on\"]')", scroll: { section: "#ch1" } },
  { id: "chaos-to-order", shows: "Chapter 2: the archive's photos fly onto the map and stack by project", path: "/", seconds: 9, scroll: { section: "#ch2" } },
  { id: "the-catch", shows: "Chapter 3: the four planted fakes caught, each with its reason, and the fingerprint diff", path: "/", seconds: 11, scroll: { section: "#ch3" } },
  { id: "measured", shows: "Chapter 4: the litter mask sweeps the before and after photos, with the measured cover", path: "/", seconds: 8, scroll: { section: "#ch4" } },
  { id: "threads", shows: "Chapter 5: every number on the report has a thread to its photos", path: "/", seconds: 9, scroll: { section: "#ch5", to: 0.75 }, events: [{ t: 6, js: hover("#ch5 [data-num]") }] },
  { id: "edited-link", shows: "Chapter 6: remove the signature from a public link and the server refuses it (401)", path: "/", seconds: 7, at: "#ch6", events: [{ t: 2, js: `document.querySelector('#ch6 button[aria-label^="Remove signature"]')?.click()` }] },
  { id: "wall-arrival", shows: "Witness Wall, operator rehearsal (labelled): a check-in lands on the map with its score", path: "/witness?operator=rehearsal", seconds: 9, ready: "!!document.querySelector('[data-wall-ready]')", events: [{ t: 0.5, js: "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))" }] },
  { id: "library", shows: "Library: the dot-field map with band pins, then a search chip", path: "/library", seconds: 7, events: [{ t: 3, js: `(() => { const i = document.querySelector('input[aria-label="Search photos"]'); if (!i) return; i.focus(); i.value = "flagged"; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()` }] },
  { id: "drawer", shows: "Evidence drawer: the photo taken apart into its layers", path: "/library", seconds: 6, events: [{ t: 0.5, js: click("#lib-grid button") }, { t: 2.5, js: clickText("aside button", "Take it apart") }] },
  { id: "review-seal", shows: "Review: a reviewer's note, approve, and the seal", path: "/review", seconds: 5, events: [{ t: 0.8, js: `(() => { const t = document.querySelector("textarea"); if (!t) return; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, "Checked on site: same bridge, same morning."); t.dispatchEvent(new Event("input", { bubbles: true })); })()` }, { t: 2.2, js: "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))" }] },
  { id: "project", shows: "Project overview: KPI threads and the mask sweep", path: "/projects/demo-hero-cleanup", seconds: 7, events: [{ t: 2.5, js: hover("[data-kpi]") }] },
  { id: "report", shows: "Public report: numbers with threads to their photos", path: (i) => `/r/${i.report}`, seconds: 8, events: [{ t: 2, js: hover('[data-num="photos_verified"]') }, { t: 5, js: hover('[data-num="photos_flagged"]') }] },
  { id: "evidence", shows: "Public evidence page: layers, the trust ledger and the history chain", path: (i) => `/e/${i.asset}`, seconds: 7, events: [{ t: 2, js: click('button[aria-pressed]') }] },
  { id: "spot", shows: "Spot page: the trend and the check-in scrubber", path: "/spots/demo-hero-cleanup-spot-1", seconds: 6 },
  { id: "poster", shows: "The spot's QR poster (one A4 sheet): scan, photograph the spot, watch it count", path: "/spots/demo-hero-cleanup-spot-1/poster", seconds: 4 },
  { id: "studio", shows: "Studio: the A4 report and the posts, faces blurred, every number from the report", path: "/studio", seconds: 7, events: [{ t: 3, js: hover("[data-num]") }] },
  { id: "how", shows: "How it works: the trust simulator", path: "/how-it-works", seconds: 7, at: "#sim", events: [{ t: 1.5, js: clickText("#sim button", "Google image") }, { t: 4.5, js: clickText("#sim button", "Real witness photo") }] },
  // The camera is Chromium's fake device playing a demo photo; the location is the spot's own. The photo is a real Commons
  // photo already in the archive, so the pipeline may well flag it as reused: whatever it decides is what the clip shows.
  { id: "capture", shows: "Capture on a phone at the demo spot: the HUD with the GPS ring, the shutter, the pipeline sheet", path: "/capture?spot=demo-hero-cleanup-spot-1", seconds: 10, phone: true, events: [{ t: 3, js: click('button[aria-label="Take photo"]') }] },
];

async function ids(): Promise<Ids> {
  const html = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(120_000) }).then((r) => r.text());
  const asset = /\/e\/([0-9a-f-]{36})/.exec(html)?.[1];
  const report = /\/r\/([0-9a-f-]{36})/.exec(html)?.[1];
  if (!asset || !report) throw new Error("The landing links no evidence or report page: import the demo first (pnpm demo:reset).");
  const hero = (/id="hero-still" src="([^"]+)"/.exec(html)?.[1] ?? "").replaceAll("&amp;", "&");
  // The spot's coordinates, as its poster prints them ("19.1351° N, 72.8146° E").
  const poster = await fetch(`${BASE}/spots/demo-hero-cleanup-spot-1/poster`).then((r) => r.text());
  const c = /(d+.d+)° ([NS]), (d+.d+)° ([EW])/.exec(poster);
  const spot = c ? { lat: Number(c[1]) * (c[2] === "S" ? -1 : 1), lng: Number(c[3]) * (c[4] === "W" ? -1 : 1) } : null;
  return { asset, report, hero, spot };
}

/** Run queued work without moving any clock, then wait for images (as scripts/_capture.ts timelines do). */
const SETTLE = `(async () => {
  for (let i = 0; i < 2; i++) await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(0); c.port2.postMessage(0); });
  await Promise.all([...document.images].map((im) => (im.complete ? 0 : im.decode().catch(() => 0))));
})()`;

/** A short MJPEG of the hero still for Chromium's fake camera. */
async function fakeCamera(I: Ids): Promise<string> {
  const jpg = path.join(OUT, "camera.jpg");
  const mjpeg = path.join(OUT, "camera.mjpeg");
  const bytes = Buffer.from(await (await fetch(`${BASE}${I.hero}`, { headers: { accept: "image/jpeg" } })).arrayBuffer());
  await writeFile(jpg, bytes);
  await new Promise<void>((res, rej) => spawn("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", jpg, "-t", "4", "-r", "30", "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720", "-q:v", "3", "-f", "mjpeg", mjpeg]).on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg: camera")))));
  return mjpeg;
}

async function record(clip: Clip, I: Ids) {
  const camera = clip.phone ? await fakeCamera(I) : null;
  const browser = await launchBrowser(camera ? { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${camera}`] } : {});
  const w = Math.round((clip.phone ? 390 : 1920) * SCALE);
  const h = Math.round((clip.phone ? 844 : 1080) * SCALE);
  const file = path.join(OUT, `${clip.id}.mp4`);
  const errors: string[] = [];
  try {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: clip.phone ? 2 : 1,
      isMobile: !!clip.phone,
      hasTouch: !!clip.phone,
      ...(clip.phone ? { permissions: ["geolocation", "camera"], geolocation: { latitude: I.spot?.lat ?? 0, longitude: I.spot?.lng ?? 0, accuracy: 6 } } : {}),
    });
    if (!clip.firstVisit) await context.addInitScript(`try{localStorage.setItem("saakshi-intro-seen","1")}catch(e){}`);
    if (clip.init) await context.addInitScript({ content: clip.init });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
    await page.clock.install({ time: new Date("2026-10-02T10:00:00+05:30") });
    await page.clock.pauseAt(new Date("2026-10-02T10:00:01+05:30"));
    const url = `${BASE}${typeof clip.path === "function" ? clip.path(I) : clip.path}`;
    await page.goto(url, { waitUntil: "load", timeout: 180_000 });
    await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => true);
    if (clip.ready) for (let i = 0; i < 300 && !(await page.evaluate(clip.ready).catch(() => false)); i++) await page.clock.runFor(100);
    else if (!clip.firstVisit) await page.clock.runFor(1500);
    if (clip.setup) await clip.setup(page);
    // Scroll range in page pixels.
    let from = 0;
    let to = 0;
    if (clip.scroll || clip.at) {
      const sel = clip.scroll?.section ?? clip.at!;
      const r = (await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top + scrollY, height: b.height }; })()`)) as { top: number; height: number } | null;
      if (!r) throw new Error(`${clip.id}: no ${sel}`);
      const span = Math.max(0, r.height - h);
      from = r.top + span * (clip.scroll?.from ?? 0);
      to = clip.scroll ? r.top + span * (clip.scroll.to ?? 1) : from;
      await page.evaluate(`window.scrollTo(0, ${Math.round(from)})`);
      await page.clock.runFor(600);
    }
    await page.evaluate(SETTLE);

    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise<void>((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));
    const frames = Math.round(clip.seconds * FPS);
    const events = [...(clip.events ?? [])].sort((a, b) => a.t - b.t);
    let elapsed = 0;
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      while (events.length && events[0].t <= t) await page.evaluate(events.shift()!.js).catch((e: unknown) => errors.push(`event: ${e instanceof Error ? e.message : e}`));
      if (clip.scroll) {
        const p = frames > 1 ? f / (frames - 1) : 1;
        const eased = p * p * (3 - 2 * p);
        await page.evaluate(`window.scrollTo(0, ${Math.round(from + (to - from) * eased)})`);
      }
      // 1/60 s on the fake clock: 16 or 17 ms so the clip keeps exact time.
      const next = Math.round(((f + 1) * 1000) / FPS);
      await page.clock.runFor(next - elapsed);
      elapsed = next;
      await page.evaluate(SETTLE);
      const jpg = await page.screenshot({ type: "jpeg", quality: 90 });
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await done;
    await context.close();
    return { id: clip.id, file: path.relative(process.cwd(), file).replaceAll("\\", "/"), shows: clip.shows, url, seconds: clip.seconds, fps: FPS, frames, width: w * (clip.phone ? 2 : 1), height: h * (clip.phone ? 2 : 1), mode: "frame-stepped (Playwright fake clock, 1/60 s per frame)", errors };
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const I = await ids();
  const manifestFile = path.join(OUT, "manifest.json");
  const manifest: { recordedAt: string; base: string; clips: Array<Record<string, unknown>> } = await import("node:fs/promises").then((fs) => fs.readFile(manifestFile, "utf8").then((t) => JSON.parse(t), () => ({ recordedAt: "", base: BASE, clips: [] })));
  for (const clip of CLIPS.filter((c) => !ONLY || ONLY.includes(c.id))) {
    const started = Date.now();
    process.stdout.write(`${clip.id} (${clip.seconds} s)… `);
    try {
      const m = await record(clip, I);
      manifest.clips = [...manifest.clips.filter((c) => c.id !== clip.id), m];
      console.log(`${m.frames} frames in ${Math.round((Date.now() - started) / 1000)} s${m.errors.length ? `; page errors: ${m.errors.slice(0, 2).join(" | ")}` : ""}`);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
      process.exitCode = 1;
    }
    manifest.recordedAt = new Date().toISOString();
    manifest.base = BASE;
    manifest.clips.sort((a, b) => CLIPS.findIndex((c) => c.id === a.id) - CLIPS.findIndex((c) => c.id === b.id));
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  }
}

if (process.argv[1] && /record/.test(process.argv[1]))
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  });
