import type { Metadata } from "next";
import { CaptureHarness } from "@/components/capture/design";
import type { SimResult } from "@/components/capture/use-sim-capture";
import { designArchive } from "@/lib/parity/archive";
import { skScore } from "@/lib/parity/sk";

export const metadata: Metadata = { title: "Parity: capture", robots: { index: false } };

/**
 * /dev/parity/capture: the capture screen in the prototype's review harness, on its hero photo,
 * sample spot and placeholder rules (CA:320-517; SK.score with bands 80/40). The product shows
 * the phone screen alone, scored by lib/trust.
 */
export default async function CaptureParity() {
  const { D, src } = await designArchive("capture");
  const facts = { inside: true, inWindow: true, dup: "none", watermark: false, screen: false, quality: "good", camera: true } as const;
  const result = (loc: "witness" | "none"): SimResult => {
    const r = skScore({ ...facts, loc });
    return { score: r.score, rows: r.rows.map((x) => ({ label: x.label, full: x.pts === x.max })) };
  };
  return (
    <CaptureHarness
      backHref="Saakshi App.html"
      cfg={{
        mode: "live",
        spotName: "Versova beach, pole 3",
        spotShort: "Pole 3",
        coords: "19.12650° N, 72.81560° E",
        feed: src(D.hero.src),
        hash: D.hero.hash,
        results: { witness: result("witness"), none: result("none") },
        bands: { verified: 80, review: 40 },
        dots: { live: { x: 52, y: 51 }, low: { x: 62, y: 38 } },
        seeHref: "Evidence Page.html",
        lowAccNote: "Location was weak, ±36 m",
      }}
    />
  );
}
