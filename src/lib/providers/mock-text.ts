/**
 * Text helpers shared by the deterministic analysis and AI mocks: tokenising, crude stemming,
 * synonym groups and a stable hash. Same input → same output, on every machine.
 */
import { createHash } from "node:crypto";

const STOPWORDS = new Set(
  "a an and are as at be by does do for from has have in is it its of on or photo image picture show shows showing that the this to visible with any there".split(" "),
);

/** Synonym groups; every member canonicalises to the first word. */
const GROUPS: string[][] = [
  ["litter", "trash", "garbage", "waste", "rubbish", "debris", "plastic", "bottle", "wrapper", "dump"],
  ["cleanup", "clean", "cleaning", "sweep", "shramdaan"],
  ["tree", "sapling", "plantation", "plant", "planting", "seedling"],
  ["child", "children", "kid", "student", "pupil", "girl", "boy", "school"],
  ["people", "person", "volunteer", "crowd", "group", "team"],
  ["water", "well", "pump", "handpump", "tap", "borewell", "tank"],
  ["watermark", "stock", "copyright", "shutterstock", "getty"],
];
const CANON = new Map<string, string>();
for (const g of GROUPS) for (const w of g) CANON.set(w, g[0]);

/** Very small English stemmer: plural and -ing/-ed endings. */
export function stem(word: string): string {
  if (CANON.has(word)) return word;
  for (const [suffix, repl] of [["ies", "y"], ["ing", ""], ["ed", ""], ["es", ""], ["s", ""]] as const) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) return word.slice(0, -suffix.length) + repl;
  }
  return word;
}

export function canonical(word: string): string {
  const w = stem(word.toLowerCase());
  return CANON.get(w) ?? CANON.get(word.toLowerCase()) ?? w;
}

/** Lower-cased, stemmed, canonicalised content words. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOPWORDS.has(t) && t.length > 1).map(canonical);
}

export function hasAny(haystack: Set<string>, needles: Iterable<string>): boolean {
  for (const n of needles) if (haystack.has(n)) return true;
  return false;
}

/** Stable 32-bit hash of a string. */
export function hash32(text: string, salt = ""): number {
  return createHash("sha256").update(salt).update("\0").update(text).digest().readUInt32BE(0);
}
