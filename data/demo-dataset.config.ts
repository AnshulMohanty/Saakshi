/**
 * Demo dataset: which Commons searches/categories to mine, and how to turn the candidates into
 * three demo projects. Used by `pnpm archive:discover` and `pnpm demo:import`; works as-is.
 */

export type DemoActivity = "cleanup" | "plantation" | "water" | "school";

export interface DiscoveryQuery {
  id: string;
  label: string;
  activity: DemoActivity;
  /** CirrusSearch terms ("filetype:bitmap " is prepended). */
  search?: string[];
  /** Category titles; files directly in each category. */
  categories?: string[];
  /** Max files per search term / category. */
  limit?: number;
}

/** Geotagged files within ~1800 km of central India (India and immediate neighbours). */
const NEAR_INDIA = "nearcoord:1800km,22.5,79";
/** Phase 7 broader pass: geotagged files near the three existing demo clusters. */
const NEAR_TIRUPPUR = "nearcoord:25km,11.1048,77.3517";
const NEAR_PIMPRI = "nearcoord:15km,18.6439,73.7712";
const NEAR_MUNDIKUNTA = "nearcoord:5km,17.4641,78.3736";

export const DISCOVERY_QUERIES: DiscoveryQuery[] = [
  {
    id: "beach-cleanup",
    label: "Beach clean-up",
    activity: "cleanup",
    search: [`beach clean ${NEAR_INDIA}`, `beach garbage ${NEAR_INDIA}`, `beach plastic ${NEAR_INDIA}`],
    categories: ["Category:Beach cleanups"],
  },
  {
    id: "cleanup-drive",
    label: "Clean-up drive",
    activity: "cleanup",
    search: [`"cleaning drive" ${NEAR_INDIA}`, `"cleanliness drive" ${NEAR_INDIA}`, `"clean up" volunteers ${NEAR_INDIA}`, `"clean-up drive" ${NEAR_INDIA}`, `"cleanup drive" ${NEAR_INDIA}`],
  },
  {
    id: "swachh-bharat",
    label: "Swachh Bharat",
    activity: "cleanup",
    search: [`"swachh bharat" ${NEAR_INDIA}`],
    categories: ["Category:Swachh Bharat Mission"],
  },
  {
    id: "litter",
    label: "Litter / garbage dump",
    activity: "cleanup",
    search: [`garbage ${NEAR_INDIA}`, `"plastic waste" ${NEAR_INDIA}`, `"garbage dump" ${NEAR_INDIA}`, `Noyyal ${NEAR_TIRUPPUR}`, `Tiruppur river ${NEAR_TIRUPPUR}`, `garbage ${NEAR_TIRUPPUR}`, `plastic ${NEAR_TIRUPPUR}`],
    categories: ["Category:Litter in India", "Category:Plastic pollution in India", "Category:Waste in India", "Category:Landfills in India"],
  },
  {
    id: "lake-cleanup",
    label: "Lake clean-up",
    activity: "water",
    search: [`lake cleaning ${NEAR_INDIA}`, `lake garbage ${NEAR_INDIA}`, `lake pollution ${NEAR_INDIA}`, `Mundikunta ${NEAR_MUNDIKUNTA}`, `lake ${NEAR_MUNDIKUNTA}`, `rubbish ${NEAR_MUNDIKUNTA}`],
  },
  {
    id: "tree-planting",
    label: "Tree planting / saplings",
    activity: "plantation",
    search: [
      `"tree planting" ${NEAR_INDIA}`, `"tree plantation" ${NEAR_INDIA}`, `"planting saplings" ${NEAR_INDIA}`, `saplings planted ${NEAR_INDIA}`,
      `"tree plantation drive" ${NEAR_INDIA}`, `tree ${NEAR_PIMPRI}`, `sapling ${NEAR_PIMPRI}`, `plantation ${NEAR_PIMPRI}`, `"Pimpri Chinchwad" tree`,
    ],
    categories: ["Category:Tree planting in India", "Category:Van Mahotsav"],
  },
  {
    id: "school-renovation",
    label: "School renovation",
    activity: "school",
    search: [`school renovation ${NEAR_INDIA}`, `school repair ${NEAR_INDIA}`],
  },
];

export type ProjectType = "cleanup" | "plantation" | "water" | "school";

