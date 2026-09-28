/**
 * What `pnpm cld:setup` makes sure exists in the Cloudinary account (pure: the plan is computed
 * from what the Admin API reports, so it is idempotent and testable). Docs: admin_api_metadata_fields,
 * admin_api_upload_presets (docs/external-apis.md).
 *
 * - Structured metadata fields project_id, trust_score, trust_band, captured_at (the Trust Engine
 *   writes them back on every score).
 * - Signed upload preset saakshi_evidence: the same settings as the app's signed uploads, for
 *   uploads made from the Cloudinary Console; its notification_url sends them through the same
 *   webhook → ingest path.
 * - Named transformations: none. Every delivery URL is signed, and Strict Transformations always
 *   allows signed URLs.
 */
export interface MetadataFieldSpec {
  external_id: string;
  label: string;
  type: "string" | "integer" | "date" | "enum";
  datasource?: { values: Array<{ external_id: string; value: string }> };
}

export const METADATA_FIELDS: MetadataFieldSpec[] = [
  { external_id: "project_id", label: "Saakshi project id", type: "string" },
  { external_id: "trust_score", label: "Saakshi trust score (0–100)", type: "integer" },
  {
    external_id: "trust_band",
    label: "Saakshi trust band",
    type: "enum",
    datasource: {
      values: [
        { external_id: "VERIFIED", value: "Verified" },
        { external_id: "NEEDS_REVIEW", value: "Needs review" },
        { external_id: "FLAGGED", value: "Flagged" },
      ],
    },
  },
  // "date" fields take yyyy-mm-dd; the full timestamp stays in contextual metadata.
  { external_id: "captured_at", label: "Saakshi capture date", type: "date" },
];

export const STRUCTURED_FIELD_IDS = METADATA_FIELDS.map((f) => f.external_id);

/** A value as its field type accepts it (enum values are datasource external ids). */
export function structuredValue(id: string, value: string): string {
  return METADATA_FIELDS.find((f) => f.external_id === id)?.type === "date" ? value.slice(0, 10) : value;
}

export const PRESET_NAME = "saakshi_evidence";

export function presetSettings({ appUrl, deliveryType = "authenticated" }: { appUrl?: string | null; deliveryType?: "authenticated" | "private" }): Record<string, string> {
  return {
    unsigned: "false",
    type: deliveryType,
    asset_folder: "saakshi/evidence",
    tags: "saakshi",
    moderation: "manual",
    media_metadata: "true",
    phash: "true",
    quality_analysis: "true",
    faces: "true",
    ...(appUrl && appUrl.startsWith("https://") ? { notification_url: `${appUrl}/api/webhooks/cloudinary` } : {}),
  };
}

export interface SetupAction {
  kind: "create_field" | "field_ok" | "field_conflict" | "create_preset" | "update_preset" | "preset_ok" | "note";
  request?: { method: "POST" | "PUT"; path: string; body: unknown; json: boolean };
  note: string;
}

/** Existing state from the Admin API; `undefined` = unknown (dry run without keys). */
export interface ExistingState {
  fields?: Array<{ external_id: string; type: string }>;
  preset?: { name: string; unsigned?: boolean; settings?: Record<string, unknown> } | null;
}

export function planSetup(existing: ExistingState, opts: { appUrl?: string | null; deliveryType?: "authenticated" | "private" }): SetupAction[] {
  const actions: SetupAction[] = [];
  for (const f of METADATA_FIELDS) {
    const found = existing.fields?.find((x) => x.external_id === f.external_id);
    if (!found) {
      actions.push({ kind: "create_field", request: { method: "POST", path: "metadata_fields", body: { ...f, mandatory: false }, json: true }, note: `metadata field ${f.external_id} (${f.type})${existing.fields ? "" : " if missing"}` });
    } else if (found.type !== f.type) {
      actions.push({ kind: "field_conflict", note: `metadata field ${f.external_id} exists as ${found.type}, expected ${f.type}: left unchanged; delete it in the Console to recreate` });
    } else {
      actions.push({ kind: "field_ok", note: `metadata field ${f.external_id} exists` });
    }
  }
  const want = presetSettings(opts);
  if (existing.preset === undefined || existing.preset === null) {
    actions.push({ kind: "create_preset", request: { method: "POST", path: "upload_presets", body: { name: PRESET_NAME, ...want }, json: false }, note: `upload preset ${PRESET_NAME}${existing.preset === undefined ? " if missing" : ""}` });
  } else {
    const have: Record<string, unknown> = { ...(existing.preset.settings ?? {}), unsigned: existing.preset.unsigned ?? false };
    const diff = Object.entries(want).filter(([k, v]) => String(have[k] ?? "") !== v).map(([k]) => k);
    actions.push(
      diff.length
        ? { kind: "update_preset", request: { method: "PUT", path: `upload_presets/${PRESET_NAME}`, body: want, json: false }, note: `upload preset ${PRESET_NAME}: update ${diff.join(", ")}` }
        : { kind: "preset_ok", note: `upload preset ${PRESET_NAME} is up to date` },
    );
  }
  if (!want.notification_url) actions.push({ kind: "note", note: "APP_URL is not an https URL: the preset has no notification_url yet (run cld:setup again after deploying)" });
  return actions;
}
