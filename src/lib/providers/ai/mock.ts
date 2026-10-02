/**
 * Deterministic AI mock. Outputs depend only on the asset's filename/tags/context (or the query
 * text), so tests and demos are stable. Embeddings use feature hashing, so texts that share
 * words are genuinely closer in cosine distance.
 */
import { findProseIssues } from "../../claims";
import { EMBEDDING_DIMENSIONS } from "../../db/schema";
import { parseDeliveryPath } from "../../media/transform";
import { normaliseQuery } from "../../search/normalize";
import { hash32, tokens } from "../mock-text";
import type { AIProvider, ClaimRef } from "./index";
import type { ParsedSearch, PhotoAnalysis } from "./schemas";

type Activity = PhotoAnalysis["activity"];
type Stage = PhotoAnalysis["stage"];

const ACTIVITY_RULES: Array<[Activity, RegExp]> = [
  ["cleanup", /litter|trash|garbage|waste|rubbish|plastic|clean ?up|sweep|debris|dump/],
  ["plantation", /tree|sapling|plantation|planting|seedling|plant/],
  ["school", /school|classroom|student|pupil|teacher/],
  ["water", /water|well|handpump|pump|borewell|tap|tank/],
];

const CAPTIONS: Record<Activity, Record<"before" | "after" | "default", string>> = {
  cleanup: {
    before: "A littered public space before a community cleanup.",
    after: "The same area after volunteers cleared the litter.",
    default: "Volunteers at a community cleanup site.",
  },
  plantation: {
    before: "Bare ground prepared for a planting drive.",
    after: "Young saplings planted and staked in rows.",
    default: "A community tree-planting site.",
  },
  school: {
    before: "A classroom before the improvement work.",
    after: "An improved classroom in use.",
    default: "Students at a school activity.",
  },
  water: {
    before: "A water point before repair.",
    after: "A working water point in use.",
    default: "A community water point.",
  },
  other: { before: "A community site before the activity.", after: "A community site after the activity.", default: "A community activity." },
};

const COUNT_LABELS: Record<Activity, string[]> = {
  cleanup: ["litter items", "people"],
  plantation: ["saplings", "people"],
  school: ["children"],
  water: ["containers", "people"],
  other: ["people"],
};

const SDGS: Record<Activity, number[]> = { cleanup: [11, 12, 14], plantation: [13, 15], school: [4], water: [6], other: [] };

const SIGNALS = ["litter", "plastic", "bottle", "bag", "glove", "broom", "sapling", "tree", "soil", "water", "pump", "banner", "child", "people"];

