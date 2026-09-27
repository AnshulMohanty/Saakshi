/**
 * Claims are the only way numbers enter generated prose.
 *
 * Totals and KPIs are computed from the database and stored as claims. Generated text refers to
 * them only as {{claim:<id>}}; `validateProse` rejects any number the model wrote itself, and
 * `renderClaims` substitutes the real values afterwards.
 */
import { z } from "zod";

export const CLAIM_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const PLACEHOLDER_RE = /\{\{claim:([A-Za-z][A-Za-z0-9_-]{0,63})\}\}/g;

export const ClaimMethod = z.enum(["measured", "ai_estimated"]);
export type ClaimMethod = z.infer<typeof ClaimMethod>;

export const ClaimSchema = z
  .object({
    id: z.string().regex(CLAIM_ID_RE),
    label: z.string().min(1),
    value: z.number(),
    unit: z.string(),
    method: ClaimMethod,
    asset_ids: z.array(z.string()),
    /** 0–1; required when method is ai_estimated. */
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine((c) => c.method !== "ai_estimated" || c.confidence !== undefined, {
    message: "ai_estimated claims must carry a confidence",
    path: ["confidence"],
  });
export type Claim = z.infer<typeof ClaimSchema>;

/** Claim ids referenced by placeholders, in order of first appearance. */
export function extractClaimIds(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(PLACEHOLDER_RE), (m) => m[1]))];
}

// Spelled-out quantities. "one" is left out: it is mostly a pronoun ("one of the volunteers").
const NUMBER_WORDS = [
  "zero", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundreds?",
  "thousands?", "millions?", "billions?", "lakhs?", "crores?", "dozens?",
];
const NUMBER_WORD_RE = new RegExp(`\\b(?:${NUMBER_WORDS.join("|")})\\b`, "gi");
/** Any Unicode number character: ASCII and Devanagari digits, ½, ², Ⅻ, … */
const NUMBER_CHAR_RE = /\p{N}/gu;

export type ProseIssue = {
  kind: "digit" | "number_word" | "malformed_placeholder" | "unknown_claim";
  index: number;
  text: string;
};

export class ProseValidationError extends Error {
  constructor(readonly issues: ProseIssue[]) {
    super(
      `Generated prose must reference numbers only as {{claim:id}}: ` +
        issues.map((i) => `${i.kind} "${i.text}" at ${i.index}`).join("; "),
    );
    this.name = "ProseValidationError";
  }
}

export interface ValidateOptions {
  /** When given, every placeholder must reference one of these ids. */
  claimIds?: Iterable<string>;
  /** Permit spelled-out numbers such as "twelve". Default false. */
  allowNumberWords?: boolean;
}

/** All problems in a piece of generated prose (empty when valid). Useful for retry prompts. */
export function findProseIssues(text: string, opts: ValidateOptions = {}): ProseIssue[] {
  const issues: ProseIssue[] = [];
  const known = opts.claimIds ? new Set(opts.claimIds) : null;

  // Blank out well-formed placeholders (same length, so indices stay meaningful).
  const masked = text.replace(PLACEHOLDER_RE, (match, id: string, index: number) => {
    if (known && !known.has(id)) issues.push({ kind: "unknown_claim", index, text: match });
    return " ".repeat(match.length);
  });

  for (const m of masked.matchAll(/\{\{[^}]*\}?\}?|\}\}/g)) {
    issues.push({ kind: "malformed_placeholder", index: m.index, text: m[0] });
  }
  for (const m of masked.matchAll(NUMBER_CHAR_RE)) {
    issues.push({ kind: "digit", index: m.index, text: m[0] });
  }
  if (!opts.allowNumberWords) {
    for (const m of masked.matchAll(NUMBER_WORD_RE)) {
      issues.push({ kind: "number_word", index: m.index, text: m[0] });
    }
  }
  return issues.sort((a, b) => a.index - b.index);
}

/** Throws ProseValidationError unless every number in `text` is a {{claim:id}} placeholder. */
export function validateProse(text: string, opts: ValidateOptions = {}): void {
  const issues = findProseIssues(text, opts);
  if (issues.length > 0) throw new ProseValidationError(issues);
}

export interface RenderOptions {
  locale?: string;
  /** Wraps each rendered value, e.g. in a link to its source photos. */
  wrap?: (formatted: string, claim: Claim) => string;
}

/** "1,240 kg", "38%", "≈12 bags" (≈ marks ai_estimated values). */
export function formatClaimValue(claim: Claim, locale = "en-IN"): string {
  const digits = Number.isInteger(claim.value) ? 0 : 2;
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(claim.value);
  const unit = claim.unit.trim();
  const withUnit = unit === "" ? n : unit === "%" ? `${n}%` : `${n} ${unit}`;
  return claim.method === "ai_estimated" ? `≈${withUnit}` : withUnit;
}

/** Replaces every {{claim:id}} with its formatted value. Throws on unknown ids. */
export function renderClaims(text: string, claims: ReadonlyArray<Claim>, opts: RenderOptions = {}): string {
  const byId = new Map(claims.map((c) => [c.id, c]));
  return text.replace(PLACEHOLDER_RE, (_match, id: string) => {
    const claim = byId.get(id);
    if (!claim) throw new Error(`Unknown claim "${id}" in text`);
    const formatted = formatClaimValue(claim, opts.locale);
    return opts.wrap ? opts.wrap(formatted, claim) : formatted;
  });
}
