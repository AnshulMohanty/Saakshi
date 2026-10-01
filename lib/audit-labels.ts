/**
 * Plain-language lines for the evidence page's audit timeline (pure): the stored action codes
 * (lib/audit.ts appendAudit callers) in words. The hash covers the stored row, not these words.
 */
const STEP: Record<string, string> = {
  parseMetadata: "Camera file read: location and time",
  analyze: "Checked for screens, watermarks and edits",
  understand: "Described by the AI (AI-estimated)",
  embed: "Indexed for search",
  assign: "Assigned to its project and spot",
  score: "Checked by the fixed rules",
  measure: "Measured on its pixels",
  finalize: "Public copy made: faces blurred, link signed",
};

const ACTION: Record<string, string> = {
  "archive.imported": "Imported into the demo archive",
  "asset.ingested": "Received",
  "sandbox.uploaded": "Dropped into Try to fool it",
  "demo.planted": "Planted as a test fake",
  "trust.rescore": "Re-scored after a related photo changed",
  "pipeline.reset": "Checks re-run",
  "review.approve": "Approved by a reviewer",
  "review.reject": "Rejected by a reviewer",
  "project.updated": "Its project was edited",
  "report.generated": "Counted in a report",
};

export function auditLabel(action: string, detail?: Record<string, unknown> | null): string {
  if (action.startsWith("pipeline.") && STEP[action.slice(9)]) {
    const base = STEP[action.slice(9)];
    if (action === "pipeline.score" && typeof detail?.score === "number") return `${base}: ${detail.score}${typeof detail.band === "string" ? `, ${detail.band === "NEEDS_REVIEW" ? "Needs review" : detail.band[0] + detail.band.slice(1).toLowerCase()}` : ""}`;
    return base;
  }
  return ACTION[action] ?? action.replace(/[._]/g, " ");
}
