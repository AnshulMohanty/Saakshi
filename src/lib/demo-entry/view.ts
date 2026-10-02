import "server-only";
/**
 * Demo entry data: the three role cards on our demo projects (B5.4). The volunteer card shows a
 * verified hero-project photo with its own place, time and score; the manager card twelve demo
 * photos with a planted fake outlined; the funder card the hero project's SQL count of verified
 * photos and its latest report. Mock-derived numbers follow the display policy.
 */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { DemoEntryData } from "@/components/demo/demo-entry";
import { offsetMinutes } from "../charts/time-axis";
import { getConfig } from "../config";
import type { DB } from "../db/client";
import { assets, projects, reports, type Asset } from "../db/schema";
import { heroProject } from "../demo/hero";
import { placeShort, splitProjectName } from "../landing/copy";
import { countWord } from "../landing/count-word";
import { THUMB } from "../media/derivatives";
import type { Transform } from "../media/transform";
import { assetMode, hidesMock, numberPolicy, type DisplayPolicy } from "../provenance";
import type { MediaProvider } from "../providers/media";

const PHONE: Transform = [{ crop: "fill", gravity: "auto", width: 300, height: 540 }, { effect: "blur_faces" }, { format: "auto", quality: "auto" }];
/** The prototype's tile order (DE:468): which column (project) each of the twelve tiles lands in. */
export const MANAGER_GROUPS = [0, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 2];

export async function demoEntryView(db: DB, media: MediaProvider, policy: DisplayPolicy): Promise<DemoEntryData> {
  const off = offsetMinutes(getConfig().env.EXIF_DEFAULT_UTC_OFFSET);
  const hero = await heroProject(db);
  const demo = (await db.select().from(projects).where(eq(projects.source, "demo_archive")).orderBy(asc(projects.createdAt)))
    .sort((a, b) => Number(b.id === hero.project?.id) - Number(a.id === hero.project?.id))
    .slice(0, 3);
  const rows = demo.length ? await db.select().from(assets).where(and(inArray(assets.projectId, demo.map((p) => p.id)), isNotNull(assets.trustBand))).orderBy(desc(assets.trustScore), asc(assets.id)) : [];
  const url = (a: Asset, t: Transform) => media.url(a.cldPublicId, t, { signed: true });
  const shown = (a: Asset) => numberPolicy(assetMode(a.provenance), policy) !== "hide";

  const heroRows = rows.filter((a) => a.projectId === hero.project?.id);
  const v = heroRows.find((a) => a.trustBand === "VERIFIED" && a.capturedAt && !a.testCase) ?? heroRows[0];
  const hhmm = (d: Date) => new Date(d.getTime() + off * 60_000).toISOString().slice(11, 16);

  // Manager: each column holds its project's verified photos, a planted fake last.
  const need = [0, 1, 2].map((g) => MANAGER_GROUPS.filter((x) => x === g).length);
  const picked = demo.map((p, g) => {
    const mine = rows.filter((a) => a.projectId === p.id);
    const fake = mine.find((a) => a.testCase && a.trustBand === "FLAGGED");
    const real = mine.filter((a) => a.trustBand === "VERIFIED" && !a.testCase);
    return fake ? [...real.slice(0, need[g] - 1), fake] : real.slice(0, need[g]);
  });
  const cursor = [0, 0, 0];
  const placed = MANAGER_GROUPS.map((g) => ({ g, a: picked[g]?.[cursor[g]++] })).filter((x): x is { g: number; a: Asset } => !!x.a);
  const label = (g: number) => {
    const p = demo[g];
    return p ? `${splitProjectName(p.name).city || p.name} ${placed.filter((x) => x.g === g).length}` : "";
  };

  const verified = heroRows.filter((a) => a.trustBand === "VERIFIED");
  const countable = hidesMock(policy) ? verified.filter((a) => assetMode(a.provenance) === "real") : verified;
  const [latest] = hero.project ? await db.select({ id: reports.id }).from(reports).where(eq(reports.projectId, hero.project.id)).orderBy(desc(reports.createdAt)).limit(1) : [];
  const planted = rows.filter((a) => a.testCase).length;
  return {
    volunteer: {
      photo: v ? url(v, PHONE) : "",
      place: (v && placeShort(v.placeName, 1)) ?? (hero.project ? splitProjectName(hero.project.name).city : "Demo spot"),
      time: v?.capturedAt ? hhmm(v.capturedAt) : "now",
      score: v && shown(v) ? v.trustScore : null,
      band: v && shown(v) ? v.trustBand : null,
      href: "/capture",
    },
    manager: { tiles: placed.map((x) => ({ src: url(x.a, THUMB), flagged: x.a.trustBand === "FLAGGED" })), groups: placed.map((x) => x.g), labels: [label(0), label(1), label(2)], href: "/library" },
    funder: {
      project: hero.project?.name ?? "Demo project",
      verified: String(countable.length),
      tiles: verified.slice(0, 5).map((a) => url(a, THUMB)),
      href: latest ? `/r/${latest.id}` : hero.project ? `/projects/${hero.project.slug ?? hero.project.id}` : "/library",
    },
    footnote: `The demo runs on the demo archive: Wikimedia Commons photos with credits${planted ? `, and ${countWord(planted).toLowerCase()} planted ${planted === 1 ? "fake" : "fakes"}` : ""}. Nothing you do here changes a real project.`,
    homeHref: "/",
    howHref: "/how-it-works",
    seed: 3,
  };
}
