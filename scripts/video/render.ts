/**
 * `pnpm video:render [--film] [--walkthrough]`: the preview videos from the recorded footage
 * (video/preview/footage, `pnpm video:record`), cut with ffmpeg one shot at a time (low memory):
 *
 *   saakshi-launch-preview.mp4      the launch film (/brag-slim direction: documentary launch film, real
 *                                   footage only, one idea per shot, cuts on the beat of the bundled
 *                                   track, captions in Anek and IBM Plex Sans, voiceover off), 87.6 s
 *   saakshi-demo-3min-preview.mp4   the 3-minute walkthrough (the master plan's demo script, §12),
 *                                   burned-in captions + .srt, and the music bed alone (.m4a) for a
 *                                   later voiceover
 *
 * Captions and the end card are drawn by Chromium in the app's own fonts (public/fonts) and
 * overlaid; no number appears in a caption that is not on screen in the footage. Work files:
 * video/preview/work/ (not committed).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FONT_PRELOADS } from "../../app/font-preloads";
import { glyphSvg, LOGO_BITS } from "../../lib/glyph";
import { launchBrowser } from "../_capture";

const ROOT = process.cwd();
const PREVIEW = path.join(ROOT, "video", "preview");
const FOOTAGE = path.join(PREVIEW, "footage");
const WORK = path.join(PREVIEW, "work");
/** The brag video skill's bundled tracks and cue files (not in the repo: their licence is unconfirmed, docs/MANUAL_STEPS.md §9). */
const MUSIC = process.env.BRAG_MUSIC_DIR ?? path.join(ROOT, ".data", "music");
const W = 1920;
const H = 1080;
const FPS = 60;
export const END_NOTE = "Preview build. Photos, locations, fingerprints and rules are real; AI checks and litter masks are prototypes until the live pipeline is connected.";

interface Caption {
  /** Seconds into the shot. */
  at: number;
  until?: number;
  text: string;
  kicker?: string;
}
interface Shot {
  clip: string | "end";
  /** Seconds into the clip. */
  from?: number;
  /** Shot length (seconds); the film's come from the beat grid. */
  seconds?: number;
  /** Beats (film only): the cut lands on the beat. */
  beats?: number;
  /** Hold the last frame this long (walkthrough). */
  hold?: number;
  captions?: Caption[];
}

// ---------- the launch film: story from the brief, cut on vol. 11's beats
const FILM_TRACK = "happy-beats-business-moves-vol-11-by-ende-dot-app";
const FILM: Shot[] = [
  { clip: "intro", from: 0, beats: 3 },
  { clip: "hero-layers", from: 1, beats: 16, captions: [{ at: 0.6, text: "A field photo arrives.", kicker: "Saakshi" }, { at: 3.6, text: "It reads where and when it was taken, what is in it, and its fingerprint." }] },
  { clip: "chaos-to-order", from: 0.5, beats: 14, captions: [{ at: 0.6, text: "Every photo in the archive finds its place and its project." }] },
  { clip: "the-catch", from: 0.5, beats: 20, captions: [{ at: 0.6, text: "Four fakes are planted in the archive." }, { at: 4.4, text: "Each one is caught by a fixed rule, with its reason." }] },
  { clip: "measured", from: 0.5, beats: 14, captions: [{ at: 0.6, text: "Change is measured from the pixels, before and after." }] },
  { clip: "threads", from: 1.2, beats: 14, captions: [{ at: 0.6, text: "Every number has a thread to its photos." }] },
  { clip: "report", from: 1, beats: 12, captions: [{ at: 0.6, text: "Reports a funder can check, number by number." }] },
  { clip: "edited-link", from: 0.3, beats: 12, captions: [{ at: 0.4, text: "Faces stay blurred. Edit the link and the server refuses it." }] },
  { clip: "capture", from: 0.5, beats: 16, captions: [{ at: 0.6, text: "Be a witness: stand at the spot and take the photo.", kicker: "Capture, simulated camera" }] },
  { clip: "wall-arrival", from: 0.2, beats: 16, captions: [{ at: 0.6, text: "It lands on the Witness Wall with its score.", kicker: "Operator rehearsal" }] },
  { clip: "review-seal", from: 0.3, beats: 8, captions: [{ at: 0.5, text: "A person reviews every flag, with a note on the record." }] },
  { clip: "end" },
];

