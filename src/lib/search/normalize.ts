/**
 * Query normalisation (pure): Hinglish words to English, and typo correction against the
 * vocabulary the app knows. The mock parser uses it directly; the real parser's prompt
 * (lib/ai/prompts.ts) asks the model for the same rewrites. Every rewrite is reported, so the
 * UI can show "Understood 'paudhe' as 'saplings'".
 */

/** Romanised Hindi/Hinglish → English. Several spellings each. */
export const HINGLISH: Record<string, string> = {
  paudhe: "saplings", paudha: "sapling", paudhon: "saplings", podhe: "saplings", poudhe: "saplings",
  ped: "trees", pedh: "trees", perh: "trees", vriksh: "trees", jungle: "forest",
  kachra: "garbage", kachara: "garbage", kooda: "garbage", kuda: "garbage", kudaa: "garbage", gandagi: "litter", gandgi: "litter",
  safai: "cleanup", saaf: "clean", swachh: "clean", swachhata: "cleanliness", shramdaan: "cleanup",
  nadi: "river", kinara: "bank", kinare: "bank", nala: "drain", naala: "drain", jheel: "lake", jhil: "lake", talab: "pond", taalab: "pond", talaab: "pond", pani: "water", paani: "water",
  vidyalaya: "school", vidyalay: "school", pathshala: "school", bacche: "children", bachche: "children",
  pehle: "before", pahle: "before", baad: "after",
  plastik: "plastic", thaila: "bag", thaile: "bags", botal: "bottle", botalein: "bottles",
};

/** Hinglish glue words dropped from the semantic text ("nadi ke kinare ka kachra"). */
const GLUE = new Set(["ke", "ki", "ka", "ko", "mein", "me", "se", "par", "aur", "wala", "wale", "wali", "hai", "hain", "wahan", "yahan"]);

/** Words typos are corrected towards: the taxonomy, activities, filters and common scene words. */
export const VOCABULARY = [
  "litter", "garbage", "rubbish", "plastic", "waste", "bottles", "bags", "trash", "debris", "dump",
  "cleanup", "clean", "volunteers", "sweeping", "saplings", "sapling", "trees", "planting", "plantation", "forest", "garden",
  "river", "lake", "pond", "shore", "beach", "water", "drain", "canal", "school", "classroom", "children", "students",
  "verified", "flagged", "review", "witness", "archive", "uploads", "uploaded", "before", "after",
  "january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december",
];

/** Damerau–Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The closest vocabulary word within 1 edit (5–6 letters) or 2 edits (7+); none for short words. */
export function correctTypo(word: string, vocabulary: readonly string[] = VOCABULARY): string | null {
  if (word.length < 5 || vocabulary.includes(word)) return null;
  const max = word.length >= 7 ? 2 : 1;
  let best: string | null = null;
  let bestD = Infinity;
  for (const v of vocabulary) {
    if (Math.abs(v.length - word.length) > max) continue;
    const dist = editDistance(word, v);
    if (dist <= max && (dist < bestD || (dist === bestD && best !== null && v < best))) {
      best = v;
      bestD = dist;
    }
  }
  return best;
}

export interface Normalised {
  text: string;
  rewrites: Array<{ from: string; to: string }>;
}

/** Lower-cases, maps Hinglish, drops Hinglish glue words, fixes typos. Keeps digits, dashes and colons. */
export function normaliseQuery(query: string): Normalised {
  const rewrites: Normalised["rewrites"] = [];
  const out: string[] = [];
  for (const raw of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!word) continue;
    if (HINGLISH[word]) {
      rewrites.push({ from: word, to: HINGLISH[word] });
      out.push(HINGLISH[word]);
    } else if (GLUE.has(word)) {
      continue;
    } else if (/^[\p{L}]+$/u.test(word)) {
      const fixed = correctTypo(word);
      if (fixed) rewrites.push({ from: word, to: fixed });
      out.push(fixed ?? word);
    } else {
      out.push(raw); // dates, slugs, uuids: untouched
    }
  }
  return { text: out.join(" "), rewrites };
}
