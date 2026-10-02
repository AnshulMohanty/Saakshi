import "server-only";
/**
 * /dev/parity Witness Wall fixture: WallData from the design's sample archive, with the
 * prototype's own simulated arrivals (pick(): photo (i·11+3) mod pool, outcomes 0,0,1,0,2,0 on
 * its placeholder rules) so the arrival sequence can be compared frame by frame (B5.3).
 */
import { DESIGN_FRAME } from "../motion/scenes/landing";
import { designArchive } from "../parity/archive";
import type { RehearsalPhoto, WallData } from "./types";

const PAGE = "witness-wall";

export async function wallFixture(): Promise<WallData> {
  const { D, src } = await designArchive(PAGE);
  const label = (s: { name: string; city: string }) => `${s.name.replace(" clean-up", "")}, ${s.city}`;
  const pool = D.photos.filter((p) => ["mumbai", "pune", "chennai"].includes(p.project));
  const outcome = [
    { score: 100, band: "VERIFIED" as const, reason: "Location, time and fingerprint check out" },
    { score: 75, band: "NEEDS_REVIEW" as const, reason: "Location permission denied" },
    { score: 75, band: "FLAGGED" as const, reason: "Same photo already used in another project" },
  ];
  const rehearsals: RehearsalPhoto[] = Array.from({ length: 12 }, (_, i) => {
    const p = pool[(i * 11 + 3) % pool.length];
    const o = outcome[[0, 0, 1, 0, 2, 0][i % 6]];
    return { src: src(`photos/${p.id}.jpg`), spot: p.project, ...o };
  });
  return {
    frame: { ...DESIGN_FRAME },
    land: D.land,
    dust: D.photos.filter((p) => p.hash).map((p) => p.hash),
    spots: Object.entries(D.spots).map(([k, s]) => ({ k, label: label(s), lat: s.lat, lng: s.lng, labelBelow: k === "pune" })),
    qr: { url: "https://saakshi.app/witness", label: "saakshi.app/witness" },
    counters: { total: 0, verified: 0, flagged: 0 },
    arrivals: [],
    operator: true,
    rehearsals,
    live: false,
    rehearsalLabel: "just now",
    opsHint: "Press A. Arrivals here are simulated.",
    rehearsalTag: null,
    counting: "local",
    seed: 7,
  };
}
