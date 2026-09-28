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
    /** "mock" when the number rests on a mock provider's output: never shown in production. */
    provider_mode: z.enum(["mock", "real"]).optional(),
    /** Supporting facts shown next to the number (never used in prose). */
    detail: z
      .object({
        topReasons: z.array(z.object({ code: z.string(), n: z.number() })).optional(),
        testInputs: z.array(z.string()).optional(),
        pairs: z.number().optional(),
        basis: z.string().optional(),
      })
      .optional(),
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
  /** Replaces formatClaimValue, e.g. with the display policy (hidden mock or low-confidence values). */
  format?: (claim: Claim) => string;
}

/** "1,240 kg", "38%", "≈12 bags" (≈ marks ai_estimated values), "+5.9 points" for *_change claims. */
export function formatClaimValue(claim: Claim, locale = "en-IN"): string {
  const digits = Number.isInteger(claim.value) ? 0 : 2;
  const change = claim.id.endsWith("_change");
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, ...(change ? { signDisplay: "exceptZero" as const } : {}) }).format(claim.value);
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
    const formatted = opts.format ? opts.format(claim) : formatClaimValue(claim, opts.locale);
    return opts.wrap ? opts.wrap(formatted, claim) : formatted;
  });
}

/** Splits prose into text and rendered-claim parts (for linking each number to its claim). */
export function claimParts(
  text: string,
  claims: ReadonlyArray<Claim>,
  locale = "en-IN",
  format: (claim: Claim) => string = (c) => formatClaimValue(c, locale),
): Array<string | { claim: Claim; formatted: string }> {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const out: Array<string | { claim: Claim; formatted: string }> = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const claim = byId.get(m[1]);
    if (!claim) throw new Error(`Unknown claim "${m[1]}" in text`);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ claim, formatted: format(claim) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** How a number was obtained, in words: counted from records, measured on pixels, or AI-estimated. */
export function methodLabel(claim: Pick<Claim, "method" | "unit" | "confidence">): string {
  if (claim.method === "ai_estimated") return `AI estimate${claim.confidence !== undefined ? `, confidence ${Math.round(claim.confidence * 100)}%` : ""}`;
  return claim.unit === "points" || claim.unit === "%" ? "Measured on photo pixels" : "Counted from records";
}
