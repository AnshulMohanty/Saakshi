/**
 * Capture limits, shared by the server's checks (token.ts) and the phone screen. No imports: the
 * browser must not pull token.ts, which needs node:crypto (a 451 KB polyfill in the bundle).
 */
export const TOKEN_TTL_MS = 15 * 60 * 1000;
export const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
export const MAX_ACCURACY_M = 100;
/** GPS fix may be at most this old at the shutter. */
export const MAX_FIX_AGE_MS = 60 * 1000;
/** Confirm may arrive this long after the ticket (slow mobile uploads are fine). */
export const MAX_UPLOAD_MS = 30 * 60 * 1000;
