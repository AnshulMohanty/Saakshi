/** Trust Engine: pure and browser-safe (no I/O, no AI, no server-only imports). */
export { defaultTrustConfig, type TrustConfig } from "./config";
export { findMatches, isLater, type DupCandidate } from "./duplicates";
export { scoreAsset } from "./engine";
export { describeReason, formatPoints, REASON_CODES } from "./reasons";
export { parseStamp, stampDayDifference, type ParsedStamp } from "./stamp";
export type * from "./types";
