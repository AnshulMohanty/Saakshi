import "server-only";
/**
 * The app on the prototype's sample archive and placeholder rules (AP:868-1127), for
 * /dev/parity/saakshi-app only (B5.3): its photos, projects and planted fakes, scored by SK.score
 * (lib/parity/sk.ts, bands 80/40), with its sample numbers marked as samples. The product builds
 * the same AppData from the database (lib/app/view.ts).
 */
import type { AppData, AppPhoto, AppProject, ProjectScreen, Tone } from "@/components/app/types";
import { bitsToHex, diffCells } from "../glyph";
import { designArchive } from "../parity/archive";
import { heroLayer, heroWhen } from "../parity/hero";
import { skScore } from "../parity/sk";
import type { SimFacts } from "../trust/simulate";
import { DESIGN_AREA } from "./map";

const PLANTED: Record<string, string> = { p56: "Same photo already used in Lake clean-up, Pune", p55: "Stock-site watermark", p53: "Taken 1,143 km from the site", p35: "The stamp says Delhi. The camera says Mumbai." };
const HISTORY = [
  { what: "Imported into the demo archive", when: "27 Sep 2026, 11:02 IST" },
  { what: "Public copy made, faces blurred, link signed", when: "27 Sep 2026, 11:03 IST" },
];

