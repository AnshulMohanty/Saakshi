/** Temporary look-around: screenshots at a few scroll fractions + console errors. */
import { launchBrowser } from "./_capture";
const url = process.argv[2];
const out = process.argv[3];
const width = Number(process.argv[4] ?? 1440);
const fracs = (process.argv[5] ?? "0,0.05,0.12").split(",").map(Number);
(async () => {
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport: { width, height: width < 800 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 300)}`));
  await page.goto(url, { waitUntil: "load", timeout: 180_000 });
  await page.waitForTimeout(4000);
  const H = (await page.evaluate("document.documentElement.scrollHeight")) as number;
  for (const [i, f] of fracs.entries()) {
    await page.evaluate(`window.scrollTo(0, ${Math.round(f * H)})`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}-${i}.png` });
  }
  console.log("scrollHeight", H, "motion", await page.evaluate("document.getElementById('top')?.dataset.motion"));
  console.log(errs.slice(0, 20).join("\n") || "no console errors");
  await b.close();
})();
