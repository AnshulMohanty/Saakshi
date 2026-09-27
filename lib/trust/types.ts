/** Trust Engine types. Pure data: no I/O, safe to import in the browser. */
import type { LatLng } from "../geo";

export type TrustBand = "VERIFIED" | "NEEDS_REVIEW" | "FLAGGED";
export type TrustSignalName = "location" | "time" | "uniqueness" | "authenticity" | "stamp" | "quality" | "provenance" | "privacy" | "score";
/** points: adds/removes points · hard: caps the score and flags · review: needs a human · info: no effect. */
export type ReasonKind = "points" | "hard" | "review" | "info";

export type ReasonCode =
  // location
  | "LOCATION_WITNESS" | "LOCATION_WITNESS_UNATTESTED" | "LOCATION_EXIF" | "LOCATION_ARCHIVE" | "LOCATION_NONE"
  | "LOCATION_NO_SITE" | "LOCATION_MISMATCH" | "LOCATION_CONFLICT" | "UPLOADER_LOCATION"
  // time
  | "TIME_IN_WINDOW" | "TIME_CHECKIN" | "TIME_UPLOAD_ONLY" | "TIME_OUTSIDE" | "TIME_NO_WINDOW"
  // uniqueness
  | "UNIQUE" | "BURST" | "REVISIT" | "SIMILAR_IN_PROJECT" | "POSSIBLE_DUPLICATE" | "REUSED" | "COPY_LATER_SUBMITTED"
  // authenticity
  | "AUTH_CLEAR" | "AUTH_UNCHECKED" | "SCREEN_OR_PRINT" | "COMPOSITED" | "STOCK_SUSPECTED"
  // stamp
  | "STAMP_CONSISTENT" | "STAMP_UNVERIFIABLE" | "STAMP_MISMATCH"
  // quality, provenance, privacy
  | "QUALITY_OK" | "QUALITY_LOW" | "QUALITY_UNKNOWN" | "PROVENANCE_CAMERA" | "PROVENANCE_NONE" | "PRIVACY_CHILDREN"
  // score
  | "HARD_FLAG_CAP";

export type ReasonDetail = Record<string, string | number | boolean | null>;

export interface TrustReason {
  code: ReasonCode;
  signal: TrustSignalName;
  kind: ReasonKind;
  /** Points added (+) or removed (−); 0 for flags and info. */
  points: number;
  detail: ReasonDetail;
}

export interface TrustResult {
  score: number;
  band: TrustBand;
  reasons: TrustReason[];
  hardFlags: ReasonCode[];
  reviewFlags: ReasonCode[];
}

export interface TrustSignals {
  assetId: string;
  source: "witness" | "upload" | "archive" | "planted_test";
  exifSource: "file" | "commons_api" | "none";
  /** Witness Capture device fix (never the uploader's location). */
  deviceFix: (LatLng & { accuracyM: number | null }) | null;
  attested: boolean;
  /** GPS from the file EXIF, or from the Commons API for archive photos. */
  exifLocation: LatLng | null;
  /** Browser location of a gallery uploader: information only. */
  uploaderLocation: LatLng | null;
  /** ISO. For witness photos: the device time, anchored to the server's ticket time. */
  capturedAt: string | null;
  capturedAtTzAssumed: boolean;
  uploadedAt: string;
  /** Moderation answers (lib/ai/questions.ts ids); null when not checked yet. */
  moderation: Record<string, boolean> | null;
  watermark: boolean | null;
  textInImage: string | null;
  childrenVisible: boolean;
  qualityScore: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
}

export interface TrustProject {
  id: string;
  name: string;
  center: LatLng | null;
  radiusM: number | null;
  /** YYYY-MM-DD, inclusive. */
  startDate: string | null;
  endDate: string | null;
  minPairGapHours: number;
}

export interface TrustSpot {
  id: string;
  name: string;
  center: LatLng;
  radiusM: number;
}

/** Another asset whose pHash (or etag) matches this one. */
export interface DuplicateMatch {
  assetId: string;
  projectId: string | null;
  projectName: string | null;
  spotId: string | null;
  hamming: number;
  /** Identical file (same etag). */
  exact: boolean;
  strong: boolean;
  capturedAt: string | null;
  uploadedAt: string;
  sameProject: boolean;
  sameSpot: boolean;
  /** Hours between the two photos (capture times if both known, else upload times). */
  gapHours: number;
  /** Whether the *other* photo came later (capture time, then upload time, then id). */
  otherIsLater: boolean;
}
