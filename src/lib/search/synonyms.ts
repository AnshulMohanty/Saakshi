/**
 * Synonym groups for full-text search (the fallback ranking with the mock AI): a query word
 * matches any word of its group ("garbage" finds "litter", "river" finds "shore").
 */
const GROUPS: string[][] = [
  ["litter", "garbage", "trash", "rubbish", "waste", "plastic", "debris", "dump", "kachra"],
  ["river", "lake", "pond", "water", "shore", "bank", "canal", "drain", "stream", "beach"],
  ["tree", "trees", "sapling", "saplings", "plant", "plants", "planting", "plantation", "green", "forest"],
  ["cleanup", "clean", "cleaning", "cleared", "sweep", "volunteers", "drive"],
  ["school", "classroom", "students", "children"],
  ["before"],
  ["after"],
];

const INDEX = new Map<string, string[]>();
for (const g of GROUPS) for (const w of g) INDEX.set(w, g);

/** The word and its synonyms (the word alone if it has none). */
export function synonymsOf(word: string): string[] {
  const w = word.toLowerCase();
  return INDEX.get(w) ?? [w];
}