// ---------- the walkthrough: the master plan's demo script (§12), from the same footage
const WALK_TRACKS = ["happy-beats-business-moves-vol-1-by-ende-dot-app", "happy-beats-business-moves-vol-10-by-ende-dot-app"];
const WALK: Shot[] = [
  { clip: "intro", seconds: 3 },
  { clip: "hero-layers", seconds: 10, hold: 1, captions: [{ at: 0.4, until: 5, text: "Anyone can post a clean-up photo. How does a funder know it's real?", kicker: "Saakshi: proof, not just photos" }, { at: 5.4, text: "Saakshi reads each photo: where, when, what is in it, and its fingerprint." }] },
  { clip: "chaos-to-order", seconds: 9, hold: 1, captions: [{ at: 0.4, text: "The demo archive: Wikimedia Commons photos, sorted onto the map by place and project.", kicker: "Chaos to order" }] },
  { clip: "library", seconds: 7, hold: 2, captions: [{ at: 0.4, text: "The library: every photo on the map, with its band. Search with plain chips." }] },
  { clip: "drawer", seconds: 6, hold: 2, captions: [{ at: 0.4, text: "Open any photo and take it apart into its evidence layers." }] },
  { clip: "the-catch", seconds: 11, hold: 2, captions: [{ at: 0.4, until: 5.5, text: "Four fakes are planted in the archive.", kicker: "The catch" }, { at: 5.8, text: "Each is flagged by a fixed rule, with its reason. The fingerprint shows the reused photo." }] },
  { clip: "review-seal", seconds: 5, hold: 2, captions: [{ at: 0.4, text: "Flagged photos go to a reviewer: a note, then a decision on the record." }] },
  { clip: "how", seconds: 7, hold: 2, captions: [{ at: 0.4, text: "Rules decide, not the model: the same published weights for every photo." }] },
  { clip: "measured", seconds: 8, hold: 1, captions: [{ at: 0.4, text: "Before and after, the litter mask counts the pixels.", kicker: "Proof to story" }] },
  { clip: "project", seconds: 7, hold: 2, captions: [{ at: 0.4, text: "The project overview: every count is a database total, threaded to its photos." }] },
  { clip: "threads", seconds: 9, hold: 1, captions: [{ at: 0.4, text: "Every number has a thread to the photos behind it." }] },
  { clip: "report", seconds: 8, hold: 2, captions: [{ at: 0.4, text: "The public report: click a number, see its photos." }] },
  { clip: "evidence", seconds: 7, hold: 2, captions: [{ at: 0.4, text: "Each photo's evidence page: its layers, its ledger, and a history chain anyone can check." }] },
  { clip: "studio", seconds: 7, hold: 2, captions: [{ at: 0.4, text: "Studio: the report and posts for the campaign, faces blurred." }] },
  { clip: "edited-link", seconds: 7, hold: 1, captions: [{ at: 0.3, text: "Edit a public link to remove the blur and the server refuses it: signed transformations.", kicker: "Can't un-blur" }] },
  { clip: "capture", seconds: 6, hold: 4, captions: [{ at: 0.4, until: 4.6, text: "At the spot, the phone shows its location fix and the spot's ring.", kicker: "It keeps watching" }, { at: 5, text: "The camera here is simulated with an archive photo, so Saakshi sends it to review: the identical file was already submitted.", kicker: "Simulated camera" }] },
  { clip: "wall-arrival", seconds: 9, hold: 2, captions: [{ at: 0.4, text: "The check-in lands on the Witness Wall with its score.", kicker: "Operator rehearsal" }] },
  { clip: "spot", seconds: 6, hold: 2, captions: [{ at: 0.4, text: "The spot page: its litter trend, measured photo by photo, and where check-ins land." }] },
  { clip: "poster", seconds: 4, hold: 3, captions: [{ at: 0.4, text: "One A4 poster per spot. Built for Swachhata Hi Seva drives and the funders who back them." }] },
  { clip: "end", seconds: 10 },
];

