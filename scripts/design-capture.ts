/**
 * `pnpm design:capture [--page <name>] [--no-video] [--fixture]`: reference screenshots of the
 * design exports in design/export/*.html → design/reference/<page>/<width>/<step>.png + manifest.json
 * (+ video.webm). With no exports (or --fixture), it captures the fixture page
 * (tests/fixtures/design/fixture.html) so the tooling is always runnable. How it scrolls and waits: scripts/_capture.ts.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { capturePage, launchBrowser, pageSlug } from "./_capture";

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
      await capturePage(browser, { name, url: pathToFileURL(f).href, outDir, video: !process.argv.includes("--no-video"), log: console.log });
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
