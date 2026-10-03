/**
 * The app's data (Saakshi_App → /library, /review, /projects/[id], /studio): everything the shell
 * and its four screens render, serialisable, built on the server from the database
 * (lib/app/view.ts) or, for the parity fixture, from the prototype's sample archive
 * (lib/app/fixture.ts). Client state (filters, selection, the drawer, the palette, decisions in
 * flight) lives in the shell.
 */
import type { BandName, Chip, ChipProject } from "@/lib/app/chips";
import type { CardSide } from "@/lib/app/map";
import type { LayerInput } from "@/lib/scenes/layers";

export type { BandName, Chip };
export type Screen = "library" | "review" | "projects" | "studio";
export type DemoState = "normal" | "loading" | "empty" | "error" | "offline";
export type Tone = "good" | "warn" | "bad" | "neutral";

export interface AppPhoto {
  id: string;
  /** "vsv-0100": short code (the first 8 of the id in the product). */
  code: string;
  title: string;
  /** Tile and thumbnail (signed, face-blurred). */
  src: string;
  /** The larger copy (review, drawer). */
  preview: string;
  band: BandName;
  score: number | null;
  /** Shown instead of a number when the display policy hides a mock-derived score. */
  scoreHidden: string | null;
  reason: string;
  project: string | null;
  /** witness, upload, archive, planted_test. */
  source: string;
  spot: string | null;
  year: string;
  gps: boolean;
  lat: number | null;
  lng: number | null;
  /** 64 bits, or null when not fingerprinted yet. */
  hash: string | null;
  date: string | null;
  w: number | null;
  h: number | null;
  credit: { title: string; author: string; license: string; page: string } | null;
  rows: Array<{ signal?: string; label: string; note: string; pts: number; max: number; tone: Tone }>;
  hard: string[];
  /** Waits in the review queue. */
  queue: boolean;
  /** The prototype's simulated marks on two of its planted fakes (fixture only). */
  overlay?: "watermark" | "stamp" | null;
  /** The closest near-duplicate, side by side in review. */
  dup: { src: string; caption: string; hash: string | null; text: string } | null;
  nearest: { src: string; hash: string | null; cells: number } | null;
  planted: boolean;
  history: Array<{ what: string; when: string }>;
  evidenceHref: string | null;
  /** Inputs for the drawer's layer art (lib/scenes/layers.ts); null → the fingerprint glyph only. */
  layer: { input: LayerInput; mask: string | null } | null;
  facts: Array<{ k: string; v: string }>;
}

export interface AppProject extends ChipProject {
  lat: number;
  lng: number;
  card: CardSide;
  href: string | null;
}

export interface Kpi {
  k: string;
  value: string;
  label: string;
  color: string;
  /** "sample value" (fixture), "Mock output" (development), or null. */
  tag: string | null;
}

export interface ProjectScreen {
  kpis: Kpi[];
  tiles: Array<{ id: string | null; src: string; keys: string[] }>;
  before: { src: string; mask: string | null; maskMode: "alpha" | "luminance"; label: string } | null;
  after: { src: string | null; label: string } | null;
  caveat: string;
  flags: Array<{ id: string; src: string; reason: string }>;
  spots: Array<{ name: string; photos: number; points: number[]; trendAria: string; last: string }>;
  trendLabel: string;
  /** "Trend and check-in values are samples." (fixture only; never ships). */
  samplesNote: string | null;
}

export interface StudioScreen {
  report: {
    kicker: string;
    title: string;
    numbers: Array<{ key: string; value: string; label: string; color: string; labelColor: string | null }>;
    tiles: Array<{ src: string; k: string }>;
    method: string;
    href: string | null;
  } | null;
  posts: {
    stat: { value: string; line: string; foot: string } | null;
    split: { before: { src: string; mask: string | null; maskMode: "alpha" | "luminance"; label: string }; after: { src: string | null; label: string } } | null;
    photo: { src: string; score: string; band: string; meta: string; chips: string[] } | null;
  };
  caption: string;
  exports: Record<"stat" | "split" | "photo", string | null>;
}

export interface AppData {
  banner: string;
  photos: AppPhoto[];
  projects: AppProject[];
  projectScreens: Record<string, ProjectScreen>;
  studio: StudioScreen | null;
  captureHref: string;
  /** "56 photos sorted into 3 projects by place and date". */
  importToast: string;
  errorDetail: string;
  /** Project key → database id (the product's API calls). */
  projectIds: Record<string, string>;
  /** The project Studio publishes for: its key and name. */
  studioKey: string | null;
  studioPlace: string;
}
