/** What the Witness Wall renders (pure types; lib/wall/view.ts from the DB, lib/wall/fixture.ts for /dev/parity). */
import type { Frame } from "../landing/types";
import type { TrustBand } from "../trust/types";

export interface WallSpot {
  k: string;
  label: string;
  lat: number;
  lng: number;
  /** Label under the pin instead of above (the prototype's Pune). */
  labelBelow: boolean;
}

export interface WallArrival {
  id: string;
  src: string;
  place: string;
  reason: string;
  score: number | null;
  band: TrustBand | null;
  /** An operator rehearsal, not a real Witness photo (B5.8). */
  rehearsal?: boolean;
}

/** A photo the operator can replay as a rehearsal: a real demo photo and its real result. */
export interface RehearsalPhoto {
  src: string;
  spot: string;
  reason: string;
  score: number;
  band: TrustBand;
}

export interface WallCounters {
  total: number;
  verified: number;
  flagged: number;
}

export interface WallData {
  frame: Frame;
  land: Array<[number, number]>;
  dust: string[];
  spots: WallSpot[];
  qr: { url: string; label: string };
  counters: WallCounters;
  arrivals: WallArrival[];
  /** Operator mode (B5.8): the simulate button and the A key, arrivals labelled rehearsals. */
  operator: boolean;
  rehearsals: RehearsalPhoto[];
  /** Listen to /api/live. */
  live: boolean;
  /** Card caption for a rehearsal ("Rehearsal: simulated arrival"; the fixture: the design's "just now"). */
  rehearsalLabel: string;
  opsHint: string;
  /** The list tags rehearsals with this (null: no tag). */
  rehearsalTag: string | null;
  /**
   * Counters: "db" refetches today's SQL counts after each real arrival (rule 1); "local" counts in
   * the browser, as the prototype did (the /dev/parity fixture only).
   */
  counting: "db" | "local";
  /** Seeded dot thinning (the prototype used Math.random). */
  seed: number;
}
