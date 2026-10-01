/**
 * A signed delivery URL as the landing's address-bar chips (pure; chapter 6, B5.6): base,
 * signature, one chip per transformation segment (crop, blur faces, format) and the photo
 * (version + public id). `withoutChips` rebuilds the URL with some chips removed and the original
 * signature kept (unless the signature itself is removed), which is what an edited link is.
 * Works for Cloudinary (…/image/authenticated/s--sig--/…) and the mock (/api/media/mock/image/upload/s--sig--/…).
 */

export interface LinkChip {
  k: string;
  label: string;
  text: string;
  removable: boolean;
}

export interface ParsedLink {
  base: string;
  chips: LinkChip[];
}

const DELIVERY = /^(.*?\/image\/(?:upload|authenticated|private)\/)(.*)$/;

function labelOf(seg: string): { k: string; label: string } {
  if (/(^|,)e_blur_faces/.test(seg)) return { k: "blur", label: "blur faces" };
  if (/(^|,)(f_|q_)/.test(seg) && !/(^|,)(c_|w_|h_)/.test(seg)) return { k: "fmt", label: "format" };
  if (/(^|,)(c_|w_|h_|g_|ar_)/.test(seg)) return { k: "crop", label: "crop" };
  return { k: "step", label: "transformation" };
}

export function linkChips(url: string): ParsedLink | null {
  const m = DELIVERY.exec(url);
  if (!m) return null;
  const segs = m[2].split("/");
  const chips: LinkChip[] = [];
  let i = 0;
  if (segs[0]?.startsWith("s--")) {
    chips.push({ k: "sig", label: "signature", text: segs[0], removable: true });
    i = 1;
  }
  const v = segs.findIndex((s, j) => j >= i && /^v\d+$/.test(s));
  if (v < 0) return null;
  const seen = new Map<string, number>();
  for (; i < v; i++) {
    const { k, label } = labelOf(segs[i]);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    chips.push({ k: n > 1 ? `${k}${n}` : k, label, text: segs[i], removable: true });
  }
  chips.push({ k: "asset", label: "photo", text: segs.slice(v).join("/"), removable: false });
  return { base: m[1], chips };
}

/** The URL with `remove` chips taken out; the photo chip can't be removed. */
export function withoutChips(url: string, remove: readonly string[]): string {
  const p = linkChips(url);
  if (!p) return url;
  const kept = p.chips.filter((c) => !c.removable || !remove.includes(c.k));
  return p.base + kept.map((c) => c.text).join("/");
}