export async function appFixture(): Promise<AppData> {
  const { D, src } = await designArchive("saakshi-app");
  const projOf = (p: string) => (p === "fake" ? "mumbai" : p);
  const raw = [
    { id: "hero", title: D.hero.title, author: D.hero.author, license: D.hero.license, page: D.hero.page, lat: D.hero.lat, lng: D.hero.lng, date: "2024-07-06 17:14:58", gps: true, project: "mumbai", hash: D.hero.hash, src: "photos/hero.jpg", w: D.hero.w, h: D.hero.h },
    ...D.photos.filter((p) => p.id !== "p52" && p.id !== "p54").map((p) => ({ ...p, project: projOf(p.project), src: `photos/${p.id}.jpg` })),
  ];
  // SK.photoFacts (saakshi-kit.js): camera GPS or the project site; the planted fakes' tells.
  const facts = (p: (typeof raw)[number]) => {
    const f: SimFacts = { loc: p.gps ? "camera" : "archive", inside: p.id !== "p53", inWindow: true, dup: p.id === "p56" ? "other" : "none", watermark: p.id === "p55", screen: false, quality: "good", camera: !!p.gps };
    const r = skScore(f);
    const hard = [...r.hard];
    let band = r.band;
    if (p.id === "p35") {
      hard.push(PLANTED.p35);
      band = "FLAGGED";
    }
    const reason = PLANTED[p.id] ?? (band === "VERIFIED" ? "Location, time and fingerprint check out" : "No location recorded. Placed at the project site");
    return { ...r, hard, band, reason };
  };
  const BAND = { VERIFIED: "Verified", NEEDS_REVIEW: "Needs review", FLAGGED: "Flagged" } as const;
  const photos: AppPhoto[] = raw.map((p, i) => {
    const r = facts(p);
    const prefix = p.project === "mumbai" ? "vsv" : p.project === "pune" ? "pnl" : "mrn";
    const band = BAND[r.band];
    return {
      id: p.id,
      code: `${prefix}-${String(100 + i).padStart(4, "0")}`,
      title: p.title,
      src: src(p.src),
      preview: src(p.src),
      band,
      score: r.score,
      scoreHidden: null,
      reason: r.reason,
      project: p.project,
      source: p.id === "hero" || !PLANTED[p.id] ? "archive" : "planted_test",
      spot: null,
      year: (/(\d{4})/.exec(p.date ?? "") ?? [])[1] ?? "",
      gps: !!p.gps,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      hash: p.hash || null,
      date: p.date ?? null,
      w: p.w ?? null,
      h: p.h ?? null,
      credit: { title: p.title, author: p.author, license: p.license, page: p.page },
      rows: r.rows.map((x) => ({ label: x.label, note: x.note, pts: x.pts, max: x.max, tone: x.tone as Tone })),
      hard: r.hard.length ? r.hard : [],
      queue: band !== "Verified",
      overlay: p.id === "p55" ? "watermark" : p.id === "p35" ? "stamp" : null,
      dup: null,
      nearest: null,
      planted: !!PLANTED[p.id],
      history: [HISTORY[0], { what: `Checked by the fixed rules: ${r.score}, ${band}`, when: "27 Sep 2026, 11:02 IST" }, HISTORY[1]],
      evidenceHref: "Evidence Page.html",
      layer: p.id === "hero" ? { input: heroLayer(D), mask: src(D.hero.mask) } : null,
      facts: [
        { k: "Project", v: D.spots[p.project].name },
        { k: "Coordinates", v: p.gps && p.lat !== undefined && p.lng !== undefined ? `${p.lat.toFixed(5)}° N, ${p.lng.toFixed(5)}° E` : "Not recorded" },
        { k: "Location source", v: p.gps ? "Camera file" : "Project site, not a fix" },
        { k: "Taken", v: p.date || "Not recorded" },
        { k: "Fingerprint", v: p.hash ? bitsToHex(p.hash) : "" },
        { k: "Size", v: `${p.w || 1600} × ${p.h || 1200}` },
      ],
    };
  });
  // AP:1093-1094, 1117: the planted copy's original side by side; every photo's nearest fingerprint.
  const orig = photos.find((p) => p.id === "p44")!;
  for (const p of photos) {
    if (p.id === "p56" && p.hash && orig.hash) p.dup = { src: orig.src, caption: "Original, filed in Lake clean-up, Pune", hash: orig.hash, text: `${diffCells(p.hash, orig.hash)} of 64 cells differ. Same photo.` };
    let near: { n: number; q: AppPhoto } | null = null;
    for (const q of photos) {
      if (q.id === p.id || !q.hash || !p.hash) continue;
      const n = diffCells(q.hash, p.hash);
      if (!near || n < near.n) near = { n, q };
    }
    p.nearest = near ? { src: near.q.src, hash: near.q.hash, cells: near.n } : null;
  }

  const projects: AppProject[] = (["mumbai", "pune", "chennai"] as const).map((k) => ({ key: k, name: D.spots[k].name, city: D.spots[k].city, lat: D.spots[k].lat, lng: D.spots[k].lng, card: k === "mumbai" ? "left" : k === "pune" ? "right" : "up", href: null, aliases: k === "mumbai" ? ["versova", "juhu"] : k === "pune" ? ["pavana"] : ["marina"] }));

  const verified = photos.filter((p) => p.project === "mumbai" && p.band === "Verified").length;
  const before = { src: src(D.before.src), mask: src(D.before.mask), maskMode: "alpha" as const, label: "Before 10%" };
  const projectScreens: Record<string, ProjectScreen> = {};
  for (const pr of projects) {
    const pp = photos.filter((p) => p.project === pr.key);
    const m = pr.key === "mumbai";
    projectScreens[pr.key] = {
      kpis: [
        { k: "verified", value: String(pp.filter((p) => p.band === "Verified").length), label: "photos verified", color: "var(--verified)", tag: null },
        { k: "flagged", value: String(pp.filter((p) => p.band === "Flagged").length), label: "photos flagged, with reasons", color: "var(--flagged)", tag: null },
        { k: "spots", value: "1", label: "spots monitored", color: "var(--foreground)", tag: null },
        { k: "before", value: m ? "10%" : "no data", label: "litter cover before, Measured", color: "var(--measured)", tag: null },
        { k: "after", value: m ? "2%" : "no data", label: "litter cover after, Measured", color: "var(--measured)", tag: "sample value" },
        { k: "checkins", value: "5", label: "check-ins since the clean-up", color: "var(--foreground)", tag: "sample value" },
      ],
      tiles: [...(m ? [{ id: null, src: src(D.before.src), keys: ["before", "spots"] }] : []), ...pp.map((p) => ({ id: p.id, src: p.src, keys: [p.band === "Verified" ? "verified" : p.band === "Flagged" ? "flagged" : "review", ...(p.id === "hero" ? ["spots", "after"] : [])] }))],
      before,
      after: { src: null, label: "After 2%, sample" },
      caveat: "Measured on photo pixels at threshold 0.50. Camera angle, framing, season and light affect the result.",
      flags: pp.filter((p) => p.band === "Flagged").map((p) => ({ id: p.id, src: p.src, reason: PLANTED[p.id] ?? p.hard[0] ?? p.reason })),
      spots: [{ name: `${pr.name.replace(" clean-up", "")}, pole 3`, photos: pp.length, points: [10, 2, 3, 2, 6, 4, 3], trendAria: "From 10% to 3%", last: "27 Sep 2026" }],
      trendLabel: "Litter cover trend",
      samplesNote: "Trend and check-in values are samples.",
    };
  }

  const mum = photos.filter((p) => p.project === "mumbai");
  return {
    banner: "Demo workspace. Photos come from Wikimedia Commons.",
    photos,
    projects,
    area: DESIGN_AREA,
    land: D.land,
    projectScreens,
    studio: {
      report: {
        kicker: "Demo archive report, 14 to 27 Sep 2026",
        title: "Versova beach clean-up, Mumbai",
        numbers: [
          { key: "v", value: String(verified), label: "photos verified", color: "var(--l-verified)", labelColor: null },
          { key: "f", value: "4", label: "photos flagged, with reasons", color: "var(--l-destructive)", labelColor: null },
          { key: "b", value: "10%", label: "litter cover before, measured", color: "var(--l-measured)", labelColor: null },
          { key: "a", value: "2%", label: "litter cover after, sample", color: "var(--l-measured)", labelColor: "var(--l-review)" },
        ],
        tiles: [...mum.filter((p) => p.band === "Verified").slice(0, 8).map((p) => ({ src: p.src, k: "v" })), ...mum.filter((p) => p.band === "Flagged").slice(0, 3).map((p) => ({ src: p.src, k: "f" })), { src: src(D.before.src), k: "b" }],
        method: "Method: fixed trust rules, weights 10, 25, 25, 25, 15. Litter measured on photo pixels at threshold 0.50. Photos: Wikimedia Commons, faces blurred.",
        href: null,
      },
      posts: {
        stat: { value: String(verified), line: "photos verified at Versova beach", foot: "Every one checked for place, time and reuse. Tap the link to see them." },
        split: { before: { ...before, label: "Before 10%" }, after: { src: null, label: "After 2%" } },
        photo: { src: src("photos/hero.jpg"), score: "90", band: "Verified", meta: "Versova, 6 Jul 2024", chips: ["Location", "Time", "Fingerprint new", "No edits"] },
      },
      caption: `Versova beach, Mumbai. ${verified} photos from our clean-up, each one checked for where and when it was taken, and whether it was used before. Tap the link to see every photo behind the numbers.`,
      exports: {
        stat: `https://res.cloudinary.com/saakshi/image/upload/w_1080,h_1350,c_fill,b_rgb:0E0B1A/l_text:Anek_700_420:${verified},co_rgb:4FCB8A,g_west,x_96,y_-80/fl_layer_apply/studio/stat-vsv.png`,
        split: "https://res.cloudinary.com/saakshi/image/upload/w_1080,h_1350,c_fill/l_evidence:vsv-before,w_1080,h_675,c_fill,g_north/fl_layer_apply/e_blur_faces:1200/studio/split-vsv.jpg",
        photo: "https://res.cloudinary.com/saakshi/image/upload/s--tQ3v9XkP--/w_1080,h_1350,c_fill,g_auto/e_blur_faces:1200/l_studio:proof-strip-90,g_south,y_32/fl_layer_apply/evidence/vsv-0142.jpg",
      },
    },
    captureHref: "Capture.html",
    importToast: `${photos.length} photos sorted into 3 projects by place and date`,
    areaCaption: "Demo area: coastline dots, no boundaries drawn",
    errorDetail: "503 from api/photos, request 7f3a2c",
    projectIds: {},
    studioKey: "mumbai",
    studioPlace: "Versova beach",
  };
}

export { heroWhen };
