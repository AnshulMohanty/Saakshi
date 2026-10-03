import "server-only";
/**
 * Witness Wall data (B5.8): the demo sites as spots, today's counters and latest arrivals from
 * the database (rule 1: SQL counts, never incremented in the browser), and, for an operator, a
 * pool of real demo photos to rehearse with (labelled as rehearsals, never counted).
 */
import { and, count, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import india from "../../../public/geo/india.json";
import type { DB } from "../db/client";
import { assets, projects, spots, type Asset } from "../db/schema";
import { startOfIstDay } from "../demo-apis";
import { heroProject } from "../demo/hero";
import { hexToBits } from "../glyph";
import { arrivalReason, placeShort, splitProjectName, stackLayout } from "../landing/copy";
import { screenState } from "../ai/questions";
import { THUMB } from "../media/derivatives";
import { FRAME } from "../motion/scenes/landing";
import { assetMode, numberPolicy, type DisplayPolicy } from "../provenance";
import type { MediaProvider } from "../providers/media";
import type { WallArrival, WallCounters, WallData } from "./types";

/** Today's Witness Capture counts (since midnight IST), from SQL. Mock-scored rows don't count in production. */
export async function wallCounters(db: DB, policy: DisplayPolicy, now = new Date()): Promise<WallCounters> {
  const since = startOfIstDay(now);
  const rows = await db.select({ band: assets.trustBand, provenance: assets.provenance }).from(assets).where(and(eq(assets.source, "witness"), gte(assets.createdAt, since)));
  const scored = rows.filter((r) => numberPolicy(assetMode(r.provenance), policy) !== "hide");
  const [{ n }] = await db.select({ n: count() }).from(assets).where(and(eq(assets.source, "witness"), gte(assets.createdAt, since)));
  return { total: n, verified: scored.filter((r) => r.band === "VERIFIED").length, flagged: scored.filter((r) => r.band === "FLAGGED").length };
}

export async function wallView(db: DB, media: MediaProvider, o: { appUrl: string; policy: DisplayPolicy; operator: boolean; now?: Date }): Promise<WallData> {
  const hero = await heroProject(db);
  const demo = await db.select().from(projects).where(eq(projects.source, "demo_archive"));
  const placed = demo
    .filter((p) => p.centerLat !== null && p.centerLng !== null)
    .sort((a, b) => Number(b.id === hero.project?.id) - Number(a.id === hero.project?.id))
    .map((p) => {
      const n = splitProjectName(p.name);
      return { key: p.slug ?? p.id, label: n.city ? `${n.name.replace(/ clean-up$/, "")}, ${n.city}` : n.name, lat: p.centerLat!, lng: p.centerLng!, isHero: p.id === hero.project?.id };
    });
  // Labels of sites within 6° would collide at the Wall's zoom: the later one goes under its pin.
  const spotsOut = stackLayout(placed, 6).map((p) => ({ k: p.key, label: p.label, lat: p.lat, lng: p.lng, labelBelow: p.stackBelow }));

  // A venue screen shows only moderated photos that are fit for it.
  const latest = (await db.select().from(assets).where(eq(assets.source, "witness")).orderBy(desc(assets.createdAt)).limit(25)).filter((a) => screenState(a) === "fit").slice(0, 5);
  const spotRows = latest.length ? await db.select({ id: spots.id, name: spots.name }).from(spots).where(inArray(spots.id, latest.map((a) => a.spotId).filter((x): x is string => !!x))) : [];
  const placeOf = (a: Asset) => spotRows.find((s) => s.id === a.spotId)?.name ?? placeShort(a.placeName) ?? demo.find((p) => p.id === a.projectId)?.name ?? "A new spot";
  const shown = (a: Asset) => numberPolicy(assetMode(a.provenance), o.policy) !== "hide";
  const arrivals: WallArrival[] = latest.map((a) => ({ id: a.id, src: media.url(a.cldPublicId, THUMB, { signed: true }), place: placeOf(a), reason: a.trustBand ? arrivalReason(a.trustReasons) : "Checking", score: shown(a) ? a.trustScore : null, band: shown(a) ? a.trustBand : null }));

  // Rehearsal pool: scored demo photos with their stored results (never counted).
  const pool = o.operator && demo.length ? await db.select().from(assets).where(and(inArray(assets.projectId, demo.map((p) => p.id)), isNotNull(assets.trustBand))).orderBy(assets.id).limit(40) : [];
  const dust = await db.select({ phash: assets.phash }).from(assets).where(isNotNull(assets.phash)).orderBy(assets.id).limit(60);
  const url = `${o.appUrl}/capture`;
  return {
    frame: { ...FRAME },
    // The official outline of India's dots (docs/map-data.md), not generic land: no neighbouring country is drawn.
    land: (india.dots as Array<[number, number]>).filter(([lng, lat]) => lng >= FRAME.lng0 - 1 && lng <= FRAME.lng1 + 1 && lat >= FRAME.lat0 - 1 && lat <= FRAME.lat1 + 1),
    dust: dust.map((d) => hexToBits(d.phash!)),
    spots: spotsOut,
    qr: { url, label: url.replace(/^https?:\/\//, "") },
    counters: await wallCounters(db, o.policy, o.now),
    arrivals,
    operator: o.operator,
    rehearsals: pool
      .filter((a) => a.trustScore !== null && a.trustBand)
      .map((a) => ({ src: media.url(a.cldPublicId, THUMB, { signed: true }), spot: demo.find((p) => p.id === a.projectId)?.slug ?? spotsOut[0]?.k ?? "", reason: arrivalReason(a.trustReasons), score: a.trustScore!, band: a.trustBand! })),
    live: true,
    rehearsalLabel: "Rehearsal: simulated arrival",
    opsHint: "Press A. Rehearsal arrivals are simulated and never counted.",
    rehearsalTag: "Rehearsal",
    counting: "db",
    seed: 7,
  };
}
