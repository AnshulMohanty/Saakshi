import "server-only";
/**
 * The /dev/parity landing fixture: LandingData built from the design's own sample archive
 * (design/unpacked/saakshi-landing, SAAKSHI_ARCHIVE + saakshi-kit), exactly as the prototype's
 * data() and renderVals() build theirs (L:1111-1203), so the ported page can be compared pixel
 * for pixel with the design capture. B5.3: this is the only place the sample archive is read,
 * and only /dev/parity (404 in production) renders it. Images are served by
 * /dev/parity/asset/saakshi-landing/<uuid>.
 */
import { fullDateTime } from "../charts/time-axis";
import { bitsToHex, diffCells, LOGO_BITS } from "../glyph";
import { DESIGN_FRAME } from "../motion/scenes/landing";
import { designArchive, type DPhoto } from "../parity/archive";
import type { RuleChip } from "../trust/labels";
import type { FieldTile, LandingData, LandingFlag, LandingProject, StormPhoto } from "./types";

const PAGE = "saakshi-landing";

const hav = (a: number, b: number, c: number, d: number) => {
  const R = 6371;
  const t = Math.PI / 180;
  const dl = (c - a) * t;
  const dn = (d - b) * t;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const num = (value: number, text = String(value)) => ({ value, text, mock: false });

export async function landingFixture(): Promise<LandingData> {
  const { D, src } = await designArchive(PAGE);
  const P = D.photos;
  const by = (id: string) => P.find((p) => p.id === id)!;
  const find = (s: string) => P.find((p) => p.title.includes(s))!;
  const stamp = find("Dharavi near Mahim");
  const delhi = find("Batla House");
  const wm = find("Waste cocobeach");
  const dup = by("p56");
  const dupOf = by("p44");
  const km = Math.round(hav(delhi.lat!, delhi.lng!, D.spots.mumbai.lat, D.spots.mumbai.lng));
  const ddiff = diffCells(dup.hash, dupOf.hash);
  const flags: LandingFlag[] = [
    { id: dup.id, src: src("photos/p56.jpg"), alt: "Lake photo resubmitted to the Versova project", reason: "Same photo already used in Lake clean-up, Pune", detail: "Its fingerprint matches a photo filed on the Pune project. It was cropped and brightened before upload.", diff: { bits: dup.hash, other: dupOf.hash, text: `${ddiff} of 64 cells differ. Same photo.` }, evidenceUrl: null },
    { id: wm.id, src: src(`photos/${wm.id}.jpg`), alt: "Beach litter photo with a stock-site watermark", watermarkOverlay: true, reason: "Stock-site watermark", detail: "Watermark text found across the frame. Planted in the demo archive to show the check.", diff: null, evidenceUrl: null },
    { id: delhi.id, src: src(`photos/${delhi.id}.jpg`), alt: "Garbage heap photographed in New Delhi", reason: `Taken ${km.toLocaleString("en-IN")} km from the site`, detail: "Camera location: New Delhi. Site: Versova beach, Mumbai.", diff: null, evidenceUrl: null },
    { id: stamp.id, src: src(`photos/${stamp.id}.jpg`), alt: "Mumbai street photo with a New Delhi location stamp drawn on it", stampOverlay: ["New Delhi, Delhi", "28.6139° N 77.2090° E", "12/09/2026 10:41"], reason: "The stamp says Delhi. The camera says Mumbai.", detail: `The camera file places it at ${stamp.lat!.toFixed(4)}° N, ${stamp.lng!.toFixed(4)}° E, in Mumbai. The stamp was drawn on.`, diff: null, evidenceUrl: null },
  ];
  const flagIds = flags.map((f) => f.id);
  const mumbai = P.filter((p) => p.project === "mumbai" && !flagIds.includes(p.id));
  const grid = mumbai.slice(0, 20).map((p) => ({ src: src(`photos/${p.id}.jpg`), hole: "" }));
  [3, 9, 14, 20].forEach((at, k) => grid.splice(at, 0, { src: flags[k].src, hole: String(k) }));
  const verifiedIds = ["hero", ...mumbai.map((p) => p.id)];
  const field: FieldTile[] = [
    ...mumbai.map((p) => ({ src: src(`photos/${p.id}.jpg`), k: "verified" as const })),
    { src: src("photos/hero.jpg"), k: "verified" },
    ...flags.map((f) => ({ src: f.src, k: "flagged" as const })),
    { src: src("photos/before.jpg"), k: "before" },
    { src: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" fill="#2C2447"/><text x="30" y="28" font-family="sans-serif" font-size="8" fill="#A9A3C2" text-anchor="middle">real photo</text><text x="30" y="38" font-family="sans-serif" font-size="8" fill="#A9A3C2" text-anchor="middle">here</text></svg>'), k: "after" },
  ];
  field.splice(9, 0, field.pop()!);
  field.splice(4, 0, field.splice(field.length - 1, 1)[0]);
  const keys = ["mumbai", "pune", "chennai"];
  const storm = P.filter((p) => keys.includes(p.project) || ["p53", "p55", "p56"].includes(p.id));
  const kOf = (p: DPhoto) => (keys.includes(p.project) ? p.project : "mumbai");
  const yr = (p: DPhoto) => {
    const m = /(\d{4})/.exec(p.date || "");
    return m ? +m[1] : null;
  };
  const range = (k: string) => {
    const ys = storm.filter((p) => kOf(p) === k).map(yr).filter((y): y is number => y !== null);
    return ys.length ? `${Math.min(...ys)} to ${Math.max(...ys)}` : "";
  };
  const cnt = (k: string) => storm.filter((p) => kOf(p) === k).length + (k === "mumbai" ? 1 : 0);
  const projects: LandingProject[] = Object.entries(D.spots).map(([k, s]) => ({ key: k, name: s.name, city: s.city, lat: s.lat, lng: s.lng, count: cnt(k), range: range(k), stackDir: k === "mumbai" ? -1 : 1, stackBelow: k === "pune", labelBelow: k === "mumbai", isHero: k === "mumbai" }));
  const stormPhotos: StormPhoto[] = storm.map((p) => ({ id: p.id, src: src(`photos/${p.id}.jpg`), w: p.w, h: p.h, lat: p.lat ?? null, lng: p.lng ?? null, project: kOf(p) }));
  const used = [...storm, by("p52")];
  const credits = [
    { title: D.hero.title, author: D.hero.author, license: D.hero.license, page: D.hero.page, note: ". Hero photo." },
    { title: D.before.title, author: D.before.author, license: D.before.license, page: D.before.page, note: ". Before photo." },
    ...used.map((p) => ({ title: p.title.replace(/\.(jpe?g|png)$/i, ""), author: p.author, license: p.license, page: p.page, note: p.planted ? ". Planted copy." : p.id === wm.id ? ". Watermark planted." : p.id === stamp.id ? ". Stamp planted." : "" })),
  ];
  // SK.score for the hero (camera GPS, in window, unique, clean, not taken in the app): 90.
  const chips: RuleChip[] = [
    { code: "LOCATION_EXIF", text: "Location recorded, 25", tone: "good" },
    { code: "TIME_IN_WINDOW", text: "Time recorded, 25", tone: "good" },
    { code: "UNIQUE", text: "Fingerprint is new, 25", tone: "good" },
    { code: "AUTH_CLEAR", text: "No watermark or edits, 15", tone: "good" },
    { code: "LOCATION_WITNESS", text: "Imported, not taken in the app, 0 of 10", tone: "neutral" },
  ];
  const boxes: Array<[string, number, number, number, number]> = [
    ["tractor", 140, 510, 510, 750],
    ["debris", 580, 470, 880, 680],
    ["horse cart", 700, 500, 1300, 960],
    ["horse", 1265, 575, 1490, 765],
    ["person, face blurred", 1462, 555, 1565, 772],
  ];
  const heroCover = (D.hero.cover * 100).toFixed(1);
  const beforePct = Math.round(D.before.cover * 100);
  return {
    frame: { ...DESIGN_FRAME },
    land: D.land,
    hero: {
      assetId: null,
      src: src(D.hero.src),
      w: D.hero.w,
      h: D.hero.h,
      alt: "Versova beach in Mumbai during a clean-up: a tractor loads debris while a horse cart waits on the sand. Faces blurred.",
      mask: src(D.hero.mask),
      maskMode: "alpha",
      bits: D.hero.hash,
      hex: bitsToHex(D.hero.hash),
      lat: D.hero.lat,
      lng: D.hero.lng,
      when: fullDateTime(Date.parse(D.hero.taken), "second", 330, { seconds: true }),
      extra: `altitude ${D.hero.alt} m`,
      locationNote: "From the camera file. Accuracy not recorded.",
      photoNote: "Versova beach, Mumbai. Faces blurred.",
      aiText: "Tractor, debris, horse cart, horse, one person.",
      aiBoxes: boxes.map(([label, a, b, c, d]) => ({ label, x0: a / 1920, y0: b / 1440, x1: c / 1920, y1: d / 1440 })),
      cover: num(+heroCover, heroCover),
      metric: "litter",
      trust: { score: 90, band: "VERIFIED", chips, mock: false },
      credit: "Versova beach, Mumbai, 6 Jul 2024. Photo: Shishirdasika, CC BY-SA 4.0, Wikimedia Commons. Faces blurred.",
      evidenceUrl: null,
    },
    projects,
    storm: stormPhotos,
    stormCount: storm.length + 1,
    grid,
    flags,
    internet: {
      src: src("photos/p52.jpg"),
      caption: "A photo found on the internet",
      score: 50,
      band: "NEEDS_REVIEW",
      rows: [
        { label: "Taken in the Saakshi app", value: "No, 0 of 10", tone: "neutral" },
        { label: "Location", value: "No location recorded, 0 of 25", tone: "warn" },
        { label: "Time", value: "File date only, 10 of 25", tone: "neutral" },
        { label: "Fingerprint is new", value: "25 of 25", tone: "good" },
        { label: "No watermark or edits", value: "15 of 15", tone: "good" },
      ],
      note: "It stays at Needs review until someone confirms it with proof. It never counts toward a report on its own.",
    },
    measurement: {
      project: "Versova beach clean-up",
      place: "Mumbai beach",
      metric: "litter",
      before: { src: src(D.before.src), mask: src(D.before.mask), maskMode: "alpha", value: num(beforePct), alt: "Plastic litter on a Mumbai beach, before a clean-up. Faces blurred.", credit: "Photo: Ravi Khemka, CC BY 2.0" },
      after: { src: null, mask: null, maskMode: "alpha", value: num(2), alt: "", credit: "" },
      isHero: true,
    },
    report: { title: "Versova beach clean-up, Mumbai", kind: "Demo archive report", verified: num(verifiedIds.length), flagged: num(4), before: num(beforePct), after: num(2), metric: "litter", url: null },
    field,
    tamper: {
      base: "https://res.cloudinary.com/saakshi/image/upload/",
      chips: [
        { k: "sig", label: "signature", text: "s--tQ3v9XkP--", removable: true },
        { k: "crop", label: "crop", text: "c_fill,g_auto,w_1200,h_800", removable: true },
        { k: "blur", label: "blur faces", text: "e_blur_faces:1200", removable: true },
        { k: "fmt", label: "format", text: "f_auto,q_auto", removable: true },
        { k: "asset", label: "photo", text: "v1727000000/evidence/vsv-0142.jpg", removable: false },
      ],
      assetId: null,
      photo: src(D.hero.src),
      bgSize: "340% auto",
      bgPosition: "79% 46%",
    },
    checkins: {
      spot: "Versova beach",
      photo: null,
      points: [
        { label: "Clean-up day", short: "2 Oct", value: num(2), photo: null },
        { label: "Check-in 1, 9 Oct", short: "9 Oct", value: num(3), photo: null },
        { label: "Check-in 2, 16 Oct", short: "16 Oct", value: num(2), photo: null },
        { label: "Check-in 3, 23 Oct", short: "23 Oct", value: num(6), photo: null },
        { label: "Check-in 4, 30 Oct", short: "30 Oct", value: num(4), photo: null },
        { label: "Check-in 5, 6 Nov", short: "6 Nov", value: num(3), photo: null },
      ],
    },
    witness: { url: "https://saakshi.app/witness", label: "saakshi.app/witness", spots: Object.values(D.spots).map((s) => ({ lat: s.lat, lng: s.lng, city: s.city })), live: false },
    nodes: [
      { name: "Intake forensics", what: "Reads the camera file for location and time, and fingerprints the pixels so reused photos are caught.", code: "cloudinary.uploader.upload(file, {\n  phash: true,\n  image_metadata: true\n})", preview: { kind: "glyph", bits: D.hero.hash, variant: "night" }, caption: "phash of the hero photo", alt: "Fingerprint glyph" },
      { name: "Perception", what: "Tags what is in the frame. Tags are AI-estimated and always carry a confidence.", code: 'upload(file, {\n  detection: "coco_v2",\n  auto_tagging: 0.6\n})', preview: { kind: "image", src: src("photos/hero.jpg"), fit: "cover" }, caption: "Tagged frame", alt: "Hero photo" },
      { name: "Measurement", what: "Segments litter and counts its pixels, so cover is a measured share of the photo.", code: "/image/upload/\n  e_extract:prompt_litter;mode_mask/\n  evidence/vsv-0142.jpg", preview: { kind: "image", src: src("photos/before-mask.png"), fit: "cover" }, caption: "Litter mask, before photo", alt: "Litter mask" },
      { name: "Privacy", what: "Blurs every face before a photo is public, on a signed link that cannot be edited.", code: 'cloudinary.url("evidence/vsv-0142", {\n  transformation: [{ effect: "blur_faces:1200" }],\n  sign_url: true\n})', preview: { kind: "image", src: src("photos/hero.jpg"), fit: "cover" }, caption: "Public copy, faces blurred", alt: "Blurred public photo" },
      { name: "Provenance", what: "Pins each photo to a version and a signature, so a report always opens the exact file it counted.", code: "/s--tQ3v9XkP--/\n  v1727000000/evidence/vsv-0142.jpg", preview: { kind: "glyph", bits: LOGO_BITS, variant: "plain" }, caption: "Versioned, signed asset", alt: "Saakshi glyph" },
    ],
    dust: P.filter((p) => p.hash).map((p) => p.hash),
    // A photo the export does not carry comes back as its bare path: no thumbnail for it.
    dustThumbs: P.filter((p) => p.hash).map((p) => src(`photos/${p.id}.jpg`)).map((u) => (u.startsWith("/") ? u : "")),
    credits,
    footer: {
      repoUrl: "https://github.com/",
      built: "Built for Code Cubicle 6.0. Team names here.",
      disclaimer: "Swachhata Hi Seva is the Government of India's annual cleanliness campaign, held each year from mid-September to 2 October. Saakshi is an independent project and is not affiliated with it. Every number on this page comes from the demo archive.",
    },
    mock: false,
    mockTag: "Mock output",
    copy: {
      dropHint: "or choose a file. It stays in your browser.",
      ledgerHint: "The fingerprint is computed in your browser and compared with every photo in the demo archive.",
      nodesNote: "Parameters as planned for the build. Confirm each one against the add-ons enabled on the Cloudinary account.",
      liveCaption: "Simulated arrivals in this prototype",
    },
  };
}
