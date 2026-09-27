/**
 * Generates the tiny synthetic images in tests/fixtures. Deterministic; re-run with `pnpm fixtures`.
 * Outputs are committed so tests don't depend on this script.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "tests", "fixtures");

/** Small seeded PRNG (mulberry32) so blob positions are reproducible. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 240;
const H = 180;

/** A park: sky gradient, grass, three trees and a bench. */
const sceneA = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7fb6e8"/><stop offset="1" stop-color="#d9ecfa"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect y="110" width="${W}" height="70" fill="#5c8f3a"/>
  <rect x="38" y="70" width="8" height="45" fill="#6b4a2b"/><circle cx="42" cy="62" r="24" fill="#2f6b2a"/>
  <rect x="118" y="60" width="10" height="55" fill="#6b4a2b"/><circle cx="123" cy="50" r="30" fill="#2a5e25"/>
  <rect x="196" y="78" width="7" height="38" fill="#6b4a2b"/><circle cx="199" cy="70" r="19" fill="#357a2f"/>
  <rect x="150" y="128" width="54" height="8" fill="#8a5a33"/><rect x="154" y="136" width="4" height="12" fill="#5a3a20"/>
  <rect x="196" y="136" width="4" height="12" fill="#5a3a20"/>
  <circle cx="210" cy="24" r="12" fill="#fff4b0"/>
</svg>`;

/** A street: buildings and diagonal road markings — structurally unrelated to scene A. */
const sceneB = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#3b3f46"/>
  <rect x="0" y="0" width="70" height="120" fill="#c9b79c"/><rect x="80" y="20" width="60" height="100" fill="#9aa5b1"/>
  <rect x="150" y="5" width="90" height="115" fill="#e0d6c2"/>
  ${Array.from({ length: 6 }, (_, i) => `<rect x="${10 + (i % 3) * 18}" y="${15 + Math.floor(i / 3) * 40}" width="10" height="16" fill="#445"/>`).join("")}
  <polygon points="0,180 240,120 240,140 20,180" fill="#f2f2f2"/>
  <polygon points="60,180 240,150 240,160 100,180" fill="#f2d24a"/>
</svg>`;

/** Grass with bright/saturated "litter" blobs, for the mock extractMask. */
function litterScene() {
  const rand = rng(42);
  const colors = ["#e63946", "#f1faee", "#1d3557", "#ffb703", "#ffffff", "#e76f51"];
  const blobs = Array.from({ length: 14 }, (_, i) => {
    const x = Math.round(10 + rand() * (W - 30));
    const y = Math.round(10 + rand() * (H - 30));
    const w = Math.round(6 + rand() * 14);
    const h = Math.round(4 + rand() * 10);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${colors[i % colors.length]}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#4f8a2e"/>
    <rect y="120" width="${W}" height="60" fill="#6b9a3c"/>${blobs}</svg>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const a = await sharp(Buffer.from(sceneA)).png().toBuffer();
  const b = await sharp(Buffer.from(sceneB)).png().toBuffer();

  const files: Record<string, Buffer> = {
    "scene-a.png": a,
    // Near-duplicate of scene A: downscaled and heavily recompressed.
    "scene-a-copy.jpg": await sharp(a).resize(160, 120).jpeg({ quality: 50 }).toBuffer(),
    "scene-b.png": b,
    // Scene A as a phone-style JPEG with GPS (Bengaluru), timestamp and camera EXIF.
    "geotagged.jpg": await sharp(a)
      .jpeg({ quality: 85 })
      .withExif({
        IFD0: { Make: "SaakshiFixture", Model: "Synthetic-1" },
        IFD2: { DateTimeOriginal: "2025:03:14 09:30:00", OffsetTimeOriginal: "+05:30" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "12/1 58/1 1800/100",
          GPSLongitudeRef: "E",
          GPSLongitude: "77/1 35/1 4056/100",
        },
      })
      .toBuffer(),
    "litter-grass.png": await sharp(Buffer.from(litterScene())).png().toBuffer(),
  };

  for (const [name, buf] of Object.entries(files)) {
    await writeFile(path.join(OUT, name), buf);
    console.log(`${name.padEnd(18)} ${buf.length} bytes`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
