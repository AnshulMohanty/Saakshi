import "server-only";
/**
 * The evidence page's model (EvidencePageData) from lib/evidence.ts evidenceView plus what the
 * design's layout needs: the layer art inputs, the rule chips and ledger, the nearest
 * fingerprint in any project, and the public copy's edits read off its real signed URL.
 */
import { and, eq, isNotNull, ne } from "drizzle-orm";
import type { EvidencePageData } from "@/components/evidence/evidence-page";
import { fullDateTime, offsetMinutes } from "./charts/time-axis";
import { getConfig } from "./config";
import type { DB } from "./db/client";
import { assets, measurements } from "./db/schema";
import { evidenceView } from "./evidence";
import { hexToBits } from "./glyph";
import { hamming } from "./hamming";
import { answeredByNote } from "./ai/perception-copy";
import { aiSentence, placeShort } from "./landing/copy";
import { linkChips } from "./media/link-chips";
import { AI_PENDING, aiPending, assetMode, mockLabel, type DisplayPolicy } from "./provenance";
import type { MediaProvider } from "./providers/media";
import { defaultTrustConfig, describeReason } from "./trust";
import { ledgerRows, ruleChips } from "./trust/labels";

const coord = (v: number, dir: [string, string]) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? dir[0] : dir[1]}`;

const WHY: Record<string, string> = {
  crop: "Frames the public copy. The original is kept unchanged.",
  blur: "Required on every public copy. Can't be removed from a signed link.",
  fmt: "Smaller file for phones. Pixels used for checks come from the original.",
  step: "Part of the public copy (the proof strip under the photo).",
  sig: "Covers everything above. Edit one character and Cloudinary refuses the link.",
};
const NAME: Record<string, string> = { crop: "Crop", blur: "Blur faces", fmt: "Format", step: "Proof strip", sig: "Signature" };

export async function evidencePageData(db: DB, media: MediaProvider, assetId: string, o: { appUrl: string; policy: DisplayPolicy }): Promise<EvidencePageData | null> {
  const v = await evidenceView(db, media, assetId, o);
  if (!v) return null;
  const off = offsetMinutes(getConfig().env.EXIF_DEFAULT_UTC_OFFSET);
  const f = v.facts;
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  const ms = await db.select().from(measurements).where(eq(measurements.assetId, assetId));
  const m = ms.find((x) => (x.metric === "litter_cover" || x.metric === "green_cover") && x.maskUrl);

  // Nearest fingerprint among every other photo (demo scale; the duplicates table keeps matches only).
  let nearest: number | null = null;
  if (f.pHash) {
    const others = await db.select({ phash: assets.phash }).from(assets).where(and(isNotNull(assets.phash), ne(assets.id, assetId)));
    for (const x of others) nearest = Math.min(nearest ?? 64, hamming(f.pHash, x.phash!));
  }
  const reused = v.trust.reasons.some((r) => r.code === "REUSED" || r.code === "POSSIBLE_DUPLICATE");
  const strong = defaultTrustConfig.matchHamming;

  const when = f.capturedAt ? fullDateTime(Date.parse(f.capturedAt), f.capturedAtPrecision, off, { seconds: true }) : `Uploaded ${fullDateTime(Date.parse(f.uploadedAt), "minute", off)}`;
  const place = placeShort(f.place) ?? v.spot?.name ?? v.project?.name ?? "Photo evidence";
  const tag = mockLabel(o.policy);
  const pendingAi = aiPending(assetMode(row.provenance), o.policy);
  const answeredBy = answeredByNote(row.provenance?.analysis?.provider);
  const tags = row.ai?.visibleCounts?.length ? row.ai.visibleCounts.map((c) => c.label) : row.cldTags.filter((t) => !/^(saakshi|planted|sandbox|trust_)/.test(t));
  const cover = m && v.trust.hiddenText === null ? `${m.value.toFixed(1)}%` : null;
  const chips = linkChips(v.imageUrl);
  // The proof strip is many layered segments (pad, text and QR overlays): one entry.
  const isStrip = (t: string) => /(^|,)(l_|fl_layer_apply|b_rgb)/.test(t);
  const publicEdits: Array<{ name: string; code: string; why: string }> = [];
  for (const c of (chips?.chips ?? []).filter((x) => x.k !== "asset")) {
    if (isStrip(c.text)) {
      const last = publicEdits.at(-1);
      if (last?.name === "Proof strip") last.code = `${Number(last.code.split(" ")[0]) + 1} layered steps`;
      else publicEdits.push({ name: "Proof strip", code: "1 layered steps", why: "Place, date, band and a QR code to this page, added under the photo by Cloudinary layers." });
      continue;
    }
    const k = c.k.replace(/\d+$/, "");
    publicEdits.push({ name: NAME[k] ?? c.label, code: c.text, why: WHY[k] ?? "Part of what's signed." });
  }
  for (const e of publicEdits) if (e.code === "1 layered steps") e.code = "1 layered step";
  // Signature last, as the design lists it (it covers everything above).
  publicEdits.sort((a, b) => Number(a.name === "Signature") - Number(b.name === "Signature"));

  const at = (iso: string | null | undefined) => (iso ? fullDateTime(Date.parse(iso), "second", off, { seconds: true }) : "–");
  const more: EvidencePageData["more"] = [];
  if (v.attestation)
    more.push({
      title: v.attestation.attested ? "Capture attestation: attested" : "Capture attestation: not attested",
      lines: [
        { text: `Shutter (device clock): ${at(v.attestation.clientCapturedAt)}` },
        { text: `Upload ticket issued (server): ${at(v.attestation.ticketIssuedAt)}` },
        { text: `Upload received (server): ${at(v.attestation.serverReceivedAt)}` },
        ...v.attestation.reasons.map((r) => ({ text: r.message })),
      ],
    });
  if (v.duplicates.length) more.push({ title: "Near-duplicates", lines: v.duplicates.map((d) => ({ text: `${d.exact ? "Identical file" : `${d.similarityPct}% match`} in ${d.projectName ?? "no project"}${d.isLater ? ", submitted later" : ", the earlier photo"}`, href: d.href })) });
  if (v.comparisons.length)
    more.push({
      title: "Before and after",
      lines: v.comparisons.map((c) => ({ text: `${c.metric}: ${c.shown?.kind === "hidden" ? c.shown.text : `${c.before} → ${c.after}${c.unit === "%" ? "%" : ""}${c.shown?.kind === "value" && c.shown.mock ? ` (${tag})` : ""}`}. This photo is the ${c.role}.`, href: `/e/${c.other}` })),
    });
  if (v.review) more.push({ title: v.review.decision === "approve" ? "Approved by a reviewer" : "Rejected by a reviewer", lines: [{ text: `“${v.review.note}” The score and band are unchanged.` }] });
  more.push({ title: "Every derivative Saakshi delivers", lines: v.edits.map((e) => ({ text: `${e.title}: ${e.steps.map((s) => s.words).join("; ")}` })) });

  return {
    code: v.id.slice(0, 8),
    title: place,
    when,
    crumb: v.project ? { label: v.project.name, href: v.spot?.slug ? `/spots/${v.spot.slug}` : `/projects/${v.project.slug ?? v.project.id}` } : { label: "Unassigned photo", href: null },
    trust: { score: v.trust.score, band: v.trust.band, hiddenText: v.trust.hiddenText, mock: v.trust.mock, mockTag: tag },
    viewer: {
      photo: { src: v.previewUrl, alt: `${v.caption ?? "Photo evidence"} Faces blurred.` },
      layer: { bits: f.pHash ? hexToBits(f.pHash) : "0".repeat(64), lat: f.location?.lat ?? null, lng: f.location?.lng ?? null, when, extra: f.device ? `camera ${f.device}` : null, aiBoxes: [], aiTags: pendingAi ? [AI_PENDING] : tags.slice(0, 8) },
      mask: m?.maskUrl ?? null,
      layers: [
        { name: "The photo", color: "var(--foreground)", detail: `The file as received${row.width && row.height ? `, ${row.width} × ${row.height}` : ""}. Faces blurred on every public copy.` },
        { name: "Where and when", color: "var(--verified)", detail: `${f.location ? `${coord(f.location.lat, ["N", "S"])}, ${coord(f.location.lng, ["E", "W"])}, ` : "No location recorded, "}${when}. ${f.location ? `From ${f.location.from}.` : ""}${f.tzNote ? ` ${f.tzNote}` : ""}` },
        { name: "Fingerprint", color: "var(--primary)", detail: "The 8×8 perceptual hash of the pixels. Used to catch the same photo in any project, even after a crop." },
        { name: "What the AI sees", color: "var(--estimated)", detail: pendingAi ? `${AI_PENDING}. AI-estimated tags describe the photo but never become a number.` : `${aiSentence(tags)} AI-estimated tags; they describe the photo but never become a number.${answeredBy ? ` ${answeredBy}` : ""}` },
        { name: "What we measured", color: "var(--measured)", detail: m ? (cover ? `${m.metric === "green_cover" ? "Green" : "Litter"} covers ${cover} of the frame, counted from mask pixels at threshold 0.50.${m.providerMode === "mock" ? ` (${tag})` : ""}` : "Measured with a mock provider: not shown in production.") : "Not measured: only spot photos are measured." },
      ],
    },
    chips: v.trust.hiddenText ? [] : ruleChips(v.trust.reasons),
    ledger: v.trust.hiddenText ? [] : ledgerRows(v.trust.reasons, describeReason),
    fingerprint: f.pHash
      ? {
          bits: hexToBits(f.pHash),
          hex: f.pHash,
          text: reused ? `64-bit perceptual hash. It matches another photo within ${strong} cells: see the near-duplicates below.` : nearest === null ? "64-bit perceptual hash. No other photo to compare yet." : `64-bit perceptual hash. Closest photo in any project differs in ${nearest} of 64 cells, so this is not a reuse.`,
        }
      : null,
    facts: [
      ...(v.spot ? [{ k: "Spot", v: v.spot.name }] : []),
      { k: "Project", v: v.project?.name ?? "Not assigned" },
      ...(f.location ? [{ k: "Coordinates", v: `${coord(f.location.lat, ["N", "S"])}, ${coord(f.location.lng, ["E", "W"])}`, mono: true }] : []),
      { k: "Taken", v: when },
      { k: "Location source", v: f.location ? f.location.from[0].toUpperCase() + f.location.from.slice(1) : "None" },
      ...(f.distanceToSiteM !== null ? [{ k: "Distance from site centre", v: `${f.distanceToSiteM} m` }] : []),
      ...(f.device ? [{ k: "Device", v: f.device }] : []),
      { k: "Metadata from", v: f.metadataSource },
      ...(cover ? [{ k: m?.metric === "green_cover" ? "Green cover" : "Litter cover", v: `${cover}, Measured` }] : []),
    ],
    edits: publicEdits,
    publicUrl: v.imageUrl,
    chain: { assetId: v.id },
    more,
    credit: v.attribution
      ? { before: v.testCase ? "Planted test input, built from " : "Photo: ", title: (v.attribution.title ?? "a Wikimedia Commons file").replace(/\.(jpe?g|png)$/i, ""), href: v.attribution.source_url, after: `, ${v.attribution.author?.trim() || "unknown"}, ${v.attribution.license || "licence unknown"}, Wikimedia Commons. Faces blurred.` }
      : null,
    record: v.testCase ? "Planted test input" : v.source === "witness" ? "Witness Capture" : v.source === "archive" ? "Demo archive record" : "Uploaded photo",
    homeHref: "/",
  };
}
