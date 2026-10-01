/**
 * `pnpm design:capture [--page <name>] [--no-video] [--fixture]`: reference screenshots of the
 * design exports in design/export/*.html → design/reference/<page>/<variant>/<width>/<step>.png
 * + manifest.json (+ video.webm). With no exports (or --fixture), it captures the fixture page
 * (tests/fixtures/design/fixture.html) so the tooling is always runnable.
 *
 * States per page (Phase 8 brief B3), set through each page's own preview props
 * (window.__dcSetProps(window.__dcRootName(), …), the design runtime API) or by driving
 * the page: landing motion full | low-power | reduced (showMarks=false, showSample=false);
 * app demoState × theme × every rail screen; Witness Wall arrival on the fake clock at 0, 0.1,
 * 1.5, 2.3, 2.9, 3.6, 4.4, 7.4, 8.0 s (1920×1080 too); every capture state; spot page
 * showSample=false; and a few interaction states elsewhere. How it scrolls and waits:
 * scripts/_capture.ts.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { capturePage, launchBrowser, pageSlug, VIEWPORTS, type Variant } from "./_capture";

const props = (p: Record<string, unknown>) => `window.__dcSetProps && window.__dcSetProps(window.__dcRootName(), ${JSON.stringify(p)});`;
const wait = (ms: number) => `await new Promise((r) => setTimeout(r, ${ms}));`;
const clickText = (sel: string, text: string) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => (b.title || b.textContent || "").trim().startsWith(${JSON.stringify(text)}))?.click();`;
const WALL = { width: 1920, height: 1080, mobile: false } as const;
const NO_MARKS = props({ showMarks: false, showSample: false });

function variantsFor(slug: string): Variant[] | undefined {
  switch (slug) {
    case "saakshi-landing":
      return [
        { id: "full", label: "motion full", prepare: NO_MARKS },
        { id: "low-power", label: "motion low-power (deviceMemory 2)", initScript: "Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });", prepare: NO_MARKS },
        { id: "reduced", label: "motion reduced (prefers-reduced-motion)", reducedMotion: "reduce", prepare: NO_MARKS },
      ];
    case "witness-wall":
      return [
        // Idle on the fake clock: the prototype starts a simulated arrival 4 s after setup (autoSimulate).
        { id: "idle", viewports: [...VIEWPORTS, WALL], mode: "timeline", timeline: { ready: "!!window.gsap && !!document.querySelector('#ww-qr svg')", trigger: "0", at: [0] } },
        {
          id: "arrival",
          label: "press A, frames at the sequence's key times",
          viewports: [WALL],
          mode: "timeline",
          timeline: { ready: "!!window.gsap && !!document.querySelector('#ww-qr svg')", trigger: "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))", at: [0, 0.1, 1.5, 2.3, 2.9, 3.6, 4.4, 7.4, 8.0] },
        },
      ];
    case "saakshi-app": {
      const out: Variant[] = [];
      for (const demoState of ["normal", "loading", "empty", "error", "offline"])
        for (const theme of ["light", "dark"])
          for (const screen of ["Library", "Review", "Projects", "Studio"])
            out.push({
              id: `${demoState}-${theme}-${screen.toLowerCase()}`,
              mode: demoState === "normal" && theme === "light" ? "scroll" : "single",
              prepare: `(async () => { ${props({ demoState, theme })} ${wait(300)} ${clickText('nav[aria-label="Main"] button', screen)} ${wait(900)} })()`,
            });
      out.push({ id: "drawer", mode: "single", prepare: `(async () => { document.querySelector('#lib-grid button')?.click(); ${wait(1200)} })()` });
      out.push({ id: "drawer-exploded", mode: "single", prepare: `(async () => { document.querySelector('#lib-grid button')?.click(); ${wait(900)} ${clickText("aside button", "Take it apart")} ${wait(1400)} })()` });
      out.push({ id: "palette", mode: "single", prepare: `(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true })); ${wait(600)} })()` });
      return out;
    }
    case "capture": {
      const states = ["Live flow", "Permission prompt", "Location denied", "Low accuracy", "Offline", "Done"];
      const out: Variant[] = states.map((s) => ({ id: pageSlug(s), label: s, mode: "single", prepare: `(async () => { ${clickText('[role="radiogroup"] button', s)} ${wait(s === "Done" ? 2200 : 900)} })()` }));
      out.push(...states.map((s) => ({ id: `${pageSlug(s)}-screen`, label: `${s}, phone screen only`, mode: "single" as const, element: "#cam", prepare: `(async () => { ${clickText('[role="radiogroup"] button', s)} ${wait(s === "Done" ? 2200 : 900)} })()` })));
      out.push({ id: "shutter", label: "shutter sequence on the fake clock", viewports: [VIEWPORTS[0]], mode: "timeline", element: "#cam", timeline: { ready: "!!window.gsap && !!document.querySelector('#cam')", trigger: "document.querySelector('button[aria-label=\"Take photo\"]').click()", at: [0, 0.1, 0.35, 0.8, 1.05, 1.65, 1.9, 2.35, 2.8, 3.3, 4.1, 4.6] } });
      return out;
    }
    case "spot-page":
      return [{ id: "default", label: "showSample=false", prepare: props({ showSample: false }) }];
    case "evidence-page":
      return [
        { id: "default" },
        { id: "exploded", mode: "single", prepare: `(async () => { document.querySelector('button[aria-pressed]')?.click(); ${wait(1200)} })()` },
      ];
    case "how-it-works":
      return [
        { id: "default" },
        { id: "preset-google", mode: "single", prepare: `(async () => { ${clickText("#sim button", "Google image")} ${wait(900)} document.querySelector('#sim').scrollIntoView(); ${wait(300)} })()` },
        { id: "preset-reused", mode: "single", prepare: `(async () => { ${clickText("#sim button", "Reused photo")} ${wait(900)} document.querySelector('#sim').scrollIntoView(); ${wait(300)} })()` },
      ];
    case "demo-entry":
      return [
        { id: "default" },
        { id: "loops", label: "loops on the fake clock", viewports: [VIEWPORTS[0]], mode: "timeline", timeline: { ready: "!!window.gsap", trigger: "0", at: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5] } },
      ];
    case "report-page":
      return [
        { id: "default" },
        { id: "hover-verified", mode: "single", prepare: `(async () => { document.querySelector('[data-num="verified"]')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); document.querySelector('[data-num="verified"]')?.focus(); ${wait(900)} })()` },
      ];
    case "qr-poster":
      return [{ id: "default", mode: "single" }];
    default:
      return undefined;
  }
}

async function main() {
  const root = process.cwd();
  const only = process.argv.includes("--page") ? process.argv[process.argv.indexOf("--page") + 1]?.toLowerCase() : null;
  const exportDir = path.join(root, "design", "export");
  let files = (await readdir(exportDir).catch(() => [])).filter((f) => /\.html?$/i.test(f)).map((f) => path.join(exportDir, f));
  if (!files.length || process.argv.includes("--fixture")) {
    if (!files.length) console.log("design/export is empty: capturing the fixture page instead.");
    files = [path.join(root, "tests", "fixtures", "design", "fixture.html")];
  }
  if (only) files = files.filter((f) => pageSlug(path.basename(f)).includes(pageSlug(only)));
  if (!files.length) throw new Error(`No export matches --page ${only}`);

  const browser = await launchBrowser();
  const outDir = path.join(root, "design", "reference");
  const started = Date.now();
  try {
    for (const f of files) {
      const name = pageSlug(path.basename(f));
      console.log(`${path.basename(f)} → design/reference/${name}/`);
      await capturePage(browser, { name, url: pathToFileURL(f).href, outDir, video: !process.argv.includes("--no-video"), variants: variantsFor(name), log: console.log });
    }
  } finally {
    await browser.close();
  }
  console.log(`\nCaptured ${files.length} page(s) in ${((Date.now() - started) / 1000).toFixed(1)} s. Next: pnpm parity:capture <route>, then pnpm parity:report.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
