/**
 * Script detection for PDF text (pure): splits a string into runs by writing system, so each run
 * can use the Noto font that has its glyphs. Spaces, punctuation, digits, combining marks and
 * zero-width joiners stay with the run they are in.
 */
export type Script = "latin" | "devanagari" | "bengali" | "tamil" | "telugu";

const RANGES: Array<[number, number, Script]> = [
  [0x0900, 0x097f, "devanagari"],
  [0xa8e0, 0xa8ff, "devanagari"], // Devanagari Extended
  [0x0980, 0x09ff, "bengali"],
  [0x0b80, 0x0bff, "tamil"],
  [0x0c00, 0x0c7f, "telugu"],
];

/** The script of one code point, or null for "common" characters that join the current run. */
export function scriptOf(cp: number): Script | null {
  for (const [a, b, s] of RANGES) if (cp >= a && cp <= b) return s;
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f) || (cp >= 0x370 && cp <= 0x3ff) || (cp >= 0x400 && cp <= 0x4ff)) return "latin";
  return null;
}

export interface Run {
  text: string;
  script: Script;
}

export function scriptRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const ch of text) {
    const s = scriptOf(ch.codePointAt(0)!);
    const last = runs.at(-1);
    if (last && (s === null || s === last.script)) last.text += ch;
    else if (!last && s === null) runs.push({ text: ch, script: "latin" });
    else runs.push({ text: ch, script: s ?? "latin" });
  }
  // A leading common prefix (e.g. "“") belongs with the first real run.
  if (runs.length > 1 && runs[0].script === "latin" && !/[A-Za-zÀ-ɏͰ-ӿ]/.test(runs[0].text)) {
    runs[1] = { text: runs[0].text + runs[1].text, script: runs[1].script };
    runs.shift();
  }
  return runs;
}

/** Noto family per script (registered in lib/report/pdf.tsx from assets/fonts). */
export const FAMILY: Record<Script, string> = {
  latin: "NotoSans",
  devanagari: "NotoSansDevanagari",
  bengali: "NotoSansBengali",
  tamil: "NotoSansTamil",
  telugu: "NotoSansTelugu",
};