/** Public id from a mock or Cloudinary delivery URL; falls back to the raw string. */
export function publicIdFromUrl(imageUrl: string): string {
  try {
    const { pathname } = new URL(imageUrl, "http://relative.invalid"); // mock URLs are relative
    const i = pathname.indexOf("/image/upload/");
    const parsed = i >= 0 ? parseDeliveryPath(pathname.slice(i + 1)) : null;
    if (parsed) return parsed.publicId;
  } catch {
    // not a URL
  }
  return imageUrl;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
type Band = ParsedSearch["filters"]["band"];

/** Rule-based stand-in for LLM query parsing: Hinglish and typos first, then filters, then free text. */
export function parseSearchQuery(query: string): ParsedSearch {
  const { text, rewrites } = normaliseQuery(query);
  let rest = ` ${text} `;
  const take = (re: RegExp) => {
    const m = re.exec(rest);
    if (m) rest = rest.replace(m[0], " ");
    return m;
  };

  let band: Band = null;
  const LEVEL: Record<string, Band> = { high: "VERIFIED", medium: "NEEDS_REVIEW", low: "FLAGGED" };
  const b = take(/\b(high|medium|low)[- ]?trust\b/i);
  if (b) band = LEVEL[b[1].toLowerCase()];
  else if (take(/\b(trusted|verified)\b/i)) band = "VERIFIED";
  else if (take(/\b(needs?[- ]review|under review|unreviewed)\b/i)) band = "NEEDS_REVIEW";
  else if (take(/\b(flagged|suspicious|untrusted)\b/i)) band = "FLAGGED";

  let source: ParsedSearch["filters"]["source"] = null;
  if (take(/\b(planted[ _-]?tests?|test[ _-]?inputs?)\b/i)) source = "planted_test";
  else if (take(/\bwitness(ed)?\b/i)) source = "witness";
  else if (take(/\bupload(s|ed)?\b/i)) source = "upload";
  else if (take(/\barchiv(e|ed|al)\b/i)) source = "archive";

  let from: string | null = null;
  let to: string | null = null;
  const month = take(new RegExp(`\\bin\\s+(${MONTHS.join("|")})[a-z]*\\s+(\\d{4})\\b`, "i"));
  if (month) {
    const m = MONTHS.indexOf(month[1].toLowerCase().slice(0, 3));
    from = iso(new Date(Date.UTC(+month[2], m, 1)));
    to = iso(new Date(Date.UTC(+month[2], m + 1, 0)));
  }
  const year = take(/\bin\s+(\d{4})\b/i);
  if (year) {
    from = `${year[1]}-01-01`;
    to = `${year[1]}-12-31`;
  }
  const since = take(/\b(?:since|after|from)\s+(\d{4}-\d{2}-\d{2}|\d{4})\b/i);
  if (since) from = since[1].length === 4 ? `${since[1]}-01-01` : since[1];
  const before = take(/\bbefore\s+(\d{4}-\d{2}-\d{2}|\d{4})\b/i);
  if (before) {
    const d = new Date(`${before[1].length === 4 ? `${before[1]}-01-01` : before[1]}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    to = iso(d);
  }
  const until = take(/\b(?:until|till|to)\s+(\d{4}-\d{2}-\d{2}|\d{4})\b/i);
  if (until) to = until[1].length === 4 ? `${until[1]}-12-31` : until[1];

  const project = take(/\bproject[:\s]+([a-z0-9][a-z0-9-]{1,80})\b/i);

  let activity: string | null = null;
  if (take(/\b(plantation|tree[- ]planting|planting drives?)\b/i)) activity = "plantation";
  else if (take(/\b(clean[- ]?ups?|cleaning drives?)\b/i)) activity = "cleanup";
  else if (take(/\b(water points?|handpumps?|borewells?)\b/i)) activity = "water";
  else if (take(/\bschools?\b/i)) activity = "school";

  const semantic = rest
    .replace(/\b(show( me)?|find|search|photos?|pictures?|images?|of|with)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { semantic, filters: { project: project?.[1].toLowerCase() ?? null, band, source, activity, from, to }, rewrites };
}

/** Feature-hashed bag of words (+ bigrams), L2-normalised. */
export function hashEmbedding(text: string, dims = EMBEDDING_DIMENSIONS): number[] {
  const v = new Float64Array(dims);
  const toks = tokens(text);
  const features: Array<[string, number]> = [
    ...toks.map((t): [string, number] => [t, 1]),
    ...toks.slice(1).map((t, i): [string, number] => [`${toks[i]} ${t}`, 0.5]),
  ];
  for (const [f, w] of features) {
    for (let k = 0; k < 3; k++) {
      const h = hash32(f, `slot${k}`);
      v[h % dims] += (h & 0x80000000 ? -1 : 1) * w;
    }
  }
  let norm = Math.hypot(...v);
  if (norm === 0) {
    // No content words: a deterministic pseudo-random direction.
    for (let i = 0; i < dims; i++) v[i] = hash32(text, `empty${i}`) / 2 ** 32 - 0.5;
    norm = Math.hypot(...v);
  }
  return Array.from(v, (x) => x / norm);
}

export class MockAIProvider implements AIProvider {
  readonly kind = "mock" as const;
  readonly models = { vision: "mock-vision-1", text: "mock-writer-1", embed: "mock-hash-embed-1" };

  /**
   * @param describe returns the text to key on for a public id (filename, tags, context).
   * @param readText mock-only stand-in for OCR: text known to be burned into the image.
   */
  constructor(
    private readonly describe: (publicId: string) => Promise<string>,
    private readonly readText: (publicId: string) => Promise<string | null> = async () => null,
  ) {}

  async describePhoto(imageUrl: string): Promise<PhotoAnalysis> {
    const publicId = publicIdFromUrl(imageUrl);
    const text = (await this.describe(publicId)).toLowerCase();
    const seed = hash32(text || publicId);

    const activity = ACTIVITY_RULES.find(([, re]) => re.test(text))?.[0] ?? "other";
    const stage: Stage = /\bbefore\b/.test(text)
      ? "before"
      : /\bafter\b/.test(text)
        ? "after"
        : /\b(during|in progress)\b/.test(text)
          ? "during"
          : /\b(check ?in|monitor(ing)?|ongoing)\b/.test(text)
            ? "ongoing"
            : "unknown";
    const captions = CAPTIONS[activity];
    const caption = stage === "before" || stage === "after" ? captions[stage] : captions.default;
    const words = new Set(tokens(text));

    return {
      caption,
      activity,
      stage,
      visibleCounts: COUNT_LABELS[activity].map((label, i) => ({
        label,
        count: (hash32(text, label) % 30) + (i === 0 ? 3 : 1),
        confidence: 0.5 + ((seed >> (i * 4)) % 30) / 100,
      })),
      visualSignals: SIGNALS.filter((s) => words.has(tokens(s)[0] ?? s)),
      sdgs: SDGS[activity],
      childrenVisible: /\b(child|children|kids?|students?|pupils?|school|girls?|boys?)\b/.test(text),
      textInImage: await this.readText(publicId),
      confidence: 0.55 + (seed % 35) / 100,
      method: "ai_estimated",
      model: "mock-vision-1",
    };
  }

  async writeWithPlaceholders(instruction: string, claims: ClaimRef[]): Promise<string> {
    void instruction; // the mock writes the same neutral summary whatever the brief
    const lines = claims.map((c) => `${stripNumbers(c.label)}: {{claim:${c.id}}}.`);
    return ["Summary drafted offline by the mock writer.", ...lines].join(" ");
  }

  async parseSearch(query: string): Promise<ParsedSearch> {
    return parseSearchQuery(query);
  }

  async embed(text: string): Promise<number[]> {
    return hashEmbedding(text);
  }
}

/** Removes digits and spelled-out numbers from a label so it can appear in prose. */
function stripNumbers(label: string): string {
  let out = label;
  for (const issue of findProseIssues(label).reverse()) {
    if (issue.kind === "digit" || issue.kind === "number_word" || issue.kind === "malformed_placeholder") {
      out = out.slice(0, issue.index) + out.slice(issue.index + issue.text.length);
    }
  }
  return out.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim() || "Result";
}