const run = (args: string[]) =>
  new Promise<void>((res, rej) => {
    const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${args.slice(-1)[0]}: exit ${c}`))));
  });

function fontCss(): string {
  const file = (p: string) => pathToFileURL(path.join(ROOT, "public", p)).href;
  const [anek, plex] = FONT_PRELOADS;
  return `@font-face{font-family:'Anek Latin';src:url('${file(anek)}') format('woff2');font-weight:100 800;font-stretch:75% 125%}
@font-face{font-family:'IBM Plex Sans';src:url('${file(plex)}') format('woff2');font-weight:100 700}`;
}

/** Draws captions and end cards to PNGs in the app's fonts. */
async function drawCards(cards: Array<{ file: string; html: string }>) {
  const browser = await launchBrowser();
  try {
    const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
    for (const c of cards) {
      const htmlFile = path.join(WORK, "card.html");
      await writeFile(htmlFile, `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}
html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden;-webkit-font-smoothing:antialiased}
.shade{position:absolute;left:0;right:0;bottom:0;height:460px;background:linear-gradient(to top,rgba(14,11,26,.82),rgba(14,11,26,.5) 45%,rgba(14,11,26,0))}
.side{position:absolute;left:0;top:0;bottom:0;width:980px;background:linear-gradient(to right,rgba(14,11,26,.6),rgba(14,11,26,0))}
.cap{position:absolute;left:120px;bottom:104px;max-width:1280px;color:#fff;font-family:'Anek Latin',sans-serif;font-weight:620;font-size:60px;line-height:1.08;letter-spacing:-.01em;text-wrap:balance;text-shadow:0 2px 24px rgba(14,11,26,.5)}
.cap.left{bottom:auto;top:50%;transform:translateY(-50%);max-width:760px}
.kicker{font-family:'IBM Plex Sans',sans-serif;font-weight:500;font-size:26px;letter-spacing:.01em;color:#c4b2ff;margin-bottom:16px;text-shadow:none}
.end{position:absolute;inset:0;background:#0e0b1a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;font-family:'IBM Plex Sans',sans-serif}
.end .mark{display:flex;align-items:center;gap:22px;font-family:'Anek Latin';font-weight:650;font-size:44px}
.end h1{margin:0;font-family:'Anek Latin';font-weight:700;font-stretch:88%;font-size:132px;line-height:.92;letter-spacing:-.02em}
.end p{margin:0;max-width:1100px;text-align:center;font-size:27px;line-height:1.45;color:#b9b3cc}
</style></head><body>${c.html}</body></html>`);
      await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.screenshot({ path: c.file, omitBackground: true });
    }
  } finally {
    await browser.close();
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const captionHtml = (c: Caption, phone: boolean) => `${phone ? '<div class="side"></div>' : '<div class="shade"></div>'}<div class="cap${phone ? " left" : ""}">${c.kicker ? `<div class="kicker">${esc(c.kicker)}</div>` : ""}${esc(c.text)}</div>`;
const endHtml = () => {
  const logo = glyphSvg(LOGO_BITS, { on: "#9C7DFF", off: "rgba(255,255,255,0.10)" }).replace("<svg ", '<svg width="64" height="64" ');
  return `<div class="end"><div class="mark">${logo}<span>Saakshi</span></div><h1>Proof, not just photos.</h1><p>${esc(END_NOTE)}</p></div>`;
};

interface Manifest {
  clips: Array<{ id: string; file: string; seconds: number; width: number; height: number }>;
}

async function beatGrid(track: string): Promise<number[]> {
  const f = path.join(MUSIC, "cues", `${track}.music-cues.json`);
  const j = JSON.parse(await readFile(f, "utf8")) as { tempo: number; beats: Array<{ time: number }> };
  const beats = j.beats.map((b) => b.time);
  const period = 60 / j.tempo;
  // Past the analysed window, extend the grid at the track's tempo.
  while (beats.length < 400) beats.push(beats[beats.length - 1] + period);
  return beats;
}

async function cut(name: string, shots: Shot[], o: { film: boolean; total?: number }) {
  const manifest = JSON.parse(await readFile(path.join(FOOTAGE, "manifest.json"), "utf8")) as Manifest;
  const clipOf = (id: string) => manifest.clips.find((c) => c.id === id);
  // Shot lengths.
  const lengths: number[] = [];
  if (o.film) {
    const beats = await beatGrid(FILM_TRACK);
    let b = 0;
    let t = 0;
    for (const s of shots) {
      if (s.clip === "end") {
        lengths.push(Math.max(4, (o.total ?? t + 8) - t));
        continue;
      }
      b += s.beats ?? 8;
      const next = beats[b - 1 + 0] ?? t + (s.beats ?? 8) * 0.5;
      // The first cut falls on beat index `beats` (0-based grid starts at the first beat).
      lengths.push(next - t);
      t = next;
    }
  } else for (const s of shots) lengths.push((s.seconds ?? clipOf(s.clip)?.seconds ?? 6) + (s.hold ?? 0));

  // Cards.
  await mkdir(path.join(WORK, name), { recursive: true });
  const cards: Array<{ file: string; html: string }> = [];
  shots.forEach((s, i) => {
    const phone = (clipOf(s.clip)?.height ?? 0) > (clipOf(s.clip)?.width ?? 1);
    s.captions?.forEach((c, k) => cards.push({ file: path.join(WORK, name, `cap-${i}-${k}.png`), html: captionHtml(c, phone) }));
  });
  cards.push({ file: path.join(WORK, name, "end.png"), html: endHtml() });
  await drawCards(cards);

  // Segments, one ffmpeg at a time.
  const segs: string[] = [];
  const srt: string[] = [];
  let at = 0;
  for (const [i, s] of shots.entries()) {
    const len = lengths[i];
    const seg = path.join(WORK, name, `seg-${String(i).padStart(2, "0")}.mp4`);
    const caps = s.captions ?? [];
    if (s.clip === "end") {
      await run(["-loop", "1", "-t", len.toFixed(3), "-i", path.join(WORK, name, "end.png"), "-filter_complex", `[0:v]format=rgba,scale=${W}:${H},fps=${FPS},fade=t=in:st=0:d=0.6,format=yuv420p[v]`, "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(FPS), seg]);
    } else {
      const c = clipOf(s.clip);
      if (!c || !existsSync(path.join(ROOT, c.file))) throw new Error(`no footage for ${s.clip}: run pnpm video:record --only ${s.clip}`);
      const from = Math.min(s.from ?? 0, Math.max(0, c.seconds - 1));
      const avail = c.seconds - from;
      const play = Math.min(len, avail);
      const pad = Math.max(0, len - play);
      const phone = c.height > c.width;
      const inputs = ["-ss", from.toFixed(3), "-t", play.toFixed(3), "-i", path.join(ROOT, c.file)];
      caps.forEach((_, k) => inputs.push("-loop", "1", "-t", len.toFixed(3), "-i", path.join(WORK, name, `cap-${i}-${k}.png`)));
      const base = phone
        ? `color=c=0x0e0b1a:s=${W}x${H}:r=${FPS}:d=${len.toFixed(3)}[bg];[0:v]scale=-2:${H - 100},fps=${FPS}${pad ? `,tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : ""}[ph];[bg][ph]overlay=x=W-w-260:y=50:shortest=1[b0]`
        : `[0:v]scale=${W}:${H},setsar=1,fps=${FPS}${pad ? `,tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : ""}[b0]`;
      const chain = [base];
      caps.forEach((cap, k) => {
        const a = cap.at;
        // A caption ends before the next one starts (stagger, never a double exposure), else near the cut.
        const next = caps[k + 1];
        const b = Math.min(cap.until ?? (next ? next.at - 0.3 : len - 0.35), len - 0.2);
        chain.push(`[${k + 1}:v]format=rgba,fade=t=in:st=${a.toFixed(3)}:d=0.35:alpha=1,fade=t=out:st=${Math.max(a + 0.4, b - 0.35).toFixed(3)}:d=0.35:alpha=1[c${k}]`);
        chain.push(`[b${k}][c${k}]overlay=0:0:shortest=1[b${k + 1}]`);
        srt.push(`${srt.length + 1}\n${stamp(at + a)} --> ${stamp(at + b)}\n${cap.kicker ? `${cap.kicker}
` : ""}${cap.text}\n`);
      });
      chain.push(`[b${caps.length}]format=yuv420p[v]`);
      await run([...inputs, "-filter_complex", chain.join(";"), "-map", "[v]", "-t", len.toFixed(3), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(FPS), seg]);
    }
    segs.push(seg);
    at += len;
    process.stdout.write(`  ${name} ${i + 1}/${shots.length} ${s.clip} ${len.toFixed(2)} s\n`);
  }
  const list = path.join(WORK, name, "list.txt");
  await writeFile(list, segs.map((f) => `file '${f.replaceAll("\\", "/")}'`).join("\n"));
  const silent = path.join(WORK, name, "video.mp4");
  await run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);
  return { silent, total: at, srt: srt.join("\n") };
}

const stamp = (t: number) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

/** Music under the picture; the strongest settled frame becomes the poster and frame 0. */
async function finish(o: { silent: string; total: number; out: string; music: string; musicGain: number; poster: number; bed?: string }) {
  const jpg = o.out.replace(/\.mp4$/, ".jpg");
  await run(["-ss", o.poster.toFixed(3), "-i", o.silent, "-frames:v", "1", "-q:v", "2", jpg]);
  const fadeAt = Math.max(0, o.total - 3);
  await run([
    "-i", o.silent, "-i", o.music, "-i", jpg,
    "-filter_complex", `[0:v][2:v]overlay=0:0:enable='eq(n,0)'[v];[1:a]atrim=0:${o.total.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeAt.toFixed(3)}:d=3,volume=${o.musicGain}[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", o.total.toFixed(3), o.out,
  ]);
  if (o.bed) await run(["-i", o.music, "-filter_complex", `[0:a]atrim=0:${o.total.toFixed(3)},afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeAt.toFixed(3)}:d=3[a]`, "-map", "[a]", "-c:a", "aac", "-b:a", "192k", o.bed]);
}

async function main() {
  await mkdir(WORK, { recursive: true });
  const both = !process.argv.includes("--film") && !process.argv.includes("--walkthrough");
  if (both || process.argv.includes("--film")) {
    const track = path.join(MUSIC, `${FILM_TRACK}.mp3`);
    const total = 87.6;
    const f = await cut("film", FILM, { film: true, total });
    const out = path.join(PREVIEW, "saakshi-launch-preview.mp4");
    // Poster: the catch, captions settled (its shot starts at beat 33).
    const beats = await beatGrid(FILM_TRACK);
    await finish({ silent: f.silent, total: f.total, out, music: track, musicGain: 0.9, poster: beats[32] + 6 });
    await writeFile(path.join(PREVIEW, "saakshi-launch-preview.srt"), f.srt);
    console.log(`video/preview/saakshi-launch-preview.mp4: ${f.total.toFixed(1)} s`);
  }
  if (both || process.argv.includes("--walkthrough")) {
    // The bed: vol. 1 then vol. 10, crossfaded, long enough for three minutes.
    const bedSrc = path.join(WORK, "walk-bed.wav");
    await run(["-i", path.join(MUSIC, `${WALK_TRACKS[0]}.mp3`), "-i", path.join(MUSIC, `${WALK_TRACKS[1]}.mp3`), "-filter_complex", "[0:a][1:a]acrossfade=d=4:c1=tri:c2=tri[a]", "-map", "[a]", bedSrc]);
    const w = await cut("walk", WALK, { film: false });
    const out = path.join(PREVIEW, "saakshi-demo-3min-preview.mp4");
    await finish({ silent: w.silent, total: w.total, out, music: bedSrc, musicGain: 0.55, poster: 6, bed: path.join(PREVIEW, "saakshi-demo-3min-preview.music.m4a") });
    await writeFile(path.join(PREVIEW, "saakshi-demo-3min-preview.srt"), w.srt);
    console.log(`video/preview/saakshi-demo-3min-preview.mp4: ${w.total.toFixed(1)} s (+ .srt, .music.m4a)`);
  }
}

if (process.argv[1] && /render/.test(process.argv[1]))
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  });
