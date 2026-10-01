/** "Four": small counts as words in running copy (the design writes "Four fakes"). */
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const countWord = (n: number) => WORDS[n] ?? String(n);
