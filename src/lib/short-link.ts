/**
 * Short links for printed posters (pure): `/s/<code>`, where the code is the first 8 hex digits of
 * the spot's id. Short enough to type from a poster (the design prints one under the spot name,
 * QP:445) and it keeps the QR small, so it scans from further away. `/s/<code>` redirects to the
 * spot page.
 */

export const SHORT_CODE = /^[0-9a-f]{8}$/;

export const spotCode = (spotId: string) => spotId.replace(/-/g, "").slice(0, 8).toLowerCase();

/** "https://saakshi.example/" + code → { url: "https://saakshi.example/s/3b75bc04", text: "saakshi.example/s/3b75bc04" }. */
export function shortLink(origin: string, spotId: string): { url: string; text: string } {
  const base = origin.replace(/\/+$/, "");
  const url = `${base}/s/${spotCode(spotId)}`;
  return { url, text: url.replace(/^https?:\/\//, "") };
}
