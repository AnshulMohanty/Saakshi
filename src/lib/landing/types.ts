/**
 * What the landing renders (pure types, shared by the DB loader lib/landing/view.ts, the
 * /dev/parity fixture lib/landing/fixture.ts and the client). The shape follows the design's
 * data() (landing template L:1111-1156) so the ported markup changes as little as possible;
 * every value comes from our database (B5.3, B5.4) or, on /dev/parity only, from the design's
 * sample archive.
 */
import type { RuleChip } from "../trust/labels";
import type { TrustBand } from "../trust/types";

export interface Frame {
  lng0: number;
  lng1: number;
  lat0: number;
  lat1: number;
}

/** A number under the display policy: shown (maybe tagged "Mock output") or withheld with a reason. */
export type LandingNumber = { value: number; text: string; mock: boolean } | { value: null; text: string; mock: false };

export interface Credit {
  title: string;
  author: string;
  license: string;
  page: string | null;
  /** ". Planted copy." and similar. */
  note: string;
}

export interface StormPhoto {
  id: string;
  src: string;
  w: number;
  h: number;
  lat: number | null;
  lng: number | null;
  /** LandingProject.key. */
  project: string;
}

export interface LandingProject {
  key: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  /** Photos in its stack, the hero card included for the hero project. */
  count: number;
  range: string;
  /** GL:79-86 generalised: the hero project stacks left, others right; a project near the hero stacks below its pin. */
  stackDir: -1 | 1;
  stackBelow: boolean;
  /** Its label sits under the stack (the hero's) or above it. */
  labelBelow: boolean;
  isHero: boolean;
}

export interface AiBox {
  label: string;
  /** Fractions of the photo, 0–1. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LandingHero {
  assetId: string | null;
  /** Full photo (signed, face-blurred) for the still and the GL texture. */
  src: string;
  w: number;
  h: number;
  alt: string;
  /** Litter mask (white = litter), same frame as `src`. */
  mask: string | null;
  /** How the mask encodes the selection: our masks are greyscale (luminance), the design's PNGs alpha. */
  maskMode: "luminance" | "alpha";
  bits: string;
  hex: string;
  lat: number | null;
  lng: number | null;
  /** "6 Jul 2024, 17:14:58 IST". */
  when: string;
  /** Third line of the where panel ("altitude 23 m"), if any. */
  extra: string | null;
  /** "From the camera file. Accuracy not recorded." */
  locationNote: string;
  /** Label 1: "Versova beach, Mumbai. Faces blurred." */
  photoNote: string;
  /** Label 4, AI-estimated: "Tractor, debris, horse cart, horse, one person." */
  aiText: string;
  aiBoxes: AiBox[];
  /** Label 5: litter cover of the frame (one decimal), or withheld. */
  cover: LandingNumber | null;
  metric: "litter" | "green";
  trust: { score: number; band: TrustBand; chips: RuleChip[]; mock: boolean } | null;
  /** "Place, date. Photo: author, licence, Wikimedia Commons. Faces blurred." */
  credit: string;
  evidenceUrl: string | null;
}

export interface LandingFlag {
  id: string;
  src: string;
  alt: string;
  reason: string;
  detail: string;
  /** Design stand-ins only (the fixture): our planted files carry the watermark and stamp in their pixels. */
  watermarkOverlay?: boolean;
  stampOverlay?: string[] | null;
  diff: { bits: string; other: string; text: string } | null;
  evidenceUrl: string | null;
}

export interface Ledger {
  src: string;
  caption: string;
  score: number;
  band: TrustBand;
  rows: Array<{ label: string; value: string; tone: "good" | "neutral" | "warn" | "bad" }>;
  note: string;
}

export interface MeasuredSide {
  /** null: the design's placeholder ("Real photo here"), the fixture only. */
  src: string | null;
  mask: string | null;
  maskMode: "luminance" | "alpha";
  value: LandingNumber;
  alt: string;
  credit: string;
}

export interface LandingMeasurement {
  project: string;
  place: string;
  metric: "litter" | "green";
  before: MeasuredSide;
  after: MeasuredSide;
  isHero: boolean;
}

export interface FieldTile {
  src: string;
  k: "verified" | "flagged" | "before" | "after";
}

export interface ReportCard {
  title: string;
  kind: string;
  verified: LandingNumber;
  flagged: LandingNumber;
  before: LandingNumber | null;
  after: LandingNumber | null;
  metric: "litter" | "green";
  url: string | null;
}

export interface TamperChip {
  k: string;
  label: string;
  text: string;
  removable: boolean;
}

export interface Tamper {
  base: string;
  chips: TamperChip[];
  /** The photo behind the link, for /api/demo/tamper (null: the fixture decides locally, as the design did). */
  assetId: string | null;
  photo: string;
  /** Background placement (the design zooms into a blurred face). */
  bgSize: string;
  bgPosition: string;
}

export interface Checkins {
  spot: string;
  photo: string | null;
  points: Array<{ label: string; short: string; value: LandingNumber; photo: string | null }>;
}

export interface PipelineNode {
  name: string;
  what: string;
  code: string;
  preview: { kind: "image"; src: string; fit: "cover" | "contain" } | { kind: "glyph"; bits: string; variant: "plain" | "night" } | null;
  caption: string;
  alt: string;
}

export interface LandingData {
  frame: Frame;
  land: Array<[number, number]>;
  hero: LandingHero | null;
  projects: LandingProject[];
  storm: StormPhoto[];
  stormCount: number;
  grid: Array<{ src: string; hole: string }>;
  flags: LandingFlag[];
  internet: Ledger | null;
  measurement: LandingMeasurement | null;
  report: ReportCard | null;
  field: FieldTile[];
  tamper: Tamper | null;
  checkins: Checkins | null;
  witness: { url: string; label: string; spots: Array<{ lat: number; lng: number; city: string }>; live: boolean };
  nodes: PipelineNode[];
  /** Dust glyphs on night stickies (D-0029): pHash bits of archive photos. */
  dust: string[];
  /** Signed thumbnails parallel to `dust` (the cursor reveal, D-0088). */
  dustThumbs: string[];
  credits: Credit[];
  footer: { repoUrl: string | null; built: string; disclaimer: string };
  /** Dev only: numbers here rest on mock providers. */
  mock: boolean;
  /** Copy that says what the product really does (the fixture passes the design's words). */
  copy: { dropHint: string; ledgerHint: string; nodesNote: string; liveCaption: string };
  /** Badge on a mock-derived number: "Mock output" (development), "Prototype measurement" (DEMO_PREVIEW). */
  mockTag: string;
}
