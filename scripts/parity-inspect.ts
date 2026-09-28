/**
 * `pnpm parity:inspect` — look into a parity report without opening it:
 *   steps <page> <variant> <width>             per-step pixelmatch % (scroll positions when they differ)
 *   strip <page> <variant> <width> <steps> <outDir>   design | app | diff, scaled, one PNG per step
 *   crop  <page> <variant> <width> <step> <x> <y> <w> <h> <out.png>   the same region at full size
 * Reads design/parity/report.html and design/{reference,actual,parity/diff}.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [cmd, page, variant, width, ...rest] = process.argv.slice(2);
const files = (n: string) => [`design/reference/${page}/${variant}/${width}/${n}.png`, `design/actual/${page}/${variant}/${width}/${n}.png`, `design/parity/diff/${page}--${variant}--${width}--${n}.png`];

async function main() {
  if (cmd === "steps") {
    const h = readFileSync("design/parity/report.html", "utf8");
    const sec = h.split('<section id="').slice(1).find((s) => s.startsWith(`${page}-${variant}-${width}"`));
    if (!sec) throw new Error("No such section in design/parity/report.html (run pnpm parity:report)");
    const rows = [...sec.matchAll(/#(\d+)<br>design y ([\d–]+)<br>app y ([\d–]+)(?:<br>([^<]*))?<br><b class="\w*">([\d.–]+)(?:% px)?/g)];
    console.log(rows.map((r) => `${r[1]}:${r[5]}${r[2] !== r[3] ? `[y ${r[2]}/${r[3]}]` : ""}${r[4] ? `(${r[4].replace("sticky ", "")})` : ""}`).join("  "));
  } else if (cmd === "strip") {
    const [steps, out] = rest;
    for (const i of steps.split(",")) {
      const f = files(i.padStart(3, "0"));
      const w = Number(width) > 800 ? 720 : 300;
      const meta = await sharp(f[0]).metadata();
      const h = Math.round(((meta.height ?? 1) / (meta.width ?? 1)) * w);
      const imgs = await Promise.all(f.map((x) => sharp(x).resize(w, h).png().toBuffer()));
      await sharp({ create: { width: w * 3 + 8, height: h, channels: 3, background: "#ff00ff" } })
        .composite(imgs.map((b, k) => ({ input: b, left: k * (w + 4), top: 0 })))
        .png()
        .toFile(path.join(out, `strip-${page}-${variant}-${width}-${i}.png`));
    }
  } else if (cmd === "crop") {
    const [step, x, y, w, h, out] = rest;
    const r = { left: +x, top: +y, width: +w, height: +h };
    const imgs = await Promise.all(files(step.padStart(3, "0")).map((f) => sharp(f).extract(r).png().toBuffer()));
    await sharp({ create: { width: +w * 3 + 8, height: +h, channels: 3, background: "#ff00ff" } }).composite(imgs.map((b, k) => ({ input: b, left: k * (+w + 4), top: 0 }))).png().toFile(out);
  } else throw new Error("Usage: pnpm parity:inspect steps|strip|crop <page> <variant> <width> …");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
