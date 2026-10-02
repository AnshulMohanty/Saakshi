import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { EvidencePage } from "@/components/evidence/evidence-page";
import { bitsToHex, diffCells } from "@/lib/glyph";
import { designArchive } from "@/lib/parity/archive";
import { heroLayer, heroWhen } from "@/lib/parity/hero";
import { skScore } from "@/lib/parity/sk";

export const metadata: Metadata = { title: "Parity: evidence page", robots: { index: false } };

/** /dev/parity/evidence-page: the evidence page on the prototype's hero photo and its data (EV:465-559). */
export default async function EvidenceParity() {
  const { D, src } = await designArchive("evidence-page");
  const r = skScore({ loc: "camera", inside: true, inWindow: true, dup: "none", watermark: false, screen: false, quality: "good", camera: true });
  let nearest = 64;
  for (const p of D.photos) if (p.hash) nearest = Math.min(nearest, diffCells(p.hash, D.hero.hash));
  const events = [
    { what: "Taken", when: "6 Jul 2024, 17:14:58 IST, from the camera file" },
    { what: "Imported into the demo archive", when: "27 Sep 2026, 11:02 IST" },
    { what: "Checked by the fixed rules: 90, Verified", when: "27 Sep 2026, 11:02 IST" },
    { what: "Public copy made, faces blurred, link signed", when: "27 Sep 2026, 11:03 IST" },
    { what: "Counted in Versova report, photos verified", when: "28 Sep 2026, 09:40 IST" },
  ];
  // The prototype's chain: sha256(prev | what | when).
  let prev = "0".repeat(64);
  const fixed = events.map((e) => {
    prev = createHash("sha256").update(`${prev}|${e.what}|${e.when}`).digest("hex");
    return { label: e.what, when: e.when, hash: `${prev.slice(0, 16)}…` };
  });
  const when = heroWhen(D);
  const tone = (x: (typeof r.rows)[number]) => (x.pts === x.max ? "good" : x.pts ? "warn" : "neutral") as "good" | "warn" | "neutral";
  return (
    <EvidencePage
      data={{
        code: "vsv-0142",
        title: "Versova beach, Mumbai",
        when,
        crumb: { label: "Versova beach clean-up", href: "Spot Page.html" },
        trust: { score: r.score, band: r.band, hiddenText: null, mock: false },
        viewer: {
          photo: { src: src(D.hero.src), alt: "Versova beach during a clean-up: a tractor loads debris, a horse cart waits. Faces blurred." },
          layer: heroLayer(D),
          mask: src(D.hero.mask),
          layers: [
            { name: "The photo", color: "var(--foreground)", detail: "The file as taken, 1600 × 1200 here. Faces blurred on every public copy." },
            { name: "Where and when", color: "var(--verified)", detail: "19.12644° N, 72.81559° E, altitude 23 m, 6 Jul 2024 17:14:58 IST. From the camera file; GPS accuracy is not recorded in imported files." },
            { name: "Fingerprint", color: "var(--primary)", detail: "The 8×8 perceptual hash of the pixels. Used to catch the same photo in any project, even after a crop." },
            { name: "What the AI sees", color: "var(--estimated)", detail: "Tractor, debris, horse cart, horse, one person. AI-estimated tags; they describe the photo but never become a number." },
            { name: "What we measured", color: "var(--measured)", detail: `Litter covers ${(D.hero.cover * 100).toFixed(1)}% of the frame, counted from mask pixels at threshold 0.50.` },
          ],
        },
        chips: r.rows.map((x, i) => ({ code: (["LOCATION_WITNESS", "LOCATION_EXIF", "TIME_IN_WINDOW", "UNIQUE", "AUTH_CLEAR"] as const)[i], text: x.label, tone: tone(x) })),
        ledger: r.rows.map((x, i) => ({ signal: (["provenance", "location", "time", "uniqueness", "authenticity"] as const)[i], label: x.label, note: x.note, pts: x.pts, max: x.max, tone: tone(x) })),
        fingerprint: { bits: D.hero.hash, hex: bitsToHex(D.hero.hash), text: `64-bit perceptual hash. Closest photo in any project differs in ${nearest} of 64 cells, so this is not a reuse.` },
        facts: [
          { k: "Spot", v: "Versova beach, Mumbai" },
          { k: "Project", v: "Versova beach clean-up" },
          { k: "Coordinates", v: "19.12644° N, 72.81559° E", mono: true },
          { k: "Altitude", v: "23 m" },
          { k: "Taken", v: "6 Jul 2024, 17:14:58 IST" },
          { k: "Location source", v: "Camera file" },
          { k: "Distance from site centre", v: "6 m" },
          { k: "Litter cover", v: `${(D.hero.cover * 100).toFixed(1)}%, Measured` },
        ],
        edits: [
          { name: "Crop", code: "c_fill,g_auto,w_1200,h_800", why: "Frames the public copy. The original is kept unchanged." },
          { name: "Blur faces", code: "e_blur_faces:1200", why: "Required on every public copy. Can't be removed from a signed link." },
          { name: "Format", code: "f_auto,q_auto", why: "Smaller file for phones. Pixels used for checks come from the original." },
          { name: "Signature", code: "s--tQ3v9XkP--", why: "Covers everything above. Edit one character and Cloudinary refuses the link." },
        ],
        publicUrl: "https://res.cloudinary.com/saakshi/image/upload/s--tQ3v9XkP--/c_fill,g_auto,w_1200,h_800/e_blur_faces:1200/f_auto,q_auto/v1727000000/evidence/vsv-0142.jpg",
        chain: { fixed, intact: true },
        more: [],
        credit: { before: "Photo: ", title: "Versova beach in Mumbai 2", href: "https://commons.wikimedia.org/wiki/File:Versova_beach_in_Mumbai_2.jpg", after: ", Shishirdasika, CC BY-SA 4.0, Wikimedia Commons. Faces blurred." },
        record: "Demo archive record",
        homeHref: "Saakshi Landing.html",
      }}
    />
  );
}
