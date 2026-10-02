/**
 * The Impact Report's six sections (pure): the PDF and the web page are both rendered from this.
 *   1 cover · 2 key numbers · 3 before/after (or the spot trend) · 4 verified evidence ·
 *   5 flagged and excluded · 6 method note and credits
 * Every number comes from a claim, and each links to its evidence (/r/<id>#claim-<claimId>).
 */
import { methodLabel, type Claim } from "../claims";
import { hidesMock, showClaim, type DisplayPolicy } from "../provenance";

export const CAVEAT = "Measured on photo pixels. Camera angle, framing, season and light affect the result.";

export interface ReportData {
  reportId: string;
  /** Absolute public URL of /r/<reportId>. */
  reportUrl: string;
  /** Absolute origin for evidence links. */
  appUrl: string;
  generatedAt: string;
  /** Production hides mock-derived numbers; development tags them. */
  policy: DisplayPolicy;
  project: { name: string; type: string; description: string | null; place: string | null; locationApproximate: boolean };
  period: { from: string; to: string };
  claims: Claim[];
  /** Prose already rendered from placeholders (numbers came from claims). */
  prose: string;
  notes: string[];
  pairs: Array<{
    key: string;
    spot: string | null;
    before: { id: string; date: string };
    after: { id: string; date: string };
    /** Key of the composite image the renderer loads. */
    image: string;
    metrics: Array<{ label: string; before: string; after: string; delta: string; method: string; hidden?: boolean }>;
    lowConfidence: boolean;
  }>;
  trend: { spot: string; metric: string; unit: string; points: Array<{ t: number; value: number }> } | null;
  gallery: Array<{ id: string; image: string; band: string; caption: string | null; date: string }>;
  excluded: Array<{ id: string; band: string | null; status: string; testCase: string | null; reasons: string[]; date: string }>;
  credits: Array<{ id: string; title: string | null; author: string | null; license: string | null; url: string | null; testCase: string | null }>;
}

export type Section =
  | { kind: "cover"; title: string; subtitle: string; period: string; generated: string; url: string; banner: string | null }
  | { kind: "numbers"; items: Array<{ id: string; label: string; value: string; hidden: boolean; mock: boolean; method: string; photos: number; url: string; detail: string | null }>; notes: string[]; prose: string }
  | { kind: "pairs"; items: ReportData["pairs"]; caveat: string }
  | { kind: "trend"; trend: NonNullable<ReportData["trend"]>; caveat: string }
  | { kind: "gallery"; items: Array<ReportData["gallery"][number] & { url: string }> }
  | { kind: "excluded"; items: Array<ReportData["excluded"][number] & { url: string }> }
  | { kind: "method"; paragraphs: string[]; credits: ReportData["credits"] };

const LONG = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${LONG[m]} ${y}`;
};

function claimDetail(c: Claim): string | null {
  const d = c.detail;
  if (!d) return null;
  const parts: string[] = [];
  if (d.topReasons?.length) parts.push(`Top reasons: ${d.topReasons.map((r) => r.code.toLowerCase().replaceAll("_", " ")).join(", ")}`);
  if (d.testInputs?.length) parts.push(`Includes planted test inputs (${d.testInputs.map((t) => t.replaceAll("_", " ")).join(", ")})`);
  if (d.pairs) parts.push(`${d.pairs === 1 ? "One before/after pair" : `${d.pairs} before/after pairs`}`);
  if (d.basis) parts.push(d.basis);
  return parts.join(". ") || null;
}

export function buildReportSections(d: ReportData): Section[] {
  const evidence = (id: string) => `${d.appUrl}/e/${id}`;
  const sections: Section[] = [
    {
      kind: "cover",
      title: d.project.name,
      subtitle: `Impact report · ${d.project.type}${d.project.place ? ` · ${d.project.place}` : ""}`,
      period: `${longDate(d.period.from)} to ${longDate(d.period.to)}`,
      generated: `Generated ${longDate(d.generatedAt)} · report ${d.reportId.slice(0, 8)}`,
      url: d.reportUrl,
      banner: !hidesMock(d.policy) && d.claims.some((c) => (c.provider_mode ?? "mock") === "mock") ? (d.policy.preview ? "Preview build: measurements are prototypes until the live pipeline is connected." : "Generated with mock providers: numbers are for development only.") : null,
    },
    {
      kind: "numbers",
      items: d.claims.map((c) => {
        const shown = showClaim(c, d.policy);
        return {
          id: c.id,
          label: c.label,
          value: shown.text,
          hidden: shown.kind === "hidden",
          mock: shown.kind === "value" && shown.mock,
          method: methodLabel(c),
          photos: c.asset_ids.length,
          url: `${d.reportUrl}#claim-${c.id}`,
          detail: claimDetail(c),
        };
      }),
      notes: d.notes,
      prose: d.prose,
    },
    d.pairs.length || !d.trend ? { kind: "pairs", items: d.pairs, caveat: CAVEAT } : { kind: "trend", trend: d.trend, caveat: CAVEAT },
    { kind: "gallery", items: d.gallery.map((g) => ({ ...g, url: evidence(g.id) })) },
    { kind: "excluded", items: d.excluded.map((e) => ({ ...e, url: evidence(e.id) })) },
    {
      kind: "method",
      paragraphs: [
        "Every photo was scored by Saakshi's rule-based Trust Engine: location against the project site, capture time against the project dates, near-duplicates across all projects, screen/print/stock checks and burned-in stamps. Each point and flag is listed on the photo's evidence page. Flagged photos are excluded from every number.",
        "Before/after pairs are two photos of the same spot, in time order, far enough apart for the project type, neither flagged. Both are masked on the same crop; cover is the share of the frame the mask selects. " + CAVEAT,
        "Counts marked “AI estimate” come from a vision model and carry its confidence; they are never presented as measurements. Numbers in this report's text were written as placeholders and filled from the claims above, so the text cannot contain a number the data doesn't support.",
        d.project.locationApproximate ? "Locations are approximate: the archive photos' coordinates were set by their uploaders on Wikimedia Commons." : "Locations come from the device (Witness Capture) or the photo's own GPS.",
        "Faces are blurred in every image. Originals are never published; every image is a signed Cloudinary transformation of the original.",
      ],
      credits: d.credits,
    },
  ];
  return sections;
}