export interface ProjectRule {
  key: "A" | "B" | "C";
  /** Stable slug: the project's id is UUIDv5 of it, so re-imports keep the same ids and links. */
  slug: string;
  /** Which discovery groups feed this project. */
  groups: string[];
  /** Relevance filter: a file's title or description must match. */
  relevant: RegExp;
  /** …and must not match (themed events and ceremonies are not evidence of a site). */
  exclude?: RegExp;
  /** Allowed project types; the first is the default, "water" wins when most photos show water. */
  types: ProjectType[];
  /** Name label chosen by majority match over the selected photos; else `label`. */
  labels: Array<{ match: RegExp; label: string }>;
  label: string;
  target: number;
  /** Keep this many of the lowest-ranked eligible photos out of the selection (reserve for planted tests). */
  holdBack?: number;
  /** Must be at least this far (km) from the listed projects' centres. */
  awayFrom?: Array<{ key: "A" | "B" | "C"; minKm: number }>;
}

const CLEANUP_WORDS = /garbage|trash|rubbish|rubish|litter(?!\s*fall)|waste|plastic|dump|clean|pollut|sewage|debris|filth|swachh/i;
/** Awareness events, exhibitions and ceremonies mention waste without showing a site. */
const EVENT_WORDS = /\b(on the theme of|walkathon|exhibition|awareness|rally|seminar|quiz|conference|lecture|pledge|inaugurat\w*)\b/i;
const WATER_WORDS = /river|lake|pond|canal|beach|shore|coast|nullah|creek/i;
const CLEANUP_LABELS = [
  { match: /beach|shore|coast/i, label: "Beach clean-up" },
  { match: /river|nullah|canal/i, label: "River clean-up" },
  { match: /lake|pond/i, label: "Lake clean-up" },
];

export const DEMO_DATASET = {
  projects: [
    {
      key: "A",
      slug: "demo-hero-cleanup",
      groups: ["beach-cleanup", "cleanup-drive", "swachh-bharat", "litter"],
      relevant: CLEANUP_WORDS,
      exclude: EVENT_WORDS,
      types: ["cleanup"],
      labels: CLEANUP_LABELS,
      label: "Clean-up",
      target: 25,
      holdBack: 1, // the stamp_mismatch test needs an unused photo of this place
    },
    {
      key: "B",
      slug: "demo-tree-planting",
      groups: ["tree-planting"],
      relevant: /plant|sapling|seedling|tree|afforest|nursery|van mahotsav|greening/i,
      types: ["plantation"],
      labels: [{ match: /sapling/i, label: "Sapling planting" }],
      label: "Tree planting",
      target: 20,
    },
    {
      key: "C",
      slug: "demo-second-cleanup",
      groups: ["lake-cleanup", "beach-cleanup", "cleanup-drive", "swachh-bharat", "litter"],
      relevant: CLEANUP_WORDS,
      exclude: EVENT_WORDS,
      types: ["cleanup", "water"],
      labels: CLEANUP_LABELS,
      label: "Clean-up",
      target: 15,
      awayFrom: [{ key: "A", minKm: 50 }],
    },
  ] satisfies ProjectRule[],
  waterWords: WATER_WORDS,
  sdgs: { cleanup: [11, 12], water: [6, 14], plantation: [13, 15], school: [4] } satisfies Record<ProjectType, number[]>,
  /** Project clusters: DBSCAN eps and min points. */
  clusterEpsM: 1500,
  clusterMinPts: 3,
  /** A cluster needs this many relevant photos to become a project (else a 4-photo pair wins). */
  clusterMinPhotos: 8,
  /** Project radius: distance covering this share of the cluster, clamped. */
  radiusQuantile: 0.9,
  radiusMinM: 300,
  radiusMaxM: 3000,
  /** Event window = the densest run of capture days (days ≤ 7 apart) ± this many days; later photos at a spot are check-ins. */
  datePaddingDays: 7,
  /**
   * Minimum hours between a before and an after photo. A clean-up finishes within hours, so a
   * same-evening pair is genuine; saplings need weeks to show change.
   */
  minPairGapHours: { cleanup: 0.5, water: 0.5, plantation: 336, school: 168, other: 24 } satisfies Record<ProjectType | "other", number>,
  /** Pairability bonus per pair whose text says "before" then "after". */
  stageBonus: 0.5,
  /** Spots: DBSCAN at ~40 m inside each project; the densest 3–5 become spots. */
  spotEpsM: 40,
  spotMinPts: 2,
  spotsMin: 3,
  spotsMax: 5,
  spotRadiusMinM: 30,
  spotRadiusMaxM: 150,
};

export type DemoDatasetConfig = typeof DEMO_DATASET;
