/** Trust Engine: pure and browser-safe (no I/O, no AI, no server-only imports). */
export { defaultTrustConfig, type TrustConfig } from "./config";
export { findMatches, isLater, type DupCandidate } from "./duplicates";
export { scoreAsset } from "./engine";
export { describeReason, formatPoints, REASON_CODES } from "./reasons";
export { reasonLabel, ruleChips, signalMax, type ChipTone, type RuleChip } from "./labels";
export { simulate, simulationSignals, SIM_PRESETS, SIM_PROJECT, type SimFacts } from "./simulate";
export { parseStamp, stampDayDifference, type ParsedStamp } from "./stamp";
export type * from "./types";
