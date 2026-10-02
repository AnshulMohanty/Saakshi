import type { Metadata } from "next";
import { DemoEntry } from "@/components/demo/demo-entry";
import { designSrc } from "@/lib/parity/archive";

export const metadata: Metadata = { title: "Parity: demo entry", robots: { index: false } };

/** /dev/parity/demo-entry: the role cards on the prototype's own photos (DE:376-430, 489). */
export default async function DemoEntryParity() {
  const src = await designSrc("demo-entry");
  const ids = ["p02", "p05", "p40", "p08", "p24", "p12", "p44", "p17", "p28", "p56", "p46", "p30"];
  return (
    <DemoEntry
      data={{
        volunteer: { photo: src("photos/hero.jpg"), place: "Versova beach", time: "17:14", score: 100, band: "VERIFIED", href: "#volunteer" },
        manager: { tiles: ids.map((id) => ({ src: src(`photos/${id}.jpg`), flagged: id === "p56" })), groups: [0, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 2], labels: ["Versova 6", "Pune 3", "Chennai 3"], href: "#manager" },
        funder: { project: "Versova beach clean-up", verified: "27", tiles: ["p02", "p08", "hero", "p17", "p12"].map((id) => src(`photos/${id}.jpg`)), href: "#funder" },
        footnote: "The demo runs on the demo archive: Wikimedia Commons photos with credits, and four planted fakes. Nothing you do here changes a real project.",
        homeHref: "Saakshi Landing.html",
        howHref: "How It Works.html",
        seed: 3,
      }}
    />
  );
}
