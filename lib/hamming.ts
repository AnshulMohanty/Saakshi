/** Hamming distance between 64-bit perceptual hashes. Pure, no dependencies (browser-safe). */

const HEX64 = /^[0-9a-f]{16}$/i;
const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

export const isPhash = (s: string | null | undefined): s is string => typeof s === "string" && HEX64.test(s);

/** Number of differing bits between two 64-bit hex hashes (0–64). */
export function hamming(a: string, b: string): number {
  if (!HEX64.test(a) || !HEX64.test(b)) throw new TypeError(`Expected two 16-char hex hashes, got "${a}", "${b}"`);
  let d = 0;
  for (let i = 0; i < 16; i++) d += POPCOUNT[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

/** "92%": similarity of two hashes as a percentage of matching bits. */
export const similarityPct = (hammingDistance: number) => Math.round(((64 - hammingDistance) / 64) * 100);
