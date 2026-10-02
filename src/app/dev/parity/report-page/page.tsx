import type { Metadata } from "next";
import { ReportPage } from "@/components/report/report-page";
import { designArchive } from "@/lib/parity/archive";
import type { NumberCard } from "@/lib/report/numbers";

export const metadata: Metadata = { title: "Parity: report page", robots: { index: false } };

/**
 * /dev/parity/report-page: the report page on the prototype's sample archive and numbers
 * (RP:414-471), with its tile order (flagged tiles moved to 8, 17, 23, 29) and its Method text.
 * "days" is the prototype's count on its capture date (28 Sep 2026).
 */
export default async function ReportParity() {
  const { D, src } = await designArchive("report-page");
  const P = D.photos;
  const find = (s: string) => P.find((p) => p.title.includes(s))!;
  const flags = [
    { p: P.find((p) => p.id === "p56")!, reason: "Same photo already used in Lake clean-up, Pune" },
    { p: find("Waste cocobeach"), reason: "Stock-site watermark" },
    { p: find("Batla House"), reason: "Taken 1,143 km from the site" },
    { p: find("Dharavi near Mahim"), reason: "The stamp says Delhi. The camera says Mumbai." },
  ];
  const fid = flags.map((f) => f.p.id);
  const mumbai = P.filter((p) => p.project === "mumbai" && !fid.includes(p.id));
  const tiles = [
    { src: "photos/hero.jpg", keys: "verified spots", alt: "Versova beach" },
    { src: "photos/before.jpg", keys: "before spots", alt: "Before the clean-up" },
    ...mumbai.map((p) => ({ src: `photos/${p.id}.jpg`, keys: "verified", alt: "" })),
    ...flags.map((f) => ({ src: `photos/${f.p.id}.jpg`, keys: "flagged", alt: "Flagged photo" })),
  ];
  for (const at of [8, 17, 23, 29]) {
    const t = tiles.pop()!;
    tiles.splice(Math.min(at, tiles.length), 0, t);
  }
  const N = (key: string, kind: NumberCard["kind"], value: string | number, label: string, sample = false) => ({ key, kind, value: String(value), label, tag: sample ? "sample value" : "", tagTone: sample ? ("review" as const) : ("muted" as const), hidden: false, basis: null });
  return (
    <ReportPage
      data={{
        kicker: "Demo archive report, 14 to 27 Sep 2026",
        title: "Versova beach clean-up, Mumbai",
        intro: "Every number below is linked to the photos behind it. Hover, tap or tab to a number and its threads draw to its photos.",
        numbers: [
          N("verified", "verified", mumbai.length + 1, "photos verified"),
          N("flagged", "flagged", 4, "photos flagged, with reasons"),
          N("before", "measured", "10%", "litter cover before, Measured, with mask"),
          N("after", "measured", "2%", "litter cover after, Measured, with mask", true),
          N("spots", "count", 1, "spot monitored"),
          N("checkins", "count", 5, "check-ins since the clean-up", true),
          N("days", "count", 1, "days since the last check-in", true),
        ],
        tiles: tiles.map((t, i) => ({ key: `${i}-${t.src}`, keys: t.keys.split(" "), src: src(t.src), alt: t.alt, href: "Evidence Page.html" })),
        flags: flags.map((f) => ({ key: f.p.id, src: src(`photos/${f.p.id}.jpg`), reason: f.reason, href: null })),
        method: [
          "Trust rules, fixed: taken in the app 10, location recorded 25, time recorded 25, fingerprint is new 25, no watermark or edits 15. Verified at 80 or more. Any hard fail is Flagged.",
          "Litter cover is measured on photo pixels at mask threshold 0.50. Camera angle, framing, season and light affect the result. Only photos of the same spot from the same pole are compared.",
          "Photos: Wikimedia Commons, credited on each evidence page, faces blurred. Four fakes were planted to show the checks.",
        ],
        pdfHref: null,
        homeHref: "Saakshi Landing.html",
        banner: null,
        summary: null,
        campaign: null,
      }}
    />
  );
}
