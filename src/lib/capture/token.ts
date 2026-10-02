/**
 * Witness Capture tokens: short-lived (15 min), multi-use within one capture session, HMAC-signed
 * with CAPTURE_TOKEN_SECRET and backed by a capture_tokens row.
 *
 * Format: "sct1.<base64url(json claims)>.<base64url(hmac-sha256)>".
 * `validateCapture` is pure: given the verified claims, the token row and the upload's context,
 * it decides whether the photo is attested and why not.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { MAX_ACCURACY_M, MAX_CLOCK_SKEW_MS, MAX_FIX_AGE_MS, MAX_UPLOAD_MS, TOKEN_TTL_MS } from "./limits";

export { MAX_ACCURACY_M, MAX_CLOCK_SKEW_MS, MAX_FIX_AGE_MS, MAX_UPLOAD_MS, TOKEN_TTL_MS };
const PREFIX = "sct1";

export interface TokenClaims {
  /** capture_tokens.id */
  tid: string;
  pid: string | null;
  sid: string | null;
  /** Issued / expires, epoch ms. */
  iat: number;
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (secret: string, body: string) => createHmac("sha256", secret).update(`${PREFIX}.${body}`).digest();

export function signCaptureToken(claims: TokenClaims, secret: string): string {
  const body = b64(JSON.stringify(claims));
  return `${PREFIX}.${body}.${b64(mac(secret, body))}`;
}

/** Claims if the signature is valid (expiry is checked by validateCapture), else null. */
export function verifyCaptureToken(token: string, secret: string): TokenClaims | null {
  const [prefix, body, sig] = token.split(".");
  if (prefix !== PREFIX || !body || !sig) return null;
  const expected = mac(secret, body);
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenClaims;
    return typeof c.tid === "string" && typeof c.iat === "number" && typeof c.exp === "number" ? c : null;
  } catch {
    return null;
  }
}

export interface TokenRow {
  id: string;
  issuedAt: Date;
  expiresAt: Date;
  projectId: string | null;
  spotId: string | null;
}

export interface CaptureCheckInput {
  token: string | null | undefined;
  secret: string;
  /** Looked up by the verified claims' tid; null when not found. */
  row: TokenRow | null;
  /** Device clock at the shutter. */
  clientCapturedAt: string | null | undefined;
  /** Server clock when the upload ticket was issued (requested at the shutter): the anchor. */
  ticketIssuedAt: Date | null | undefined;
  /** Server clock at confirm. */
  confirmedAt: Date;
  /** Device clock when the GPS fix was taken. */
  fixTimestamp: string | null | undefined;
  accuracyM: number | null | undefined;
  /** Project/spot the upload says it is for (from the capture page URL). */
  hint?: { projectId?: string | null; spotId?: string | null } | null;
  /** Queued on the phone while offline and uploaded later (B5.12): the time is the phone's own. */
  takenOffline?: boolean;
}

export type CaptureReasonCode =
  | "no_token" | "bad_token" | "unknown_token" | "no_ticket" | "expired" | "outside_window" | "clock_skew"
  | "no_client_time" | "stale_fix" | "late_upload" | "wrong_project" | "no_location" | "low_accuracy" | "taken_offline";

export interface CaptureReason {
  code: CaptureReasonCode;
  message: string;
}

export interface CaptureCheck {
  attested: boolean;
  reasons: CaptureReason[];
  claims: TokenClaims | null;
}


/**
 * Attested = a valid, unexpired capture token, and at the shutter (anchored to the server's
 * ticket time): device clock within 2 min of the server, GPS fix at most 60 s old and ≤ 100 m,
 * and the upload confirmed within 30 min of the ticket. A photo queued offline is never attested.
 */
export function validateCapture(input: CaptureCheckInput): CaptureCheck {
  const reasons: CaptureReason[] = [];
  const add = (code: CaptureReasonCode, message: string) => reasons.push({ code, message });
  if (input.takenOffline) add("taken_offline", "Taken offline: time from your phone.");

  let claims: TokenClaims | null = null;
  if (!input.token) add("no_token", "No capture token: not taken with Witness Capture.");
  else {
    claims = verifyCaptureToken(input.token, input.secret);
    if (!claims) add("bad_token", "Capture token signature is invalid.");
    else if (!input.row || input.row.id !== claims.tid) add("unknown_token", "Capture token is not on record.");
  }
  const row = claims && input.row && input.row.id === claims.tid ? input.row : null;

  const anchor = input.ticketIssuedAt ? input.ticketIssuedAt.getTime() : null;
  if (anchor === null) add("no_ticket", "No server-issued upload ticket to anchor the capture time.");
  if (row && anchor !== null && anchor > row.expiresAt.getTime()) add("expired", "Capture token had expired when the photo was taken.");

  const client = input.clientCapturedAt ? Date.parse(input.clientCapturedAt) : Number.NaN;
  if (Number.isNaN(client)) add("no_client_time", "No capture time from the device.");
  else {
    if (row && (client < row.issuedAt.getTime() - MAX_CLOCK_SKEW_MS || client > row.expiresAt.getTime() + MAX_CLOCK_SKEW_MS)) {
      add("outside_window", "Capture time is outside the capture token's window.");
    }
    if (anchor !== null && Math.abs(anchor - client) > MAX_CLOCK_SKEW_MS) {
      add("clock_skew", "Device clock and the server's ticket time differ by more than two minutes.");
    }
    const fix = input.fixTimestamp ? Date.parse(input.fixTimestamp) : Number.NaN;
    if (input.accuracyM != null && (Number.isNaN(fix) || client - fix > MAX_FIX_AGE_MS)) {
      add("stale_fix", "The GPS fix was more than 60 seconds old when the photo was taken.");
    }
  }

  if (anchor !== null && input.confirmedAt.getTime() - anchor > MAX_UPLOAD_MS) {
    add("late_upload", "The upload finished more than 30 minutes after the photo was taken.");
  }

  if (row && input.hint) {
    const { projectId, spotId } = input.hint;
    if ((projectId && row.projectId && projectId !== row.projectId) || (spotId && row.spotId && spotId !== row.spotId)) {
      add("wrong_project", "Photo claims a different project or spot than its capture token.");
    }
  }

  if (input.accuracyM == null || !Number.isFinite(input.accuracyM)) add("no_location", "No device location fix.");
  else if (input.accuracyM > MAX_ACCURACY_M) add("low_accuracy", `Location accuracy was worse than ${MAX_ACCURACY_M} m.`);

  return { attested: reasons.length === 0, reasons, claims };
}
